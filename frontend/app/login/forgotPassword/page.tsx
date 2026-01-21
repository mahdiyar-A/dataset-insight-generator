// app/forgot-password/page.tsx
import styles from "./forgotPassword.module.css";

export default function ForgotPasswordPage() {
  return (
    <div className={styles.authBody}>
      <div className={styles.authContainer}>
        <h2>Forgot Password</h2>
        <p>Enter your email and we’ll send you a password reset link.</p>

        <input type="email" placeholder="Email address" required />

        <button className={styles.authBtn}>Send Reset Link</button>

        <div className={styles.authFooter}>
          <a href="/login">← Back to login</a>
        </div>
      </div>
    </div>
  );
}
