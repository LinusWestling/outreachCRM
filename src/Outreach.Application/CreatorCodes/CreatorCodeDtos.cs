using Outreach.Application.Creators;

namespace Outreach.Application.CreatorCodes;

public sealed record CreatorCodeDto
{
    public Guid Id { get; init; }

    public required string Code { get; init; }

    public Guid CreatorId { get; init; }

    public string? CreatorDisplayName { get; init; }

    public required string Status { get; init; }

    public DateTimeOffset? ValidFrom { get; init; }

    public DateTimeOffset? ValidUntil { get; init; }

    public int PremiumDurationDays { get; init; }

    public DateTimeOffset CreatedAt { get; init; }

    public DateTimeOffset UpdatedAt { get; init; }

    public int OngoingCount { get; init; }

    public int ActivatedCount { get; init; }

    public int ConvertedCount { get; init; }

    public int PaidEligibleCount { get; init; }

    public DateTimeOffset? FirstRedeemedAt { get; init; }

    public DateTimeOffset? LastRedeemedAt { get; init; }

    public string CurrentStage { get; init; } = CreatorConversionStages.NoRedemptions;
}

public sealed record CreateCreatorCodeRequestDto
{
    public required string Code { get; init; }

    public Guid CreatorId { get; init; }

    public Guid? CreatorAccountId { get; init; }

    public int PremiumDurationDays { get; init; } = 21;

    public DateTimeOffset? ValidFrom { get; init; }

    public DateTimeOffset? ValidUntil { get; init; }

    public string Status { get; init; } = "active";
}

public sealed record UpdateCreatorCodeRequestDto
{
    public string? Status { get; init; }

    public DateTimeOffset? ValidFrom { get; init; }

    public bool ClearValidFrom { get; init; }

    public DateTimeOffset? ValidUntil { get; init; }

    public bool ClearValidUntil { get; init; }

    public int? PremiumDurationDays { get; init; }

    public string? CreatorDisplayName { get; init; }
}
