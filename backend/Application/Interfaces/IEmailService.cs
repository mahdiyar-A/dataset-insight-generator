namespace backend.Application.Interfaces;

public interface IEmailService
{
    Task SendEmailVerificationAsync(string toEmail, string userName, string token);
    Task SendPasswordResetAsync(string toEmail, string userName, string token);
    Task SendEmailChangeVerificationAsync(string toNewEmail, string userName, string token);
    Task SendPhoneOtpAsync(string toEmail, string userName, string otp);
    Task SendReportAsync(string toEmail, string userName, byte[] pdfBytes, string reportFileName);
}