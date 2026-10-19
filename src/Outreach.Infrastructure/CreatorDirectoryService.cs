using Microsoft.EntityFrameworkCore;
using Outreach.Application.Creators;
using Outreach.Application.Creators.Services;
using Outreach.Domain;

namespace Outreach.Infrastructure;

public sealed class CreatorDirectoryService(
    OutreachDbContext db,
    IMessageTemplateService templates,
    ICreatorConversionService conversions) : ICreatorDirectoryService
{
    public async Task<PagedResultDto<CreatorListItemDto>> ListAsync(
        CreatorListingFiltersDto filters,
        CancellationToken cancellationToken = default)
    {
        await EnsureCreatorSchemaAsync(cancellationToken);

        var normalizedResponseStatus = NormalizeResponseStatus(filters.ResponseStatus);
        var query = db.Creators
            .AsNoTracking()
            .Include(x => x.Accounts)
            .Include(x => x.ContactLogs)
                .ThenInclude(x => x.MessageTemplate)
            .AsSplitQuery()
            .Where(x => x.Status != OutreachStatus.Queued)
            .AsQueryable();

        if (normalizedResponseStatus != "Archived")
        {
            query = query.Where(x => x.Status != OutreachStatus.Archived);
        }

        if (!string.IsNullOrWhiteSpace(filters.Search))
        {
            var search = filters.Search.Trim().ToLowerInvariant();
            query = query.Where(x =>
                x.DisplayName.ToLower().Contains(search) ||
                (x.Email != null && x.Email.ToLower().Contains(search)) ||
                (x.ThreadsUrl != null && x.ThreadsUrl.ToLower().Contains(search)) ||
                (x.Notes != null && x.Notes.ToLower().Contains(search)) ||
                x.Accounts.Any(a => a.Handle.ToLower().Contains(search) ||
                                    a.NormalizedHandle.Contains(search) ||
                                    a.ProfileUrl.ToLower().Contains(search)));
        }

        if (filters.Channels.Count > 0)
        {
            var platforms = filters.Channels
                .Where(x => x != CreatorChannel.Unknown)
                .Select(x => x.ToPlatform())
                .ToArray();

            query = query.Where(x => x.Accounts.Any(a => platforms.Contains(a.Platform)));
        }

        if (filters.HasEmail.HasValue)
        {
            query = filters.HasEmail.Value
                ? query.Where(x => x.Email != null && x.Email != string.Empty)
                : query.Where(x => x.Email == null || x.Email == string.Empty);
        }

        if (!string.IsNullOrWhiteSpace(filters.ResponseStatus))
        {
            query = normalizedResponseStatus switch
            {
                "Archived" => query.Where(x => x.Status == OutreachStatus.Archived),
                "Not Interested" => query.Where(x => x.Status == OutreachStatus.NotInterested),
                "Yes" => query.Where(x =>
                    x.Status == OutreachStatus.Responded ||
                    x.Status == OutreachStatus.Interested ||
                    x.Status == OutreachStatus.Partnered ||
                    x.LastResponseAt != null),
                "No" => query.Where(x =>
                    x.Status != OutreachStatus.Responded &&
                    x.Status != OutreachStatus.Interested &&
                    x.Status != OutreachStatus.Partnered &&
                    x.Status != OutreachStatus.NotInterested &&
                    x.LastResponseAt == null),
                _ => query
            };
        }

        var creators = await query.ToListAsync(cancellationToken);
        var items = creators
            .SelectMany(creator => creator.Accounts.DefaultIfEmpty(), (creator, account) => new { creator, account })
            .Where(x => x.account is not null)
            .Select(x => new
            {
                Item = CreatorMapping.ToListItem(
                    x.creator,
                    x.account!,
                    LatestDirectMessageLog(x.creator),
                    LatestEmailFollowUpLog(x.creator)),
                x.creator.UpdatedAt,
                x.creator.CreatedAt
            })
            .Where(x => !filters.MinFollowers.HasValue || x.Item.Followers >= filters.MinFollowers.Value)
            .Where(x => !filters.MaxFollowers.HasValue || x.Item.Followers <= filters.MaxFollowers.Value)
            .Where(x => !filters.FirstMessageFrom.HasValue || x.Item.FirstMessageDate >= filters.FirstMessageFrom.Value)
            .Where(x => !filters.FirstMessageTo.HasValue || x.Item.FirstMessageDate <= filters.FirstMessageTo.Value)
            .Where(x => !filters.LastContactFrom.HasValue || x.Item.LastContactDate >= filters.LastContactFrom.Value)
            .Where(x => !filters.LastContactTo.HasValue || x.Item.LastContactDate <= filters.LastContactTo.Value)
            .Where(x => filters.MessageVersions.Count == 0 || (x.Item.MessageVersion is not null && filters.MessageVersions.Contains(x.Item.MessageVersion, StringComparer.OrdinalIgnoreCase)))
            .Where(x => !filters.HasCode.HasValue || filters.HasCode.Value == !string.IsNullOrWhiteSpace(x.Item.Code))
            .Where(x => !filters.ResumeContact.HasValue || x.Item.ResumeContact == filters.ResumeContact.Value);

        items = (filters.SortBy, filters.SortDescending) switch
        {
            (CreatorSortField.Followers, true) => items.OrderByDescending(x => x.Item.Followers).ThenByDescending(x => x.UpdatedAt),
            (CreatorSortField.Followers, false) => items.OrderBy(x => x.Item.Followers).ThenByDescending(x => x.UpdatedAt),
            (CreatorSortField.Profile, true) => items.OrderByDescending(x => x.Item.ProfileUrl).ThenByDescending(x => x.UpdatedAt),
            (CreatorSortField.Profile, false) => items.OrderBy(x => x.Item.ProfileUrl).ThenByDescending(x => x.UpdatedAt),
            (CreatorSortField.MessageVersion, true) => items.OrderByDescending(x => x.Item.MessageVersion).ThenByDescending(x => x.UpdatedAt),
            (CreatorSortField.MessageVersion, false) => items.OrderBy(x => x.Item.MessageVersion).ThenByDescending(x => x.UpdatedAt),
            (CreatorSortField.LastContactDate, true) => items.OrderByDescending(x => x.Item.LastContactDate).ThenByDescending(x => x.UpdatedAt),
            (CreatorSortField.LastContactDate, false) => items.OrderBy(x => x.Item.LastContactDate).ThenByDescending(x => x.UpdatedAt),
            (_, true) => items.OrderByDescending(x => x.Item.FirstMessageDate).ThenByDescending(x => x.UpdatedAt),
            _ => items.OrderBy(x => x.Item.FirstMessageDate).ThenByDescending(x => x.UpdatedAt)
        };

        var pageNumber = Math.Max(1, filters.PageNumber);
        var pageSize = Math.Clamp(filters.PageSize, 1, 500);
        var allItems = items.ToList();

        var pageItems = allItems
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .Select(x => x.Item)
            .ToList();

        var conversionStats = await conversions.GetStatsByCreatorAsync(
            pageItems.Select(x => x.Id).Distinct().ToArray(),
            cancellationToken);

        pageItems = pageItems
            .Select(item => conversionStats.TryGetValue(item.Id, out var stats)
                ? item with
                {
                    OngoingCount = stats.OngoingCount,
                    ActivatedCount = stats.ActivatedCount,
                    ConvertedCount = stats.ConvertedCount,
                    PaidEligibleCount = stats.PaidEligibleCount,
                    FirstRedeemedAt = stats.FirstRedeemedAt,
                    LastRedeemedAt = stats.LastRedeemedAt,
                    CurrentStage = stats.CurrentStage,
                    Code = string.IsNullOrWhiteSpace(item.Code) ? stats.Code : item.Code
                }
                : item)
            .ToList();

        return new PagedResultDto<CreatorListItemDto>
        {
            Items = pageItems,
            TotalCount = allItems.Count,
            PageNumber = pageNumber,
            PageSize = pageSize
        };
    }

    public async Task<DailyOutreachCountsDto> GetDailyOutreachCountsAsync(
        DateOnly? date = null,
        CancellationToken cancellationToken = default)
    {
        await EnsureCreatorSchemaAsync(cancellationToken);

        var targetDate = date ?? StockholmToday();
        var socialOutboundLogs = await db.ContactLogs
            .AsNoTracking()
            .Where(log =>
                log.Type == ContactLogType.Outbound &&
                (log.Channel == ContactChannel.Instagram || log.Channel == ContactChannel.TikTok))
            .ToListAsync(cancellationToken);

        var counts = socialOutboundLogs
            .GroupBy(log => new { log.CreatorId, log.Channel })
            .Select(group => group.OrderBy(log => log.OccurredAt).First())
            .Where(log => StockholmDate(log.OccurredAt) == targetDate)
            .GroupBy(log => log.Channel)
            .Select(group => new
            {
                Channel = group.Key,
                Count = group.Count()
            })
            .ToList();

        return new DailyOutreachCountsDto
        {
            Date = targetDate,
            Instagram = counts.FirstOrDefault(x => x.Channel == ContactChannel.Instagram)?.Count ?? 0,
            TikTok = counts.FirstOrDefault(x => x.Channel == ContactChannel.TikTok)?.Count ?? 0
        };
    }

    public async Task<CreatorStatsDto> GetStatsAsync(CancellationToken cancellationToken = default)
    {
        await EnsureCreatorSchemaAsync(cancellationToken);

        var creators = await db.Creators
            .AsNoTracking()
            .Where(x => x.Status != OutreachStatus.Queued)
            .ToListAsync(cancellationToken);

        return new CreatorStatsDto
        {
            TotalCount = creators.Count,
            RespondedCount = creators.Count(HasResponse),
            NotInterestedCount = creators.Count(x => x.Status == OutreachStatus.NotInterested),
            ArchivedCount = creators.Count(x => x.Status == OutreachStatus.Archived),
            EmailCount = creators.Count(x => !string.IsNullOrWhiteSpace(x.Email)),
            ThreadsCount = creators.Count(x => !string.IsNullOrWhiteSpace(x.ThreadsUrl))
        };
    }

    public async Task<IReadOnlyList<CreatorListItemDto>> ListPendingAsync(CancellationToken cancellationToken = default)
    {
        await EnsureCreatorSchemaAsync(cancellationToken);

        var creators = await db.Creators
            .AsNoTracking()
            .Include(x => x.Accounts)
            .Include(x => x.ContactLogs)
                .ThenInclude(x => x.MessageTemplate)
            .AsSplitQuery()
            .Where(x => x.Status == OutreachStatus.Queued)
            .OrderByDescending(x => x.CreatedAt)
            .ToListAsync(cancellationToken);

        return creators
            .SelectMany(creator => creator.Accounts.DefaultIfEmpty(), (creator, account) => new { creator, account })
            .Where(x => x.account is not null)
            .Select(x => CreatorMapping.ToListItem(
                x.creator,
                x.account!,
                LatestDirectMessageLog(x.creator),
                LatestEmailFollowUpLog(x.creator)))
            .ToList();
    }

    public async Task<IReadOnlyList<CreatorListItemDto>> ListEmailFollowUpCandidatesAsync(
        int minimumDaysWithoutContact = 7,
        DateOnly? asOf = null,
        CancellationToken cancellationToken = default)
    {
        await EnsureCreatorSchemaAsync(cancellationToken);

        var days = Math.Max(0, minimumDaysWithoutContact);
        var threshold = (asOf ?? StockholmToday()).AddDays(-days);

        var creators = await db.Creators
            .AsNoTracking()
            .Include(x => x.Accounts)
            .Include(x => x.ContactLogs)
                .ThenInclude(x => x.MessageTemplate)
            .AsSplitQuery()
            .Where(x =>
                x.Status != OutreachStatus.Queued &&
                x.Status != OutreachStatus.Archived &&
                x.Status != OutreachStatus.NotInterested &&
                x.Status != OutreachStatus.DoNotContact &&
                x.Status != OutreachStatus.Closed &&
                x.Status != OutreachStatus.Responded &&
                x.Status != OutreachStatus.Interested &&
                x.Status != OutreachStatus.Partnered &&
                !x.DoNotContact &&
                x.LastResponseAt == null &&
                x.Email != null &&
                x.Email != string.Empty)
            .ToListAsync(cancellationToken);

        return creators
            .SelectMany(creator => creator.Accounts.DefaultIfEmpty(), (creator, account) => new { creator, account })
            .Where(x => x.account is not null)
            .Select(x => new
            {
                x.creator,
                account = x.account!,
                LastContactDate = CreatorMapping.LastContactDate(x.creator) ?? CreatorMapping.FirstMessageDate(x.creator)
            })
            .Where(x => x.LastContactDate.HasValue && x.LastContactDate.Value <= threshold)
            .OrderBy(x => x.LastContactDate)
            .ThenBy(x => x.creator.DisplayName)
            .Select(x => CreatorMapping.ToListItem(
                x.creator,
                x.account,
                LatestDirectMessageLog(x.creator),
                LatestEmailFollowUpLog(x.creator)))
            .ToList();
    }

    public async Task<PendingCreatorDuplicateCheckDto> CheckPendingDuplicateAsync(
        string profileUrl,
        CancellationToken cancellationToken = default)
    {
        await EnsureCreatorSchemaAsync(cancellationToken);

        var profile = ParseProfileUrl(profileUrl);
        var duplicate = await FindDuplicateAccountAsync(profile, cancellationToken);

        return new PendingCreatorDuplicateCheckDto
        {
            ProfileUrl = profile.ProfileUrl,
            Handle = profile.Handle,
            Channel = profile.Channel,
            IsDuplicate = duplicate is not null,
            DuplicateType = duplicate?.Creator?.Status == OutreachStatus.Queued ? "prospect" : duplicate is not null ? "reached-out" : null,
            Message = DuplicateMessage(duplicate?.Creator?.Status)
        };
    }

    public async Task<CreatorListItemDto> CreatePendingAsync(
        CreatePendingCreatorRequestDto request,
        CancellationToken cancellationToken = default)
    {
        await EnsureCreatorSchemaAsync(cancellationToken);

        var profile = ParseProfileUrl(request.ProfileUrl);
        var platform = profile.Channel.ToPlatform();
        var normalizedHandle = CreatorMapping.NormalizeHandle(profile.Handle);
        var duplicate = await FindDuplicateAccountAsync(profile, cancellationToken);

        if (duplicate is not null)
        {
            throw new InvalidOperationException(DuplicateMessage(duplicate.Creator?.Status) ?? "This creator already exists in the directory.");
        }

        var activeTemplate = await templates.GetActiveAsync(cancellationToken);
        var firstDate = request.FirstMessageDate ?? DateOnly.FromDateTime(DateTime.Today);
        var creator = new Creator
        {
            DisplayName = profile.Handle,
            Email = CleanOptional(request.Email),
            ThreadsUrl = CleanOptional(request.ThreadsUrl),
            Status = OutreachStatus.Queued,
            Notes = CreatorMapping.BuildNotes(
                activeTemplate?.Name,
                firstDate,
                null,
                null,
                CleanOptional(request.Code),
                null)
        };

        var account = new CreatorAccount
        {
            Creator = creator,
            Platform = platform,
            Handle = profile.Handle,
            NormalizedHandle = normalizedHandle,
            ProfileUrl = profile.ProfileUrl,
            FollowerCount = request.Followers,
            RawFollowerCount = request.Followers?.ToString(),
            SourceName = profile.Channel.ToString()
        };

        creator.Accounts.Add(account);
        creator.ContactLogs.Add(new ContactLog
        {
            Type = ContactLogType.Note,
            Channel = platform == Platform.TikTok ? ContactChannel.TikTok : ContactChannel.Instagram,
            MessageTemplateId = activeTemplate?.Id,
            MessageBody = activeTemplate?.Body
        });

        db.Creators.Add(creator);
        await db.SaveChangesAsync(cancellationToken);
        return CreatorMapping.ToListItem(
            creator,
            account,
            LatestDirectMessageLog(creator),
            LatestEmailFollowUpLog(creator));
    }

    public async Task<CreatorListItemDto?> DeletePendingAsync(
        Guid id,
        CancellationToken cancellationToken = default)
    {
        await EnsureCreatorSchemaAsync(cancellationToken);

        var creator = await db.Creators
            .Include(x => x.Accounts)
            .Include(x => x.ContactLogs)
            .AsSplitQuery()
            .FirstOrDefaultAsync(
                x => x.Status == OutreachStatus.Queued &&
                    (x.Id == id || x.Accounts.Any(account => account.Id == id)),
                cancellationToken);

        if (creator?.Accounts.FirstOrDefault() is not { } account)
        {
            return null;
        }

        var deleted = CreatorMapping.ToListItem(
            creator,
            account,
            LatestDirectMessageLog(creator),
            LatestEmailFollowUpLog(creator));
        db.Creators.Remove(creator);
        await db.SaveChangesAsync(cancellationToken);
        return deleted;
    }

    public async Task<CreatorListItemDto?> UpdateAsync(
        Guid id,
        UpdateCreatorWorkflowRequestDto request,
        CancellationToken cancellationToken = default)
    {
        await EnsureCreatorSchemaAsync(cancellationToken);

        var creator = await db.Creators
            .Include(x => x.Accounts)
            .Include(x => x.ContactLogs)
                .ThenInclude(x => x.MessageTemplate)
            .AsSplitQuery()
            .FirstOrDefaultAsync(x => x.Id == id, cancellationToken);

        if (creator?.Accounts.FirstOrDefault() is not { } account)
        {
            return null;
        }

        ApplyEditableFields(creator, account, request);
        UpsertDirectMessageLog(creator, account.Platform, request.MessageTemplateId, request.MessageBody);
        UpsertEmailFollowUpLog(creator, request.EmailTemplateId, request.EmailSubject, request.EmailBody);
        ClearReadyFlagIfInvalid(creator, account);

        await db.SaveChangesAsync(cancellationToken);
        return CreatorMapping.ToListItem(
            creator,
            account,
            LatestDirectMessageLog(creator),
            LatestEmailFollowUpLog(creator));
    }

    public async Task<IReadOnlyList<CreatorListItemDto>> BulkUpdateAsync(
        BulkUpdateCreatorsRequestDto request,
        CancellationToken cancellationToken = default)
    {
        await EnsureCreatorSchemaAsync(cancellationToken);

        if (request.CreatorIds is not { Count: > 0 })
        {
            throw new ArgumentException("Select at least one creator to update.", nameof(request));
        }

        var ids = request.CreatorIds
            .Where(id => id != Guid.Empty)
            .Distinct()
            .ToArray();

        if (ids.Length == 0)
        {
            throw new ArgumentException("Select at least one creator to update.", nameof(request));
        }

        var creators = await db.Creators
            .Include(x => x.Accounts)
            .Include(x => x.ContactLogs)
            .AsSplitQuery()
            .Where(x => ids.Contains(x.Id) && x.Status != OutreachStatus.Queued)
            .ToListAsync(cancellationToken);

        if (creators.Count == 0)
        {
            throw new InvalidOperationException("No marked contacted creators were found to update. Refresh and mark the rows again.");
        }

        foreach (var creator in creators)
        {
            if (creator.Accounts.FirstOrDefault() is not { } account)
            {
                continue;
            }

            var update = new UpdateCreatorWorkflowRequestDto
            {
                MessageVersion = request.SetMessage ? request.MessageVersion : null,
                MessageTemplateId = request.SetMessage ? request.MessageTemplateId : null,
                MessageBody = request.SetMessage ? request.MessageBody : null,
                ResponseStatus = request.SetResponseStatus ? request.ResponseStatus : null,
                FirstMessageDate = request.FirstMessageDate,
                LastContactDate = request.LastContactDate
            };

            ApplyEditableFields(creator, account, update);

            if (request.SetMessage)
            {
                UpsertDirectMessageLog(creator, account.Platform, request.MessageTemplateId, request.MessageBody);
            }
        }

        await db.SaveChangesAsync(cancellationToken);

        return creators
            .SelectMany(creator => creator.Accounts.DefaultIfEmpty(), (creator, account) => new { creator, account })
            .Where(x => x.account is not null)
            .Select(x => CreatorMapping.ToListItem(
                x.creator,
                x.account!,
                LatestDirectMessageLog(x.creator),
                LatestEmailFollowUpLog(x.creator)))
            .ToList();
    }

    public async Task<CreatorListItemDto?> CompletePendingAsync(
        Guid id,
        CompletePendingCreatorRequestDto request,
        CancellationToken cancellationToken = default)
    {
        await EnsureCreatorSchemaAsync(cancellationToken);

        var creator = await db.Creators
            .Include(x => x.Accounts)
            .Include(x => x.ContactLogs)
            .AsSplitQuery()
            .FirstOrDefaultAsync(x => x.Id == id && x.Status == OutreachStatus.Queued, cancellationToken);

        if (creator?.Accounts.FirstOrDefault() is not { } account)
        {
            return null;
        }

        ApplyEditableFields(
            creator,
            account,
            new UpdateCreatorWorkflowRequestDto
            {
                Email = request.Email,
                ThreadsUrl = request.ThreadsUrl,
                Followers = request.Followers,
                Code = request.Code,
                MessageVersion = request.MessageVersion,
                MessageTemplateId = request.MessageTemplateId,
                MessageBody = request.MessageBody,
                FirstMessageDate = request.FirstMessageDate,
                LastContactDate = DateOnly.FromDateTime(DateTime.Today)
            });

        var contactDate = DateOnly.FromDateTime(DateTime.Today);
        creator.Status = OutreachStatus.Contacted;
        creator.LastContactedAt = contactDate;
        creator.UpdatedAt = DateTimeOffset.UtcNow;

        var outboundLog = new ContactLog
        {
            CreatorId = creator.Id,
            Type = ContactLogType.Outbound,
            Channel = account.Platform == Platform.TikTok ? ContactChannel.TikTok : ContactChannel.Instagram,
            MessageTemplateId = request.MessageTemplateId,
            MessageBody = CleanOptional(request.MessageBody),
            OccurredAt = new DateTimeOffset(contactDate.ToDateTime(new TimeOnly(12, 0)), TimeSpan.Zero)
        };

        db.ContactLogs.Add(outboundLog);
        await db.SaveChangesAsync(cancellationToken);
        return CreatorMapping.ToListItem(
            creator,
            account,
            outboundLog,
            LatestEmailFollowUpLog(creator));
    }

    public async Task<CreatorListItemDto?> MarkPendingReadyAsync(
        Guid id,
        CancellationToken cancellationToken = default)
    {
        await EnsureCreatorSchemaAsync(cancellationToken);

        var creator = await db.Creators
            .Include(x => x.Accounts)
            .Include(x => x.ContactLogs)
                .ThenInclude(x => x.MessageTemplate)
            .AsSplitQuery()
            .FirstOrDefaultAsync(x => x.Id == id && x.Status == OutreachStatus.Queued, cancellationToken);

        if (creator?.Accounts.FirstOrDefault() is not { } account)
        {
            return null;
        }

        var messageLog = LatestDirectMessageLog(creator);
        var failures = PendingReadyFailures(account, messageLog);
        if (failures.Count > 0)
        {
            throw new InvalidOperationException($"Prospect is not ready for action: {string.Join(" ", failures)}");
        }

        creator.ProspectReadyAt = DateTimeOffset.UtcNow;
        creator.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(cancellationToken);
        return CreatorMapping.ToListItem(
            creator,
            account,
            messageLog,
            LatestEmailFollowUpLog(creator));
    }

    private static void ApplyEditableFields(Creator creator, CreatorAccount account, UpdateCreatorWorkflowRequestDto request)
    {
        if (!string.IsNullOrWhiteSpace(request.DisplayName))
        {
            creator.DisplayName = request.DisplayName.Trim();
        }

        if (request.Email is not null)
        {
            creator.Email = CleanOptional(request.Email);
        }

        if (request.ThreadsUrl is not null)
        {
            creator.ThreadsUrl = CleanOptional(request.ThreadsUrl);
        }

        if (request.Followers.HasValue)
        {
            account.FollowerCount = request.Followers;
            account.RawFollowerCount = request.Followers?.ToString();
        }

        var metadata = CreatorMapping.ParseNotes(creator.Notes);
        var messageVersion = request.MessageVersion ?? metadata.GetValueOrDefault("MessageVersion");
        var firstDate = request.FirstMessageDate ?? TryGetDate(metadata, "FirstMessageDate");
        var secondDate = request.SecondMessageDate ?? TryGetDate(metadata, "SecondMessageDate");
        var lastDate = request.LastContactDate ?? TryGetDate(metadata, "LastContactDate");
        var code = request.Code ?? metadata.GetValueOrDefault("Code");
        var resumeContact = request.ResumeContact ?? TryGetBool(metadata, "ResumeContact");

        creator.Notes = CreatorMapping.BuildNotes(
            CleanOptional(messageVersion),
            firstDate,
            secondDate,
            lastDate,
            CleanOptional(code),
            resumeContact);

        if (lastDate.HasValue)
        {
            creator.LastContactedAt = lastDate;
        }

        if (!string.IsNullOrWhiteSpace(request.ResponseStatus))
        {
            switch (NormalizeResponseStatus(request.ResponseStatus))
            {
                case "Archived":
                    creator.Status = OutreachStatus.Archived;
                    break;
                case "Not Interested":
                    creator.Status = OutreachStatus.NotInterested;
                    creator.LastResponseAt ??= lastDate ?? DateOnly.FromDateTime(DateTime.Today);
                    break;
                case "Yes":
                    creator.Status = OutreachStatus.Responded;
                    creator.LastResponseAt ??= lastDate ?? DateOnly.FromDateTime(DateTime.Today);
                    break;
                case "No":
                    creator.Status = creator.Status == OutreachStatus.Queued ? OutreachStatus.Queued : OutreachStatus.Contacted;
                    creator.LastResponseAt = null;
                    break;
            }
        }

        account.UpdatedAt = DateTimeOffset.UtcNow;
        creator.UpdatedAt = DateTimeOffset.UtcNow;
    }

    private async Task EnsureCreatorSchemaAsync(CancellationToken cancellationToken)
    {
        await db.Database.ExecuteSqlRawAsync(
            """
            DO $$
            BEGIN
                IF to_regclass('"Creators"') IS NOT NULL THEN
                    ALTER TABLE "Creators" ADD COLUMN IF NOT EXISTS "ThreadsUrl" character varying(600) NULL;
                    ALTER TABLE "Creators" ADD COLUMN IF NOT EXISTS "ProspectReadyAt" timestamp with time zone NULL;
                END IF;

                IF to_regclass('"ContactLogs"') IS NOT NULL THEN
                    ALTER TABLE "ContactLogs" ADD COLUMN IF NOT EXISTS "MessageSubject" character varying(240) NULL;
                END IF;

                IF to_regclass('"MessageTemplates"') IS NOT NULL THEN
                    ALTER TABLE "MessageTemplates" ADD COLUMN IF NOT EXISTS "Subject" character varying(240) NULL;
                END IF;
            END $$;
            """,
            cancellationToken);
    }

    private void UpsertDirectMessageLog(Creator creator, Platform platform, Guid? templateId, string? messageBody)
    {
        if (templateId is null && messageBody is null)
        {
            return;
        }

        var log = LatestDirectMessageLog(creator);
        if (log is null || log.Type == ContactLogType.Outbound)
        {
            log = new ContactLog
            {
                CreatorId = creator.Id,
                Type = ContactLogType.Note,
                Channel = platform == Platform.TikTok ? ContactChannel.TikTok : ContactChannel.Instagram
            };
            db.ContactLogs.Add(log);
        }

        if (templateId.HasValue)
        {
            log.MessageTemplateId = templateId;
        }

        if (messageBody is not null)
        {
            log.MessageBody = CleanOptional(messageBody);
        }
    }

    private void UpsertEmailFollowUpLog(Creator creator, Guid? templateId, string? messageSubject, string? messageBody)
    {
        if (templateId is null && messageSubject is null && messageBody is null)
        {
            return;
        }

        var log = LatestEmailFollowUpLog(creator);
        if (log is null || log.Type == ContactLogType.Outbound)
        {
            log = new ContactLog
            {
                CreatorId = creator.Id,
                Type = ContactLogType.Note,
                Channel = ContactChannel.Email
            };
            db.ContactLogs.Add(log);
        }

        if (templateId.HasValue)
        {
            log.MessageTemplateId = templateId;
        }

        if (messageSubject is not null)
        {
            log.MessageSubject = CleanOptional(messageSubject);
        }

        if (messageBody is not null)
        {
            log.MessageBody = CleanOptional(messageBody);
        }

        creator.UpdatedAt = DateTimeOffset.UtcNow;
    }

    private static ContactLog? LatestDirectMessageLog(Creator creator) =>
        creator.ContactLogs
            .Where(x =>
                x.Channel != ContactChannel.Email &&
                (!string.IsNullOrWhiteSpace(x.MessageBody) || x.MessageTemplateId.HasValue))
            .OrderByDescending(x => x.Type == ContactLogType.Outbound)
            .ThenByDescending(x => x.OccurredAt)
            .ThenByDescending(x => x.CreatedAt)
            .FirstOrDefault();

    private static ContactLog? LatestEmailFollowUpLog(Creator creator) =>
        creator.ContactLogs
            .Where(x =>
                x.Channel == ContactChannel.Email &&
                (!string.IsNullOrWhiteSpace(x.MessageSubject) || !string.IsNullOrWhiteSpace(x.MessageBody) || x.MessageTemplateId.HasValue))
            .OrderByDescending(x => x.Type != ContactLogType.Outbound)
            .ThenByDescending(x => x.OccurredAt)
            .ThenByDescending(x => x.CreatedAt)
            .FirstOrDefault();

    private static bool HasResponse(Creator creator) =>
        creator.LastResponseAt.HasValue ||
        creator.Status is OutreachStatus.Responded or OutreachStatus.Interested or OutreachStatus.Partnered;

    private static void ClearReadyFlagIfInvalid(Creator creator, CreatorAccount account)
    {
        if (creator.Status != OutreachStatus.Queued ||
            !creator.ProspectReadyAt.HasValue ||
            PendingReadyFailures(account, LatestDirectMessageLog(creator)).Count == 0)
        {
            return;
        }

        creator.ProspectReadyAt = null;
    }

    private static IReadOnlyList<string> PendingReadyFailures(CreatorAccount account, ContactLog? messageLog)
    {
        var failures = new List<string>();
        if (!account.FollowerCount.HasValue)
        {
            failures.Add("Follower count must be set.");
        }

        if (!HasPersonalizedMessage(messageLog))
        {
            failures.Add("Personalized message must be saved and differ from the default template.");
        }

        return failures;
    }

    private static bool HasPersonalizedMessage(ContactLog? messageLog)
    {
        var body = messageLog?.MessageBody?.Trim();
        if (string.IsNullOrWhiteSpace(body) ||
            string.Equals(body, CreatorMapping.LegacyDefaultMessageBody, StringComparison.Ordinal))
        {
            return false;
        }

        var templateBody = messageLog?.MessageTemplate?.Body?.Trim();
        return string.IsNullOrWhiteSpace(templateBody) ||
            !string.Equals(body, templateBody, StringComparison.Ordinal);
    }

    private async Task<CreatorAccount?> FindDuplicateAccountAsync(
        ParsedCreatorProfileDto profile,
        CancellationToken cancellationToken)
    {
        var platform = profile.Channel.ToPlatform();
        var normalizedHandle = CreatorMapping.NormalizeHandle(profile.Handle);

        return await db.CreatorAccounts
            .AsNoTracking()
            .Include(x => x.Creator)
            .FirstOrDefaultAsync(x => x.Platform == platform && x.NormalizedHandle == normalizedHandle, cancellationToken);
    }

    private static string? DuplicateMessage(OutreachStatus? status) =>
        status switch
        {
            OutreachStatus.Queued => "Already in prospects.",
            OutreachStatus.Archived => "This creator is archived.",
            null => null,
            _ => "Already reached out."
        };

    private static DateOnly StockholmToday()
    {
        return StockholmDate(DateTimeOffset.UtcNow);
    }

    private static DateOnly StockholmDate(DateTimeOffset timestamp) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(timestamp, StockholmTimeZone()).DateTime);

    private static TimeZoneInfo StockholmTimeZone()
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById("Europe/Stockholm");
        }
        catch (TimeZoneNotFoundException)
        {
        }
        catch (InvalidTimeZoneException)
        {
        }

        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById("W. Europe Standard Time");
        }
        catch (TimeZoneNotFoundException)
        {
        }
        catch (InvalidTimeZoneException)
        {
        }

        return TimeZoneInfo.Local;
    }

    private static ParsedCreatorProfileDto ParseProfileUrl(string rawUrl)
    {
        if (!Uri.TryCreate(rawUrl.Trim(), UriKind.Absolute, out var uri))
        {
            var prefixed = rawUrl.Trim().StartsWith("@", StringComparison.Ordinal)
                ? $"https://instagram.com/{rawUrl.Trim().TrimStart('@')}"
                : $"https://{rawUrl.Trim()}";

            if (!Uri.TryCreate(prefixed, UriKind.Absolute, out uri))
            {
                throw new ArgumentException("Enter a valid Instagram or TikTok profile URL.");
            }
        }

        var host = uri.Host.Replace("www.", string.Empty, StringComparison.OrdinalIgnoreCase).ToLowerInvariant();
        var segments = uri.AbsolutePath
            .Split('/', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .ToList();

        CreatorChannel channel;
        string? handle;
        if (host is "instagram.com" or "m.instagram.com")
        {
            channel = CreatorChannel.Instagram;
            handle = segments.FirstOrDefault();
        }
        else if (host is "tiktok.com" or "m.tiktok.com" or "vm.tiktok.com")
        {
            channel = CreatorChannel.TikTok;
            handle = segments.FirstOrDefault()?.TrimStart('@');
        }
        else
        {
            throw new ArgumentException("Only Instagram and TikTok profile URLs are supported.");
        }

        handle = handle?.Trim().TrimStart('@');
        if (string.IsNullOrWhiteSpace(handle) ||
            handle.Contains("?", StringComparison.Ordinal) ||
            handle.Equals("p", StringComparison.OrdinalIgnoreCase) ||
            handle.Equals("reel", StringComparison.OrdinalIgnoreCase) ||
            handle.Equals("video", StringComparison.OrdinalIgnoreCase))
        {
            throw new ArgumentException("Could not resolve a profile handle from that URL.");
        }

        var normalizedUrl = channel == CreatorChannel.TikTok
            ? $"https://www.tiktok.com/@{handle}"
            : $"https://www.instagram.com/{handle}";

        return new ParsedCreatorProfileDto
        {
            Channel = channel,
            Handle = handle,
            ProfileUrl = normalizedUrl
        };
    }

    private static string? CleanOptional(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string NormalizeResponseStatus(string? value)
    {
        var normalized = value?.Trim().ToLowerInvariant();
        return normalized switch
        {
            "archived" or "archive" => "Archived",
            "yes" or "responded" or "interested" => "Yes",
            "not interested" or "not_interested" or "notinterested" => "Not Interested",
            _ => "No"
        };
    }

    private static DateOnly? TryGetDate(IReadOnlyDictionary<string, string?> metadata, string key) =>
        DateOnly.TryParse(metadata.GetValueOrDefault(key), out var parsed) ? parsed : null;

    private static bool? TryGetBool(IReadOnlyDictionary<string, string?> metadata, string key) =>
        bool.TryParse(metadata.GetValueOrDefault(key), out var parsed) ? parsed : null;
}
