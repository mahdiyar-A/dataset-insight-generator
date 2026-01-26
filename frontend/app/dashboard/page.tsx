'use client';

import { useState, useRef } from 'react';
import BackendAPI from '@/test_backend/BackendAPI'; // import your backend API class

export default function DashboardPage() {
  const fileInputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [analysisInput, setAnalysisInput] = useState('');
  const [uploadStatus, setUploadStatus] = useState('idle');
  const [uploadProgress, setUploadProgress] = useState(0);

  /* ---------- Top actions ---------- */
  const handleNewDataset = async () => {
    try {
      await BackendAPI.createNewDataset();
      alert('New dataset created successfully.');
    } catch (err) {
      console.error('Failed to create new dataset:', err);
    }
  };

  const handleSignOut = async () => {
    try {
      await BackendAPI.signOut();
      alert('Signed out successfully.');
    } catch (err) {
      console.error('Sign out failed:', err);
    }
  };

  /* ---------- File upload ---------- */
  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setUploadStatus('uploading');

    try {
      // simulate upload progress
      await BackendAPI.uploadFile(file, (progress) => {
        setUploadProgress(progress);
      });

      setUploadStatus('completed');
      alert(`File "${file.name}" uploaded successfully.`);
    } catch (err) {
      console.error('File upload failed:', err);
      setUploadStatus('failed');
    }
  };

  /* ---------- Analysis actions ---------- */
  const handleCleanAuto = async () => {
    if (!selectedFile) return alert('No file uploaded.');
    try {
      await BackendAPI.cleanDataset(selectedFile.name);
      alert('Automatic cleaning applied successfully.');
    } catch (err) {
      console.error('Automatic cleaning failed:', err);
    }
  };

  const handleReviewIssues = async () => {
    if (!selectedFile) return alert('No file uploaded.');
    try {
      const issues = await BackendAPI.getDatasetIssues(selectedFile.name);
      alert(`Dataset issues:\n${JSON.stringify(issues, null, 2)}`);
    } catch (err) {
      console.error('Failed to fetch dataset issues:', err);
    }
  };

  const handleContinue = async () => {
    if (!selectedFile) return alert('No file uploaded.');
    try {
      await BackendAPI.continueWithoutCleaning(selectedFile.name);
      alert('Continuing without cleaning.');
    } catch (err) {
      console.error('Failed to continue:', err);
    }
  };

  const handleCancelAnalysis = async () => {
    try {
      await BackendAPI.cancelAnalysis();
      alert('Analysis canceled.');
    } catch (err) {
      console.error('Failed to cancel analysis:', err);
    }
  };

  const handleSendMessage = async () => {
    if (!analysisInput.trim()) return;
    try {
      const response = await BackendAPI.sendAnalysisMessage(analysisInput);
      alert(`Assistant response:\n${response}`);
      setAnalysisInput('');
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  return (
    <div className="dig-body">
      <input type="checkbox" id="sidebar-toggle" className="sidebar-toggle" />

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

      <div className="dig-main" id="top">
        <header className="dig-topbar">
          <div>
            <h1>Dashboard</h1>
            <p className="subtitle">
              Upload a dataset to generate instant insights, a cleaned CSV, and a downloadable PDF report.
            </p>
          </div>

          <div className="topbar-right">
            <button className="primary-btn" onClick={handleNewDataset}>New Dataset</button>

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
                <button onClick={handleSignOut}>Sign out</button>
              </div>
            </div>
          </div>
        </header>

        <section className="upper-grid" id="section-upload">
          <div className="card upload-card">
            <h2>Upload CSV</h2>
            <p className="muted">Drag and drop your .csv file here, or click to browse. Max 50 MB.</p>

            <label className="upload-dropzone">
              <input type="file" id="fileUpload" accept=".csv" ref={fileInputRef} onChange={handleFileSelect} />
              <div className="dropzone-inner">
                <div className="dropzone-icon">⬆</div>
                <div>
                  <p className="dropzone-title">{selectedFile ? selectedFile.name : 'Drop your file here'}</p>
                  <p className="muted-small">or click to choose a file</p>
                </div>
              </div>
            </label>

            <div className="upload-status-bar" id="uploadStatusBar">
              <div className="status-header">
                <span id="uploadStatusText">
                  {uploadStatus === 'idle' && 'No file selected.'}
                  {uploadStatus === 'uploading' && 'Uploading...'}
                  {uploadStatus === 'completed' && 'Upload complete!'}
                  {uploadStatus === 'failed' && 'Upload failed.'}
                </span>
                <span className={`status-pill ${uploadStatus}`} id="uploadStatusPill">{uploadStatus}</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${uploadProgress}%` }} id="uploadProgressFill"></div>
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
              {/* Assistant/User chat messages remain static for now */}
            </div>

            <div className="analysis-quick-actions">
              <button className="chip-btn" onClick={handleCleanAuto}>Clean automatically</button>
              <button className="chip-btn subtle" onClick={handleReviewIssues}>Review issues first</button>
              <button className="chip-btn subtle" onClick={handleContinue}>Continue without cleaning</button>
              <button className="chip-btn subtle" onClick={handleCancelAnalysis}>Cancel analysis</button>
            </div>

            <div className="analysis-input-row">
              <input type="text" placeholder="Ask a question…" value={analysisInput} onChange={(e) => setAnalysisInput(e.target.value)} />
              <button className="send-btn" onClick={handleSendMessage}>Send</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
