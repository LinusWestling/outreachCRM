namespace Outreach.Application.Creators.Export;

public sealed record CreatorExportOptionsDto
{
    public bool IncludeHeader { get; init; } = true;

    public string? FileName { get; init; }
}
