using Outreach.Application.Creators;

namespace Outreach.Application.Creators.Services;

public interface IEmailFollowUpSender
{
    Task<CreatorListItemDto?> SendAsync(Guid creatorId, CancellationToken cancellationToken = default);
}
