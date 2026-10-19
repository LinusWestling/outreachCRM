using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Outreach.Application;
using Outreach.Application.CreatorCodes;
using Outreach.Application.Creators.Normalization;
using Outreach.Application.Creators.Services;

namespace Outreach.Infrastructure;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddOutreachInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("OutreachDatabase")
            ?? "Host=localhost;Port=5433;Database=outreach;Username=outreach;Password=outreach";

        services.AddDbContext<OutreachDbContext>(options => options.UseNpgsql(connectionString));
        services.AddSingleton<ICreatorCsvNormalizer, CreatorCsvNormalizer>();
        services.AddScoped<ICreatorService, CreatorService>();
        services.AddScoped<ICreatorDirectoryService, CreatorDirectoryService>();
        services.AddScoped<ICreatorConversionService, CreatorConversionService>();
        services.AddScoped<ICreatorCodeService, CreatorCodeService>();
        services.AddScoped<ICreatorImportService, CreatorImportService>();
        services.AddScoped<ICreatorExportService, CreatorExportService>();
        services.AddScoped<IEmailFollowUpSender, EmailFollowUpSender>();
        services.AddScoped<IMessageTemplateService, MessageTemplateService>();
        services.AddScoped<BundledCreatorCsvInitializer>();

        return services;
    }
}
