using Outreach.Application.Creators;

namespace Outreach.Application.Creators.Import;

public sealed record CreatorImportPreviewRowDto
{
    public int RowNumber { get; init; }

    public CreatorChannel Channel { get; init; }

    public string? MessageVersion { get; init; }

    public required string ProfileUrl { get; init; }

    public string? Handle { get; init; }

    public string? RawFollowers { get; init; }

    public int? Followers { get; init; }

    public DateOnly? FirstMessageDate { get; init; }

    public bool? Responded { get; init; }

    public string? ResponseStatus { get; init; }

    public string? Email { get; init; }

    public string? ThreadsUrl { get; init; }

    public DateOnly? SecondMessageDate { get; init; }

    public DateOnly? LastContactDate { get; init; }

    public string? Code { get; init; }

    public bool? ResumeContact { get; init; }

    public IReadOnlyDictionary<string, string?> RawValues { get; init; } =
        new Dictionary<string, string?>();

    public IReadOnlyList<string> Warnings { get; init; } = [];

    public IReadOnlyList<string> Errors { get; init; } = [];

    public bool CanImport => Errors.Count == 0;
}
