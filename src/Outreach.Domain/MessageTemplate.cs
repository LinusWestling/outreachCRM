namespace Outreach.Domain;

public sealed class MessageTemplate
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public MessageTemplateKind Kind { get; set; } = MessageTemplateKind.Dm;
    public Platform? Platform { get; set; }
    public string? Subject { get; set; }
    public string Body { get; set; } = string.Empty;
    public string? GenerationRules { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<ContactLog> ContactLogs { get; set; } = [];
}
