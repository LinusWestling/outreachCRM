namespace Outreach.Domain;

public sealed class ImportBatch
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string SourceName { get; set; } = string.Empty;
    public string SourceType { get; set; } = string.Empty;
    public DateTimeOffset ImportedAt { get; set; } = DateTimeOffset.UtcNow;
    public int RowCount { get; set; }
    public int CreatedCount { get; set; }
    public int UpdatedCount { get; set; }
    public int SkippedCount { get; set; }
    public int IssueCount { get; set; }

    public List<ImportRow> Rows { get; set; } = [];
}
