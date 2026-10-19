using System.Globalization;
using System.Text.RegularExpressions;
using Outreach.Domain;

namespace Outreach.Application;

public static partial class OutreachParsing
{
    public static Platform? DetectPlatform(string? profile)
    {
        if (string.IsNullOrWhiteSpace(profile))
        {
            return null;
        }

        var value = profile.ToLowerInvariant();
        if (value.Contains("instagram.com"))
        {
            return Platform.Instagram;
        }

        if (value.Contains("tiktok.com"))
        {
            return Platform.TikTok;
        }

        return null;
    }

    public static string NormalizeHandle(string? profileOrHandle)
    {
        if (string.IsNullOrWhiteSpace(profileOrHandle))
        {
            return string.Empty;
        }

        var value = profileOrHandle.Trim().ToLowerInvariant();
        value = value.Split('?', '#')[0].TrimEnd('/');
        value = value.Replace("https://", string.Empty).Replace("http://", string.Empty);
        value = value.Replace("www.", string.Empty);

        if (value.StartsWith("instagram.com/"))
        {
            value = value["instagram.com/".Length..];
        }
        else if (value.StartsWith("tiktok.com/@"))
        {
            value = value["tiktok.com/@".Length..];
        }
        else if (value.StartsWith("tiktok.com/"))
        {
            value = value["tiktok.com/".Length..];
        }

        value = value.TrimStart('@').Trim('/');
        var slash = value.IndexOf("/", StringComparison.Ordinal);
        if (slash >= 0)
        {
            value = value[..slash];
        }

        return HandleCleaner().Replace(value, string.Empty);
    }

    public static int? ParseFollowerCount(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        var value = raw.Trim().ToLowerInvariant().Replace(" ", string.Empty);
        var multiplier = 1;
        if (value.EndsWith("k", StringComparison.Ordinal))
        {
            multiplier = 1_000;
            value = value[..^1];
        }
        else if (value.EndsWith("m", StringComparison.Ordinal))
        {
            multiplier = 1_000_000;
            value = value[..^1];
        }

        value = value.Replace(',', '.');
        return decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var parsed)
            ? (int)Math.Round(parsed * multiplier)
            : null;
    }

    public static bool ParseBoolish(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return false;
        }

        var value = raw.Trim().ToLowerInvariant();
        return value is "yes" or "y" or "true" or "1" or "ja" or "x";
    }

    [GeneratedRegex("[^a-z0-9._-]")]
    private static partial Regex HandleCleaner();
}
