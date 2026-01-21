import "./register.css";

export default function RegisterPage() {
  return (
    <div className="auth-body">
      <div className="auth-container">
        <h2>Create Account</h2>

        <div className="name-row">
          <div className="input-group">
            <label>First Name</label>
            <input type="text" placeholder="Enter your first name" required />
          </div>
          <div className="input-group">
            <label>Last Name</label>
            <input type="text" placeholder="Enter your last name" required />
          </div>
        </div>

        <div className="input-group">
          <label>Email</label>
          <input type="email" placeholder="Enter your email" required />
        </div>

        <div className="input-group">
          <label>Password</label>
          <input type="password" placeholder="Enter your password" required />
        </div>

        <div className="input-group">
          <label>Confirm Password</label>
          <input type="password" placeholder="Confirm your password" required />
        </div>

        <button className="auth-btn">Register</button>

        <div className="auth-footer">
          Already have an account? <a href="/login">Login</a>
        </div>
      </div>
    </div>
  );
}
