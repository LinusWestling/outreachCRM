using Outreach.Application.Creators;

namespace Outreach.Application.Creators.Import;

public sealed record CreatorImportPreviewRequestDto
{
    public required CreatorChannel Channel { get; init; }

    public string? SourceName { get; init; }

    public bool HasHeaderRow { get; init; } = true;
}
