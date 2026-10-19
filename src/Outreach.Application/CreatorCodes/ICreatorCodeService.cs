namespace Outreach.Application.CreatorCodes;

public interface ICreatorCodeService
{
    Task<IReadOnlyList<CreatorCodeDto>> ListAsync(
        bool includeInactive = false,
        CancellationToken cancellationToken = default);

    Task<CreatorCodeDto> CreateAsync(
        CreateCreatorCodeRequestDto request,
        CancellationToken cancellationToken = default);

    Task<CreatorCodeDto?> UpdateAsync(
        Guid id,
        UpdateCreatorCodeRequestDto request,
        CancellationToken cancellationToken = default);

    Task<CreatorCodeDto?> DisableAsync(
        Guid id,
        CancellationToken cancellationToken = default);

    Task<bool> DeleteAsync(
        Guid id,
        CancellationToken cancellationToken = default);
}
