using Microsoft.AspNetCore.Mvc;
using Outreach.Application.Creators;
using Outreach.Application.Creators.Import;
using Outreach.Application.Creators.Services;

namespace Outreach.Api.Controllers;

[ApiController]
[Route("api/imports")]
public sealed class ImportsController(ICreatorImportService imports) : ControllerBase
{
    [HttpPost("preview")]
    [RequestSizeLimit(10_000_000)]
    public async Task<ActionResult<CreatorImportResultDto>> Preview(
        IFormFile file,
        [FromForm] CreatorChannel channel,
        [FromForm] string? sourceName,
        CancellationToken cancellationToken)
    {
        await using var stream = file.OpenReadStream();
        return Ok(await imports.PreviewAsync(stream, BuildImportRequest(channel, sourceName), cancellationToken));
    }

    [HttpPost("confirm")]
    [RequestSizeLimit(10_000_000)]
    public async Task<ActionResult<CreatorImportSummaryDto>> Confirm(
        IFormFile file,
        [FromForm] CreatorChannel channel,
        [FromForm] string? sourceName,
        CancellationToken cancellationToken)
    {
        await using var stream = file.OpenReadStream();
        return Ok(await imports.ImportAsync(stream, BuildImportRequest(channel, sourceName), cancellationToken));
    }

    private static CreatorImportPreviewRequestDto BuildImportRequest(CreatorChannel channel, string? sourceName) => new()
    {
        Channel = channel,
        SourceName = sourceName,
        HasHeaderRow = true
    };
}
