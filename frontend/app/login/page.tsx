// app/login/page.tsx
import "./login.css"; // relative to this file
export default function LoginPage() {
  return (
    <div className="auth-body">
      <div className="auth-container">
        <h2>Login</h2>

        <input type="email" placeholder="Email" required />
        <input type="password" placeholder="Password" required />

        <div className="forgot-password">
          <a href="/login/forgotPassword">Forgot password?</a>
        </div>

        <button className="auth-btn">Login</button>

        <div className="auth-footer">
          Don't have an account? <a href="/register">Register</a>
        </div>
      </div>
    </div>
  );
}
