namespace Outreach.Application.Creators;

public static class CreatorConversionStages
{
    public const string Ongoing = "Ongoing";
    public const string Active = "Active";
    public const string Converted = "Converted";
    public const string NoRedemptions = "No redemptions";
}

public sealed record CreatorConversionStatsDto
{
    public Guid CreatorId { get; init; }

    public int OngoingCount { get; init; }

    public int ActivatedCount { get; init; }

    public int ConvertedCount { get; init; }

    public int PaidEligibleCount { get; init; }

    public DateTimeOffset? FirstRedeemedAt { get; init; }

    public DateTimeOffset? LastRedeemedAt { get; init; }

    public string CurrentStage { get; init; } = CreatorConversionStages.NoRedemptions;

    public string? Code { get; init; }
}

public sealed record CreatorConversionSummaryDto
{
    public int ReachedOutCount { get; init; }

    public int RespondedCreatorCount { get; init; }

    public int OngoingCreatorCount { get; init; }

    public int ActivatedCreatorCount { get; init; }

    public int ConvertedCreatorCount { get; init; }

    public decimal ReplyToRedeemRate { get; init; }

    public decimal RedeemToTrialRate { get; init; }

    public decimal TrialToPaidRate { get; init; }
}
