// app/profile/page.tsx
import styles from "./profileEditor.module.css";

export default function EditProfilePage() {
  return (
    <div className={styles.container}>
      <div className={styles.backDashboardContainer}>
          <a href="/dashboard" className={styles.btnGhost}>
          ← Back to dashboard
        </a>
      </div>
      

      <aside className={styles.card}>
        <div className={styles.bigAvatar} id="bigAvatar">M</div>
        <h3 id="displayName">Mock User</h3>
        <label className={styles.secondaryBtn}>
          Upload avatar
          <input type="file" id="pfpInput" accept="image/*" className={styles.hidden} />
        </label>
        <button className={styles.secondaryBtn} id="removePfpBtn">
          Remove avatar
        </button>
      </aside>

      <section className={styles.card}>
        <h2>Edit profile</h2>
        <form id="profileForm">
          <div className={styles.inputGroup}>
            <label>First name</label>
            <input type="text" id="firstName" required />
          </div>

          <div className={styles.inputGroup}>
            <label>Middle name</label>
            <input type="text" id="middleName" placeholder="Optional" />
          </div>

          <div className={styles.inputGroup}>
            <label>Last name</label>
            <input type="text" id="lastName" required />
          </div>

          <div className={styles.inputGroup}>
            <label>Display name</label>
            <input type="text" id="displayNameInput" placeholder="Optional (e.g., Mahdiyar)" />
          </div>

          <div className={styles.inputGroup}>
            <label>Phone Number</label>
            <input type="text" id="phoneNumberInput" placeholder="Optional (e.g., +1 123 456 7890)" />
          </div>

          <div className={styles.formActions}>
            <button className={styles.primaryBtn} type="submit">Save profile</button>
          </div>
        </form>
      </section>

      <script
        dangerouslySetInnerHTML={{
          __html: `
            const bigAvatar = document.getElementById('bigAvatar');
            const pfpInput = document.getElementById('pfpInput');
            const removePfpBtn = document.getElementById('removePfpBtn');
            const profileForm = document.getElementById('profileForm');

            pfpInput.addEventListener('change', () => {
              if (pfpInput.files && pfpInput.files[0]) {
                const file = pfpInput.files[0];
                bigAvatar.innerHTML = '<img src="' + URL.createObjectURL(file) + '" alt="Avatar" />';
              }
            });

            removePfpBtn.addEventListener('click', () => {
              bigAvatar.textContent = 'M';
              pfpInput.value = '';
            });

            profileForm.addEventListener('submit', (e) => {
              e.preventDefault();
              const data = {
                firstName: document.getElementById('firstName').value,
                middleName: document.getElementById('middleName').value,
                lastName: document.getElementById('lastName').value,
                displayName: document.getElementById('displayNameInput').value,
                phoneNumber: document.getElementById('phoneNumberInput').value
              };
              console.log(data);
              alert('Profile saved!');
            });
          `,
        }}
      />
    </div>
  );
}
