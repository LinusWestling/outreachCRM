namespace Outreach.Application.Creators;

public sealed record CreatorListingFiltersDto
{
    public string? Search { get; init; }

    public IReadOnlyCollection<CreatorChannel> Channels { get; init; } = [];

    public string? ResponseStatus { get; init; }

    public bool? HasEmail { get; init; }

    public bool? HasCode { get; init; }

    public bool? ResumeContact { get; init; }

    public DateOnly? FirstMessageFrom { get; init; }

    public DateOnly? FirstMessageTo { get; init; }

    public DateOnly? LastContactFrom { get; init; }

    public DateOnly? LastContactTo { get; init; }

    public int? MinFollowers { get; init; }

    public int? MaxFollowers { get; init; }

    public IReadOnlyCollection<string> MessageVersions { get; init; } = [];

    public CreatorSortField SortBy { get; init; } = CreatorSortField.FirstMessageDate;

    public bool SortDescending { get; init; } = true;

    public int PageNumber { get; init; } = 1;

    public int PageSize { get; init; } = 50;
}
