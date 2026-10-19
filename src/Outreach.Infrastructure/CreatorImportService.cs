using System.Globalization;
using System.Text.Json;
using CsvHelper;
using CsvHelper.Configuration;
using Microsoft.EntityFrameworkCore;
using Outreach.Application.Creators.Import;
using Outreach.Application.Creators.Normalization;
using Outreach.Application.Creators.Services;
using Outreach.Domain;

namespace Outreach.Infrastructure;

public sealed class CreatorImportService(OutreachDbContext db, ICreatorCsvNormalizer normalizer) : ICreatorImportService
{
    public async Task<CreatorImportResultDto> PreviewAsync(
        Stream csvStream,
        CreatorImportPreviewRequestDto request,
        CancellationToken cancellationToken = default)
    {
        var rows = await ParseAsync(csvStream, request, cancellationToken);
        return new CreatorImportResultDto
        {
            Summary = CreatorMapping.Summarize(rows),
            Rows = rows
        };
    }

    public async Task<CreatorImportSummaryDto> ImportAsync(
        Stream csvStream,
        CreatorImportPreviewRequestDto request,
        CancellationToken cancellationToken = default)
    {
        var rows = await ParseAsync(csvStream, request, cancellationToken);
        var created = 0;
        var updated = 0;
        var platform = request.Channel.ToPlatform();

        var batch = new ImportBatch
        {
            SourceName = request.SourceName ?? "CSV import",
            SourceType = request.Channel.ToString(),
            RowCount = rows.Count
        };

        foreach (var row in rows)
        {
            if (!row.CanImport)
            {
                batch.SkippedCount++;
                batch.IssueCount++;
                batch.Rows.Add(ToImportRow(row, null, ImportRowAction.Skipped));
                continue;
            }

            var normalizedHandle = CreatorMapping.NormalizeHandle(row.Handle ?? normalizer.ExtractHandle(row.ProfileUrl));
            var account = await db.CreatorAccounts
                .Include(x => x.Creator)
                .FirstOrDefaultAsync(x => x.Platform == platform && x.NormalizedHandle == normalizedHandle, cancellationToken);

            Creator creator;
            ImportRowAction action;
            if (account?.Creator is not null)
            {
                creator = account.Creator;
                ApplyRow(creator, account, row);
                updated++;
                action = ImportRowAction.Updated;
            }
            else
            {
                creator = new Creator();
                account = new CreatorAccount
                {
                    Creator = creator,
                    Platform = platform,
                    NormalizedHandle = normalizedHandle
                };

                creator.Accounts.Add(account);
                ApplyRow(creator, account, row);
                db.Creators.Add(creator);
                created++;
                action = ImportRowAction.Created;
            }

            batch.Rows.Add(ToImportRow(row, creator.Id, action));
        }

        batch.CreatedCount = created;
        batch.UpdatedCount = updated;
        db.ImportBatches.Add(batch);
        await db.SaveChangesAsync(cancellationToken);

        return CreatorMapping.Summarize(rows, created, updated);
    }

    private async Task<IReadOnlyList<CreatorImportPreviewRowDto>> ParseAsync(
        Stream csvStream,
        CreatorImportPreviewRequestDto request,
        CancellationToken cancellationToken)
    {
        using var reader = new StreamReader(csvStream);
        using var csv = new CsvReader(reader, new CsvConfiguration(CultureInfo.InvariantCulture)
        {
            BadDataFound = null,
            MissingFieldFound = null,
            HeaderValidated = null,
            TrimOptions = TrimOptions.Trim
        });

        var rows = new List<CreatorImportPreviewRowDto>();
        if (request.HasHeaderRow)
        {
            await csv.ReadAsync();
            csv.ReadHeader();
        }

        while (await csv.ReadAsync())
        {
            cancellationToken.ThrowIfCancellationRequested();
            rows.Add(ToPreviewRow(csv, request));
        }

        var seenHandles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var duplicates = rows
            .Where(x => !string.IsNullOrWhiteSpace(x.Handle))
            .Where(row =>
            {
                var handle = CreatorMapping.NormalizeHandle(row.Handle);
                return handle.Length > 0 && !seenHandles.Add(handle);
            })
            .Select(row => row.RowNumber)
            .ToHashSet();

        if (duplicates.Count == 0)
        {
            return rows;
        }

        return rows
            .Select(row => duplicates.Contains(row.RowNumber)
                ? row with { Errors = row.Errors.Concat(["Duplicate handle already appears earlier in this file; skipped."]).ToList() }
                : row)
            .ToList();
    }

    private CreatorImportPreviewRowDto ToPreviewRow(CsvReader csv, CreatorImportPreviewRequestDto request)
    {
        var raw = request.HasHeaderRow
            ? ReadRawValues(csv)
            : new Dictionary<string, string?>();

        string? Field(string header, int index)
        {
            if (request.HasHeaderRow)
            {
                return GetField(csv, header);
            }

            return csv.TryGetField(index, out string? value) ? value : null;
        }

        var profile = normalizer.NormalizeProfileUrl(Field("Profile", 1) ?? Field("Profile URL", 1) ?? Field("profile", 1));
        var handle = normalizer.NormalizeText(Field("Handle", 11)) ?? normalizer.ExtractHandle(profile);
        var followersRaw = Field("Followers", 2);
        var firstMessage = normalizer.ParseDate(Field("1st message", 3));
        var secondMessage = normalizer.ParseDate(Field("2nd message", 6));
        var lastContact = normalizer.ParseDate(Field("Last contact", 7)) ?? CreatorMapping.MostRecent(secondMessage, firstMessage);
        var responseStatus = normalizer.NormalizeText(Field("Responded", 4));
        var responded = normalizer.ParseBoolean(responseStatus);
        var errors = new List<string>();
        var warnings = new List<string>();

        if (profile is null)
        {
            errors.Add("Profile is required.");
        }

        if (handle is null)
        {
            errors.Add("Could not extract a handle from the profile URL.");
        }

        var inferredHandle = normalizer.ExtractHandle(profile);
        if (handle is not null && inferredHandle is null)
        {
            warnings.Add("Profile URL does not look like a supported Instagram or TikTok URL.");
        }

        return new CreatorImportPreviewRowDto
        {
            RowNumber = csv.Context.Parser?.Row ?? 0,
            Channel = request.Channel,
            MessageVersion = normalizer.NormalizeText(Field("Message version", 0)),
            ProfileUrl = profile ?? string.Empty,
            Handle = handle,
            RawFollowers = normalizer.NormalizeText(followersRaw),
            Followers = normalizer.ParseFollowerCount(followersRaw),
            FirstMessageDate = firstMessage,
            Responded = responded,
            ResponseStatus = responseStatus,
            Email = normalizer.NormalizeText(Field("Email", 5)),
            ThreadsUrl = normalizer.NormalizeProfileUrl(Field("Threads", 10) ?? Field("Threads URL", 10) ?? Field("Threads profile", 10)),
            SecondMessageDate = secondMessage,
            LastContactDate = lastContact,
            Code = normalizer.NormalizeText(Field("Code", 8)),
            ResumeContact = normalizer.ParseBoolean(Field("Återuppta kontakt", 9) ?? Field("Resume contact", 9)),
            RawValues = raw,
            Warnings = warnings,
            Errors = errors
        };
    }

    private static string? GetField(CsvReader csv, string header) =>
        csv.TryGetField(header, out string? value) ? value : null;

    private static Dictionary<string, string?> ReadRawValues(CsvReader csv)
    {
        var raw = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
        var headers = csv.HeaderRecord ?? [];
        var counts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

        for (var i = 0; i < headers.Length; i++)
        {
            var header = string.IsNullOrWhiteSpace(headers[i]) ? $"Column {i + 1}" : headers[i];
            counts.TryGetValue(header, out var count);
            counts[header] = count + 1;
            var key = count == 0 ? header : $"{header} ({count + 1})";
            raw[key] = csv.TryGetField(i, out string? value) ? value : null;
        }

        return raw;
    }

    private static void ApplyRow(Creator creator, CreatorAccount account, CreatorImportPreviewRowDto row)
    {
        creator.DisplayName = CreatorMapping.DisplayNameFor(row);
        creator.Email = row.Email;
        creator.ThreadsUrl = row.ThreadsUrl;
        creator.Notes = CreatorMapping.BuildNotes(row);
        creator.LastContactedAt = row.LastContactDate ?? CreatorMapping.MostRecent(row.SecondMessageDate, row.FirstMessageDate);
        creator.LastResponseAt = row.Responded == true || IsPositiveResponse(row.ResponseStatus) ? row.LastContactDate ?? creator.LastContactedAt : null;
        creator.Status = StatusFor(row, creator.LastContactedAt.HasValue);
        creator.UpdatedAt = DateTimeOffset.UtcNow;

        account.Handle = row.Handle ?? account.Handle;
        account.NormalizedHandle = CreatorMapping.NormalizeHandle(row.Handle ?? account.Handle);
        account.ProfileUrl = row.ProfileUrl;
        account.FollowerCount = row.Followers;
        account.RawFollowerCount = row.RawFollowers;
        account.SourceName = row.Channel.ToString();
        account.UpdatedAt = DateTimeOffset.UtcNow;
    }

    private static OutreachStatus StatusFor(CreatorImportPreviewRowDto row, bool hasContact)
    {
        var response = row.ResponseStatus?.Trim().ToLowerInvariant();
        if (response is null)
        {
            return hasContact ? OutreachStatus.Contacted : OutreachStatus.NotContacted;
        }

        if (response.Contains("not interested") || response.Contains("no thanks"))
        {
            return OutreachStatus.NotInterested;
        }

        if (response.Contains("interested"))
        {
            return OutreachStatus.Interested;
        }

        if (response.Contains("followup") || response.Contains("follow up"))
        {
            return OutreachStatus.Responded;
        }

        return row.Responded == true
            ? OutreachStatus.Responded
            : hasContact ? OutreachStatus.Contacted : OutreachStatus.NotContacted;
    }

    private static bool IsPositiveResponse(string? responseStatus)
    {
        var response = responseStatus?.Trim().ToLowerInvariant();
        return response is not null && response != "no" && response != "false" && response != "nej";
    }

    private static ImportRow ToImportRow(CreatorImportPreviewRowDto row, Guid? creatorId, ImportRowAction action) => new()
    {
        RowNumber = row.RowNumber,
        MatchedCreatorId = creatorId,
        Action = action,
        IssueMessage = row.Errors.Count > 0 ? string.Join("; ", row.Errors) : null,
        RawJson = JsonSerializer.Serialize(row.RawValues)
    };
}
