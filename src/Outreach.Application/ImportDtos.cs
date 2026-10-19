using Outreach.Domain;

namespace Outreach.Application;

public sealed record ImportPreviewRequest(string SourceName, string CsvText);

public sealed record ImportPreviewRow(
    int RowNumber,
    Platform? Platform,
    string Profile,
    string? Handle,
    string? NormalizedHandle,
    string? MessageVersion,
    string? RawFollowers,
    int? FollowerCount,
    DateOnly? FirstMessageAt,
    DateOnly? LastContactAt,
    DateOnly? NextFollowUpAt,
    bool HasResponded,
    string? Email,
    string? Code,
    ImportRowAction SuggestedAction,
    string? Issue,
    IReadOnlyDictionary<string, string?> Raw);

public sealed record ImportPreviewResponse(
    string SourceName,
    int RowCount,
    int ValidRows,
    int IssueRows,
    IReadOnlyList<ImportPreviewRow> Rows);

public sealed record ImportConfirmRequest(string SourceName, IReadOnlyList<ImportPreviewRow> Rows);

public sealed record ImportSummaryDto(
    Guid ImportBatchId,
    int RowCount,
    int CreatedCount,
    int UpdatedCount,
    int SkippedCount,
    int IssueCount);

public sealed record ExportCreatorRow(
    string DisplayName,
    string Platform,
    string Handle,
    string ProfileUrl,
    int? Followers,
    string Status,
    string Priority,
    DateOnly? LastContactedAt,
    DateOnly? NextFollowUpAt,
    string? Email);
