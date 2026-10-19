using Microsoft.EntityFrameworkCore;
using Outreach.Application;
using Outreach.Domain;

namespace Outreach.Infrastructure;

public sealed class CreatorService(OutreachDbContext db) : ICreatorService
{
    public async Task<IReadOnlyList<CreatorSummaryDto>> ListAsync(CreatorListQuery query, CancellationToken cancellationToken)
    {
        var creators = ApplyQuery(db.Creators.AsNoTracking().Include(x => x.Accounts), query);
        return await creators.OrderBy(x => x.NextFollowUpAt ?? DateOnly.MaxValue).ThenBy(x => x.DisplayName)
            .Select(x => ToSummary(x))
            .ToListAsync(cancellationToken);
    }

    public async Task<CreatorSummaryDto?> GetAsync(Guid id, CancellationToken cancellationToken)
    {
        var creator = await db.Creators.AsNoTracking().Include(x => x.Accounts).FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
        return creator is null ? null : ToSummary(creator);
    }

    public async Task<CreatorSummaryDto?> UpdateAsync(Guid id, UpdateCreatorRequest request, CancellationToken cancellationToken)
    {
        var creator = await db.Creators.Include(x => x.Accounts).FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (creator is null)
        {
            return null;
        }

        if (request.DisplayName is not null)
        {
            creator.DisplayName = request.DisplayName;
        }

        if (request.Email is not null)
        {
            creator.Email = string.IsNullOrWhiteSpace(request.Email) ? null : request.Email.Trim();
        }

        if (request.Notes is not null)
        {
            creator.Notes = request.Notes;
        }

        if (request.Status.HasValue)
        {
            creator.Status = request.Status.Value;
        }

        if (request.Priority.HasValue)
        {
            creator.Priority = request.Priority.Value;
        }

        if (request.NextFollowUpAt.HasValue)
        {
            creator.NextFollowUpAt = request.NextFollowUpAt;
        }

        if (request.DoNotContact.HasValue)
        {
            creator.DoNotContact = request.DoNotContact.Value;
        }

        creator.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return ToSummary(creator);
    }

    public async Task AddContactLogAsync(Guid creatorId, AddContactLogRequest request, CancellationToken cancellationToken)
    {
        await EnsureContactLogSchemaAsync(cancellationToken);

        var creator = await db.Creators.FirstOrDefaultAsync(x => x.Id == creatorId, cancellationToken)
            ?? throw new InvalidOperationException("Creator was not found.");

        var occurredAt = request.OccurredAt ?? DateTimeOffset.UtcNow;
        db.ContactLogs.Add(new ContactLog
        {
            CreatorId = creatorId,
            Type = request.Type,
            Channel = request.Channel,
            MessageTemplateId = request.MessageTemplateId,
            MessageBody = request.MessageBody,
            Outcome = request.Outcome,
            OccurredAt = occurredAt
        });

        if (request.Type == ContactLogType.Outbound)
        {
            creator.LastContactedAt = DateOnly.FromDateTime(occurredAt.UtcDateTime);
        }
        else if (request.Type == ContactLogType.Inbound)
        {
            creator.LastResponseAt = DateOnly.FromDateTime(occurredAt.UtcDateTime);
        }

        if (request.NewStatus.HasValue)
        {
            creator.Status = request.NewStatus.Value;
        }

        creator.NextFollowUpAt = request.NextFollowUpAt;
        creator.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
    }

    private async Task EnsureContactLogSchemaAsync(CancellationToken cancellationToken)
    {
        await db.Database.ExecuteSqlRawAsync(
            """
            DO $$
            BEGIN
                IF to_regclass('"ContactLogs"') IS NOT NULL THEN
                    ALTER TABLE "ContactLogs" ADD COLUMN IF NOT EXISTS "MessageSubject" character varying(240) NULL;
                END IF;
            END $$;
            """,
            cancellationToken);
    }

    private static IQueryable<Creator> ApplyQuery(IQueryable<Creator> queryable, CreatorListQuery query)
    {
        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var search = query.Search.Trim().ToLowerInvariant();
            queryable = queryable.Where(x =>
                x.DisplayName.ToLower().Contains(search) ||
                (x.Email != null && x.Email.ToLower().Contains(search)) ||
                x.Accounts.Any(a => a.NormalizedHandle.Contains(search) || a.ProfileUrl.ToLower().Contains(search)));
        }

        if (query.Platform.HasValue)
        {
            queryable = queryable.Where(x => x.Accounts.Any(a => a.Platform == query.Platform));
        }

        if (query.Status.HasValue)
        {
            queryable = queryable.Where(x => x.Status == query.Status);
        }

        if (query.Priority.HasValue)
        {
            queryable = queryable.Where(x => x.Priority == query.Priority);
        }

        if (query.DueOnly)
        {
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            queryable = queryable.Where(x => x.NextFollowUpAt <= today && !x.DoNotContact && x.Status != OutreachStatus.Closed && x.Status != OutreachStatus.DoNotContact);
        }

        return queryable;
    }

    private static CreatorSummaryDto ToSummary(Creator creator) =>
        new(
            creator.Id,
            creator.DisplayName,
            creator.Email,
            creator.Status,
            creator.Priority,
            creator.LastContactedAt,
            creator.LastResponseAt,
            creator.NextFollowUpAt,
            creator.DoNotContact,
            creator.Accounts.Select(a => new CreatorAccountDto(a.Id, a.Platform, a.Handle, a.NormalizedHandle, a.ProfileUrl, a.FollowerCount, a.RawFollowerCount)).ToList());
}
