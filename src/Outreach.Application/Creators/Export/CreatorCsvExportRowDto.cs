using Outreach.Application.Creators;

namespace Outreach.Application.Creators.Export;

public sealed record CreatorCsvExportRowDto
{
    public string? MessageVersion { get; init; }

    public required string Profile { get; init; }

    public string? Followers { get; init; }

    public string? FirstMessage { get; init; }

    public string? Responded { get; init; }

    public string? Email { get; init; }

    public string? Threads { get; init; }

    public string? SecondMessage { get; init; }

    public string? LastContact { get; init; }

    public string? Code { get; init; }

    public string? ResumeContact { get; init; }

    public CreatorChannel Channel { get; init; }
}
