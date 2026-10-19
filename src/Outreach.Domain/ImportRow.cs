namespace Outreach.Domain;

public sealed class ImportRow
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ImportBatchId { get; set; }
    public int RowNumber { get; set; }
    public string RawJson { get; set; } = "{}";
    public Guid? MatchedCreatorId { get; set; }
    public ImportRowAction Action { get; set; }
    public string? IssueMessage { get; set; }

    public ImportBatch? ImportBatch { get; set; }
    public Creator? MatchedCreator { get; set; }
}
