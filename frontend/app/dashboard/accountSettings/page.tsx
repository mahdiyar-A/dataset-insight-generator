// app/dashboard/accountSettings/page.tsx
import styles from "./accountSettings.module.css";

export default function AccountSettingsPage() {
  return (
    <div className={styles.container}>
      {/* Back to dashboard */}
      <a href="/dashboard" className={styles.btnGhost}>← Back to dashboard</a>

      <h2>Account Settings</h2>

      {/* Appearance Section */}
      <div className={styles.settingsSection}>
        <h3>Appearance</h3>

        <div className={styles.settingRow}>
          <div>
            <strong>Dark Mode</strong>
            <div className={styles.mutedSmall}>Enable dark theme</div>
          </div>
          <div className={`${styles.switch} ${styles.on}`}><div className={styles.knob}></div></div>
        </div>

        <div className={styles.settingRow}>
          <div>
            <strong>Font Size</strong>
            <div className={styles.mutedSmall}>Choose the font size for the app</div>
          </div>
          <select>
            <option>Small</option>
            <option selected>Medium</option>
            <option>Large</option>
          </select>
        </div>

        <div className={styles.settingRow}>
          <div>
            <strong>Language</strong>
            <div className={styles.mutedSmall}>Select your preferred language</div>
          </div>
          <select>
            <option>English</option>
            <option>French</option>
            <option>Spanish</option>
            <option>Other</option>
          </select>
        </div>
      </div>

      {/* Notifications Section */}
      <div className={styles.settingsSection}>
        <h3>Notifications</h3>
        <div className={styles.settingRow}><div>Email Notifications</div><div className={`${styles.switch} ${styles.on}`}><div className={styles.knob}></div></div></div>
        <div className={styles.settingRow}><div>Push Notifications</div><div className={`${styles.switch} ${styles.on}`}><div className={styles.knob}></div></div></div>
        <div className={styles.settingRow}><div>SMS Notifications</div><div className={styles.switch}><div className={styles.knob}></div></div></div>
        <div className={styles.settingRow}><div>Marketing Emails</div><div className={styles.switch}><div className={styles.knob}></div></div></div>
      </div>

      {/* Privacy & Security */}
      <div className={styles.settingsSection}>
        <h3>Privacy & Security</h3>
        <div className={styles.settingRow}><div>Two-Factor Authentication (2FA)</div><div className={styles.switch}><div className={styles.knob}></div></div></div>
        <div className={styles.settingRow}><div>Login Alerts</div><div className={`${styles.switch} ${styles.on}`}><div className={styles.knob}></div></div></div>
        <div className={styles.settingRow}><div>Account Activity Alerts</div><div className={`${styles.switch} ${styles.on}`}><div className={styles.knob}></div></div></div>
        <div className={styles.settingRow}>
          <div>Reset Password</div>
          <button className={styles.primaryBtn}>Reset</button>
        </div>
      </div>

      {/* Data & Account Management */}
      <div className={styles.settingsSection}>
        <h3>Data & Account Management</h3>
        <div className={styles.settingRow}><div>Download Your Data</div><button className={styles.primaryBtn}>Download</button></div>
        <div className={styles.settingRow}><div>Delete Account</div><button className={styles.secondaryBtn}>Delete</button></div>
        <div className={styles.settingRow}><div>Export Settings</div><button className={styles.primaryBtn}>Export</button></div>
        <div className={styles.settingRow}><div>Backup Data</div><div className={styles.switch}><div className={styles.knob}></div></div></div>
      </div>

      {/* Footer actions */}
      <div style={{ marginTop: 20 }}>
        <button className={styles.primaryBtnLg}>Save Settings</button>
        <a href="/dashboard" className={styles.secondaryBtn}>Cancel</a>
      </div>
    </div>
  );
}
