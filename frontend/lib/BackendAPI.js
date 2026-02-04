// lib/backendAPI.js

export default class BackendAPI {
  static async createNewDataset() {
    return new Promise((resolve) => setTimeout(resolve, 500));
  }

  static async signOut() {
    return new Promise((resolve) => setTimeout(resolve, 500));
  }

  static async uploadFile(file, onProgress) {
    return new Promise((resolve, reject) => {
      let progress = 0;
      const interval = setInterval(() => {
        progress += 10;
        if (onProgress) onProgress(progress);
        if (progress >= 100) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
    });
  }

  static async cleanDataset(filename) {
    return new Promise((resolve) => setTimeout(() => resolve(), 700));
  }

  static async getDatasetIssues(filename) {
    return new Promise((resolve) =>
      setTimeout(
        () =>
          resolve([
            { column: 'price', issue: '42% missing values' },
            { column: 'Date', issue: 'Inconsistent formatting' },
            { column: 'transaction_id', issue: 'Duplicate values' },
          ]),
        500
      )
    );
  }

  static async continueWithoutCleaning(filename) {
    return new Promise((resolve) => setTimeout(resolve, 500));
  }

  static async cancelAnalysis() {
    return new Promise((resolve) => setTimeout(resolve, 500));
  }

  static async sendAnalysisMessage(message) {
    return new Promise((resolve) =>
      setTimeout(() => resolve(`Assistant response to "${message}" (mock)`), 700)
    );
  }

  static async login(email, password) {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!response.ok) throw new Error('Login failed');
    return await response.json();
  }

  static async register(email, password, username) {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, username })
    });
    if (!response.ok) throw new Error('Registration failed');
    return await response.json();
  }

  static async getCurrentUser(token) {
    const response = await fetch('/api/users/profile', {
      method: 'GET',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
       }
    });
    if (!response.ok) throw new Error('Failed to fetch user profile');
    return await response.json();
  }


}
