# Epicor PR Automation Tool

**Automate Purchase Requisitions from Excel data with ease.**

This application provides a user-friendly web interface to automate the entry of Purchase Requisitions into Epicor. It bridges the gap between your engineering/Excel part lists and your ERP system, eliminating the need for manual, error-prone data entry.

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js** (v18 or higher recommended)
- **Chromium Browser** (Managed by Playwright)

### 2. Installation
1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Install the required automation browser:
   ```bash
   npm run install-browsers
   ```

### 3. Usage
1. Start the server:
   ```bash
   npm start
   ```
2. Open your browser and navigate to: `http://localhost:3000`
3. Enter your Epicor credentials.
4. Upload your part list Excel file (see [SPEC.md](SPEC.md) for data format).
5. Specify the row numbers ("No" values) you want to process.
6. Click **Run Automation** and watch the progress in the activity log.

---

## 📖 Documentation
For in-depth information about the technical architecture, automation workflow, and specific Excel schema requirements, please refer to the:

👉 **[Project Specification (SPEC.md)](SPEC.md)**

---

## 🛠 Tech Stack
- **Backend**: Node.js, Express, Playwright.
- **Frontend**: Vanilla JavaScript, Glassmorphism CSS.
- **Data**: XLSX parser for spreadsheet integration.

## 🤝 Stakeholder Information
This tool is intended for use by the procurement and engineering teams to streamline the PR creation process. For bug reports or feature requests, please contact the internal IT/Automation lead.
