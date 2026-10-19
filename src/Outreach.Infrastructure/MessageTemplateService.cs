using Microsoft.EntityFrameworkCore;
using Outreach.Application.Creators;
using Outreach.Application.Creators.Services;
using Outreach.Domain;

namespace Outreach.Infrastructure;

public sealed class MessageTemplateService(OutreachDbContext db) : IMessageTemplateService
{
    public async Task<IReadOnlyList<MessageTemplateDto>> ListAsync(CancellationToken cancellationToken = default)
    {
        await EnsureTemplateSchemaAsync(cancellationToken);
        await EnsureDefaultTemplateAsync(cancellationToken);

        return await db.MessageTemplates
            .AsNoTracking()
            .OrderByDescending(x => x.IsActive)
            .ThenBy(x => x.Kind)
            .ThenBy(x => x.Name)
            .Select(x => ToDto(x))
            .ToListAsync(cancellationToken);
    }

    public Task<MessageTemplateDto?> GetActiveAsync(CancellationToken cancellationToken = default) =>
        GetActiveAsync(null, cancellationToken);

    public async Task<MessageTemplateDto?> GetActiveAsync(string? kind, CancellationToken cancellationToken = default)
    {
        await EnsureTemplateSchemaAsync(cancellationToken);
        await EnsureDefaultTemplateAsync(cancellationToken);

        var templateKind = ParseKind(kind);
        var template = await db.MessageTemplates
            .AsNoTracking()
            .Where(x => x.Kind == templateKind && x.IsActive)
            .OrderByDescending(x => x.IsActive)
            .ThenByDescending(x => x.UpdatedAt)
            .ThenByDescending(x => x.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);

        return template is null ? null : ToDto(template);
    }

    public async Task<MessageTemplateDto> CreateAsync(
        SaveMessageTemplateRequestDto request,
        string? requestedKind = null,
        CancellationToken cancellationToken = default)
    {
        await EnsureTemplateSchemaAsync(cancellationToken);

        var name = CleanRequired(request.Name, "Template name");
        var kind = ResolveWriteKind(request, requestedKind, null);
        await EnsureUniqueNameAsync(name, kind, null, cancellationToken);
        var subject = kind == MessageTemplateKind.Email ? CleanOptional(request.Subject) : null;

        var template = new MessageTemplate
        {
            Name = name,
            Kind = kind,
            Subject = subject,
            Body = CleanRequired(request.Body, "Template body"),
            GenerationRules = CleanOptional(request.GenerationRules),
            IsActive = false
        };

        var shouldActivate = request.Activate || !await db.MessageTemplates.AnyAsync(x => x.Kind == kind, cancellationToken);

        db.MessageTemplates.Add(template);
        await db.SaveChangesAsync(cancellationToken);

        if (shouldActivate)
        {
            await SetOnlyActiveTemplateAsync(template.Id, kind, cancellationToken);
        }

        return await GetTemplateDtoAsync(template.Id, cancellationToken) ?? ToDto(template);
    }

    public async Task<MessageTemplateDto?> UpdateAsync(
        Guid id,
        SaveMessageTemplateRequestDto request,
        string? requestedKind = null,
        CancellationToken cancellationToken = default)
    {
        await EnsureTemplateSchemaAsync(cancellationToken);

        var template = await db.MessageTemplates.FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (template is null)
        {
            return null;
        }

        var name = CleanRequired(request.Name, "Template name");
        var kind = ResolveWriteKind(request, requestedKind, template.Kind);
        await EnsureUniqueNameAsync(name, kind, id, cancellationToken);
        var subject = kind == MessageTemplateKind.Email ? CleanOptional(request.Subject) : null;
        var wasActive = template.IsActive;
        var kindChanged = template.Kind != kind;

        template.Name = name;
        template.Kind = kind;
        template.Subject = subject;
        template.Body = CleanRequired(request.Body, "Template body");
        template.GenerationRules = CleanOptional(request.GenerationRules);
        template.IsActive = kindChanged ? false : template.IsActive;
        template.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(cancellationToken);

        if (request.Activate || (wasActive && kindChanged))
        {
            await SetOnlyActiveTemplateAsync(id, kind, cancellationToken);
        }

        return await GetTemplateDtoAsync(id, cancellationToken);
    }

    public async Task<MessageTemplateDto?> ActivateAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await EnsureTemplateSchemaAsync(cancellationToken);

        var template = await db.MessageTemplates.FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (template is null)
        {
            return null;
        }

        await SetOnlyActiveTemplateAsync(id, template.Kind, cancellationToken);
        return await GetTemplateDtoAsync(id, cancellationToken);
    }

    public async Task<MessageTemplateDto?> DeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await EnsureTemplateSchemaAsync(cancellationToken);

        var template = await db.MessageTemplates.FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (template is null)
        {
            return null;
        }

        var deleted = ToDto(template);

        await db.ContactLogs
            .Where(x => x.MessageTemplateId == id)
            .ExecuteUpdateAsync(
                setters => setters.SetProperty(x => x.MessageTemplateId, (Guid?)null),
                cancellationToken);

        db.MessageTemplates.Remove(template);
        await db.SaveChangesAsync(cancellationToken);

        return deleted;
    }

    private async Task EnsureDefaultTemplateAsync(CancellationToken cancellationToken)
    {
        if (await db.MessageTemplates.AnyAsync(x => x.Kind == MessageTemplateKind.Dm, cancellationToken))
        {
            return;
        }

        db.MessageTemplates.Add(new MessageTemplate
        {
            Name = "v3 AI",
            Kind = MessageTemplateKind.Dm,
            Body = "Personalize this outreach message for the creator before sending.",
            GenerationRules = "Use only known profile data. Do not invent follower counts, emails, response status, sent dates, or profile details.",
            IsActive = true
        });

        await db.SaveChangesAsync(cancellationToken);
    }

    private async Task EnsureTemplateSchemaAsync(CancellationToken cancellationToken)
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
            END $$;
            """,
            cancellationToken);

        await NormalizeLegacyTemplatesAsync(cancellationToken);

        await db.Database.ExecuteSqlRawAsync(
            """
            DROP INDEX IF EXISTS "IX_MessageTemplates_NormalizedName";
            DROP INDEX IF EXISTS "IX_MessageTemplates_OnlyOneActive";

            CREATE UNIQUE INDEX IF NOT EXISTS "IX_MessageTemplates_Kind_NormalizedName"
                ON "MessageTemplates" ("Kind", lower(btrim("Name")));

            CREATE UNIQUE INDEX IF NOT EXISTS "IX_MessageTemplates_Kind_OnlyOneActive"
                ON "MessageTemplates" ("Kind")
                WHERE "IsActive";
            """,
            cancellationToken);
    }

    private async Task SetOnlyActiveTemplateAsync(Guid id, MessageTemplateKind kind, CancellationToken cancellationToken)
    {
        var updatedAt = DateTimeOffset.UtcNow;
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        await db.MessageTemplates
            .Where(x => x.Kind == kind && x.IsActive)
            .ExecuteUpdateAsync(
                setters => setters
                    .SetProperty(x => x.IsActive, false)
                    .SetProperty(x => x.UpdatedAt, updatedAt),
                cancellationToken);

        await db.MessageTemplates
            .Where(x => x.Id == id)
            .ExecuteUpdateAsync(
                setters => setters
                    .SetProperty(x => x.IsActive, true)
                    .SetProperty(x => x.UpdatedAt, updatedAt),
                cancellationToken);

        await transaction.CommitAsync(cancellationToken);
    }

    private async Task NormalizeLegacyTemplatesAsync(CancellationToken cancellationToken)
    {
        var templates = await db.MessageTemplates
            .OrderBy(x => x.Kind)
            .ThenByDescending(x => x.IsActive)
            .ThenByDescending(x => x.UpdatedAt)
            .ThenByDescending(x => x.CreatedAt)
            .ToListAsync(cancellationToken);

        var reservedNamesByKind = templates
            .GroupBy(x => x.Kind)
            .ToDictionary(
                x => x.Key,
                x => new HashSet<string>(
                    x.Select(template => NormalizeName(template.Name)).Where(name => name.Length > 0),
                    StringComparer.Ordinal));

        foreach (var group in templates.GroupBy(x => new { x.Kind, Name = NormalizeName(x.Name) }).Where(x => x.Count() > 1))
        {
            var duplicateIndex = 2;
            var reservedNames = reservedNamesByKind[group.Key.Kind];

            foreach (var duplicate in group.Skip(1))
            {
                duplicate.Name = NextAvailableTemplateName(
                    string.IsNullOrWhiteSpace(duplicate.Name) ? "Untitled template" : duplicate.Name,
                    reservedNames,
                    ref duplicateIndex);
                duplicate.UpdatedAt = DateTimeOffset.UtcNow;
            }
        }

        foreach (var activeGroup in templates.Where(x => x.IsActive).GroupBy(x => x.Kind))
        {
            foreach (var inactiveDuplicate in activeGroup.Skip(1))
            {
                inactiveDuplicate.IsActive = false;
                inactiveDuplicate.UpdatedAt = DateTimeOffset.UtcNow;
            }
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    private async Task EnsureUniqueNameAsync(string name, MessageTemplateKind kind, Guid? excludedId, CancellationToken cancellationToken)
    {
        var normalized = NormalizeName(name);
        var exists = await db.MessageTemplates.AnyAsync(
            x => x.Kind == kind &&
                 (!excludedId.HasValue || x.Id != excludedId.Value) &&
                 x.Name.Trim().ToLower() == normalized,
            cancellationToken);

        if (exists)
        {
            throw new ArgumentException($"A {kind} template named {name} already exists.");
        }
    }

    private async Task<MessageTemplateDto?> GetTemplateDtoAsync(Guid id, CancellationToken cancellationToken)
    {
        var template = await db.MessageTemplates.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
        return template is null ? null : ToDto(template);
    }

    private static MessageTemplateDto ToDto(MessageTemplate template) => new()
    {
        Id = template.Id,
        Name = template.Name,
        Kind = template.Kind.ToString(),
        Platform = template.Platform?.ToString(),
        Subject = template.Subject,
        Body = template.Body,
        GenerationRules = template.GenerationRules,
        IsActive = template.IsActive,
        CreatedAt = template.CreatedAt,
        UpdatedAt = template.UpdatedAt
    };

    private static MessageTemplateKind ParseKind(string? value)
    {
        var cleaned = CleanOptional(value);
        if (cleaned is null)
        {
            return MessageTemplateKind.Dm;
        }

        return Enum.TryParse<MessageTemplateKind>(cleaned, true, out var kind)
            ? kind
            : throw new ArgumentException("Template kind must be Dm or Email.");
    }

    private static MessageTemplateKind ResolveWriteKind(
        SaveMessageTemplateRequestDto request,
        string? requestedKind,
        MessageTemplateKind? fallbackKind)
    {
        var candidates = new[]
        {
            request.Kind,
            request.Type,
            requestedKind
        };

        MessageTemplateKind? resolved = null;
        foreach (var candidate in candidates)
        {
            var cleaned = CleanOptional(candidate);
            if (cleaned is null)
            {
                continue;
            }

            var parsed = ParseExplicitKind(cleaned);
            if (resolved.HasValue && resolved.Value != parsed)
            {
                throw new ArgumentException("Template kind mismatch. Body kind, body type, and query kind must agree.");
            }

            resolved = parsed;
        }

        if (resolved.HasValue)
        {
            return resolved.Value;
        }

        if (fallbackKind.HasValue)
        {
            return fallbackKind.Value;
        }

        throw new ArgumentException("Template kind is required. Use Dm or Email.");
    }

    private static MessageTemplateKind ParseExplicitKind(string value) =>
        Enum.TryParse<MessageTemplateKind>(value, true, out var kind)
            ? kind
            : throw new ArgumentException("Template kind must be Dm or Email.");

    private static string CleanRequired(string value, string field)
    {
        var cleaned = value.Trim();
        return cleaned.Length == 0 ? throw new ArgumentException($"{field} is required.") : cleaned;
    }

    private static string? CleanOptional(string? value)
    {
        var cleaned = value?.Trim();
        return string.IsNullOrEmpty(cleaned) ? null : cleaned;
    }

    private static string NormalizeName(string value) => value.Trim().ToLowerInvariant();

    private static string NextAvailableTemplateName(string originalName, HashSet<string> reservedNames, ref int duplicateIndex)
    {
        while (true)
        {
            var suffix = $" ({duplicateIndex})";
            var maxBaseLength = Math.Max(1, 160 - suffix.Length);
            var baseName = originalName.Trim();
            if (baseName.Length > maxBaseLength)
            {
                baseName = baseName[..maxBaseLength].TrimEnd();
            }

            var candidate = $"{baseName}{suffix}";
            if (reservedNames.Add(NormalizeName(candidate)))
            {
                duplicateIndex++;
                return candidate;
            }

            duplicateIndex++;
        }
    }
}
