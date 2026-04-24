const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// --- Multer Setup for file uploads ---
const upload = multer({ dest: path.join(__dirname, 'uploads') });

// Serve static files from /public
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// --- SSE Clients ---
let sseClients = [];

function broadcast(message, type = 'log') {
    const data = JSON.stringify({ type, message });
    sseClients.forEach(res => {
        res.write(`data: ${data}\n\n`);
    });
}

// Custom log function that broadcasts to SSE
function log(msg) {
    console.log(msg);
    broadcast(msg, 'log');
}

// --- SSE Endpoint ---
app.get('/api/logs', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });
    res.write(`data: ${JSON.stringify({ type: 'log', message: 'Connected to log stream.' })}\n\n`);
    sseClients.push(res);
    req.on('close', () => {
        sseClients = sseClients.filter(c => c !== res);
    });
});

// --- Global state ---
let isRunning = false;

// --- Status Endpoint ---
app.get('/api/status', (req, res) => {
    res.json({ isRunning });
});

// --- Run Automation Endpoint ---
app.post('/api/run', upload.single('excelFile'), async (req, res) => {
    if (isRunning) {
        return res.status(409).json({ error: 'Automation is already running.' });
    }

    const { username, password, noValues } = req.body;
    const file = req.file;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
    }
    if (!file) {
        return res.status(400).json({ error: 'Excel file is required.' });
    }
    if (!noValues) {
        return res.status(400).json({ error: 'No values are required.' });
    }

    // Parse the "No" values
    const nos = noValues.replace(/,/g, ' ').split(/\s+/).filter(Boolean).map(Number);
    if (nos.some(isNaN) || nos.length === 0) {
        return res.status(400).json({ error: 'Invalid "No" values. Please enter numbers only.' });
    }

    // Immediately respond, then run automation in background
    res.json({ status: 'started', nos });
    isRunning = true;
    broadcast('running', 'status');

    try {
        await runEpicorAutomation(file.path, username, password, nos);
    } catch (err) {
        log(`[FATAL ERROR] ${err.message}`);
    } finally {
        isRunning = false;
        broadcast('idle', 'status');
        // Clean up uploaded file
        try { fs.unlinkSync(file.path); } catch (_) {}
    }
});


// ===================================================================
//  CORE AUTOMATION LOGIC (ported from epicor_automation.py)
// ===================================================================

async function robustFill(page, labelText, value) {
    if (value === null || value === undefined || String(value).trim() === '') {
        log(`  [SKIP] '${labelText}' value is empty in Excel.`);
        return;
    }
    value = String(value).trim();

    try {
        let inp = page.locator(`xpath=//*[text()='${labelText}']/..//input | //*[text()='${labelText}']/..//textarea`).first();

        if (await inp.count() === 0 || !(await inp.isVisible().catch(() => false))) {
            inp = page.locator(`xpath=//*[normalize-space(text())='${labelText}']/..//input | //*[normalize-space(text())='${labelText}']/..//textarea`).first();
        }
        if (await inp.count() === 0 || !(await inp.isVisible().catch(() => false))) {
            inp = page.getByRole('textbox', { name: labelText });
        }
        if (await inp.count() === 0 || !(await inp.isVisible().catch(() => false))) {
            inp = page.getByLabel(labelText, { exact: false });
        }

        await inp.click({ timeout: 3000 });
        await inp.fill(value);
        await inp.press('Tab');
        await page.waitForTimeout(1000);

        const actual = await inp.inputValue();
        if (value.includes(actual) || actual.includes(value)) {
            log(`  [OK] Confirmed '${labelText}' is set to '${value}'`);
        } else {
            log(`  [WARN] '${labelText}' reads as '${actual}' instead of '${value}'`);
        }
    } catch (e) {
        log(`  [ERROR] Could not fill '${labelText}' with '${value}'. (Check if field is enabled/visible).`);
    }
}

async function robustCombobox(page, labelText, value) {
    if (value === null || value === undefined || String(value).trim() === '') {
        log(`  [SKIP] '${labelText}' value is empty in Excel.`);
        return;
    }
    value = String(value).trim();

    try {
        let inp = page.locator(`xpath=//*[text()='${labelText}']/..//input`).first();

        if (await inp.count() === 0 || !(await inp.isVisible().catch(() => false))) {
            inp = page.locator(`xpath=//*[normalize-space(text())='${labelText}']/..//input`).first();
        }
        if (await inp.count() === 0 || !(await inp.isVisible().catch(() => false))) {
            inp = page.getByRole('combobox', { name: labelText });
        }
        if (await inp.count() === 0 || !(await inp.isVisible().catch(() => false))) {
            inp = page.getByLabel(labelText, { exact: false });
        }

        await inp.click({ timeout: 3000 });
        await page.waitForTimeout(500);

        await inp.press('Control+A');
        await inp.press('Backspace');
        await page.waitForTimeout(500);

        await inp.type(value, { delay: 50 });
        await page.waitForTimeout(2000);

        // Wait for the dropdown list to appear and click the matching item
        try {
            // common selectors for Epicor/Angular/Kinetic dropdown items
            const option = page.locator('mat-option, [role="option"], .list-item').filter({ hasText: value }).first();
            await option.click({ timeout: 4000 });
            log(`  [OK] Clicked matching dropdown item: '${value}'`);
        } catch (err) {
            log(`  [INFO] Could not find clickable dropdown item for '${value}', falling back to Enter key.`);
            await inp.press('ArrowDown');
            await page.waitForTimeout(500);
            await inp.press('Enter');
        }
        await page.waitForTimeout(1000);

        const actual = await inp.inputValue();
        if (value.includes(actual) || actual.includes(value)) {
            log(`  [OK] Confirmed '${labelText}' is select-set to '${value}'`);
        } else {
            log(`  [WARN] '${labelText}' reads as '${actual}' instead of '${value}'`);
        }
    } catch (e) {
        log(`  [ERROR] Could not select '${labelText}' with '${value}'. (Check if field is enabled/visible).`);
    }
}

async function runEpicorAutomation(excelPath, username, password, noList) {
    log('Loading Excel Data...');

    // Read the Excel file using the xlsx library
    const workbook = XLSX.readFile(excelPath);
    const sheet = workbook.Sheets['PART CODE - TABLE FORM'];
    if (!sheet) {
        log('[ERROR] Could not find sheet "PART CODE - TABLE FORM" in the uploaded file.');
        return;
    }
    // header: 3 means the 3rd row (0-indexed row 2) becomes the header, matching Python's header=2
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    // Find the header row (row index 2, i.e., the 3rd row)
    const headerRow = rawData[2];
    if (!headerRow) {
        log('[ERROR] Could not find header row at row 3 in the sheet.');
        return;
    }
    const rawHeaders = headerRow.map(h => (h ? String(h).trim() : ''));
    const headers = [];
    const headerCounts = {};
    for (const h of rawHeaders) {
        if (!h) {
            headers.push('');
            continue;
        }
        if (headerCounts[h]) {
            headers.push(`${h}.${headerCounts[h]}`);
            headerCounts[h]++;
        } else {
            headers.push(h);
            headerCounts[h] = 1;
        }
    }

    // Build data rows
    const dataRows = [];
    for (let i = 3; i < rawData.length; i++) {
        const row = rawData[i];
        if (!row || row.length === 0) continue;
        const obj = {};
        headers.forEach((h, idx) => {
            obj[h] = row[idx] !== undefined ? row[idx] : null;
        });
        dataRows.push(obj);
    }

    log(`Loaded ${dataRows.length} rows from Excel.`);

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        log('Logging into Epicor...');
        await page.goto('https://lsidtapp02.epicorsaas.com/SaaS3024/Apps/Erp/Home/#/view/PMGO2020?channelid=2eec4a59-f9ae-4a11-b57e-e476bfa7b933&layerVersion=0&baseAppVersion=0&company=29897G&site=MfgSys&pageId=ReqEntryForm', { timeout: 300000 });

        await page.getByRole('textbox', { name: 'User Name' }).fill(username);
        await page.getByRole('textbox', { name: 'Password' }).fill(password);
        await page.getByRole('button', { name: 'Log in' }).click();

        await page.waitForTimeout(5000);

        log('\nCreating New Requisition Header...');
        await page.getByTitle('New Requisition').click();
        await page.waitForTimeout(2000);

        await page.getByTitle('Save').click();
        await page.waitForTimeout(3000);
        log('\nNew PR Number has been generated.');

        const reqNum = await page.getByRole('spinbutton', { name: 'Requisition Number *' }).inputValue();
        log('\n==================================================');
        log(` GENERATED PR NUMBER: ${reqNum} `);
        log('==================================================\n');
        broadcast(reqNum, 'pr_number');

        log(`Processing lines for No's: ${noList.join(', ')}`);

        for (const noVal of noList) {
            // Find matching row by the "No" column
            const row = dataRows.find(r => Number(r['No']) === noVal);
            if (!row) {
                log(`Error: Could not find No=${noVal} in Excel!`);
                continue;
            }

            const pPart = row['Requisition Part  Code'] ?? null;
            const pClass = row['Description'] ?? null;   // Column D (Index 3) - Misnamed as Description in Excel
            const pDesc = row['Description.1'] ?? null;  // Column L (Index 11) - Actual description
            const pSupplier = row['Supplier Code'] ?? null;
            const pPrice = row['Price'] ?? null;

            log(`\n-- Adding Line for No=${noVal} --`);
            log(`  Extracted Excel Data:`);
            log(`  Part: ${pPart} | Class: ${pClass} | Desc: ${pDesc} | Supplier: ${pSupplier} | Price: ${pPrice}`);

            // Click New Line
            log('  Clicking New Line...');
            await page.getByTitle('New Line').first().click({ force: true });
            await page.waitForTimeout(4000);

            // Switch to Line Detail view
            try {
                log("  Switching to 'Lines / Detail' view...");
                await page.locator("text='Lines / Detail'").first().click({ timeout: 5000 });
            } catch (_) {}
            await page.waitForTimeout(3000);

            // Double check if we are on line details
            try {
                if (!(await page.locator("text='Line Detail'").isVisible())) {
                    await page.locator("text='Line Detail'").last().click({ timeout: 1000 });
                }
            } catch (_) {}

            log('  Filling Line Parameters...');
            await robustFill(page, 'Part', pPart);
            await robustCombobox(page, 'Class', pClass);
            await robustFill(page, 'Description', pDesc);
            await robustFill(page, 'Supplier', pSupplier);
            await robustFill(page, 'Our Qty', '1');
            await robustFill(page, 'Supplier Qty', '1');
            await robustFill(page, 'Unit Price', pPrice);

            // Save Line
            log(`  Saving Line for No=${noVal}...`);
            await page.getByTitle('Save').click();
            await page.waitForTimeout(3000);
        }

        log('\n✅ Finished PR Automation!');
        await page.waitForTimeout(3000);
    } catch (err) {
        log(`[ERROR] Automation error: ${err.message}`);
    } finally {
        await browser.close();
    }
}

// --- Start server ---
app.listen(PORT, () => {
    console.log(`\n  Epicor PR Automation Server running at http://localhost:${PORT}\n`);
});
