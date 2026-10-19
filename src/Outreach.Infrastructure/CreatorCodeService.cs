using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Npgsql;
using NpgsqlTypes;
using Outreach.Application.CreatorCodes;
using Outreach.Application.Creators;
using Outreach.Domain;

namespace Outreach.Infrastructure;

public sealed class CreatorCodeService(OutreachDbContext db, IConfiguration configuration) : ICreatorCodeService
{
    private const string ConnectionNotConfiguredMessage = "Supabase creator-code connection is not configured.";
    private const string HardDeleteConflictMessage = "This code has redemptions; disable it instead to preserve conversion history.";

    private static readonly HashSet<string> ValidStatuses = new(StringComparer.Ordinal)
    {
        "active",
        "disabled",
        "expired"
    };

    private readonly string? supabaseWriteConnectionString = configuration.GetConnectionString("SupabaseWrite");

    public async Task<IReadOnlyList<CreatorCodeDto>> ListAsync(
        bool includeInactive = false,
        CancellationToken cancellationToken = default)
    {
        await using var connection = CreateConnection();
        await connection.OpenAsync(cancellationToken);

        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT cc.id,
                   cc.code_normalized AS code,
                   cc.creator_id AS crm_creator_id,
                   cc.creator_display_name,
                   cc.status,
                   cc.valid_from,
                   cc.valid_until,
                   cc.premium_duration_days,
                   cc.created_at,
                   cc.updated_at,
                   count(ca.id) AS ongoing_count,
                   count(ca.id) FILTER (WHERE ca.store_trial_started_at IS NOT NULL) AS activated_count,
                   count(ca.id) FILTER (WHERE ca.first_paid_renewal_at IS NOT NULL) AS converted_count,
                   count(ca.id) FILTER (WHERE ca.paid_conversion_eligible_at IS NOT NULL) AS paid_eligible_count,
                   min(ca.redeemed_at) AS first_redeemed_at,
                   max(ca.redeemed_at) AS last_redeemed_at
            FROM creator_codes cc
            LEFT JOIN creator_attributions ca
                   ON ca.creator_code_id = cc.id
                  AND ca.status NOT IN ('revoked','conflict')
            WHERE cc.creator_id ~ '^[0-9a-f-]{36}$'
              AND (@include_inactive OR cc.status = 'active')
            GROUP BY cc.id,
                     cc.code_normalized,
                     cc.creator_id,
                     cc.creator_display_name,
                     cc.status,
                     cc.valid_from,
                     cc.valid_until,
                     cc.premium_duration_days,
                     cc.created_at,
                     cc.updated_at
            ORDER BY cc.created_at DESC;
            """;
        command.Parameters.Add("include_inactive", NpgsqlDbType.Boolean).Value = includeInactive;

        var results = new List<CreatorCodeDto>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var dto = ReadCreatorCode(reader);
            if (dto is not null)
            {
                results.Add(dto);
            }
        }

        return results;
    }

    public async Task<CreatorCodeDto> CreateAsync(
        CreateCreatorCodeRequestDto request,
        CancellationToken cancellationToken = default)
    {
        var code = NormalizeCode(request.Code);
        var status = NormalizeStatus(request.Status);
        ValidatePremiumDurationDays(request.PremiumDurationDays);
        var creatorDisplayName = await ResolveCreatorDisplayNameAsync(request, cancellationToken);

        try
        {
            await using var connection = CreateConnection();
            await connection.OpenAsync(cancellationToken);

            await using var command = connection.CreateCommand();
            command.CommandText =
                """
                INSERT INTO creator_codes (
                    code_normalized,
                    creator_id,
                    creator_display_name,
                    status,
                    valid_from,
                    valid_until,
                    premium_duration_days,
                    created_at,
                    updated_at
                )
                VALUES (
                    @code,
                    @creator_id,
                    @creator_display_name,
                    @status,
                    @valid_from,
                    @valid_until,
                    @premium_duration_days,
                    now(),
                    now()
                )
                RETURNING id;
                """;
            command.Parameters.Add("code", NpgsqlDbType.Text).Value = code;
            command.Parameters.Add("creator_id", NpgsqlDbType.Text).Value = request.CreatorId.ToString("D");
            command.Parameters.Add("creator_display_name", NpgsqlDbType.Text).Value =
                creatorDisplayName is null ? DBNull.Value : creatorDisplayName;
            command.Parameters.Add("status", NpgsqlDbType.Text).Value = status;
            AddTimestampParameter(command, "valid_from", request.ValidFrom);
            AddTimestampParameter(command, "valid_until", request.ValidUntil);
            command.Parameters.Add("premium_duration_days", NpgsqlDbType.Integer).Value = request.PremiumDurationDays;

            var id = (Guid)(await command.ExecuteScalarAsync(cancellationToken)
                ?? throw new InvalidOperationException("The creator code was not created."));

            return await GetByIdAsync(connection, id, cancellationToken)
                ?? throw new InvalidOperationException("The creator code was created but could not be read back.");
        }
        catch (PostgresException ex)
        {
            throw TranslatePostgresException(ex);
        }
    }

    public async Task<CreatorCodeDto?> UpdateAsync(
        Guid id,
        UpdateCreatorCodeRequestDto request,
        CancellationToken cancellationToken = default)
    {
        if (id == Guid.Empty)
        {
            return null;
        }

        if (request.ValidFrom.HasValue && request.ClearValidFrom)
        {
            throw new ArgumentException("Provide validFrom or clearValidFrom, not both.");
        }

        if (request.ValidUntil.HasValue && request.ClearValidUntil)
        {
            throw new ArgumentException("Provide validUntil or clearValidUntil, not both.");
        }

        var assignments = new List<string> { "updated_at = now()" };

        try
        {
            await using var connection = CreateConnection();
            await connection.OpenAsync(cancellationToken);
            await using var command = connection.CreateCommand();

            command.Parameters.Add("id", NpgsqlDbType.Uuid).Value = id;

            if (request.Status is not null)
            {
                assignments.Add("status = @status");
                command.Parameters.Add("status", NpgsqlDbType.Text).Value = NormalizeStatus(request.Status);
            }

            if (request.ValidFrom.HasValue || request.ClearValidFrom)
            {
                assignments.Add("valid_from = @valid_from");
                AddTimestampParameter(command, "valid_from", request.ClearValidFrom ? null : request.ValidFrom);
            }

            if (request.ValidUntil.HasValue || request.ClearValidUntil)
            {
                assignments.Add("valid_until = @valid_until");
                AddTimestampParameter(command, "valid_until", request.ClearValidUntil ? null : request.ValidUntil);
            }

            if (request.PremiumDurationDays.HasValue)
            {
                ValidatePremiumDurationDays(request.PremiumDurationDays.Value);
                assignments.Add("premium_duration_days = @premium_duration_days");
                command.Parameters.Add("premium_duration_days", NpgsqlDbType.Integer).Value = request.PremiumDurationDays.Value;
            }

            if (request.CreatorDisplayName is not null)
            {
                assignments.Add("creator_display_name = @creator_display_name");
                command.Parameters.Add("creator_display_name", NpgsqlDbType.Text).Value = request.CreatorDisplayName.Trim();
            }

            command.CommandText = $"""
                UPDATE creator_codes
                SET {string.Join(", ", assignments)}
                WHERE id = @id
                RETURNING id;
                """;

            var updatedId = await command.ExecuteScalarAsync(cancellationToken);
            return updatedId is null
                ? null
                : await GetByIdAsync(connection, id, cancellationToken);
        }
        catch (PostgresException ex)
        {
            throw TranslatePostgresException(ex);
        }
    }

    public async Task<CreatorCodeDto?> DisableAsync(
        Guid id,
        CancellationToken cancellationToken = default)
    {
        if (id == Guid.Empty)
        {
            return null;
        }

        try
        {
            await using var connection = CreateConnection();
            await connection.OpenAsync(cancellationToken);

            await using var command = connection.CreateCommand();
            command.CommandText =
                """
                UPDATE creator_codes
                SET status = 'disabled',
                    updated_at = now()
                WHERE id = @id
                RETURNING id;
                """;
            command.Parameters.Add("id", NpgsqlDbType.Uuid).Value = id;

            var updatedId = await command.ExecuteScalarAsync(cancellationToken);
            return updatedId is null
                ? null
                : await GetByIdAsync(connection, id, cancellationToken);
        }
        catch (PostgresException ex)
        {
            throw TranslatePostgresException(ex);
        }
    }

    public async Task<bool> DeleteAsync(
        Guid id,
        CancellationToken cancellationToken = default)
    {
        if (id == Guid.Empty)
        {
            return false;
        }

        try
        {
            await using var connection = CreateConnection();
            await connection.OpenAsync(cancellationToken);
            await using var transaction = await connection.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, cancellationToken);

            await using (var countCommand = connection.CreateCommand())
            {
                countCommand.Transaction = transaction;
                countCommand.CommandText = "SELECT count(*) FROM creator_attributions WHERE creator_code_id = @id;";
                countCommand.Parameters.Add("id", NpgsqlDbType.Uuid).Value = id;

                var attributionCount = checked((int)(long)(await countCommand.ExecuteScalarAsync(cancellationToken) ?? 0L));
                if (attributionCount > 0)
                {
                    await transaction.RollbackAsync(cancellationToken);
                    throw new InvalidOperationException(
                        $"This code has {attributionCount} redemptions; disable it instead to preserve conversion history.");
                }
            }

            await using var deleteCommand = connection.CreateCommand();
            deleteCommand.Transaction = transaction;
            deleteCommand.CommandText = "DELETE FROM creator_codes WHERE id = @id;";
            deleteCommand.Parameters.Add("id", NpgsqlDbType.Uuid).Value = id;

            var deleted = await deleteCommand.ExecuteNonQueryAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return deleted > 0;
        }
        catch (PostgresException ex)
        {
            throw TranslatePostgresException(ex);
        }
    }

    private async Task<string?> ResolveCreatorDisplayNameAsync(
        CreateCreatorCodeRequestDto request,
        CancellationToken cancellationToken)
    {
        if (request.CreatorId == Guid.Empty)
        {
            throw new ArgumentException("CreatorId is required.");
        }

        var creator = await db.Creators
            .AsNoTracking()
            .Include(x => x.Accounts)
            .SingleOrDefaultAsync(x => x.Id == request.CreatorId, cancellationToken);

        if (creator is null)
        {
            throw new ArgumentException("Creator was not found.");
        }

        if (creator.Accounts.Count == 0)
        {
            if (request.CreatorAccountId.HasValue)
            {
                throw new ArgumentException("CreatorAccountId must belong to the selected creator.");
            }

            return TrimToNull(creator.DisplayName);
        }

        if (creator.Accounts.Count == 1)
        {
            var account = creator.Accounts[0];
            if (request.CreatorAccountId.HasValue && request.CreatorAccountId.Value != account.Id)
            {
                throw new ArgumentException("CreatorAccountId must belong to the selected creator.");
            }

            return DisplayNameFor(account, creator);
        }

        if (!request.CreatorAccountId.HasValue)
        {
            throw new ArgumentException("CreatorAccountId is required when the creator has multiple accounts.");
        }

        var selectedAccount = creator.Accounts.SingleOrDefault(x => x.Id == request.CreatorAccountId.Value);
        if (selectedAccount is null)
        {
            throw new ArgumentException("CreatorAccountId must belong to the selected creator.");
        }

        return DisplayNameFor(selectedAccount, creator);
    }

    private async Task<CreatorCodeDto?> GetByIdAsync(
        NpgsqlConnection connection,
        Guid id,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT cc.id,
                   cc.code_normalized AS code,
                   cc.creator_id AS crm_creator_id,
                   cc.creator_display_name,
                   cc.status,
                   cc.valid_from,
                   cc.valid_until,
                   cc.premium_duration_days,
                   cc.created_at,
                   cc.updated_at,
                   count(ca.id) AS ongoing_count,
                   count(ca.id) FILTER (WHERE ca.store_trial_started_at IS NOT NULL) AS activated_count,
                   count(ca.id) FILTER (WHERE ca.first_paid_renewal_at IS NOT NULL) AS converted_count,
                   count(ca.id) FILTER (WHERE ca.paid_conversion_eligible_at IS NOT NULL) AS paid_eligible_count,
                   min(ca.redeemed_at) AS first_redeemed_at,
                   max(ca.redeemed_at) AS last_redeemed_at
            FROM creator_codes cc
            LEFT JOIN creator_attributions ca
                   ON ca.creator_code_id = cc.id
                  AND ca.status NOT IN ('revoked','conflict')
            WHERE cc.id = @id
              AND cc.creator_id ~ '^[0-9a-f-]{36}$'
            GROUP BY cc.id,
                     cc.code_normalized,
                     cc.creator_id,
                     cc.creator_display_name,
                     cc.status,
                     cc.valid_from,
                     cc.valid_until,
                     cc.premium_duration_days,
                     cc.created_at,
                     cc.updated_at;
            """;
        command.Parameters.Add("id", NpgsqlDbType.Uuid).Value = id;

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken)
            ? ReadCreatorCode(reader)
            : null;
    }

    private NpgsqlConnection CreateConnection()
    {
        if (string.IsNullOrWhiteSpace(supabaseWriteConnectionString))
        {
            throw new InvalidOperationException(ConnectionNotConfiguredMessage);
        }

        return new NpgsqlConnection(supabaseWriteConnectionString);
    }

    private static CreatorCodeDto? ReadCreatorCode(NpgsqlDataReader reader)
    {
        var rawCreatorId = reader.GetString(2);
        if (!Guid.TryParse(rawCreatorId, out var creatorId))
        {
            return null;
        }

        var ongoingCount = CheckedInt(reader.GetInt64(10));
        var activatedCount = CheckedInt(reader.GetInt64(11));
        var convertedCount = CheckedInt(reader.GetInt64(12));

        return new CreatorCodeDto
        {
            Id = reader.GetGuid(0),
            Code = reader.GetString(1),
            CreatorId = creatorId,
            CreatorDisplayName = reader.IsDBNull(3) ? null : reader.GetString(3),
            Status = reader.GetString(4),
            ValidFrom = ReadDateTimeOffset(reader, 5),
            ValidUntil = ReadDateTimeOffset(reader, 6),
            PremiumDurationDays = reader.GetInt32(7),
            CreatedAt = ReadRequiredDateTimeOffset(reader, 8),
            UpdatedAt = ReadRequiredDateTimeOffset(reader, 9),
            OngoingCount = ongoingCount,
            ActivatedCount = activatedCount,
            ConvertedCount = convertedCount,
            PaidEligibleCount = CheckedInt(reader.GetInt64(13)),
            FirstRedeemedAt = ReadDateTimeOffset(reader, 14),
            LastRedeemedAt = ReadDateTimeOffset(reader, 15),
            CurrentStage = ResolveCurrentStage(ongoingCount, activatedCount, convertedCount)
        };
    }

    private static string NormalizeCode(string? code)
    {
        if (string.IsNullOrWhiteSpace(code))
        {
            throw new ArgumentException("Code is required.");
        }

        return code.Trim().ToUpperInvariant();
    }

    private static string NormalizeStatus(string? status)
    {
        if (string.IsNullOrWhiteSpace(status))
        {
            throw new ArgumentException("Status is required.");
        }

        var normalized = status.Trim().ToLowerInvariant();
        if (!ValidStatuses.Contains(normalized))
        {
            throw new ArgumentException("Status must be active, disabled, or expired.");
        }

        return normalized;
    }

    private static void ValidatePremiumDurationDays(int premiumDurationDays)
    {
        if (premiumDurationDays <= 0)
        {
            throw new ArgumentException("PremiumDurationDays must be greater than zero.");
        }
    }

    private static Exception TranslatePostgresException(PostgresException ex) =>
        ex.SqlState switch
        {
            PostgresErrorCodes.UniqueViolation => new InvalidOperationException("That creator code already exists.", ex),
            PostgresErrorCodes.CheckViolation => new ArgumentException("Creator code failed database validation.", ex),
            PostgresErrorCodes.ForeignKeyViolation => new InvalidOperationException(HardDeleteConflictMessage, ex),
            _ => ex
        };

    private static void AddTimestampParameter(NpgsqlCommand command, string name, DateTimeOffset? value) =>
        command.Parameters.Add(name, NpgsqlDbType.TimestampTz).Value =
            value.HasValue ? value.Value.ToUniversalTime() : DBNull.Value;

    private static string? DisplayNameFor(CreatorAccount account, Creator creator) =>
        TrimToNull(account.Handle) ??
        TrimToNull(account.NormalizedHandle) ??
        TrimToNull(creator.DisplayName);

    private static string? TrimToNull(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.Trim();
    }

    private static string ResolveCurrentStage(int ongoingCount, int activatedCount, int convertedCount)
    {
        if (convertedCount > 0)
        {
            return CreatorConversionStages.Converted;
        }

        if (activatedCount > 0)
        {
            return CreatorConversionStages.Active;
        }

        return ongoingCount > 0
            ? CreatorConversionStages.Ongoing
            : CreatorConversionStages.NoRedemptions;
    }

    private static int CheckedInt(long value) => checked((int)value);

    private static DateTimeOffset ReadRequiredDateTimeOffset(NpgsqlDataReader reader, int ordinal) =>
        ReadDateTimeOffset(reader, ordinal)
            ?? throw new InvalidOperationException("Creator code timestamp was unexpectedly null.");

    private static DateTimeOffset? ReadDateTimeOffset(NpgsqlDataReader reader, int ordinal)
    {
        if (reader.IsDBNull(ordinal))
        {
            return null;
        }

        var value = reader.GetValue(ordinal);
        return value switch
        {
            DateTimeOffset dateTimeOffset => dateTimeOffset,
            DateTime dateTime => new DateTimeOffset(
                dateTime.Kind == DateTimeKind.Unspecified
                    ? DateTime.SpecifyKind(dateTime, DateTimeKind.Utc)
                    : dateTime.ToUniversalTime()),
            _ => null
        };
    }
}
