using Outreach.Application.Creators;

namespace Outreach.Application.Creators.Services;

public interface IMessageTemplateService
{
    Task<IReadOnlyList<MessageTemplateDto>> ListAsync(CancellationToken cancellationToken = default);

    Task<MessageTemplateDto?> GetActiveAsync(CancellationToken cancellationToken = default);

    Task<MessageTemplateDto?> GetActiveAsync(string? kind, CancellationToken cancellationToken = default);

    Task<MessageTemplateDto> CreateAsync(
        SaveMessageTemplateRequestDto request,
        string? requestedKind = null,
        CancellationToken cancellationToken = default);

    Task<MessageTemplateDto?> UpdateAsync(
        Guid id,
        SaveMessageTemplateRequestDto request,
        string? requestedKind = null,
        CancellationToken cancellationToken = default);

    Task<MessageTemplateDto?> ActivateAsync(Guid id, CancellationToken cancellationToken = default);

    Task<MessageTemplateDto?> DeleteAsync(Guid id, CancellationToken cancellationToken = default);
}
