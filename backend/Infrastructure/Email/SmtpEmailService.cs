using System.Net;
using System.Net.Mail;
using backend.Application.Interfaces;

namespace backend.Infrastructure.Email;

public class SmtpEmailService : IEmailService
{
    private readonly IConfiguration _config;
    private readonly ILogger<SmtpEmailService> _logger;

    public SmtpEmailService(IConfiguration config, ILogger<SmtpEmailService> logger)
    {
        _config = config;
        _logger = logger;
    }

    private SmtpClient CreateClient()
    {
        var host = _config["Email:SmtpHost"] ?? "smtp.gmail.com";
        var port = int.Parse(_config["Email:SmtpPort"] ?? "587");
        var user = _config["Email:Username"] ?? "";
        var pass = _config["Email:Password"] ?? "";

        return new SmtpClient(host, port)
        {
            Credentials    = new NetworkCredential(user, pass),
            EnableSsl      = true,
            DeliveryMethod = SmtpDeliveryMethod.Network,
        };
    }

    private string FromAddress => _config["Email:FromAddress"] ?? "noreply@datainsightgen.com";
    private string FromName    => _config["Email:FromName"]    ?? "DIG";
    private string AppUrl      => (_config["AppUrl"]           ?? "https://datainsightgen.com").TrimEnd('/');

    // ── Base email wrapper ────────────────────────────────────────────────────
    private static string Wrap(string content) => $@"
<!DOCTYPE html>
<html lang=""en"">
<head>
  <meta charset=""UTF-8"" />
  <meta name=""viewport"" content=""width=device-width, initial-scale=1.0"" />
  <title>DIG</title>
</head>
<body style=""margin:0;padding:0;background:#0a0f1e;font-family:'Segoe UI',Arial,sans-serif;"">
  <table width=""100%"" cellpadding=""0"" cellspacing=""0"" style=""background:#0a0f1e;padding:40px 0;"">
    <tr>
      <td align=""center"">
        <table width=""580"" cellpadding=""0"" cellspacing=""0"" style=""max-width:580px;width:100%;"">

          <!-- HEADER -->
          <tr>
            <td style=""background:linear-gradient(135deg,#0f172a,#1e293b);border-radius:16px 16px 0 0;padding:32px 40px;border-bottom:1px solid #1e3a5f;"">
              <table width=""100%"" cellpadding=""0"" cellspacing=""0"">
                <tr>
                  <td>
                    <span style=""font-size:22px;font-weight:800;color:#3b82f6;letter-spacing:-0.5px;"">DIG</span>
                    <span style=""font-size:12px;color:#64748b;margin-left:8px;"">Dataset Insight Generator</span>
                  </td>
                  <td align=""right"">
                    <span style=""font-size:11px;color:#334155;"">datainsightgen.com</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style=""background:#0f172a;padding:40px;border-left:1px solid #1e293b;border-right:1px solid #1e293b;"">
              {content}
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style=""background:#080d1a;border-radius:0 0 16px 16px;padding:24px 40px;border:1px solid #1e293b;border-top:1px solid #1e3a5f;"">
              <p style=""margin:0;font-size:11px;color:#334155;text-align:center;line-height:1.8;"">
                This email was sent by DIG — Dataset Insight Generator<br/>
                <a href=""https://datainsightgen.com"" style=""color:#3b82f6;text-decoration:none;"">datainsightgen.com</a>
                &nbsp;·&nbsp;
                <span>© 2026 DIG. All rights reserved.</span>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>";

    // ── Button component ──────────────────────────────────────────────────────
    private static string Button(string url, string label) => $@"
<table cellpadding=""0"" cellspacing=""0"" style=""margin:28px 0;"">
  <tr>
    <td style=""background:linear-gradient(135deg,#2563eb,#1d4ed8);border-radius:10px;"">
      <a href=""{url}"" style=""display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;letter-spacing:0.3px;"">
        {label}
      </a>
    </td>
  </tr>
</table>";

    // ── Heading ───────────────────────────────────────────────────────────────
    private static string Heading(string text) =>
        $@"<h1 style=""margin:0 0 8px 0;font-size:24px;font-weight:800;color:#e2e8f0;letter-spacing:-0.5px;"">{text}</h1>";

    // ── Subheading ────────────────────────────────────────────────────────────
    private static string Sub(string text) =>
        $@"<p style=""margin:0 0 24px 0;font-size:14px;color:#64748b;"">{text}</p>";

    // ── Body paragraph ────────────────────────────────────────────────────────
    private static string Para(string text) =>
        $@"<p style=""margin:0 0 16px 0;font-size:15px;color:#94a3b8;line-height:1.7;"">{text}</p>";

    // ── Info box ──────────────────────────────────────────────────────────────
    private static string InfoBox(string text) => $@"
<div style=""background:#1e293b;border:1px solid #334155;border-left:3px solid #3b82f6;border-radius:8px;padding:16px 20px;margin:20px 0;"">
  <p style=""margin:0;font-size:13px;color:#64748b;line-height:1.6;"">{text}</p>
</div>";

    // ── Fallback link ─────────────────────────────────────────────────────────
    private static string FallbackLink(string url) => $@"
<p style=""margin:16px 0 0 0;font-size:12px;color:#475569;"">
  If the button doesn't work, copy and paste this link into your browser:<br/>
  <a href=""{url}"" style=""color:#3b82f6;word-break:break-all;font-size:11px;"">{url}</a>
</p>";

    private async Task SendAsync(string toEmail, string subject, string htmlBody)
    {
        try
        {
            using var client  = CreateClient();
            using var message = new MailMessage();
            message.From       = new MailAddress(FromAddress, FromName);
            message.To.Add(new MailAddress(toEmail));
            message.Subject    = subject;
            message.Body       = htmlBody;
            message.IsBodyHtml = true;
            await client.SendMailAsync(message);
            _logger.LogInformation("[Email] Sent '{Subject}' to {Email}", subject, toEmail);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Email] Failed to send '{Subject}' to {Email}", subject, toEmail);
            throw;
        }
    }

    // ── Email Verification ────────────────────────────────────────────────────
    public async Task SendEmailVerificationAsync(string toEmail, string userName, string token)
    {
        var link = $"{AppUrl}/verify-email?token={token}";
        var body = Wrap(
            Heading("Verify your email address") +
            Sub($"Hi {userName}, welcome to DIG.") +
            Para("You're one step away from unlocking AI-powered dataset analysis. Click below to verify your email and activate your account.") +
            Button(link, "Verify Email Address") +
            InfoBox("This link expires in 24 hours. If you didn't create a DIG account, you can safely ignore this email.") +
            FallbackLink(link)
        );
        await SendAsync(toEmail, "Verify your DIG account", body);
    }

    // ── Password Reset ────────────────────────────────────────────────────────
    public async Task SendPasswordResetAsync(string toEmail, string userName, string token)
    {
        var link = $"{AppUrl}/reset-password?token={token}";
        var body = Wrap(
            Heading("Reset your password") +
            Sub($"Hi {userName}, we received a password reset request.") +
            Para("Click the button below to set a new password. If you didn't request this, you can safely ignore this email — your password won't change.") +
            Button(link, "Reset Password") +
            InfoBox("This link expires in 1 hour for your security.") +
            FallbackLink(link)
        );
        await SendAsync(toEmail, "Reset your DIG password", body);
    }

    // ── Email Change ──────────────────────────────────────────────────────────
    public async Task SendEmailChangeVerificationAsync(string toNewEmail, string userName, string token)
    {
        var link = $"{AppUrl}/verify-email-change?token={token}";
        var body = Wrap(
            Heading("Confirm your new email") +
            Sub($"Hi {userName}, you requested an email address change.") +
            Para("Click below to confirm your new email address. Once confirmed, all future communications will be sent here.") +
            Button(link, "Confirm New Email") +
            InfoBox("This link expires in 1 hour. If you didn't request this change, contact support immediately.") +
            FallbackLink(link)
        );
        await SendAsync(toNewEmail, "Confirm your new DIG email address", body);
    }

    // ── Phone OTP ─────────────────────────────────────────────────────────────
    public async Task SendPhoneOtpAsync(string toEmail, string userName, string otp)
    {
        var body = Wrap(
            Heading("Phone verification code") +
            Sub($"Hi {userName}, here is your verification code.") +
            Para("Enter this code in the DIG app to verify your phone number:") +
            $@"<div style=""background:#1e293b;border:1px solid #334155;border-radius:12px;padding:24px;margin:20px 0;text-align:center;"">
                <span style=""font-size:40px;font-weight:800;letter-spacing:12px;color:#3b82f6;font-family:monospace;"">{otp}</span>
               </div>" +
            InfoBox("This code expires in 10 minutes. Never share this code with anyone.")
        );
        await SendAsync(toEmail, "Your DIG phone verification code", body);
    }

    // ── Report Delivery ───────────────────────────────────────────────────────
    public async Task SendReportAsync(string toEmail, string userName, byte[] pdfBytes, string reportFileName)
    {
        var body = Wrap(
            Heading("Your analysis report is ready") +
            Sub($"Hi {userName}, your DIG report has been generated.") +
            Para("Your AI-powered dataset analysis is complete. The full PDF report is attached to this email, including key insights, visualizations, and recommendations.") +
            $@"<div style=""background:#1e293b;border:1px solid #1e3a5f;border-radius:12px;padding:20px 24px;margin:20px 0;display:flex;align-items:center;"">
                <div style=""background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.3);border-radius:8px;padding:12px;margin-right:16px;"">
                  <span style=""font-size:24px;"">📊</span>
                </div>
                <div>
                  <p style=""margin:0;font-size:14px;font-weight:700;color:#e2e8f0;"">{reportFileName}</p>
                  <p style=""margin:4px 0 0 0;font-size:12px;color:#64748b;"">AI Analysis Report · Generated by DIG</p>
                </div>
               </div>" +
            Para("Log in to your dashboard anytime to re-download your report, view interactive charts, and access your analysis history.") +
            Button($"{AppUrl}/dashboard", "View Dashboard")
        );

        try
        {
            using var client  = CreateClient();
            using var message = new MailMessage();
            message.From       = new MailAddress(FromAddress, FromName);
            message.To.Add(new MailAddress(toEmail));
            message.Subject    = $"Your DIG Report: {reportFileName}";
            message.Body       = body;
            message.IsBodyHtml = true;

            using var stream    = new MemoryStream(pdfBytes);
            var attachment      = new Attachment(stream, reportFileName, "application/pdf");
            message.Attachments.Add(attachment);
            await client.SendMailAsync(message);
            _logger.LogInformation("[Email] Report sent to {Email}", toEmail);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Email] Failed to send report to {Email}", toEmail);
            throw;
        }
    }
}