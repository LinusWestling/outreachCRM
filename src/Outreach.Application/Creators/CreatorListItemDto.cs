namespace Outreach.Application.Creators;

public sealed record CreatorListItemDto
{
    public Guid Id { get; init; }

    public required string ProfileUrl { get; init; }

    public string? Handle { get; init; }

    public CreatorChannel Channel { get; init; }

    public int? Followers { get; init; }

    public string? MessageVersion { get; init; }

    public DateOnly? FirstMessageDate { get; init; }

    public string ResponseStatus { get; init; } = "No";

    public bool? Responded { get; init; }

    public string? Email { get; init; }

    public string? ThreadsUrl { get; init; }

    public DateOnly? SecondMessageDate { get; init; }

    public DateOnly? LastContactDate { get; init; }

    public string? Code { get; init; }

    public int OngoingCount { get; init; }

    public int ActivatedCount { get; init; }

    public int ConvertedCount { get; init; }

    public int PaidEligibleCount { get; init; }

    public DateTimeOffset? FirstRedeemedAt { get; init; }

    public DateTimeOffset? LastRedeemedAt { get; init; }

    public string CurrentStage { get; init; } = CreatorConversionStages.NoRedemptions;

    public bool? ResumeContact { get; init; }

    public Guid? MessageTemplateId { get; init; }

    public string? MessageBody { get; init; }

    public Guid? EmailTemplateId { get; init; }

    public string? EmailSubject { get; init; }

    public string? EmailBody { get; init; }

    public bool IsReadyForAction { get; init; }

    public DateTimeOffset? ProspectReadyAt { get; init; }
}
