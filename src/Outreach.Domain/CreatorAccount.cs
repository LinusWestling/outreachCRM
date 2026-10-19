namespace Outreach.Domain;

public sealed class CreatorAccount
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CreatorId { get; set; }
    public Platform Platform { get; set; }
    public string Handle { get; set; } = string.Empty;
    public string NormalizedHandle { get; set; } = string.Empty;
    public string ProfileUrl { get; set; } = string.Empty;
    public int? FollowerCount { get; set; }
    public string? RawFollowerCount { get; set; }
    public string? SourceName { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public Creator? Creator { get; set; }
}
