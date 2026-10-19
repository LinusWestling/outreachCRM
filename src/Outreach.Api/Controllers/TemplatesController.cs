using Microsoft.AspNetCore.Mvc;
using Outreach.Api.Realtime;
using Outreach.Application.Creators;
using Outreach.Application.Creators.Services;

namespace Outreach.Api.Controllers;

[ApiController]
[Route("api/templates")]
public sealed class TemplatesController(IMessageTemplateService templates, IOutreachRealtimePublisher realtime) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<MessageTemplateDto>>> List(CancellationToken cancellationToken)
    {
        return Ok(await templates.ListAsync(cancellationToken));
    }

    [HttpGet("active")]
    public async Task<ActionResult<MessageTemplateDto>> Active([FromQuery] string? kind, CancellationToken cancellationToken)
    {
        try
        {
            var active = await templates.GetActiveAsync(kind, cancellationToken);
            return active is null ? NotFound() : Ok(active);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost]
    public async Task<ActionResult<MessageTemplateDto>> Create(
        [FromQuery] string? kind,
        [FromBody] SaveMessageTemplateRequestDto request,
        CancellationToken cancellationToken)
    {
        try
        {
            var created = await templates.CreateAsync(request, kind, cancellationToken);
            await PublishTemplateChangeAsync("created", created.Id, cancellationToken);
            return CreatedAtAction(nameof(List), new { id = created.Id }, created);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<MessageTemplateDto>> Update(
        Guid id,
        [FromQuery] string? kind,
        [FromBody] SaveMessageTemplateRequestDto request,
        CancellationToken cancellationToken)
    {
        try
        {
            var updated = await templates.UpdateAsync(id, request, kind, cancellationToken);
            if (updated is not null)
            {
                await PublishTemplateChangeAsync("updated", updated.Id, cancellationToken);
            }

            return updated is null ? NotFound() : Ok(updated);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("{id:guid}/activate")]
    public async Task<ActionResult<MessageTemplateDto>> Activate(Guid id, CancellationToken cancellationToken)
    {
        var activated = await templates.ActivateAsync(id, cancellationToken);
        if (activated is not null)
        {
            await PublishTemplateChangeAsync("activated", activated.Id, cancellationToken);
        }

        return activated is null ? NotFound() : Ok(activated);
    }

    [HttpDelete("{id:guid}")]
    public async Task<ActionResult<MessageTemplateDto>> Delete(Guid id, CancellationToken cancellationToken)
    {
        var deleted = await templates.DeleteAsync(id, cancellationToken);
        if (deleted is not null)
        {
            await PublishTemplateChangeAsync("deleted", deleted.Id, cancellationToken);
        }

        return deleted is null ? NotFound() : Ok(deleted);
    }

    private ValueTask PublishTemplateChangeAsync(string action, Guid? entityId, CancellationToken cancellationToken) =>
        realtime.PublishAsync(new OutreachRealtimeEvent
        {
            Type = "templates-changed",
            Action = action,
            EntityId = entityId
        }, cancellationToken);
}
