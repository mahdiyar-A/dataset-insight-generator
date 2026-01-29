"use client";

import React from "react";

export default function InfoCards() {
  return (
    <section className="lower-grid" id="section-help">
      {/* Help center */}
      <div className="card info-card">
        <h2>Help center</h2>
        <table>
          <thead>
            <tr>
              <th>Topic</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Uploading CSV files</td><td>Updated</td></tr>
            <tr><td>Supported delimiters</td><td>Draft</td></tr>
            <tr><td>AI-generated summaries</td><td>Beta</td></tr>
          </tbody>
        </table>
        <a href="#section-help" className="muted-link">View documentation →</a>
      </div>

      {/* Privacy & data */}
      <div className="card info-card">
        <h2>Privacy & data</h2>
        <table>
          <thead>
            <tr>
              <th>Policy</th>
              <th>Last review</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Data retention</td><td>Jan 2025</td></tr>
            <tr><td>Access control</td><td>Jan 2025</td></tr>
            <tr><td>Export / deletion</td><td>Planned</td></tr>
          </tbody>
        </table>
        <a href="#section-help" className="muted-link">Read privacy overview →</a>
      </div>

      {/* Contact & support */}
      <div className="card info-card">
        <h2>Contact & support</h2>
        <table>
          <thead>
            <tr>
              <th>Channel</th>
              <th>Response time</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Email</td><td>1–2 business days</td></tr>
            <tr><td>Live chat</td><td>Coming soon</td></tr>
            <tr><td>GitHub issues</td><td>Within 48 hours</td></tr>
          </tbody>
        </table>
        <a href="#section-help" className="muted-link">Open a support ticket →</a>
      </div>
    </section>
  );
}
