using Microsoft.AspNetCore.Mvc;
using Outreach.Api.Realtime;
using Outreach.Application.CreatorCodes;

namespace Outreach.Api.Controllers;

[ApiController]
[Route("api/creator-codes")]
public sealed class CreatorCodesController(
    ICreatorCodeService creatorCodes,
    IOutreachRealtimePublisher realtime) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<CreatorCodeDto>>> List(
        [FromQuery] bool includeInactive = false,
        CancellationToken cancellationToken = default)
    {
        try
        {
            return Ok(await creatorCodes.ListAsync(includeInactive, cancellationToken));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { message = ex.Message });
        }
    }

    [HttpPost]
    public async Task<ActionResult<CreatorCodeDto>> Create(
        CreateCreatorCodeRequestDto request,
        CancellationToken cancellationToken)
    {
        try
        {
            var created = await creatorCodes.CreateAsync(request, cancellationToken);
            await PublishCreatorCodeChangeAsync("created", created.Id, cancellationToken);
            return Created($"/api/creator-codes/{created.Id}", created);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { message = ex.Message });
        }
    }

    [HttpPatch("{id:guid}")]
    public async Task<ActionResult<CreatorCodeDto>> Update(
        Guid id,
        UpdateCreatorCodeRequestDto request,
        CancellationToken cancellationToken)
    {
        try
        {
            var updated = await creatorCodes.UpdateAsync(id, request, cancellationToken);
            if (updated is null)
            {
                return NotFound(new { message = "Creator code was not found." });
            }

            await PublishCreatorCodeChangeAsync("updated", updated.Id, cancellationToken);
            return Ok(updated);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { message = ex.Message });
        }
    }

    [HttpPost("{id:guid}/disable")]
    public async Task<ActionResult<CreatorCodeDto>> Disable(
        Guid id,
        CancellationToken cancellationToken)
    {
        try
        {
            var disabled = await creatorCodes.DisableAsync(id, cancellationToken);
            if (disabled is null)
            {
                return NotFound(new { message = "Creator code was not found." });
            }

            await PublishCreatorCodeChangeAsync("disabled", disabled.Id, cancellationToken);
            return Ok(disabled);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { message = ex.Message });
        }
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(
        Guid id,
        CancellationToken cancellationToken)
    {
        try
        {
            var deleted = await creatorCodes.DeleteAsync(id, cancellationToken);
            if (!deleted)
            {
                return NotFound(new { message = "Creator code was not found." });
            }

            await PublishCreatorCodeChangeAsync("deleted", id, cancellationToken);
            return NoContent();
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { message = ex.Message });
        }
    }

    private ValueTask PublishCreatorCodeChangeAsync(string action, Guid? entityId, CancellationToken cancellationToken) =>
        realtime.PublishAsync(new OutreachRealtimeEvent
        {
            Type = "creator-codes-changed",
            Action = action,
            EntityId = entityId
        }, cancellationToken);
}
