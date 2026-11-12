namespace backend.Application.Interfaces;

public interface IEmailService
{
    Task SendEmailVerificationAsync(string toEmail, string userName, string token);
    Task SendPasswordResetAsync(string toEmail, string userName, string token);
    Task SendEmailChangeVerificationAsync(string toNewEmail, string userName, string token);
    Task SendPhoneOtpAsync(string toEmail, string userName, string otp);
    Task SendReportAsync(string toEmail, string userName, byte[] pdfBytes, string reportFileName);
    Task SendTeamInviteAsync(string toEmail, string inviterName, string teamName, string inviteUrl, string role);

    /// <summary>
    /// A notice to the person who runs DIG that something needs them. Each line
    /// is a plain sentence; nothing in it is addressed to a user. Sent through
    /// OwnerAlerts, which limits how often.
    /// </summary>
    Task SendOwnerAlertAsync(string toEmail, string subject, IReadOnlyList<string> lines);
}
