namespace Outreach.Domain;

public sealed class ContactLog
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CreatorId { get; set; }
    public ContactLogType Type { get; set; }
    public ContactChannel? Channel { get; set; }
    public Guid? MessageTemplateId { get; set; }
    public string? MessageSubject { get; set; }
    public string? MessageBody { get; set; }
    public string? Outcome { get; set; }
    public DateTimeOffset OccurredAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public Creator? Creator { get; set; }
    public MessageTemplate? MessageTemplate { get; set; }
}
