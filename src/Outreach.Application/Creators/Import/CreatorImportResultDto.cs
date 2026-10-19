namespace Outreach.Application.Creators.Import;

public sealed record CreatorImportResultDto
{
    public required CreatorImportSummaryDto Summary { get; init; }

    public IReadOnlyList<CreatorImportPreviewRowDto> Rows { get; init; } = [];
}
