const XLSX = require('xlsx');
const { launchFreshBrowser } = require('../../shared/playwright');

async function robustFill(page, labelText, value, log) {
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

async function robustCombobox(page, labelText, value, log) {
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

        try {
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

async function runEpicorAutomation(excelPath, username, password, noList, log, broadcast) {
    log('Loading Excel Data...');

    const workbook = XLSX.readFile(excelPath);
    const sheet = workbook.Sheets['PART CODE - TABLE FORM'];
    if (!sheet) {
        log('[ERROR] Could not find sheet "PART CODE - TABLE FORM" in the uploaded file.');
        return;
    }

    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    const headerRow = rawData[2];
    if (!headerRow) {
        log('[ERROR] Could not find header row at row 3 in the sheet.');
        return;
    }

    const rawHeaders = headerRow.map(h => (h ? String(h).trim() : ''));
    const headers = [];
    const headerCounts = {};
    for (const h of rawHeaders) {
        if (!h) { headers.push(''); continue; }
        if (headerCounts[h]) {
            headers.push(`${h}.${headerCounts[h]}`);
            headerCounts[h]++;
        } else {
            headers.push(h);
            headerCounts[h] = 1;
        }
    }

    const dataRows = [];
    for (let i = 3; i < rawData.length; i++) {
        const row = rawData[i];
        if (!row || row.length === 0) continue;
        const obj = {};
        headers.forEach((h, idx) => { obj[h] = row[idx] !== undefined ? row[idx] : null; });
        dataRows.push(obj);
    }

    log(`Loaded ${dataRows.length} rows from Excel.`);

    const { browser, context, page } = await launchFreshBrowser();

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
            const row = dataRows.find(r => Number(r['No']) === noVal);
            if (!row) {
                log(`Error: Could not find No=${noVal} in Excel!`);
                continue;
            }

            const pPart = row['Requisition Part  Code'] ?? null;
            const pClass = row['Description'] ?? null;
            const pDesc = row['Description.1'] ?? null;
            const pSupplier = row['Supplier Code'] ?? null;
            const pPrice = row['Price'] ?? null;

            log(`\n-- Adding Line for No=${noVal} --`);
            log(`  Extracted Excel Data:`);
            log(`  Part: ${pPart} | Class: ${pClass} | Desc: ${pDesc} | Supplier: ${pSupplier} | Price: ${pPrice}`);

            log('  Clicking New Line...');
            await page.getByTitle('New Line').first().click({ force: true });
            await page.waitForTimeout(4000);

            try {
                log("  Switching to 'Lines / Detail' view...");
                await page.locator("text='Lines / Detail'").first().click({ timeout: 5000 });
            } catch (_) {}
            await page.waitForTimeout(3000);

            try {
                if (!(await page.locator("text='Line Detail'").isVisible())) {
                    await page.locator("text='Line Detail'").last().click({ timeout: 1000 });
                }
            } catch (_) {}

            log('  Filling Line Parameters...');
            await robustFill(page, 'Part', pPart, log);
            await robustCombobox(page, 'Class', pClass, log);
            await robustFill(page, 'Description', pDesc, log);
            await robustFill(page, 'Supplier', pSupplier, log);
            await robustFill(page, 'Our Qty', '1', log);
            await robustFill(page, 'Supplier Qty', '1', log);
            await robustFill(page, 'Unit Price', pPrice, log);

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

module.exports = { runEpicorAutomation };
