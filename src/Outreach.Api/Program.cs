using Outreach.Api.Realtime;
using Outreach.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

if (builder.Environment.IsDevelopment())
{
    builder.Configuration.AddUserSecrets<Program>();
}

builder.Services.AddControllers();
builder.Services.AddOpenApi();
builder.Services.AddSingleton<IOutreachRealtimePublisher, OutreachRealtimeBroker>();
builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        policy
            .SetIsOriginAllowed(origin =>
                Uri.TryCreate(origin, UriKind.Absolute, out var uri) &&
                (uri.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase) ||
                 uri.Host.Equals("127.0.0.1", StringComparison.OrdinalIgnoreCase) ||
                 uri.Host.Equals("::1", StringComparison.OrdinalIgnoreCase)))
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});
builder.Services.AddOutreachInfrastructure(builder.Configuration);

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();

    try
    {
        using var scope = app.Services.CreateScope();
        var initializer = scope.ServiceProvider.GetRequiredService<BundledCreatorCsvInitializer>();
        var result = await initializer.InitializeAsync(app.Environment.ContentRootPath);
        app.Logger.LogInformation("Bundled creator CSV initialization checked {FileCount} files and imported {ImportedFiles}.", result.Files.Count, result.ImportedFiles);
    }
    catch (Exception ex)
    {
        app.Logger.LogWarning(ex, "Bundled creator CSV initialization was skipped.");
    }
}

app.UseHttpsRedirection();
app.UseCors("Frontend");

app.UseAuthorization();

app.MapControllers();

app.Run();
