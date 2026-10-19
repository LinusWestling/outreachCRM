namespace Outreach.Application.Creators;

public sealed record MessageTemplateDto
{
    public Guid Id { get; init; }

    public required string Name { get; init; }

    public required string Kind { get; init; }

    public string? Platform { get; init; }

    public string? Subject { get; init; }

    public required string Body { get; init; }

    public string? GenerationRules { get; init; }

    public bool IsActive { get; init; }

    public DateTimeOffset CreatedAt { get; init; }

    public DateTimeOffset UpdatedAt { get; init; }
}

public sealed record SaveMessageTemplateRequestDto
{
    public required string Name { get; init; }

    public string? Kind { get; init; }

    public string? Type { get; init; }

    public string? Subject { get; init; }

    public required string Body { get; init; }

    public string? GenerationRules { get; init; }

    public bool Activate { get; init; }
}
