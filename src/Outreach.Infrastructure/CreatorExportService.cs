using Outreach.Application.Creators;
using Outreach.Application.Creators.Export;
using Outreach.Application.Creators.Normalization;
using Outreach.Application.Creators.Services;

namespace Outreach.Infrastructure;

public sealed class CreatorExportService(ICreatorDirectoryService directory, ICreatorCsvNormalizer normalizer) : ICreatorExportService
{
    public async Task<CreatorCsvExportDto> ExportCsvAsync(
        CreatorListingFiltersDto filters,
        CreatorExportOptionsDto? options = null,
        CancellationToken cancellationToken = default)
    {
        var result = await directory.ListAsync(filters with { PageNumber = 1, PageSize = 5000 }, cancellationToken);

        return new CreatorCsvExportDto
        {
            FileName = options?.FileName ?? $"creators-{DateTimeOffset.UtcNow:yyyyMMdd-HHmm}.csv",
            Rows = result.Items.Select(row => new CreatorCsvExportRowDto
            {
                MessageVersion = row.MessageVersion,
                Profile = row.ProfileUrl,
                Followers = normalizer.FormatFollowerCount(row.Followers),
                FirstMessage = normalizer.FormatDate(row.FirstMessageDate),
                Responded = normalizer.FormatBoolean(row.Responded),
                Email = row.Email,
                Threads = row.ThreadsUrl,
                SecondMessage = normalizer.FormatDate(row.SecondMessageDate),
                LastContact = normalizer.FormatDate(row.LastContactDate),
                Code = row.Code,
                ResumeContact = normalizer.FormatBoolean(row.ResumeContact),
                Channel = row.Channel
            }).ToList()
        };
    }
}
