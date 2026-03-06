// app/page.tsx
export default function HomePage() {
  return (
    <div className="container">
      {/* Navbar */}
      <header className="navbar">
        <div className="logo">
          <img src="/DIG.png" alt="DIG Logo" style={{ height: '100px', width: '200px' }} />
           <span>Dataset Insight Generator</span>
        </div>
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
            <h1>Your Data Has a Story. We Help You Read It.</h1>
            <p className="hero-subtitle">
              Drop in any CSV or Excel file and get back a full AI-powered analysis —
              visualizations, patterns, anomalies, and a professional PDF report.
              No coding. No setup. Just an insightful report.
            </p>
            <div className="hero-buttons">
              <a href="/login" className="btn primary">Login</a>
              <a href="/register" className="btn secondary">Register</a>
              <a href="/guestDashboard" className="btn ghost">Continue as Guest</a>
            </div>
            <p className="small-note">
              No account needed for a one-time report. Create an account to save your results.
            </p>
          </div>

          <div className="hero-panel">
            <div className="hero-card">
              <h3>How it works ?</h3>
              <ol>
                <li>Upload your dataset — CSV or Excel, up to 50MB.</li>
                <li>Our AI engine profiles your data, detects patterns, and generates charts.</li>
                <li>Download a clean, professional PDF report in seconds.</li>
              </ol>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="section section-light">
          <h2>Everything you need to understand your data</h2>
          <p className="section-subtitle">
            Built for researchers, analysts, and students who want real insights — not just raw numbers.
          </p>
          <div className="card-grid">
            <div className="card">
              <h3>Instant Data Profiling</h3>
              <p>
                Automatically detects column types, missing values, outliers, and correlations.
                No configuration required — it just works.
              </p>
            </div>
            <div className="card">
              <h3>AI-Written Insights</h3>
              <p>
                Goes beyond charts. Our AI writes a plain-English narrative explaining what your
                data means, what stands out, and what to watch out for.
              </p>
            </div>
            <div className="card">
              <h3>Flexible Access</h3>
              <p>
                Use it as a guest for a quick one-time report, or create an account to
                save your results and come back anytime.
              </p>
            </div>
            <div className="card">
              <h3>AI-Guided Analysis Assistant</h3>
              <p>
               An interactive chatbot walks you through your results — asking the right questions, flagging concerns, and helping you get the most out of your report.
              </p>
              </div>
              <div className="card">
              <h3>Your Results, Always There </h3>
              <p>
                   We save your last session automatically. Come back anytime to download 
                    your cleaned dataset, original file, or full PDF report — no need to re-upload.
              </p>
              </div>
          </div>
        </section>

        {/* Security */}
<section id="security" className="section">
  <h2>Security</h2>
  <div className="card wide-card">
    <p>
      Your data is handled with care at every step — from upload to report delivery.
    </p>
    <ul>
      <li>All data is transmitted over HTTPS — encrypted end to end.</li>
      <li>Files are processed in isolation and never shared with third parties.</li>
      <li>We use Supabase — a trusted, production-grade cloud database used by thousands of teams worldwide.</li>
      <li>Authentication is handled via industry-standard JWT tokens with secure password hashing.</li>
      <li>50MB file size limit and strict file type validation enforced on every upload.</li>
      <li>Data quality warnings are surfaced transparently so you always know how reliable your results are.</li>
      <li>Built with security-conscious development practices — input validation, error handling, and safe API design throughout.</li>
    </ul>
    <p className="small-note">
       Please do not upload confidential or legally sensitive data.
    </p>
  </div>
</section>
       {/* Developers */}
<section id="developers" className="section section-light">
  <h2>Developers</h2>
  <div className="card wide-card">
    <p>
      We are a team of undergraduate Computer Science students at the <strong>University of Calgary</strong> — 
      passionate about building AI-powered tools and active members of the UofC AI Club. 
      This project was built as a showcase of what a small, driven team can create with modern full-stack development.
    </p>
    <br />
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginTop: '8px' }}>
      <div>
        <p style={{ fontWeight: 600, color: '#f9fafb' }}>Mahdiyar Ashrafioun</p>
        <p style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Project Manager · Full Stack</p>
        <a href="https://www.linkedin.com/in/mahdiyar-ashrafioun/" target="_blank" style={{ fontSize: '0.78rem', color: '#60a5fa' }}>LinkedIn →</a>
      </div>
      <div>
        <p style={{ fontWeight: 600, color: '#f9fafb' }}>Pranhjot Singh Sidhu</p>
        <p style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Backend Developer</p>
        <a href="https://www.linkedin.com/in/prabhjot-sidhu-24abb3381/" target="_blank" style={{ fontSize: '0.78rem', color: '#60a5fa' }}>LinkedIn →</a>
      </div>
      <div>
        <p style={{ fontWeight: 600, color: '#f9fafb' }}>Harmanroop Singh</p>
        <p style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Frontend Developer</p>
        <a href="https://www.linkedin.com/in/harmanroop-singh/" target="_blank" style={{ fontSize: '0.78rem', color: '#60a5fa' }}>LinkedIn →</a>
      </div>
      <div>
        <p style={{ fontWeight: 600, color: '#f9fafb' }}>Muhammad Ibad Hassan</p>
        <p style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Frontend Developer </p>
        <a href="http://linkedin.com/in/muhammad-ibad-hassan-331a37241" target="_blank" style={{ fontSize: '0.78rem', color: '#60a5fa' }}>LinkedIn →</a>
      </div>
    </div>
  </div>
</section>

        {/* Contact */}
        <section id="contact" className="section">
          <h2>Get in Touch</h2>
          <div className="card wide-card contact-card">
            <p>
              Have questions or feedback? We'd love to hear from you.
            </p>
            <a href="mailto:dataset_insight_generator.ai@proton.me" className="btn primary">Contact us</a>          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="footer">
        <p>© 2025 Dataset Insight Generator </p>
      </footer>
    </div>
  );
}