// app/page.tsx
export default function HomePage() {
  return (
    <div className="container">
      {/* Navbar */}
      <header className="navbar">
        <div className="logo">Dataset Insight Generator</div>
        <nav className="nav-links">
          <a href="#features">Features</a>
          <a href="#security">Security</a>
          <a href="#developers">Developers</a>
          <a href="#contact">Contact</a>
        </nav>
      </header>

      {/* Hero Section */}
      <main>
        <section className="hero">
          <div className="hero-content">
            <h1>Turn Raw CSV Data into Clear AI-Powered Insights</h1>
            <p className="hero-subtitle">
              Upload any CSV (up to 50MB) and get a structured analysis, visual summaries, and a
              downloadable AI-generated PDF report — no manual data wrangling required.
            </p>
            <div className="hero-buttons">
              <a href="/login" className="btn primary">Login</a>
              <a href="/register" className="btn secondary">Register</a>
              <a href="/guestDashboard" className="btn ghost">Continue as Guest</a>
            </div>
            <p className="small-note">
              No account? Use guest mode to upload a dataset and get a one-time report.
            </p>
          </div>

          <div className="hero-panel">
            <div className="hero-card">
              <h3>How it works</h3>
              <ol>
                <li>Upload your CSV dataset.</li>
                <li>Our Python AI engine analyzes structure, quality, and patterns.</li>
                <li>C# backend assembles a professional PDF report for download.</li>
              </ol>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="section section-light">
          <h2>What this website does</h2>
          <p className="section-subtitle">
            Dataset Insight Generator is a full-stack AI-powered tool designed for data-heavy domains like
            geology, oil & gas, research, and business analytics.
          </p>
          <div className="card-grid">
            <div className="card">
              <h3>Automatic Dataset Profiling</h3>
              <p>
                Detects column types, missing values, outliers, correlations, and trends,
                even when the dataset topic is not explicitly specified.
              </p>
            </div>
            <div className="card">
              <h3>AI-Generated Reports</h3>
              <p>
                Uses a Python analysis engine plus LLM-style text generation to create a structured
                narrative PDF report summarizing key insights and data quality issues.
              </p>
            </div>
            <div className="card">
              <h3>Flexible Access</h3>
              <p>
                Sign in to use your profile, or continue as a guest for a one-time upload and report.
                Future versions may include history and saved analyses.
              </p>
            </div>
          </div>
        </section>

        {/* Security */}
        <section id="security" className="section">
          <h2>Security & Data Handling</h2>
          <div className="card wide-card">
            <p>
              Your datasets are processed securely through our C# backend and Python AI service.
              We enforce a strict 50MB file limit and accept only CSV files to reduce risk and complexity.
            </p>
            <ul>
              <li>All communication between frontend, backend, and AI service is planned over HTTPS.</li>
              <li>Uploaded files are stored temporarily for analysis and report generation.</li>
              <li>Data quality warnings are surfaced transparently so you know when results may be less reliable.</li>
              <li>Future versions may include configurable retention and auto-cleaning options.</li>
            </ul>
            <p className="small-note">
              This project is currently a student showcase / prototype, not a production-grade enterprise service.
              Do not upload confidential or legally sensitive data.
            </p>
          </div>
        </section>

        {/* Developers */}
        <section id="developers" className="section section-light">
          <h2>About the Developers</h2>
          <div className="card wide-card">
            <p>
              Dataset Insight Generator is built by a small team of computer science students as a full-stack AI
              project. The stack includes:
            </p>
            <ul>
              <li><strong>Frontend:</strong> HTML/CSS now, moving toward React for dynamic UI.</li>
              <li><strong>Backend:</strong> C# ASP.NET Core for authentication, file handling, and PDF delivery.</li>
              <li><strong>AI Engine:</strong> Python for dataset analysis, visualizations, and insight extraction.</li>
              <li><strong>Database (minimal):</strong> Small SQL backend for user accounts and metadata.</li>
            </ul>
            <p>
              Our focus is on clean architecture, security by design, and a realistic deployment model suitable for
              demos, showcases, and academic evaluation.
            </p>
          </div>
        </section>

        {/* Contact */}
        <section id="contact" className="section">
          <h2>Contact & Feedback</h2>
          <div className="card wide-card contact-card">
            <p>
              Have questions, feedback, or issues with a dataset? Reach out to the development team.
            </p>
            <a href="mailto:team@example.com" className="btn primary">Contact the Developers</a>
            <p className="small-note">
              Replace this email with your real project or team contact address when deploying.
            </p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="footer">
        <p>© 2025 Dataset Insight Generator · Built with C#, Python, HTML/CSS, and AI.</p>
      </footer>
    </div>
  );
}
