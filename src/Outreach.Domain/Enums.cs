namespace Outreach.Domain;

public enum Platform
{
    Instagram = 1,
    TikTok = 2
}

public enum OutreachStatus
{
    NotContacted = 1,
    Queued = 2,
    Contacted = 3,
    FollowUpDue = 4,
    Responded = 5,
    Interested = 6,
    NotInterested = 7,
    NoResponse = 8,
    Partnered = 9,
    Paused = 10,
    DoNotContact = 11,
    Closed = 12,
    Archived = 13
}

public enum CreatorPriority
{
    Low = 1,
    Normal = 2,
    High = 3
}

public enum ContactLogType
{
    Outbound = 1,
    Inbound = 2,
    Note = 3,
    StatusChange = 4
}

public enum ContactChannel
{
    Instagram = 1,
    TikTok = 2,
    Email = 3,
    Other = 4
}

public enum MessageTemplateKind
{
    Dm = 1,
    Email = 2
}

public enum ImportRowAction
{
    Created = 1,
    Updated = 2,
    Skipped = 3,
    NeedsReview = 4
}
