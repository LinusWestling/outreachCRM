using Outreach.Application.Creators;
using Outreach.Application.Creators.Export;

namespace Outreach.Application.Creators.Services;

public interface ICreatorExportService
{
    Task<CreatorCsvExportDto> ExportCsvAsync(
        CreatorListingFiltersDto filters,
        CreatorExportOptionsDto? options = null,
        CancellationToken cancellationToken = default);
}
