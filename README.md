# PM Automation Hub

A unified platform for project management automation tools, including Celoxis timesheet automation and Epicor workflow helpers.

## Features

- **Celoxis Automation**: Automatically fill timesheets from text files.
- **Epicor Automation**: Streamline Epicor workflows via browser automation.
- **Unified Dashboard**: A single interface to access all tools.

## Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher recommended)
- [Git](https://git-scm.com/)

## Getting Started

1. **Clone the repository**:
   ```bash
   git clone https://github.com/khanhhuynh-nex/PM-Tools.git
   cd PM-Tools
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Install Playwright browsers**:
   ```bash
   npx playwright install chromium
   ```

4. **Run the application**:
   - **On Windows**: Double-click `Start App.bat` or run `node server.js`.
   - **On MacOS/Linux**: Run `node server.js`.

5. **Access the tools**:
   Open your browser and navigate to `http://localhost:3000`.

## Directory Structure

- `server.js`: Main entry point for the Express server.
- `tools/`: Contains individual automation tools.
- `shared/`: Shared utilities for SSE, file uploads, and browser management.
- `public/`: Frontend assets for the main dashboard.

## License

MIT
