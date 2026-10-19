using System.Collections.Concurrent;
using System.Net.Mail;
using System.Text.Encodings.Web;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using MimeKit;
using Outreach.Application.Creators;
using Outreach.Application.Creators.Services;
using Outreach.Domain;

namespace Outreach.Infrastructure;

public sealed class EmailFollowUpSender(
    OutreachDbContext db,
    IConfiguration configuration) : IEmailFollowUpSender
{
    private const int MinimumDaysSinceLastContact = 7;
    private static readonly ConcurrentDictionary<Guid, SemaphoreSlim> SendLocks = new();

    public async Task<CreatorListItemDto?> SendAsync(Guid creatorId, CancellationToken cancellationToken = default)
    {
        var sendLock = SendLocks.GetOrAdd(creatorId, _ => new SemaphoreSlim(1, 1));
        await sendLock.WaitAsync(cancellationToken);

        try
        {
            var creator = await db.Creators
                .Include(x => x.Accounts)
                .Include(x => x.ContactLogs)
                    .ThenInclude(x => x.MessageTemplate)
                .AsSplitQuery()
                .FirstOrDefaultAsync(x => x.Id == creatorId, cancellationToken);

            if (creator?.Accounts.FirstOrDefault() is not { } account)
            {
                return null;
            }

            var emailLog = LatestEmailFollowUpLog(creator);
            ValidateSendableFollowUp(creator, emailLog);

            var smtp = ReadSmtpConfiguration();
            var subject = emailLog!.MessageSubject!.Trim();
            var draftBody = emailLog.MessageBody!.Trim();
            var sentBody = ComposePlainTextBody(draftBody);

            await SendSmtpAsync(smtp, creator.Email!.Trim(), subject, sentBody, ComposeHtmlBody(draftBody), cancellationToken);

            var sentAt = DateTimeOffset.UtcNow;
            var sentDate = StockholmToday();
            emailLog.Type = ContactLogType.Outbound;
            emailLog.MessageSubject = subject;
            emailLog.MessageBody = sentBody;
            emailLog.Outcome = "SMTP accepted";
            emailLog.OccurredAt = sentAt;

            var metadata = CreatorMapping.ParseNotes(creator.Notes);
            creator.Notes = CreatorMapping.BuildNotes(
                metadata.GetValueOrDefault("MessageVersion"),
                CreatorMapping.FirstMessageDate(creator),
                CreatorMapping.SecondMessageDate(creator),
                sentDate,
                metadata.GetValueOrDefault("Code"),
                CreatorMapping.ResumeContact(creator));
            creator.LastContactedAt = sentDate;
            creator.Status = OutreachStatus.Contacted;
            creator.UpdatedAt = sentAt;

            await db.SaveChangesAsync(cancellationToken);

            return CreatorMapping.ToListItem(
                creator,
                account,
                LatestDirectMessageLog(creator),
                emailLog);
        }
        finally
        {
            sendLock.Release();
        }
    }

    private SmtpConfiguration ReadSmtpConfiguration()
    {
        var host = RequiredSetting("Smtp:Host");
        var fromAddress = RequiredSetting("Smtp:FromAddress");
        var username = RequiredSetting("Smtp:Username");
        var password = RequiredSetting("Smtp:Password");
        var fromName = configuration["Smtp:FromName"]?.Trim();

        return new SmtpConfiguration(
            host,
            int.TryParse(configuration["Smtp:Port"], out var port) ? port : 465,
            fromAddress,
            string.IsNullOrWhiteSpace(fromName) ? fromAddress : fromName,
            username,
            password);
    }

    private string RequiredSetting(string key)
    {
        var value = configuration[key]?.Trim();
        return !string.IsNullOrWhiteSpace(value)
            ? value
            : throw new InvalidOperationException("SMTP is not fully configured. Set Smtp:Host, Smtp:FromAddress, Smtp:Username and Smtp:Password (for example with dotnet user-secrets) before sending.");
    }

    private static void ValidateSendableFollowUp(Creator creator, ContactLog? emailLog)
    {
        if (creator.DoNotContact || creator.LastResponseAt.HasValue || creator.Status is
            OutreachStatus.Queued or
            OutreachStatus.Archived or
            OutreachStatus.NotInterested or
            OutreachStatus.DoNotContact or
            OutreachStatus.Closed or
            OutreachStatus.Responded or
            OutreachStatus.Interested or
            OutreachStatus.Partnered)
        {
            throw new InvalidOperationException("This creator is not eligible for an email follow-up.");
        }

        if (string.IsNullOrWhiteSpace(creator.Email))
        {
            throw new InvalidOperationException("Email follow-up needs an email address.");
        }

        try
        {
            _ = new MailAddress(creator.Email.Trim());
        }
        catch (FormatException ex)
        {
            throw new InvalidOperationException("The creator email address is invalid.", ex);
        }

        if (emailLog is null ||
            string.IsNullOrWhiteSpace(emailLog.MessageSubject) ||
            string.IsNullOrWhiteSpace(emailLog.MessageBody))
        {
            throw new InvalidOperationException("Save a personalized email subject and body before sending.");
        }

        if (emailLog.Type == ContactLogType.Outbound)
        {
            throw new InvalidOperationException("This follow-up has already been sent. Save a new email draft before sending another.");
        }

        var lastContact = CreatorMapping.LastContactDate(creator) ?? CreatorMapping.FirstMessageDate(creator);
        if (!lastContact.HasValue || lastContact.Value > StockholmToday().AddDays(-MinimumDaysSinceLastContact))
        {
            throw new InvalidOperationException($"Email follow-ups can be sent after {MinimumDaysSinceLastContact} days without contact.");
        }
    }

    private static async Task SendSmtpAsync(
        SmtpConfiguration smtp,
        string recipient,
        string subject,
        string plainTextBody,
        string htmlBody,
        CancellationToken cancellationToken)
    {
        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(smtp.FromName, smtp.FromAddress));
        message.To.Add(MailboxAddress.Parse(recipient));
        message.Subject = subject;

        var body = new BodyBuilder
        {
            TextBody = plainTextBody,
            HtmlBody = htmlBody
        };
        message.Body = body.ToMessageBody();

        using var client = new MailKit.Net.Smtp.SmtpClient();
        try
        {
            await client.ConnectAsync(smtp.Host, smtp.Port, SecureSocketOptions.SslOnConnect, cancellationToken);
            await client.AuthenticateAsync(smtp.Username, smtp.Password, cancellationToken);
            await client.SendAsync(message, cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            throw new EmailDeliveryException("The SMTP server did not accept this email. The draft was not marked as sent.", ex);
        }
        finally
        {
            if (client.IsConnected)
            {
                try
                {
                    await client.DisconnectAsync(true, CancellationToken.None);
                }
                catch
                {
                    // SMTP has already accepted the message; a disconnect error does not change that.
                }
            }
        }
    }

    private string ComposePlainTextBody(string draftBody)
    {
        var signature = ReadSignature();
        var body = draftBody.Trim();
        if (signature.Lines.Count > 0)
        {
            body += "\n\n" + string.Join("\n", signature.Lines);
        }

        if (signature.Links.Count > 0)
        {
            body += "\n\n" + string.Join("\n", signature.Links.Select(link => $"{link.Label}: {link.Url}"));
        }

        return body;
    }

    private string ComposeHtmlBody(string draftBody)
    {
        var signature = ReadSignature();
        var body = EncodeHtml(draftBody.Trim());
        if (signature.Lines.Count > 0)
        {
            body += "<br><br>" + string.Join("<br>", signature.Lines.Select(EncodeHtml));
        }

        if (signature.Links.Count > 0)
        {
            body += "<br><br>" + string.Join(
                " &nbsp;--&nbsp; ",
                signature.Links.Select(link => $"<a href=\"{HtmlEncoder.Default.Encode(link.Url)}\">{HtmlEncoder.Default.Encode(link.Label)}</a>"));
        }

        return body;
    }

    private static string EncodeHtml(string text) =>
        HtmlEncoder.Default.Encode(text)
            .Replace("\r\n", "<br>", StringComparison.Ordinal)
            .Replace("\n", "<br>", StringComparison.Ordinal);

    // Optional signature appended to every follow-up email, configured under Smtp:Signature.
    private EmailSignature ReadSignature()
    {
        var section = configuration.GetSection("Smtp:Signature");
        var lines = section.GetSection("Lines").GetChildren()
            .Select(x => x.Value?.Trim())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x!)
            .ToList();
        var links = section.GetSection("Links").GetChildren()
            .Select(x => new SignatureLink(x["Label"]?.Trim() ?? "", x["Url"]?.Trim() ?? ""))
            .Where(x => x.Label.Length > 0 && x.Url.Length > 0)
            .ToList();

        return new EmailSignature(lines, links);
    }

    private static ContactLog? LatestEmailFollowUpLog(Creator creator) =>
        creator.ContactLogs
            .Where(x =>
                x.Channel == ContactChannel.Email &&
                (!string.IsNullOrWhiteSpace(x.MessageSubject) || !string.IsNullOrWhiteSpace(x.MessageBody) || x.MessageTemplateId.HasValue))
            .OrderByDescending(x => x.Type != ContactLogType.Outbound)
            .ThenByDescending(x => x.OccurredAt)
            .ThenByDescending(x => x.CreatedAt)
            .FirstOrDefault();

    private static ContactLog? LatestDirectMessageLog(Creator creator) =>
        creator.ContactLogs
            .Where(x =>
                x.Channel != ContactChannel.Email &&
                (!string.IsNullOrWhiteSpace(x.MessageBody) || x.MessageTemplateId.HasValue))
            .OrderByDescending(x => x.Type == ContactLogType.Outbound)
            .ThenByDescending(x => x.OccurredAt)
            .ThenByDescending(x => x.CreatedAt)
            .FirstOrDefault();

    private static DateOnly StockholmToday()
    {
        var timeZone = TimeZoneInfo.FindSystemTimeZoneById("Europe/Stockholm");
        return DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, timeZone).DateTime);
    }

    private sealed record SmtpConfiguration(
        string Host,
        int Port,
        string FromAddress,
        string FromName,
        string Username,
        string Password);

    private sealed record EmailSignature(IReadOnlyList<string> Lines, IReadOnlyList<SignatureLink> Links);

    private sealed record SignatureLink(string Label, string Url);
}
