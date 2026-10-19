using Outreach.Application.Creators;

namespace Outreach.Application.Creators.Services;

public interface ICreatorDirectoryService
{
    Task<PagedResultDto<CreatorListItemDto>> ListAsync(
        CreatorListingFiltersDto filters,
        CancellationToken cancellationToken = default);

    Task<DailyOutreachCountsDto> GetDailyOutreachCountsAsync(
        DateOnly? date = null,
        CancellationToken cancellationToken = default);

    Task<CreatorStatsDto> GetStatsAsync(CancellationToken cancellationToken = default);

    Task<IReadOnlyList<CreatorListItemDto>> ListPendingAsync(CancellationToken cancellationToken = default);

    Task<IReadOnlyList<CreatorListItemDto>> ListEmailFollowUpCandidatesAsync(
        int minimumDaysWithoutContact = 7,
        DateOnly? asOf = null,
        CancellationToken cancellationToken = default);

    Task<PendingCreatorDuplicateCheckDto> CheckPendingDuplicateAsync(
        string profileUrl,
        CancellationToken cancellationToken = default);

    Task<CreatorListItemDto> CreatePendingAsync(
        CreatePendingCreatorRequestDto request,
        CancellationToken cancellationToken = default);

    Task<CreatorListItemDto?> UpdateAsync(
        Guid id,
        UpdateCreatorWorkflowRequestDto request,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<CreatorListItemDto>> BulkUpdateAsync(
        BulkUpdateCreatorsRequestDto request,
        CancellationToken cancellationToken = default);

    Task<CreatorListItemDto?> CompletePendingAsync(
        Guid id,
        CompletePendingCreatorRequestDto request,
        CancellationToken cancellationToken = default);

    Task<CreatorListItemDto?> MarkPendingReadyAsync(
        Guid id,
        CancellationToken cancellationToken = default);

    Task<CreatorListItemDto?> DeletePendingAsync(
        Guid id,
        CancellationToken cancellationToken = default);
}
