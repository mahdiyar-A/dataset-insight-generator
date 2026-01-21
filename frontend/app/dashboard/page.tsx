// frontend/app/test/page.tsx

export default function dashboardPage() {
  return (
    <div className="dig-body">
      {/* Sidebar Toggle (NO JS) */}
      <input type="checkbox" id="sidebar-toggle" className="sidebar-toggle" />

      {/* Sidebar */}
      <aside className="dig-sidebar">
        <div className="brand">
          <img src="DIG.png" alt="Dataset Insight Generator logo" className="logo" />
          <span className="brand-name">
            Dataset Insight <br /> Generator
          </span>
        </div>
        <nav>
          <a href="#top" className="active">Dashboard</a>
          <a href="#section-upload">Upload</a>
          <a href="#section-dataset-management">History / Analysis</a>
          <a href="#section-insights">AI Insights</a>
          <a href="#section-help">Help & Support</a>
          <a href="#top">Settings</a>
        </nav>
      </aside>

      {/* Main content */}
      <div className="dig-main" id="top">
        {/* Top bar */}
        <header className="dig-topbar">
          <div>
            <h1>Dashboard</h1>
            <p className="subtitle">
              Upload a dataset to generate instant insights, a cleaned CSV, and a downloadable PDF report.
            </p>
          </div>

          <div className="topbar-right">
            <button className="primary-btn">New Dataset</button>

            <div className="profile-wrapper">
              <div className="avatar">M</div>
              <div className="profile-text">
                <span className="profile-name">Mahdiyar (mock)</span>
                <span className="profile-role">Guest user</span>
              </div>
              <div className="profile-dropdown-icon">▾</div>

              <div className="profile-dropdown">
                <a href="/dashboard/profileEditor">View profile</a>
                <a href="#section-analysis">History</a>
                <a href="/dashboard/accountSettings">Account settings</a>
                <a href="#top">Sign out</a>
              </div>
            </div>
          </div>
        </header>

        {/* Upload + quick stats */}
        <section className="upper-grid" id="section-upload">
          {/* Upload card */}
          <div className="card upload-card">
            <h2>Upload CSV</h2>
            <p className="muted">Drag and drop your .csv file here, or click to browse. Max 50 MB.</p>

            <label className="upload-dropzone">
              <input type="file" id="fileUpload" accept=".csv" />
              <div className="dropzone-inner">
                <div className="dropzone-icon">⬆</div>
                <div>
                  <p className="dropzone-title">Drop your file here</p>
                  <p className="muted-small">or click to choose a file</p>
                </div>
              </div>
            </label>

            {/* Status bar */}
            <div className="upload-status-bar" id="uploadStatusBar">
              <div className="status-header">
                <span id="uploadStatusText">No file selected.</span>
                <span className="status-pill idle" id="uploadStatusPill">Idle</span>
              </div>

              <div className="progress-track">
                <div className="progress-fill" id="uploadProgressFill"></div>
              </div>
            </div>

            <div className="stats-row">
              <div className="stat">
                <span className="stat-label">Rows detected</span>
                <span className="stat-value">–</span>
              </div>
              <div className="stat">
                <span className="stat-label">Columns</span>
                <span className="stat-value">–</span>
              </div>
              <div className="stat">
                <span className="stat-label">Missing values</span>
                <span className="stat-value">–</span>
              </div>
              <div className="stat">
                <span className="stat-label">Upload time</span>
                <span className="stat-value">–</span>
              </div>
            </div>
          </div>

          {/* Analysis assistant card */}
          <div className="card analysis-chat-card">
            <div className="card-header">
              <h2>Analysis assistant</h2>
              <div className="header-actions">
                <span className="pill live-pill">Step 2 of 4 · Profiling & cleaning (mock)</span>
                <a href="/dashboard/assistant" className="open-aa">Open →</a>
              </div>
            </div>

            <div className="analysis-timeline">
              <span className="step done">1. Upload</span>
              <span className="step active">2. Data quality checks</span>
              <span className="step">3. Insights</span>
              <span className="step">4. Report ready</span>
            </div>

            <div className="analysis-chat-log">
              <div className="msg-row assistant">
                <div className="msg">
                  We’ve scanned your dataset and found:
                  <ul>
                    <li><strong>42% missing values</strong> in <strong>price</strong></li>
                    <li>Inconsistent formatting in <strong>Date</strong></li>
                    <li>Duplicate values in <strong>transaction_id</strong></li>
                  </ul>
                  The dataset is analyzable, but we strongly recommend cleaning it first.
                </div>
              </div>

              <div className="msg-row assistant">
                <div className="msg">How would you like us to handle these issues?</div>
              </div>

              <div className="msg-row user">
                <div className="msg">Clean automatically, but if something looks wrong, stop and ask me.</div>
              </div>

              <div className="msg-row assistant pending">
                <div className="msg">Understood. Applying automatic cleaning rules…</div>
              </div>

              <div className="msg-row assistant">
                <div className="msg">
                  Cleaning complete (mock).
                  <ul>
                    <li>Removed <strong>32 duplicate rows</strong></li>
                    <li>Imputed <strong>price</strong></li>
                    <li>Standardized all <strong>Date</strong> values</li>
                  </ul>
                  <a className="download-cleaned" href="#" download>
                    Download cleaned_dataset.csv (mock)
                  </a>
                </div>
              </div>
            </div>

            <div className="analysis-quick-actions">
              <button className="chip-btn">Clean automatically</button>
              <button className="chip-btn subtle">Review issues first</button>
              <button className="chip-btn subtle">Continue without cleaning</button>
              <button className="chip-btn subtle">Cancel analysis</button>
            </div>

            <div className="analysis-input-row">
              <input type="text" placeholder="Ask a question…" />
              <button className="send-btn">Send</button>
            </div>
          </div>
        </section>

        {/* Dataset Management Table */}
        <section className="dataset-management-grid" id="section-dataset-management">
          <div className="card table-card">
            <div className="card-header">
              <h2>Dataset management</h2>
              <span className="pill">Your recent uploads</span>
            </div>

            <table className="dataset-table">
              <thead>
                <tr>
                  <th>Dataset name</th>
                  <th>Rows</th>
                  <th>Columns</th>
                  <th>Upload time</th>
                  <th>Size</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                <tr>
                  <td>sales_q1.csv</td>
                  <td>12,482</td>
                  <td>14</td>
                  <td>2h ago</td>
                  <td>3.1 MB</td>
                  <td><span className="status-pill ready">Processed</span></td>
                  <td className="actions-cell">
                    <button className="table-action view">View</button>
                    <button className="table-action delete">Delete</button>
                    <button className="table-action run">Run model</button>
                  </td>
                </tr>

                <tr>
                  <td>customers_latest.csv</td>
                  <td>8,311</td>
                  <td>9</td>
                  <td>Yesterday</td>
                  <td>1.8 MB</td>
                  <td><span className="status-pill uploading">Processing</span></td>
                  <td className="actions-cell">
                    <button className="table-action view">View</button>
                    <button className="table-action delete">Delete</button>
                    <button className="table-action run">Run model</button>
                  </td>
                </tr>

                <tr>
                  <td>inventory_backup.csv</td>
                  <td>3,201</td>
                  <td>6</td>
                  <td>3 days ago</td>
                  <td>742 KB</td>
                  <td><span className="status-pill idle">Pending</span></td>
                  <td className="actions-cell">
                    <button className="table-action view">View</button>
                    <button className="table-action delete">Delete</button>
                    <button className="table-action run">Run model</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Dataset preview + charts */}
        <section className="middle-grid" id="section-insights">
          <div className="card table-card">
            <div className="card-header">
              <h2>Dataset preview (mock)</h2>
              <span className="pill">First 6 rows</span>
            </div>

            <table>
              <thead>
                <tr>
                  <th>customer_id</th>
                  <th>age</th>
                  <th>country</th>
                  <th>purchases</th>
                  <th>churned</th>
                </tr>
              </thead>

              <tbody>
                <tr><td>C001</td><td>28</td><td>Canada</td><td>12</td><td>No</td></tr>
                <tr><td>C002</td><td>35</td><td>USA</td><td>7</td><td>Yes</td></tr>
                <tr><td>C003</td><td>22</td><td>Germany</td><td>4</td><td>No</td></tr>
                <tr><td>C004</td><td>41</td><td>UK</td><td>16</td><td>No</td></tr>
                <tr><td>C005</td><td>30</td><td>Canada</td><td>2</td><td>Yes</td></tr>
                <tr><td>C006</td><td>27</td><td>France</td><td>9</td><td>No</td></tr>
              </tbody>
            </table>
          </div>

          {/* Charts */}
          <div className="charts-column">
            <div className="card chart-card">
              <div className="card-header">
                <h2>Mock bar chart</h2>
                <span className="pill">Churn rate by country</span>
              </div>
              <div className="bar-chart">
                <div className="bar" style={{ "--h": "40%" } as React.CSSProperties}>CA</div>
                <div className="bar" style={{ "--h": "65%" } as React.CSSProperties}>US</div>
                <div className="bar" style={{ "--h": "30%" } as React.CSSProperties}>DE</div>
                <div className="bar" style={{ "--h": "20%" } as React.CSSProperties}>FR</div>
                <div className="bar" style={{ "--h": "50%" } as React.CSSProperties}>UK</div>
              </div>
            </div>

            <div className="card chart-card">
              <div className="card-header">
                <h2>Mock trend</h2>
                <span className="pill">Uploads this week</span>
              </div>
              <div className="line-chart">
                <div className="line-chart-bg"></div>
                <div className="line-chart-line"></div>
              </div>
            </div>
          </div>
        </section>

        {/* Export card */}
        <div className="card analysis-report-card">
          <div className="card-header">
            <h2>Report & exports</h2>
            <span className="pill">Report status: not started</span>
          </div>

          <p className="muted-small">
            Once analysis is complete, you can download the PDF report.
          </p>

          <button className="primary-btn-lg disabled">
            Download PDF report
          </button>

          <div className="export-buttons">
            <button className="secondary-btn disabled">Download cleaned CSV</button>
            <button className="secondary-btn disabled">View report online</button>
            <button className="secondary-btn disabled">Email me the report</button>
          </div>

          <div className="report-preview">
            <h3>What your report includes (mock)</h3>
            <ul>
              <li>Dataset overview</li>
              <li>Missing values summary</li>
              <li>Key distributions</li>
              <li>Cleaning log</li>
              <li>AI insights</li>
            </ul>
          </div>
        </div>

        {/* Help section */}
        <section className="lower-grid" id="section-help">
          <div className="card info-card">
            <h2>Help center</h2>
            <table>
              <thead><tr><th>Topic</th><th>Status</th></tr></thead>
              <tbody>
                <tr><td>Uploading CSV files</td><td>Updated</td></tr>
                <tr><td>Supported delimiters</td><td>Draft</td></tr>
                <tr><td>AI-generated summaries</td><td>Beta</td></tr>
              </tbody>
            </table>
            <a href="#section-help" className="muted-link">View documentation →</a>
          </div>

          <div className="card info-card">
            <h2>Privacy & data</h2>
            <table>
              <thead><tr><th>Policy</th><th>Last review</th></tr></thead>
              <tbody>
                <tr><td>Data retention</td><td>Jan 2025</td></tr>
                <tr><td>Access control</td><td>Jan 2025</td></tr>
                <tr><td>Export / deletion</td><td>Planned</td></tr>
              </tbody>
            </table>
            <a href="#section-help" className="muted-link">Read privacy overview →</a>
          </div>

          <div className="card info-card">
            <h2>Contact & support</h2>
            <table>
              <thead><tr><th>Channel</th><th>Response time</th></tr></thead>
              <tbody>
                <tr><td>Email</td><td>1–2 business days</td></tr>
                <tr><td>Live chat</td><td>Coming soon</td></tr>
                <tr><td>GitHub issues</td><td>Within 48 hours</td></tr>
              </tbody>
            </table>
            <a href="#section-help" className="muted-link">Open a support ticket →</a>
          </div>
        </section>

        <footer className="dig-footer">
          <span>© 2025 Dataset Insight Generator (mock)</span>
          <span>Built with C#, React, and Python AI.</span>
        </footer>
      </div>
    </div>
  );
}
