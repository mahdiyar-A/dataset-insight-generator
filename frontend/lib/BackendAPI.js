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
}
