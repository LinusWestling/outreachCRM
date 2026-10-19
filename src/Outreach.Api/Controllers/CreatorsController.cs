using Microsoft.AspNetCore.Mvc;
using Outreach.Api.Realtime;
using Outreach.Application.Creators;
using Outreach.Application.Creators.Services;

namespace Outreach.Api.Controllers;

[ApiController]
[Route("api/creators")]
public sealed class CreatorsController(
    ICreatorDirectoryService creators,
    ICreatorConversionService conversions,
    IEmailFollowUpSender emailFollowUps,
    IOutreachRealtimePublisher realtime) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PagedResultDto<CreatorListItemDto>>> List(
        [FromQuery] CreatorListingFiltersDto filters,
        CancellationToken cancellationToken)
    {
        return Ok(await creators.ListAsync(filters, cancellationToken));
    }

    [HttpGet("daily-outreach-counts")]
    public async Task<ActionResult<DailyOutreachCountsDto>> DailyOutreachCounts(
        [FromQuery] DateOnly? date,
        CancellationToken cancellationToken)
    {
        return Ok(await creators.GetDailyOutreachCountsAsync(date, cancellationToken));
    }

    [HttpGet("conversion-summary")]
    public async Task<ActionResult<CreatorConversionSummaryDto>> ConversionSummary(
        [FromQuery] CreatorListingFiltersDto filters,
        CancellationToken cancellationToken)
    {
        return Ok(await conversions.GetSummaryAsync(filters, cancellationToken));
    }

    [HttpGet("stats")]
    public async Task<ActionResult<CreatorStatsDto>> Stats(CancellationToken cancellationToken)
    {
        return Ok(await creators.GetStatsAsync(cancellationToken));
    }

    [HttpGet("pending")]
    public async Task<ActionResult<IReadOnlyList<CreatorListItemDto>>> Pending(CancellationToken cancellationToken)
    {
        return Ok(await creators.ListPendingAsync(cancellationToken));
    }

    [HttpGet("email-follow-up-candidates")]
    public async Task<ActionResult<IReadOnlyList<CreatorListItemDto>>> EmailFollowUpCandidates(
        [FromQuery] int daysWithoutContact = 7,
        [FromQuery] DateOnly? asOf = null,
        CancellationToken cancellationToken = default)
    {
        return Ok(await creators.ListEmailFollowUpCandidatesAsync(daysWithoutContact, asOf, cancellationToken));
    }

    [HttpGet("pending/duplicate-check")]
    public async Task<ActionResult<PendingCreatorDuplicateCheckDto>> CheckPendingDuplicate(
        [FromQuery] string profileUrl,
        CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await creators.CheckPendingDuplicateAsync(profileUrl, cancellationToken));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("pending")]
    public async Task<ActionResult<CreatorListItemDto>> CreatePending(
        CreatePendingCreatorRequestDto request,
        CancellationToken cancellationToken)
    {
        try
        {
            var created = await creators.CreatePendingAsync(request, cancellationToken);
            await PublishCreatorChangeAsync("created", created.Id, cancellationToken);
            return CreatedAtAction(nameof(Pending), new { id = created.Id }, created);
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

    [HttpDelete("pending/{id:guid}")]
    public async Task<ActionResult<CreatorListItemDto>> DeletePending(
        Guid id,
        CancellationToken cancellationToken)
    {
        var deleted = await creators.DeletePendingAsync(id, cancellationToken);
        if (deleted is not null)
        {
            await PublishCreatorChangeAsync("deleted-pending", deleted.Id, cancellationToken);
        }

        return deleted is null
            ? NotFound(new { message = "Prospect was not found in the queue. It may already have been removed or completed." })
            : Ok(deleted);
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<CreatorListItemDto>> Update(
        Guid id,
        UpdateCreatorWorkflowRequestDto request,
        CancellationToken cancellationToken)
    {
        var updated = await creators.UpdateAsync(id, request, cancellationToken);
        if (updated is not null)
        {
            await PublishCreatorChangeAsync("updated", updated.Id, cancellationToken);
        }

        return updated is null ? NotFound() : Ok(updated);
    }

    [HttpPut("bulk")]
    public async Task<ActionResult<IReadOnlyList<CreatorListItemDto>>> BulkUpdate(
        BulkUpdateCreatorsRequestDto request,
        CancellationToken cancellationToken)
    {
        if (request.CreatorIds is not { Count: > 0 } ||
            !request.CreatorIds.Any(id => id != Guid.Empty))
        {
            return BadRequest(new { message = "Select at least one creator to update." });
        }

        if (!request.FirstMessageDate.HasValue &&
            !request.LastContactDate.HasValue &&
            !request.SetResponseStatus &&
            !request.SetMessage)
        {
            return BadRequest(new { message = "Choose at least one bulk field to update." });
        }

        try
        {
            var updated = await creators.BulkUpdateAsync(request, cancellationToken);
            await PublishCreatorChangeAsync("bulk-updated", null, cancellationToken);
            return Ok(updated);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("{id:guid}/email-follow-up/send")]
    public async Task<ActionResult<CreatorListItemDto>> SendEmailFollowUp(
        Guid id,
        CancellationToken cancellationToken)
    {
        try
        {
            var sent = await emailFollowUps.SendAsync(id, cancellationToken);
            if (sent is null)
            {
                return NotFound();
            }

            await PublishCreatorChangeAsync("email-follow-up-sent", sent.Id, cancellationToken);
            return Ok(sent);
        }
        catch (EmailDeliveryException ex)
        {
            return StatusCode(StatusCodes.Status502BadGateway, new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("pending/{id:guid}/complete")]
    public async Task<ActionResult<CreatorListItemDto>> CompletePending(
        Guid id,
        CompletePendingCreatorRequestDto request,
        CancellationToken cancellationToken)
    {
        var completed = await creators.CompletePendingAsync(id, request, cancellationToken);
        if (completed is not null)
        {
            await PublishCreatorChangeAsync("completed", completed.Id, cancellationToken);
        }

        return completed is null ? NotFound() : Ok(completed);
    }

    [HttpPost("pending/{id:guid}/ready")]
    public async Task<ActionResult<CreatorListItemDto>> MarkPendingReady(
        Guid id,
        CancellationToken cancellationToken)
    {
        try
        {
            var marked = await creators.MarkPendingReadyAsync(id, cancellationToken);
            if (marked is not null)
            {
                await PublishCreatorChangeAsync("marked-ready", marked.Id, cancellationToken);
            }

            return marked is null ? NotFound() : Ok(marked);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    private ValueTask PublishCreatorChangeAsync(string action, Guid? entityId, CancellationToken cancellationToken) =>
        realtime.PublishAsync(new OutreachRealtimeEvent
        {
            Type = "creators-changed",
            Action = action,
            EntityId = entityId
        }, cancellationToken);
}
