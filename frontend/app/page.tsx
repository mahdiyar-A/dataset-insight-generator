// app/page.tsx
"use client";

import { useTranslations } from "next-intl";

export default function HomePage() {
  const t = useTranslations("homepage");
  return (
    <div className="container homepage-root">
      {/* Navbar */}
      <header className="navbar">
        <div className="logo">
          <img src="/DIG.png" alt="DIG Logo" style={{ height: '100px', width: '200px' }} />
           <span>Dataset Insight Generator</span>
        </div>
        <nav className="nav-links">
          <a href="#features">{t("navFeatures")}</a>
          <a href="#security">{t("navSecurity")}</a>
          <a href="#developers">{t("navDevelopers")}</a>
          <a href="#contact">{t("navContact")}</a>
        </nav>
      </header>

      {/* Hero Section */}
      <main>
        <section className="hero">
          <div className="hero-content">
            <h1>{t("heroHeading")}</h1>
            <p className="hero-subtitle">
              {t("heroSubtitle")}
            </p>
            <div className="hero-buttons">
              <a href="/login" className="btn primary">{t("heroBtnLogin")}</a>
              <a href="/register" className="btn secondary">{t("heroBtnRegister")}</a>
              <a href="/guestDashboard" className="btn ghost">{t("heroBtnGuest")}</a>
            </div>
            <p className="small-note">
              {t("heroNote")}
            </p>
          </div>

          <div className="hero-panel">
            <div className="hero-card">
              <h3>{t("howItWorksTitle")}</h3>
              <ol>
                <li>{t("howItWorksStep1")}</li>
                <li>{t("howItWorksStep2")}</li>
                <li>{t("howItWorksStep3")}</li>
              </ol>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="section section-light">
          <h2>{t("featuresTitle")}</h2>
          <p className="section-subtitle">
            {t("featuresSubtitle")}
          </p>
          <div className="card-grid">
            <div className="card">
              <h3>{t("feature1Title")}</h3>
              <p>{t("feature1Desc")}</p>
            </div>
            <div className="card">
              <h3>{t("feature2Title")}</h3>
              <p>{t("feature2Desc")}</p>
            </div>
            <div className="card">
              <h3>{t("feature3Title")}</h3>
              <p>{t("feature3Desc")}</p>
            </div>
            <div className="card">
              <h3>{t("feature4Title")}</h3>
              <p>{t("feature4Desc")}</p>
            </div>
            <div className="card">
              <h3>{t("feature5Title")}</h3>
              <p>{t("feature5Desc")}</p>
            </div>
          </div>
        </section>

        {/* Security */}
<section id="security" className="section">
  <h2>{t("securityTitle")}</h2>
  <div className="card wide-card">
    <p>{t("securityIntro")}</p>
    <ul>
      <li>{t("securityBullet1")}</li>
      <li>{t("securityBullet2")}</li>
      <li>{t("securityBullet3")}</li>
      <li>{t("securityBullet4")}</li>
      <li>{t("securityBullet5")}</li>
      <li>{t("securityBullet6")}</li>
      <li>{t("securityBullet7")}</li>
    </ul>
    <p className="small-note">{t("securityNote")}</p>
  </div>
</section>
       {/* Developers */}
<section id="developers" className="section section-light">
  <h2>{t("devTitle")}</h2>
  <div className="card wide-card">
    <p>{t("devIntro")}</p>
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
          <h2>{t("contactTitle")}</h2>
          <div className="card wide-card contact-card">
            <p>{t("contactIntro")}</p>
            <a href="mailto:dataset_insight_generator.ai@proton.me" className="btn primary">{t("contactBtn")}</a>          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="footer">
        <p>{t("footer")}</p>
      </footer>
    </div>
  );
}