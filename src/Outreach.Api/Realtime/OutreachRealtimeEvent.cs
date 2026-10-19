namespace Outreach.Api.Realtime;

public sealed record OutreachRealtimeEvent
{
    public required string Type { get; init; }

    public required string Action { get; init; }

    public Guid? EntityId { get; init; }

    public DateTimeOffset OccurredAt { get; init; } = DateTimeOffset.UtcNow;
}
