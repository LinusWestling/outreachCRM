namespace Outreach.Application;

public interface ICreatorService
{
    Task<IReadOnlyList<CreatorSummaryDto>> ListAsync(CreatorListQuery query, CancellationToken cancellationToken);
    Task<CreatorSummaryDto?> GetAsync(Guid id, CancellationToken cancellationToken);
    Task<CreatorSummaryDto?> UpdateAsync(Guid id, UpdateCreatorRequest request, CancellationToken cancellationToken);
    Task AddContactLogAsync(Guid creatorId, AddContactLogRequest request, CancellationToken cancellationToken);
}

public interface IImportService
{
    ImportPreviewResponse PreviewCsv(ImportPreviewRequest request);
    Task<ImportSummaryDto> ConfirmAsync(ImportConfirmRequest request, CancellationToken cancellationToken);
}

public interface IExportService
{
    Task<string> ExportCreatorsCsvAsync(CreatorListQuery query, CancellationToken cancellationToken);
}
