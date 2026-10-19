namespace Outreach.Api.Realtime;

public interface IOutreachRealtimePublisher
{
    IAsyncEnumerable<OutreachRealtimeEvent> SubscribeAsync(CancellationToken cancellationToken);

    ValueTask PublishAsync(OutreachRealtimeEvent realtimeEvent, CancellationToken cancellationToken = default);
}
