using Outreach.Domain;

namespace Outreach.Application;

public sealed record CreatorListQuery(
    string? Search,
    Platform? Platform,
    OutreachStatus? Status,
    CreatorPriority? Priority,
    bool DueOnly = false);

public sealed record CreatorAccountDto(
    Guid Id,
    Platform Platform,
    string Handle,
    string NormalizedHandle,
    string ProfileUrl,
    int? FollowerCount,
    string? RawFollowerCount);

public sealed record CreatorSummaryDto(
    Guid Id,
    string DisplayName,
    string? Email,
    OutreachStatus Status,
    CreatorPriority Priority,
    DateOnly? LastContactedAt,
    DateOnly? LastResponseAt,
    DateOnly? NextFollowUpAt,
    bool DoNotContact,
    IReadOnlyList<CreatorAccountDto> Accounts);

public sealed record UpdateCreatorRequest(
    string? DisplayName,
    string? Email,
    string? Notes,
    OutreachStatus? Status,
    CreatorPriority? Priority,
    DateOnly? NextFollowUpAt,
    bool? DoNotContact);

public sealed record AddContactLogRequest(
    ContactLogType Type,
    ContactChannel? Channel,
    Guid? MessageTemplateId,
    string? MessageBody,
    string? Outcome,
    DateTimeOffset? OccurredAt,
    DateOnly? NextFollowUpAt,
    OutreachStatus? NewStatus);
