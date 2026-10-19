using Outreach.Application.Creators;

namespace Outreach.Application.Creators.Import;

public sealed record CreatorImportSummaryDto
{
    public int TotalRows { get; init; }

    public int ImportableRows { get; init; }

    public int RowsWithWarnings { get; init; }

    public int InvalidRows { get; init; }

    public int CreatedCount { get; init; }

    public int UpdatedCount { get; init; }

    public int SkippedCount { get; init; }

    public int DuplicateProfileCount { get; init; }

    public IReadOnlyDictionary<CreatorChannel, int> RowsByChannel { get; init; } =
        new Dictionary<CreatorChannel, int>();

    public IReadOnlyList<string> Messages { get; init; } = [];
}
