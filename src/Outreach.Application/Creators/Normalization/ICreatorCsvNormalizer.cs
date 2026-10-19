namespace Outreach.Application.Creators.Normalization;

public interface ICreatorCsvNormalizer
{
    string? NormalizeText(string? value);

    string? NormalizeProfileUrl(string? profileUrl);

    string? ExtractHandle(string? profileUrl);

    int? ParseFollowerCount(string? followerCount);

    DateOnly? ParseDate(string? value);

    bool? ParseBoolean(string? value);

    string FormatFollowerCount(int? followerCount);

    string FormatDate(DateOnly? value);

    string FormatBoolean(bool? value);
}
