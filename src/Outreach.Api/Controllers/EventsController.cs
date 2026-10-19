using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Outreach.Api.Realtime;

namespace Outreach.Api.Controllers;

[ApiController]
[Route("api/events")]
public sealed class EventsController(IOutreachRealtimePublisher realtime) : ControllerBase
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    [HttpGet]
    public async Task Stream(CancellationToken cancellationToken)
    {
        Response.Headers.CacheControl = "no-cache";
        Response.Headers.Connection = "keep-alive";
        Response.ContentType = "text/event-stream";

        await foreach (var realtimeEvent in realtime.SubscribeAsync(cancellationToken))
        {
            await Response.WriteAsync($"event: {realtimeEvent.Type}\n", cancellationToken);
            await Response.WriteAsync($"data: {JsonSerializer.Serialize(realtimeEvent, JsonOptions)}\n\n", cancellationToken);
            await Response.Body.FlushAsync(cancellationToken);
        }
    }
}
