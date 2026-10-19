namespace Outreach.Application.Creators;

public sealed record CreatePendingCreatorRequestDto
{
    public required string ProfileUrl { get; init; }

    public int? Followers { get; init; }

    public string? Email { get; init; }

    public string? ThreadsUrl { get; init; }

    public string? Code { get; init; }

    public DateOnly? FirstMessageDate { get; init; }
}

public sealed record PendingCreatorDuplicateCheckDto
{
    public required string ProfileUrl { get; init; }

    public required string Handle { get; init; }

    public CreatorChannel Channel { get; init; }

    public bool IsDuplicate { get; init; }

    public string? DuplicateType { get; init; }

    public string? Message { get; init; }
}

public sealed record UpdateCreatorWorkflowRequestDto
{
    public string? DisplayName { get; init; }

    public string? Email { get; init; }

    public string? ThreadsUrl { get; init; }

    public int? Followers { get; init; }

    public string? MessageVersion { get; init; }

    public Guid? MessageTemplateId { get; init; }

    public string? MessageBody { get; init; }

    public Guid? EmailTemplateId { get; init; }

    public string? EmailSubject { get; init; }

    public string? EmailBody { get; init; }

    public string? ResponseStatus { get; init; }

    public DateOnly? FirstMessageDate { get; init; }

    public DateOnly? SecondMessageDate { get; init; }

    public DateOnly? LastContactDate { get; init; }

    public string? Code { get; init; }

    public bool? ResumeContact { get; init; }
}

public sealed record BulkUpdateCreatorsRequestDto
{
    public IReadOnlyList<Guid> CreatorIds { get; init; } = [];

    public DateOnly? FirstMessageDate { get; init; }

    public DateOnly? LastContactDate { get; init; }

    public bool SetResponseStatus { get; init; }

    public string? ResponseStatus { get; init; }

    public bool SetMessage { get; init; }

    public Guid? MessageTemplateId { get; init; }

    public string? MessageVersion { get; init; }

    public string? MessageBody { get; init; }
}

public sealed record CompletePendingCreatorRequestDto
{
    public string? Email { get; init; }

    public string? ThreadsUrl { get; init; }

    public int? Followers { get; init; }

    public string? Code { get; init; }

    public Guid? MessageTemplateId { get; init; }

    public string? MessageVersion { get; init; }

    public string? MessageBody { get; init; }

    public DateOnly? FirstMessageDate { get; init; }

    public DateOnly? LastContactDate { get; init; }
}

public sealed record ParsedCreatorProfileDto
{
    public required CreatorChannel Channel { get; init; }

    public required string Handle { get; init; }

    public required string ProfileUrl { get; init; }
}
