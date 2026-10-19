namespace Outreach.Application.Creators;

public sealed record PagedResultDto<T>
{
    public IReadOnlyList<T> Items { get; init; } = [];

    public int PageNumber { get; init; }

    public int PageSize { get; init; }

    public int TotalCount { get; init; }
}
