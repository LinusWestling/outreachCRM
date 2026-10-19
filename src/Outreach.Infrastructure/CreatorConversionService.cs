using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Npgsql;
using NpgsqlTypes;
using Outreach.Application.Creators;
using Outreach.Application.Creators.Services;
using Outreach.Domain;

namespace Outreach.Infrastructure;

public sealed class CreatorConversionService(OutreachDbContext db, IConfiguration configuration) : ICreatorConversionService
{
    private readonly string? supabaseReadConnectionString = configuration.GetConnectionString("SupabaseRead");

    private sealed record LegacyCreatorLinks(
        IReadOnlyDictionary<string, Guid> CreatorIdByCode,
        IReadOnlyDictionary<string, Guid> CreatorIdByKey);

    public async Task<IReadOnlyDictionary<Guid, CreatorConversionStatsDto>> GetStatsByCreatorAsync(
        IReadOnlyCollection<Guid> creatorIds,
        CancellationToken cancellationToken = default)
    {
        if (creatorIds.Count == 0 || string.IsNullOrWhiteSpace(supabaseReadConnectionString))
        {
            return new Dictionary<Guid, CreatorConversionStatsDto>();
        }

        var requestedIds = creatorIds
            .Where(id => id != Guid.Empty)
            .Distinct()
            .ToArray();

        if (requestedIds.Length == 0)
        {
            return new Dictionary<Guid, CreatorConversionStatsDto>();
        }

        var creatorIdStrings = requestedIds
            .Select(id => id.ToString("D"))
            .ToArray();
        var requestedIdSet = requestedIds.ToHashSet();
        var legacyLinks = await GetLegacyCreatorLinksAsync(requestedIds, cancellationToken);
        var creatorCodes = legacyLinks.CreatorIdByCode.Keys.ToArray();

        await using var connection = new NpgsqlConnection(supabaseReadConnectionString);
        await connection.OpenAsync(cancellationToken);

        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT cc.creator_id AS crm_creator_id,
                   cc.code_normalized AS code,
                   cc.creator_display_name,
                   count(ca.id) AS ongoing_count,
                   count(ca.id) FILTER (WHERE ca.store_trial_started_at IS NOT NULL) AS activated_count,
                   count(ca.id) FILTER (WHERE ca.first_paid_renewal_at IS NOT NULL) AS converted_count,
                   count(ca.id) FILTER (WHERE ca.paid_conversion_eligible_at IS NOT NULL) AS paid_eligible_count,
                   min(ca.redeemed_at) AS first_redeemed_at,
                   max(ca.redeemed_at) AS last_redeemed_at
            FROM creator_codes cc
            LEFT JOIN creator_attributions ca
                   ON ca.creator_code_id = cc.id
                  AND ca.status NOT IN ('revoked','conflict')
            WHERE cc.status = 'active'
              AND (
                    (cc.creator_id ~* '^[0-9a-f-]{36}$' AND cc.creator_id = ANY(@creator_ids))
                    OR cc.code_normalized = ANY(@creator_codes)
                    OR cc.creator_id !~* '^[0-9a-f-]{36}$'
                  )
            GROUP BY cc.id,
                     cc.creator_id,
                     cc.code_normalized,
                     cc.creator_display_name;
            """;
        command.Parameters.Add("creator_ids", NpgsqlDbType.Array | NpgsqlDbType.Text).Value = creatorIdStrings;
        command.Parameters.Add("creator_codes", NpgsqlDbType.Array | NpgsqlDbType.Text).Value = creatorCodes;

        var results = new Dictionary<Guid, CreatorConversionStatsDto>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var rawCreatorId = reader.GetString(0);
            var code = reader.GetString(1);
            var rawCreatorDisplayName = reader.IsDBNull(2) ? null : reader.GetString(2);
            Guid? creatorId = null;
            if (Guid.TryParse(rawCreatorId, out var parsedCreatorId) && requestedIdSet.Contains(parsedCreatorId))
            {
                creatorId = parsedCreatorId;
            }
            else if (legacyLinks.CreatorIdByCode.TryGetValue(NormalizeCreatorCode(code), out var fallbackCreatorId))
            {
                creatorId = fallbackCreatorId;
            }
            else if (TryResolveLegacyCreatorId(rawCreatorId, rawCreatorDisplayName, legacyLinks.CreatorIdByKey, out var linkedCreatorId))
            {
                creatorId = linkedCreatorId;
            }

            if (!creatorId.HasValue)
            {
                continue;
            }

            var ongoingCount = CheckedInt(reader.GetInt64(3));
            var activatedCount = CheckedInt(reader.GetInt64(4));
            var convertedCount = CheckedInt(reader.GetInt64(5));
            var paidEligibleCount = CheckedInt(reader.GetInt64(6));
            var firstRedeemedAt = ReadDateTimeOffset(reader, 7);
            var lastRedeemedAt = ReadDateTimeOffset(reader, 8);
            var resolvedCode = NormalizeCreatorCode(code);

            if (results.TryGetValue(creatorId.Value, out var existing))
            {
                ongoingCount += existing.OngoingCount;
                activatedCount += existing.ActivatedCount;
                convertedCount += existing.ConvertedCount;
                paidEligibleCount += existing.PaidEligibleCount;
                firstRedeemedAt = MinDate(firstRedeemedAt, existing.FirstRedeemedAt);
                lastRedeemedAt = MaxDate(lastRedeemedAt, existing.LastRedeemedAt);
                resolvedCode = existing.Code ?? resolvedCode;
            }

            results[creatorId.Value] = new CreatorConversionStatsDto
            {
                CreatorId = creatorId.Value,
                OngoingCount = ongoingCount,
                ActivatedCount = activatedCount,
                ConvertedCount = convertedCount,
                PaidEligibleCount = paidEligibleCount,
                FirstRedeemedAt = firstRedeemedAt,
                LastRedeemedAt = lastRedeemedAt,
                CurrentStage = ResolveCurrentStage(ongoingCount, activatedCount, convertedCount),
                Code = string.IsNullOrWhiteSpace(resolvedCode) ? null : resolvedCode
            };
        }

        return results;
    }

    private async Task<LegacyCreatorLinks> GetLegacyCreatorLinksAsync(
        IReadOnlyCollection<Guid> creatorIds,
        CancellationToken cancellationToken)
    {
        var rows = await db.Creators
            .AsNoTracking()
            .Include(creator => creator.Accounts)
            .Where(creator => creatorIds.Contains(creator.Id))
            .ToListAsync(cancellationToken);

        var creatorIdByCode = rows
            .Select(row => new { row.Id, Code = NormalizeCreatorCode(CreatorMapping.Code(row)) })
            .Where(row => !string.IsNullOrWhiteSpace(row.Code))
            .GroupBy(row => row.Code, StringComparer.Ordinal)
            .Where(group => group.Select(row => row.Id).Distinct().Count() == 1)
            .ToDictionary(group => group.Key, group => group.First().Id, StringComparer.Ordinal);

        var creatorIdByKey = rows
            .SelectMany(creator => LegacyKeysFor(creator))
            .Where(row => !string.IsNullOrWhiteSpace(row.Key))
            .GroupBy(row => row.Key, StringComparer.Ordinal)
            .Where(group => group.Select(row => row.Id).Distinct().Count() == 1)
            .ToDictionary(group => group.Key, group => group.First().Id, StringComparer.Ordinal);

        return new LegacyCreatorLinks(creatorIdByCode, creatorIdByKey);
    }

    public async Task<CreatorConversionSummaryDto> GetSummaryAsync(
        CreatorListingFiltersDto filters,
        CancellationToken cancellationToken = default)
    {
        await EnsureCreatorSchemaAsync(cancellationToken);

        var creators = await GetFilteredCreatorsAsync(filters, cancellationToken);
        var creatorIds = creators.Select(creator => creator.Id).Distinct().ToArray();
        var stats = await GetStatsByCreatorAsync(creatorIds, cancellationToken);

        var reachedOutCount = creators.Count;
        var respondedCreatorCount = creators.Count(HasResponse);
        var ongoingCreatorCount = stats.Values.Count(x => x.OngoingCount > 0);
        var activatedCreatorCount = stats.Values.Count(x => x.ActivatedCount > 0);
        var convertedCreatorCount = stats.Values.Count(x => x.ConvertedCount > 0);

        return new CreatorConversionSummaryDto
        {
            ReachedOutCount = reachedOutCount,
            RespondedCreatorCount = respondedCreatorCount,
            OngoingCreatorCount = ongoingCreatorCount,
            ActivatedCreatorCount = activatedCreatorCount,
            ConvertedCreatorCount = convertedCreatorCount,
            ReplyToRedeemRate = Rate(ongoingCreatorCount, respondedCreatorCount),
            RedeemToTrialRate = Rate(activatedCreatorCount, ongoingCreatorCount),
            TrialToPaidRate = Rate(convertedCreatorCount, activatedCreatorCount)
        };
    }

    private async Task<IReadOnlyList<Creator>> GetFilteredCreatorsAsync(
        CreatorListingFiltersDto filters,
        CancellationToken cancellationToken)
    {
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
        return creators
            .SelectMany(creator => creator.Accounts.DefaultIfEmpty(), (creator, account) => new { creator, account })
            .Where(x => x.account is not null)
            .Select(x => new
            {
                x.creator,
                Item = CreatorMapping.ToListItem(x.creator, x.account!, LatestMessageLog(x.creator))
            })
            .Where(x => !filters.MinFollowers.HasValue || x.Item.Followers >= filters.MinFollowers.Value)
            .Where(x => !filters.MaxFollowers.HasValue || x.Item.Followers <= filters.MaxFollowers.Value)
            .Where(x => !filters.FirstMessageFrom.HasValue || x.Item.FirstMessageDate >= filters.FirstMessageFrom.Value)
            .Where(x => !filters.FirstMessageTo.HasValue || x.Item.FirstMessageDate <= filters.FirstMessageTo.Value)
            .Where(x => !filters.LastContactFrom.HasValue || x.Item.LastContactDate >= filters.LastContactFrom.Value)
            .Where(x => !filters.LastContactTo.HasValue || x.Item.LastContactDate <= filters.LastContactTo.Value)
            .Where(x => filters.MessageVersions.Count == 0 || (x.Item.MessageVersion is not null && filters.MessageVersions.Contains(x.Item.MessageVersion, StringComparer.OrdinalIgnoreCase)))
            .Where(x => !filters.HasCode.HasValue || filters.HasCode.Value == !string.IsNullOrWhiteSpace(x.Item.Code))
            .Where(x => !filters.ResumeContact.HasValue || x.Item.ResumeContact == filters.ResumeContact.Value)
            .Select(x => x.creator)
            .DistinctBy(x => x.Id)
            .ToList();
    }

    private async Task EnsureCreatorSchemaAsync(CancellationToken cancellationToken)
    {
        await db.Database.ExecuteSqlRawAsync(
            """
            DO $$
            BEGIN
                IF to_regclass('"Creators"') IS NOT NULL THEN
                    ALTER TABLE "Creators" ADD COLUMN IF NOT EXISTS "ThreadsUrl" character varying(600) NULL;
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

    private static ContactLog? LatestMessageLog(Creator creator) =>
        creator.ContactLogs
            .Where(x =>
                x.Channel != ContactChannel.Email &&
                (!string.IsNullOrWhiteSpace(x.MessageBody) || x.MessageTemplateId.HasValue))
            .OrderByDescending(x => x.Type == ContactLogType.Outbound)
            .ThenByDescending(x => x.OccurredAt)
            .ThenByDescending(x => x.CreatedAt)
            .FirstOrDefault();

    private static bool HasResponse(Creator creator) =>
        creator.LastResponseAt.HasValue ||
        creator.Status is OutreachStatus.Responded or OutreachStatus.Interested or OutreachStatus.Partnered;

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

    private static string ResolveCurrentStage(int ongoingCount, int activatedCount, int convertedCount)
    {
        if (convertedCount > 0)
        {
            return CreatorConversionStages.Converted;
        }

        if (activatedCount > 0)
        {
            return CreatorConversionStages.Active;
        }

        return ongoingCount > 0
            ? CreatorConversionStages.Ongoing
            : CreatorConversionStages.NoRedemptions;
    }

    private static decimal Rate(int numerator, int denominator) =>
        denominator == 0 ? 0 : decimal.Round((decimal)numerator / denominator, 4);

    private static int CheckedInt(long value) => checked((int)value);

    private static string NormalizeCreatorCode(string? code) =>
        string.IsNullOrWhiteSpace(code)
            ? string.Empty
            : code.Trim().ToUpperInvariant();

    private static IEnumerable<(Guid Id, string Key)> LegacyKeysFor(Creator creator)
    {
        foreach (var account in creator.Accounts)
        {
            yield return (creator.Id, NormalizeLegacyKey(account.Handle));
            yield return (creator.Id, NormalizeLegacyKey(account.NormalizedHandle));
            yield return (creator.Id, NormalizeLegacyKey(account.ProfileUrl));
        }
    }

    private static bool TryResolveLegacyCreatorId(
        string? creatorId,
        string? creatorDisplayName,
        IReadOnlyDictionary<string, Guid> creatorIdByKey,
        out Guid linkedCreatorId)
    {
        foreach (var candidate in new[] { creatorId, creatorDisplayName })
        {
            var key = NormalizeLegacyKey(candidate);
            if (!string.IsNullOrWhiteSpace(key) && creatorIdByKey.TryGetValue(key, out linkedCreatorId))
            {
                return true;
            }
        }

        linkedCreatorId = Guid.Empty;
        return false;
    }

    private static string NormalizeLegacyKey(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var normalized = value.Trim().TrimStart('@').ToLowerInvariant();
        var junkIndex = normalized.IndexOf('$', StringComparison.Ordinal);
        if (junkIndex >= 0)
        {
            normalized = normalized[..junkIndex].Trim();
        }

        if (!Uri.TryCreate(normalized, UriKind.Absolute, out var uri))
        {
            return normalized.TrimEnd('/');
        }

        var host = uri.Host.StartsWith("www.", StringComparison.Ordinal)
            ? uri.Host[4..]
            : uri.Host;
        var firstPathSegment = uri.AbsolutePath
            .Split('/', StringSplitOptions.RemoveEmptyEntries)
            .FirstOrDefault();

        return string.IsNullOrWhiteSpace(firstPathSegment)
            ? host
            : $"{host}/{firstPathSegment.TrimStart('@')}";
    }

    private static DateTimeOffset? MinDate(DateTimeOffset? first, DateTimeOffset? second) =>
        (first, second) switch
        {
            (null, null) => null,
            ({ } value, null) => value,
            (null, { } value) => value,
            ({ } left, { } right) => left <= right ? left : right
        };

    private static DateTimeOffset? MaxDate(DateTimeOffset? first, DateTimeOffset? second) =>
        (first, second) switch
        {
            (null, null) => null,
            ({ } value, null) => value,
            (null, { } value) => value,
            ({ } left, { } right) => left >= right ? left : right
        };

    private static DateTimeOffset? ReadDateTimeOffset(NpgsqlDataReader reader, int ordinal)
    {
        if (reader.IsDBNull(ordinal))
        {
            return null;
        }

        var value = reader.GetValue(ordinal);
        return value switch
        {
            DateTimeOffset dateTimeOffset => dateTimeOffset,
            DateTime dateTime => new DateTimeOffset(
                dateTime.Kind == DateTimeKind.Unspecified
                    ? DateTime.SpecifyKind(dateTime, DateTimeKind.Utc)
                    : dateTime.ToUniversalTime()),
            _ => null
        };
    }
}
