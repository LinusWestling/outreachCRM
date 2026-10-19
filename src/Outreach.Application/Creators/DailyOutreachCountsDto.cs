namespace Outreach.Application.Creators;

public sealed record DailyOutreachCountsDto
{
    public DateOnly Date { get; init; }

    public int Instagram { get; init; }

    public int TikTok { get; init; }
}

public sealed record CreatorStatsDto
{
    public int TotalCount { get; init; }

    public int RespondedCount { get; init; }

    public int NotInterestedCount { get; init; }

    public int ArchivedCount { get; init; }

    public int EmailCount { get; init; }

    public int ThreadsCount { get; init; }
}
