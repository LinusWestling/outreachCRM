using System.Globalization;
using System.Text.RegularExpressions;

namespace Outreach.Application.Creators.Normalization;

public sealed partial class CreatorCsvNormalizer : ICreatorCsvNormalizer
{
    public string? NormalizeText(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
    }

    public string? NormalizeProfileUrl(string? profileUrl)
    {
        var normalized = NormalizeText(profileUrl);
        return normalized?.TrimEnd('/');
    }

    public string? ExtractHandle(string? profileUrl)
    {
        var normalized = NormalizeProfileUrl(profileUrl);
        if (normalized is null)
        {
            return null;
        }

        var match = CreatorHandleRegex().Match(normalized);
        if (!match.Success)
        {
            return null;
        }

        var handle = match.Groups["handle"].Value.Trim('@', '/');
        if (IsReservedPathSegment(handle))
        {
            return null;
        }

        return string.IsNullOrWhiteSpace(handle) ? null : handle;
    }

    public int? ParseFollowerCount(string? followerCount)
    {
        var normalized = NormalizeText(followerCount)?.ToLowerInvariant();
        if (normalized is null)
        {
            return null;
        }

        var multiplier = normalized.EndsWith('k') ? 1_000 :
            normalized.EndsWith('m') ? 1_000_000 : 1;

        if (multiplier > 1)
        {
            normalized = normalized[..^1];
        }

        normalized = normalized.Replace(" ", string.Empty, StringComparison.Ordinal);
        normalized = normalized.Replace(',', '.');

        if (!decimal.TryParse(normalized, NumberStyles.Number, CultureInfo.InvariantCulture, out var parsed))
        {
            return null;
        }

        return (int)Math.Round(parsed * multiplier, MidpointRounding.AwayFromZero);
    }

    public DateOnly? ParseDate(string? value)
    {
        var normalized = NormalizeText(value);
        if (normalized is null)
        {
            return null;
        }

        string[] formats = ["yyyy-MM-dd", "yyyy/M/d", "M/d/yyyy", "d/M/yyyy"];
        return DateOnly.TryParseExact(normalized, formats, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed)
            ? parsed
            : null;
    }

    public bool? ParseBoolean(string? value)
    {
        var normalized = NormalizeText(value)?.ToLowerInvariant();
        return normalized switch
        {
            "yes" or "y" or "true" or "1" or "ja" => true,
            "no" or "n" or "false" or "0" or "nej" => false,
            _ => null
        };
    }

    public string FormatFollowerCount(int? followerCount)
    {
        return followerCount?.ToString(CultureInfo.InvariantCulture) ?? string.Empty;
    }

    public string FormatDate(DateOnly? value)
    {
        return value?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) ?? string.Empty;
    }

    public string FormatBoolean(bool? value)
    {
        return value switch
        {
            true => "yes",
            false => "no",
            null => string.Empty
        };
    }

    private static bool IsReservedPathSegment(string handle)
    {
        var normalized = handle.Trim().ToLowerInvariant();
        return normalized is
            "about" or
            "accounts" or
            "explore" or
            "messages" or
            "p" or
            "reel" or
            "reels" or
            "stories";
    }

    [GeneratedRegex(@"(?:instagram\.com|tiktok\.com)/(?:@)?(?<handle>[^/?#]+)", RegexOptions.IgnoreCase)]
    private static partial Regex CreatorHandleRegex();
}
