using Outreach.Application.Creators;

namespace Outreach.Application.Creators.Services;

public interface ICreatorConversionService
{
    Task<IReadOnlyDictionary<Guid, CreatorConversionStatsDto>> GetStatsByCreatorAsync(
        IReadOnlyCollection<Guid> creatorIds,
        CancellationToken cancellationToken = default);

    Task<CreatorConversionSummaryDto> GetSummaryAsync(
        CreatorListingFiltersDto filters,
        CancellationToken cancellationToken = default);
}
