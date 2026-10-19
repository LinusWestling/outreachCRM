using System.Collections.Concurrent;
using System.Runtime.CompilerServices;
using System.Threading.Channels;

namespace Outreach.Api.Realtime;

public sealed class OutreachRealtimeBroker : IOutreachRealtimePublisher
{
    private readonly ConcurrentDictionary<Guid, Channel<OutreachRealtimeEvent>> subscribers = new();

    public async IAsyncEnumerable<OutreachRealtimeEvent> SubscribeAsync([EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var id = Guid.NewGuid();
        var channel = Channel.CreateUnbounded<OutreachRealtimeEvent>(new UnboundedChannelOptions
        {
            SingleReader = true,
            SingleWriter = false
        });

        subscribers[id] = channel;

        try
        {
            yield return new OutreachRealtimeEvent
            {
                Type = "system",
                Action = "connected"
            };

            await foreach (var realtimeEvent in channel.Reader.ReadAllAsync(cancellationToken))
            {
                yield return realtimeEvent;
            }
        }
        finally
        {
            subscribers.TryRemove(id, out _);
            channel.Writer.TryComplete();
        }
    }

    public ValueTask PublishAsync(OutreachRealtimeEvent realtimeEvent, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        foreach (var subscriber in subscribers.Values)
        {
            subscriber.Writer.TryWrite(realtimeEvent);
        }

        return ValueTask.CompletedTask;
    }
}
