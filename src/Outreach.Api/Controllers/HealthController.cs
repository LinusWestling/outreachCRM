using Microsoft.AspNetCore.Mvc;
using Outreach.Infrastructure;

namespace Outreach.Api.Controllers;

[ApiController]
[Route("api/health")]
public sealed class HealthController(
    OutreachDbContext db,
    BundledCreatorCsvInitializer bundledCsvInitializer,
    IWebHostEnvironment environment) : ControllerBase
{
    [HttpGet]
    public ActionResult<object> Get() => Ok(new { status = "ok" });

    [HttpGet("database")]
    public async Task<ActionResult<object>> Database(CancellationToken cancellationToken)
    {
        var canConnect = await db.Database.CanConnectAsync(cancellationToken);
        return Ok(new { status = canConnect ? "ok" : "unavailable" });
    }

    [HttpPost("database/initialize")]
    public async Task<ActionResult<object>> InitializeDatabase(CancellationToken cancellationToken)
    {
        var result = await bundledCsvInitializer.InitializeAsync(environment.ContentRootPath, cancellationToken);
        return Ok(new { status = "ok", created = result.DatabaseCreated, csv = result });
    }
}
