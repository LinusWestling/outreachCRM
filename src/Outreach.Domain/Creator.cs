namespace Outreach.Domain;

public sealed class Creator
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string DisplayName { get; set; } = string.Empty;
    public string? Email { get; set; }
    public string? ThreadsUrl { get; set; }
    public string? Notes { get; set; }
    public OutreachStatus Status { get; set; } = OutreachStatus.NotContacted;
    public CreatorPriority Priority { get; set; } = CreatorPriority.Normal;
    public int? FitScore { get; set; }
    public DateOnly? LastContactedAt { get; set; }
    public DateOnly? LastResponseAt { get; set; }
    public DateOnly? NextFollowUpAt { get; set; }
    public DateTimeOffset? ProspectReadyAt { get; set; }
    public bool DoNotContact { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<CreatorAccount> Accounts { get; set; } = [];
    public List<ContactLog> ContactLogs { get; set; } = [];
}
