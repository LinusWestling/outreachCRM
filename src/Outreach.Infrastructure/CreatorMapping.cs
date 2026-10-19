using System.Globalization;
using Outreach.Application.Creators;
using Outreach.Application.Creators.Import;
using Outreach.Domain;

namespace Outreach.Infrastructure;

internal static class CreatorMapping
{
    public const string LegacyDefaultMessageBody = "Personalize this outreach message for the creator before sending.";

    public static Platform ToPlatform(this CreatorChannel channel) =>
        channel == CreatorChannel.TikTok ? Platform.TikTok : Platform.Instagram;

    public static CreatorChannel ToChannel(this Platform platform) =>
        platform == Platform.TikTok ? CreatorChannel.TikTok : CreatorChannel.Instagram;

    public static string NormalizeHandle(string? handle) =>
        string.IsNullOrWhiteSpace(handle)
            ? string.Empty
            : handle.Trim().TrimStart('@').ToLowerInvariant();

    public static DateOnly? LastContactDate(Creator creator)
    {
        var metadata = ParseNotes(creator.Notes);
        return TryParseDate(metadata, "LastContactDate", out var lastContact) ? lastContact : creator.LastContactedAt;
    }

    public static DateOnly? FirstMessageDate(Creator creator)
    {
        var metadata = ParseNotes(creator.Notes);
        return TryParseDate(metadata, "FirstMessageDate", out var firstMessage) ? firstMessage : creator.LastContactedAt;
    }

    public static DateOnly? ExplicitFirstMessageDate(Creator creator)
    {
        var metadata = ParseNotes(creator.Notes);
        return TryParseDate(metadata, "FirstMessageDate", out var firstMessage) ? firstMessage : null;
    }

    public static DateOnly? SecondMessageDate(Creator creator)
    {
        var metadata = ParseNotes(creator.Notes);
        return TryParseDate(metadata, "SecondMessageDate", out var secondMessage) ? secondMessage : null;
    }

    public static string? MessageVersion(Creator creator) => ParseNotes(creator.Notes).GetValueOrDefault("MessageVersion");

    public static string? Code(Creator creator) => ParseNotes(creator.Notes).GetValueOrDefault("Code");

    public static string ResponseStatus(Creator creator)
    {
        if (creator.Status == OutreachStatus.Archived)
        {
            return "Archived";
        }

        if (creator.Status == OutreachStatus.NotInterested)
        {
            return "Not Interested";
        }

        if (creator.LastResponseAt.HasValue ||
            creator.Status is OutreachStatus.Responded or OutreachStatus.Interested or OutreachStatus.Partnered)
        {
            return "Yes";
        }

        return "No";
    }

    public static bool? ResumeContact(Creator creator)
    {
        var metadata = ParseNotes(creator.Notes);
        return bool.TryParse(metadata.GetValueOrDefault("ResumeContact"), out var parsed) ? parsed : null;
    }

    public static bool? Responded(Creator creator)
    {
        if (creator.LastResponseAt.HasValue)
        {
            return true;
        }

        return creator.Status is OutreachStatus.Responded or OutreachStatus.Interested or OutreachStatus.NotInterested
            ? true
            : creator.Status is OutreachStatus.NotContacted ? null : false;
    }

    public static CreatorListItemDto ToListItem(
        Creator creator,
        CreatorAccount account,
        ContactLog? messageLog = null,
        ContactLog? emailFollowUpLog = null) => new()
    {
        Id = creator.Id,
        ProfileUrl = account.ProfileUrl,
        Handle = account.Handle,
        Channel = account.Platform.ToChannel(),
        Followers = account.FollowerCount,
        MessageVersion = MessageVersion(creator),
        FirstMessageDate = FirstMessageDate(creator),
        ResponseStatus = ResponseStatus(creator),
        Responded = Responded(creator),
        Email = creator.Email,
        ThreadsUrl = creator.ThreadsUrl,
        SecondMessageDate = SecondMessageDate(creator),
        LastContactDate = LastContactDate(creator),
        Code = Code(creator),
        ResumeContact = ResumeContact(creator),
        MessageTemplateId = messageLog?.MessageTemplateId,
        MessageBody = ResolveMessageBody(messageLog),
        EmailTemplateId = emailFollowUpLog?.MessageTemplateId,
        EmailSubject = ResolveEmailSubject(emailFollowUpLog),
        EmailBody = ResolveMessageBody(emailFollowUpLog),
        IsReadyForAction = creator.ProspectReadyAt.HasValue,
        ProspectReadyAt = creator.ProspectReadyAt
    };

    public static string BuildNotes(CreatorImportPreviewRowDto row)
    {
        var values = new Dictionary<string, string?>
        {
            ["MessageVersion"] = row.MessageVersion,
            ["FirstMessageDate"] = FormatDate(row.FirstMessageDate),
            ["SecondMessageDate"] = FormatDate(row.SecondMessageDate),
            ["LastContactDate"] = FormatDate(row.LastContactDate),
            ["Code"] = row.Code,
            ["ResponseStatus"] = row.ResponseStatus,
            ["ResumeContact"] = row.ResumeContact?.ToString(CultureInfo.InvariantCulture)
        };

        return string.Join(
            Environment.NewLine,
            values.Where(x => !string.IsNullOrWhiteSpace(x.Value)).Select(x => $"{x.Key}: {x.Value}"));
    }

    public static string BuildNotes(
        string? messageVersion,
        DateOnly? firstMessageDate,
        DateOnly? secondMessageDate,
        DateOnly? lastContactDate,
        string? code,
        bool? resumeContact)
    {
        var values = new Dictionary<string, string?>
        {
            ["MessageVersion"] = messageVersion,
            ["FirstMessageDate"] = FormatDate(firstMessageDate),
            ["SecondMessageDate"] = FormatDate(secondMessageDate),
            ["LastContactDate"] = FormatDate(lastContactDate),
            ["Code"] = code,
            ["ResumeContact"] = resumeContact?.ToString(CultureInfo.InvariantCulture)
        };

        return string.Join(
            Environment.NewLine,
            values.Where(x => !string.IsNullOrWhiteSpace(x.Value)).Select(x => $"{x.Key}: {x.Value}"));
    }

    public static IReadOnlyDictionary<string, string?> ParseNotes(string? notes)
    {
        var values = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
        if (string.IsNullOrWhiteSpace(notes))
        {
            return values;
        }

        foreach (var line in notes.Split(Environment.NewLine, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var separator = line.IndexOf(':', StringComparison.Ordinal);
            if (separator <= 0)
            {
                continue;
            }

            values[line[..separator].Trim()] = line[(separator + 1)..].Trim();
        }

        return values;
    }

    public static DateOnly? MostRecent(params DateOnly?[] dates)
    {
        var presentDates = dates.Where(x => x.HasValue).Select(x => x!.Value).ToList();
        return presentDates.Count == 0 ? null : presentDates.Max();
    }

    public static string DisplayNameFor(CreatorImportPreviewRowDto row) =>
        !string.IsNullOrWhiteSpace(row.Handle) ? row.Handle.TrimStart('@') : row.ProfileUrl;

    public static string? FormatDate(DateOnly? value) =>
        value?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    public static CreatorImportSummaryDto Summarize(IReadOnlyList<CreatorImportPreviewRowDto> rows, int created = 0, int updated = 0)
    {
        var duplicateProfiles = rows
            .Where(x => !string.IsNullOrWhiteSpace(x.ProfileUrl))
            .GroupBy(x => x.ProfileUrl, StringComparer.OrdinalIgnoreCase)
            .Count(x => x.Count() > 1);

        return new CreatorImportSummaryDto
        {
            TotalRows = rows.Count,
            ImportableRows = rows.Count(x => x.CanImport),
            RowsWithWarnings = rows.Count(x => x.Warnings.Count > 0),
            InvalidRows = rows.Count(x => !x.CanImport),
            CreatedCount = created,
            UpdatedCount = updated,
            SkippedCount = rows.Count(x => !x.CanImport),
            DuplicateProfileCount = duplicateProfiles,
            RowsByChannel = rows.GroupBy(x => x.Channel).ToDictionary(x => x.Key, x => x.Count()),
            Messages = rows.Any(x => !x.CanImport) ? ["Rows with errors were skipped."] : []
        };
    }

    private static bool TryParseDate(IReadOnlyDictionary<string, string?> metadata, string key, out DateOnly value) =>
        DateOnly.TryParseExact(
            metadata.GetValueOrDefault(key),
            "yyyy-MM-dd",
            CultureInfo.InvariantCulture,
            DateTimeStyles.None,
            out value);

    private static string? ResolveMessageBody(ContactLog? messageLog)
    {
        if (messageLog?.MessageTemplate is not { } template)
        {
            return messageLog?.MessageBody;
        }

        return ShouldUseTemplateBody(messageLog.MessageBody, template.Body)
            ? template.Body
            : messageLog.MessageBody;
    }

    private static string? ResolveEmailSubject(ContactLog? emailFollowUpLog)
    {
        if (emailFollowUpLog is null)
        {
            return null;
        }

        return !string.IsNullOrWhiteSpace(emailFollowUpLog.MessageSubject)
            ? emailFollowUpLog.MessageSubject
            : emailFollowUpLog.MessageTemplate?.Kind == MessageTemplateKind.Email
                ? emailFollowUpLog.MessageTemplate.Subject
                : null;
    }

    private static bool ShouldUseTemplateBody(string? messageBody, string? templateBody) =>
        !string.IsNullOrWhiteSpace(templateBody) &&
        (string.IsNullOrWhiteSpace(messageBody) ||
         string.Equals(messageBody.Trim(), LegacyDefaultMessageBody, StringComparison.Ordinal));
}
