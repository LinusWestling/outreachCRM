using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Outreach.Application.Creators;
using Outreach.Application.Creators.Import;
using Outreach.Application.Creators.Services;

namespace Outreach.Infrastructure;

public sealed class BundledCreatorCsvInitializer(
    OutreachDbContext db,
    ICreatorImportService imports,
    ILogger<BundledCreatorCsvInitializer> logger)
{
    private static readonly BundledCreatorCsv[] BundledCsvs =
    [
        new("Influencer tracking Instagram - Blad1.csv", CreatorChannel.Instagram),
        new("Influencer tracking tiktok - Blad1.csv", CreatorChannel.TikTok)
    ];

    public async Task<BundledCreatorCsvInitializationResult> InitializeAsync(
        string contentRootPath,
        CancellationToken cancellationToken = default)
    {
        var databaseCreated = await db.Database.EnsureCreatedAsync(cancellationToken);
        await EnsureWorkflowSchemaAsync(cancellationToken);
        var files = new List<BundledCreatorCsvFileResult>();

        foreach (var csv in BundledCsvs)
        {
            files.Add(await InitializeCsvAsync(csv, contentRootPath, cancellationToken));
        }

        return new BundledCreatorCsvInitializationResult(databaseCreated, files);
    }

    private async Task<BundledCreatorCsvFileResult> InitializeCsvAsync(
        BundledCreatorCsv csv,
        string contentRootPath,
        CancellationToken cancellationToken)
    {
        var path = FindCsv(contentRootPath, csv.FileName);
        if (path is null)
        {
            logger.LogWarning("Bundled creator CSV {FileName} was not found from content root {ContentRootPath}.", csv.FileName, contentRootPath);
            return BundledCreatorCsvFileResult.Missing(csv.FileName, csv.Channel);
        }

        var request = new CreatorImportPreviewRequestDto
        {
            Channel = csv.Channel,
            SourceName = csv.FileName
        };

        using var previewStream = File.OpenRead(path);
        var preview = await imports.PreviewAsync(previewStream, request, cancellationToken);
        var importableHandles = preview.Rows
            .Where(row => row.CanImport)
            .Select(row => CreatorMapping.NormalizeHandle(row.Handle))
            .Where(handle => handle.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (importableHandles.Count == 0)
        {
            return BundledCreatorCsvFileResult.Skipped(
                csv.FileName,
                csv.Channel,
                path,
                preview.Summary.TotalRows,
                preview.Summary.ImportableRows,
                0,
                "no-importable-rows",
                preview.Summary.Messages);
        }

        var platform = csv.Channel.ToPlatform();
        var existingCount = await db.CreatorAccounts
            .CountAsync(account => account.Platform == platform && importableHandles.Contains(account.NormalizedHandle), cancellationToken);

        if (existingCount == importableHandles.Count)
        {
            return BundledCreatorCsvFileResult.Skipped(
                csv.FileName,
                csv.Channel,
                path,
                preview.Summary.TotalRows,
                preview.Summary.ImportableRows,
                existingCount,
                "already-loaded",
                preview.Summary.Messages);
        }

        using var importStream = File.OpenRead(path);
        var summary = await imports.ImportAsync(importStream, request, cancellationToken);
        return BundledCreatorCsvFileResult.FromImport(
            csv.FileName,
            csv.Channel,
            path,
            summary.TotalRows,
            summary.ImportableRows,
            existingCount,
            summary.CreatedCount,
            summary.UpdatedCount,
            summary.Messages);
    }

    private async Task EnsureWorkflowSchemaAsync(CancellationToken cancellationToken)
    {
        await db.Database.ExecuteSqlRawAsync(
            """
            CREATE TABLE IF NOT EXISTS "MessageTemplates" (
                "Id" uuid NOT NULL,
                "Name" character varying(160) NOT NULL,
                "Kind" character varying(20) NOT NULL,
                "Platform" character varying(20) NULL,
                "Subject" character varying(240) NULL,
                "Body" text NOT NULL,
                "GenerationRules" text NULL,
                "IsActive" boolean NOT NULL,
                "CreatedAt" timestamp with time zone NOT NULL,
                "UpdatedAt" timestamp with time zone NOT NULL,
                CONSTRAINT "PK_MessageTemplates" PRIMARY KEY ("Id")
            );

            DO $$
            BEGIN
                ALTER TABLE "MessageTemplates" ADD COLUMN IF NOT EXISTS "Id" uuid NULL;
                ALTER TABLE "MessageTemplates" ADD COLUMN IF NOT EXISTS "Name" character varying(160) NULL;
                ALTER TABLE "MessageTemplates" ADD COLUMN IF NOT EXISTS "Kind" character varying(20) NULL;
                ALTER TABLE "MessageTemplates" ADD COLUMN IF NOT EXISTS "Platform" character varying(20) NULL;
                ALTER TABLE "MessageTemplates" ADD COLUMN IF NOT EXISTS "Subject" character varying(240) NULL;
                ALTER TABLE "MessageTemplates" ADD COLUMN IF NOT EXISTS "Body" text NULL;
                ALTER TABLE "MessageTemplates" ADD COLUMN IF NOT EXISTS "GenerationRules" text NULL;
                ALTER TABLE "MessageTemplates" ADD COLUMN IF NOT EXISTS "IsActive" boolean NULL;
                ALTER TABLE "MessageTemplates" ADD COLUMN IF NOT EXISTS "CreatedAt" timestamp with time zone NULL;
                ALTER TABLE "MessageTemplates" ADD COLUMN IF NOT EXISTS "UpdatedAt" timestamp with time zone NULL;

                UPDATE "MessageTemplates"
                SET
                    "Id" = COALESCE("Id", gen_random_uuid()),
                    "Name" = COALESCE(NULLIF(btrim("Name"), ''), 'Untitled template'),
                    "Kind" = CASE
                        WHEN lower(btrim(COALESCE("Kind", ''))) IN ('email', 'emailtemplate', '2') THEN 'Email'
                        WHEN lower(btrim(COALESCE("Kind", ''))) IN ('dm', 'dmtemplate', 'directmessage', 'directmessagetemplate', '1') THEN 'Dm'
                        ELSE 'Dm'
                    END,
                    "Body" = COALESCE(NULLIF("Body", ''), 'Personalize this outreach message for the creator before sending.'),
                    "IsActive" = COALESCE("IsActive", false),
                    "CreatedAt" = COALESCE("CreatedAt", now()),
                    "UpdatedAt" = COALESCE("UpdatedAt", now())
                WHERE "Id" IS NULL
                   OR NULLIF(btrim("Name"), '') IS NULL
                   OR NULLIF(btrim("Kind"), '') IS NULL
                   OR "Kind" NOT IN ('Dm', 'Email')
                   OR NULLIF("Body", '') IS NULL
                   OR "IsActive" IS NULL
                   OR "CreatedAt" IS NULL
                   OR "UpdatedAt" IS NULL;

                ALTER TABLE "MessageTemplates" ALTER COLUMN "Id" SET NOT NULL;
                ALTER TABLE "MessageTemplates" ALTER COLUMN "Name" SET NOT NULL;
                ALTER TABLE "MessageTemplates" ALTER COLUMN "Kind" SET NOT NULL;
                ALTER TABLE "MessageTemplates" ALTER COLUMN "Body" SET NOT NULL;
                ALTER TABLE "MessageTemplates" ALTER COLUMN "IsActive" SET NOT NULL;
                ALTER TABLE "MessageTemplates" ALTER COLUMN "CreatedAt" SET NOT NULL;
                ALTER TABLE "MessageTemplates" ALTER COLUMN "UpdatedAt" SET NOT NULL;

                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conrelid = '"MessageTemplates"'::regclass
                      AND contype = 'p'
                ) THEN
                    ALTER TABLE "MessageTemplates" ADD CONSTRAINT "PK_MessageTemplates" PRIMARY KEY ("Id");
                END IF;

                IF to_regclass('"ContactLogs"') IS NOT NULL THEN
                    ALTER TABLE "ContactLogs" ADD COLUMN IF NOT EXISTS "MessageTemplateId" uuid NULL;
                    ALTER TABLE "ContactLogs" ADD COLUMN IF NOT EXISTS "MessageSubject" character varying(240) NULL;
                    ALTER TABLE "ContactLogs" ADD COLUMN IF NOT EXISTS "MessageBody" text NULL;
                END IF;

                IF to_regclass('"Creators"') IS NOT NULL THEN
                    ALTER TABLE "Creators" ADD COLUMN IF NOT EXISTS "ThreadsUrl" character varying(600) NULL;
                END IF;
            END $$;
            """,
            cancellationToken);
    }

    private static string? FindCsv(string contentRootPath, string fileName)
    {
        var directory = new DirectoryInfo(contentRootPath);
        while (directory is not null)
        {
            var candidate = Path.Combine(directory.FullName, fileName);
            if (File.Exists(candidate))
            {
                return candidate;
            }

            directory = directory.Parent;
        }

        return null;
    }

    private sealed record BundledCreatorCsv(string FileName, CreatorChannel Channel);
}

public sealed record BundledCreatorCsvInitializationResult(
    bool DatabaseCreated,
    IReadOnlyList<BundledCreatorCsvFileResult> Files)
{
    public int ImportedFiles => Files.Count(file => file.Imported);
}

public sealed record BundledCreatorCsvFileResult
{
    public required string FileName { get; init; }

    public required CreatorChannel Channel { get; init; }

    public string? Path { get; init; }

    public required string Status { get; init; }

    public required bool Imported { get; init; }

    public required int TotalRows { get; init; }

    public required int ImportableRows { get; init; }

    public required int ExistingCount { get; init; }

    public int CreatedCount { get; init; }

    public int UpdatedCount { get; init; }

    public IReadOnlyList<string> Messages { get; init; } = [];

    public static BundledCreatorCsvFileResult Missing(string fileName, CreatorChannel channel) => new()
    {
        FileName = fileName,
        Channel = channel,
        Status = "missing",
        Imported = false,
        TotalRows = 0,
        ImportableRows = 0,
        ExistingCount = 0,
        Messages = [$"Expected CSV file was not found: {fileName}"]
    };

    public static BundledCreatorCsvFileResult Skipped(
        string fileName,
        CreatorChannel channel,
        string path,
        int totalRows,
        int importableRows,
        int existingCount,
        string status,
        IReadOnlyList<string> messages) => new()
    {
        FileName = fileName,
        Channel = channel,
        Path = path,
        Status = status,
        Imported = false,
        TotalRows = totalRows,
        ImportableRows = importableRows,
        ExistingCount = existingCount,
        Messages = messages
    };

    public static BundledCreatorCsvFileResult FromImport(
        string fileName,
        CreatorChannel channel,
        string path,
        int totalRows,
        int importableRows,
        int existingCount,
        int createdCount,
        int updatedCount,
        IReadOnlyList<string> messages) => new()
    {
        FileName = fileName,
        Channel = channel,
        Path = path,
        Status = "imported",
        Imported = true,
        TotalRows = totalRows,
        ImportableRows = importableRows,
        ExistingCount = existingCount,
        CreatedCount = createdCount,
        UpdatedCount = updatedCount,
        Messages = messages
    };
}
