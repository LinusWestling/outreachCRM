namespace Outreach.Application.Creators.Export;

public sealed record CreatorCsvExportDto
{
    public string FileName { get; init; } = "creators.csv";

    public string ContentType { get; init; } = "text/csv";

    public IReadOnlyList<string> Headers { get; init; } =
    [
        "Channel",
        "Message version",
        "Profile",
        "Followers",
        "1st message",
        "Responded",
        "Email",
        "Threads",
        "2nd message",
        "Last contact",
        "Code",
        "Återuppta kontakt"
    ];

    public IReadOnlyList<CreatorCsvExportRowDto> Rows { get; init; } = [];
}
