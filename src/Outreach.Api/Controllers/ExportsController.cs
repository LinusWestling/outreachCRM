using System.Text;
using Microsoft.AspNetCore.Mvc;
using Outreach.Application.Creators;
using Outreach.Application.Creators.Export;
using Outreach.Application.Creators.Services;

namespace Outreach.Api.Controllers;

[ApiController]
[Route("api/exports")]
public sealed class ExportsController(ICreatorExportService exports) : ControllerBase
{
    [HttpGet("creators.csv")]
    public async Task<IActionResult> CreatorsCsv(
        [FromQuery] CreatorListingFiltersDto filters,
        CancellationToken cancellationToken)
    {
        var export = await exports.ExportCsvAsync(filters, new CreatorExportOptionsDto(), cancellationToken);
        var csv = ToCsv(export);
        return File(Encoding.UTF8.GetBytes(csv), export.ContentType, export.FileName);
    }

    private static string ToCsv(CreatorCsvExportDto export)
    {
        var builder = new StringBuilder();
        builder.AppendLine(string.Join(',', export.Headers.Select(Escape)));

        foreach (var row in export.Rows)
        {
            builder.AppendLine(string.Join(',', new[]
            {
                row.Channel.ToString(),
                row.MessageVersion,
                row.Profile,
                row.Followers,
                row.FirstMessage,
                row.Responded,
                row.Email,
                row.Threads,
                row.SecondMessage,
                row.LastContact,
                row.Code,
                row.ResumeContact
            }.Select(Escape)));
        }

        return builder.ToString();
    }

    private static string Escape(string? value)
    {
        value ??= string.Empty;
        return value.Contains(',') || value.Contains('"') || value.Contains('\n') || value.Contains('\r')
            ? $"\"{value.Replace("\"", "\"\"")}\""
            : value;
    }
}
