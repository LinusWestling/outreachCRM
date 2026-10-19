using Outreach.Application.Creators.Import;

namespace Outreach.Application.Creators.Services;

public interface ICreatorImportService
{
    Task<CreatorImportResultDto> PreviewAsync(
        Stream csvStream,
        CreatorImportPreviewRequestDto request,
        CancellationToken cancellationToken = default);

    Task<CreatorImportSummaryDto> ImportAsync(
        Stream csvStream,
        CreatorImportPreviewRequestDto request,
        CancellationToken cancellationToken = default);
}
