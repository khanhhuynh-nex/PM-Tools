const path = require('path');
const { launchPersistentBrowser } = require('../../shared/playwright');
const { parseTimesheet } = require('./parser');

const BROWSER_PROFILE = path.join(__dirname, 'browser_profile');

const DAY_COLUMN = { Sun: 4, Mon: 5, Tue: 6, Wed: 7, Thu: 8, Fri: 9, Sat: 10 };

const MONTH_NAMES = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

// Extract target week info from filename and first day key
function parseTargetWeek(filePath, firstDayKey) {
    const filename = path.basename(filePath);

    // Week number from filename: "Wk16 13 Apr - 17 Apr.txt" → 16
    const wkMatch = filename.match(/Wk\s*(\d+)/i);
    const weekNum = wkMatch ? parseInt(wkMatch[1]) : null;

    // Day + month from filename: "13 Apr" → { day: 13, month: "apr" }
    const dateMatch = filename.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i);
    const targetDay = dateMatch ? parseInt(dateMatch[1]) : null;
    const targetMonth = dateMatch ? dateMatch[2].toLowerCase() : null;

    // Day number from firstDayKey: "Mon 13" → 13
    const dayNumMatch = firstDayKey ? firstDayKey.match(/\d+/) : null;
    const firstDayNum = dayNumMatch ? parseInt(dayNumMatch[0]) : null;

    return { weekNum, targetDay: targetDay || firstDayNum, targetMonth };
}

// Check if the currently shown week contains our target date
function isTargetWeekInHeaders(headers, firstDayKey, targetDay, targetMonth) {
    const joined = headers.join(' ').toLowerCase();

    // Strategy 1: exact "Mon 13" substring (works if headers show day+number without month)
    if (firstDayKey && joined.includes(firstDayKey.toLowerCase())) return true;

    // Strategy 2: "13 Apr" or "Apr 13" style
    if (targetDay && targetMonth) {
        if (joined.includes(`${targetDay} ${targetMonth}`)) return true;
        if (joined.includes(`${targetMonth} ${targetDay}`)) return true;
        // zero-padded: "13/04" or "13-04"
        const monthIdx = MONTH_NAMES.indexOf(targetMonth) + 1;
        if (monthIdx > 0) {
            const mm = String(monthIdx).padStart(2, '0');
            const dd = String(targetDay).padStart(2, '0');
            if (joined.includes(`${dd}/${mm}`) || joined.includes(`${dd}-${mm}`)) return true;
            if (joined.includes(`${mm}/${dd}`) || joined.includes(`${mm}-${dd}`)) return true;
        }
    }

    // Strategy 3: just the day number appears somewhere in headers (weak but last resort)
    if (targetDay) {
        const dayStr = String(targetDay);
        if (headers.some(h => h.includes(dayStr))) return true;
    }

    return false;
}

async function clickPrevWeek(weekLabel, log) {
    // Walk up up to 3 ancestor levels looking for a container that has sibling/child buttons
    for (const xpath of [
        'xpath=preceding-sibling::button',
        'xpath=parent::*/button[1]',
        'xpath=parent::*/preceding-sibling::button',
        'xpath=parent::parent::*/button[1]',
    ]) {
        try {
            const btn = weekLabel.locator(xpath).first();
            if (await btn.count() > 0 && await btn.isVisible().catch(() => false)) {
                await btn.click();
                return true;
            }
        } catch (_) {}
    }
    log('   [WARN] Could not find Previous Week ( < ) button.');
    return false;
}

async function clickNextWeek(weekLabel, log) {
    for (const xpath of [
        'xpath=following-sibling::button',
        'xpath=parent::*/button[last()]',
        'xpath=parent::*/following-sibling::button',
        'xpath=parent::parent::*/button[last()]',
    ]) {
        try {
            const btn = weekLabel.locator(xpath).first();
            if (await btn.count() > 0 && await btn.isVisible().catch(() => false)) {
                await btn.click();
                return true;
            }
        } catch (_) {}
    }
    log('   [WARN] Could not find Next Week ( > ) button.');
    return false;
}

async function navigateToCorrectWeek(page, filePath, firstDayKey, log) {
    log('\n[Navigation] Checking correct week...');

    const { weekNum, targetDay, targetMonth } = parseTargetWeek(filePath, firstDayKey);
    log(`   Target: Wk${weekNum || '?'}, Day ${targetDay || '?'} ${targetMonth || ''}`);

    for (let attempt = 0; attempt < 15; attempt++) {
        // The Celoxis week label is a text element (span/div), NOT a button.
        // Structure is:  [< button]  [Wk 16: 12 Apr — 18 Apr label]  [> button]
        const weekLabel = page.locator('text=/Wk\\s*\\d+/i').first();
        const visible = await weekLabel.isVisible({ timeout: 5000 }).catch(() => false);

        if (!visible) {
            log('   [!] Week label not found. Saving debug screenshot...');
            await page.screenshot({ path: path.join(__dirname, 'debug_week_nav.png') });
            log('   Saved debug_week_nav.png in tools/celoxis/ — share this file to diagnose further.');
            break;
        }

        const currentText = (await weekLabel.innerText().catch(() => '')).trim();
        log(`   Week label: "${currentText}"`);

        // Check column headers first — Celoxis shows "Sun 12", "Mon 13" etc.
        const headers = await page.locator('table').nth(1).locator('th').allInnerTexts().catch(() => []);
        log(`   Headers: ${headers.filter(Boolean).slice(0, 8).join(' | ')}`);

        if (isTargetWeekInHeaders(headers, firstDayKey, targetDay, targetMonth)) {
            log('   ✅ Correct week confirmed in column headers.');
            return;
        }

        // Determine direction from week number
        const uiWeekMatch = currentText.match(/Wk\s*(\d+)/i);
        const currentUiWeek = uiWeekMatch ? parseInt(uiWeekMatch[1]) : null;

        if (weekNum && currentUiWeek && weekNum === currentUiWeek) {
            log(`   ✅ Week number Wk${weekNum} matches. Proceeding.`);
            return;
        }

        const goBack = (weekNum && currentUiWeek) ? weekNum < currentUiWeek : true;
        log(`   Going ${goBack ? 'back' : 'forward'} (target Wk${weekNum}, current Wk${currentUiWeek || '?'})`);

        // Navigate: find the < or > button in the parent container of the week label
        const navigated = await (goBack
            ? clickPrevWeek(weekLabel, log)
            : clickNextWeek(weekLabel, log));

        if (!navigated) break;

        await page.waitForTimeout(2000);
        await page.waitForSelector('table', { timeout: 10000 }).catch(() => {});
    }

    log('   ⚠️ Week navigation ended. Will attempt data entry on current week.');
}

async function runCeloxisAutomation(filePath, headless, email, password, log) {
    const timesheetData = parseTimesheet(filePath);

    if (!timesheetData || Object.keys(timesheetData).length === 0) {
        log('[ERROR] No data found in timesheet file. Check the file format.');
        return;
    }

    log(`✅ Parsed ${Object.keys(timesheetData).length} days.`);

    for (const [day, items] of Object.entries(timesheetData)) {
        const total = items.reduce((sum, i) => sum + i.hours, 0);
        log(`[${day}] ${items.length} items → ${total}h`);
        if (total < 8.0 && !day.startsWith('Sat') && !day.startsWith('Sun')) {
            log(`   ⚠️  WARNING: Only ${total}h on weekday!`);
        }
    }

    const { context, page } = await launchPersistentBrowser(BROWSER_PROFILE, headless);

    try {
        log('Opening Celoxis...');
        await page.goto('https://app.celoxis.com/psa/login', { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);

        const passwordInput = page.locator('input[type="password"]');
        const isLoginVisible = await passwordInput.isVisible({ timeout: 10000 }).catch(() => false);

        if (isLoginVisible) {
            log('Login page detected. Filling in credentials...');
            const emailInput = page.locator('input[type="text"], input[type="email"]').first();
            await emailInput.fill(email);
            await passwordInput.first().fill(password);

            if (headless) {
                // In headless mode attempt an automated click, but reCAPTCHA will likely block it.
                // If this fails, re-run with "Show Browser" enabled so you can click Login yourself.
                await page.locator('button').filter({ hasText: /^Login$/i }).first().click();
                log('Waiting for login redirect (headless mode)...');
                await page.waitForURL(url => !url.includes('/login'), { timeout: 30000 }).catch(() => {});
            } else {
                // Headed mode: credentials are pre-filled — user must click Login (and solve any CAPTCHA).
                log('');
                log('=======================================================');
                log('ACTION REQUIRED: Click the "Login" button in the browser');
                log('window. If a CAPTCHA appears, complete it too.');
                log('Waiting up to 2 minutes...');
                log('=======================================================');
                log('');
                await page.waitForURL(url => !url.includes('/login'), { timeout: 120000 }).catch(() => {});
            }

            const currentUrl = page.url();
            if (currentUrl.includes('/login')) {
                await page.screenshot({ path: path.join(__dirname, 'error_login_failed.png') });
                log('Saved error_login_failed.png');
                const hint = headless
                    ? 'Re-run with "Show Browser" enabled so you can click Login and complete any CAPTCHA manually. The session is then saved for future runs.'
                    : 'Login did not complete within 2 minutes. Check credentials and try again.';
                throw new Error(`Login failed — still on login page after waiting. ${hint}`);
            }

            log('Login done (session saved for next run).');
        } else {
            log('Already logged in from previous run.');
        }

        log('Navigating to Timesheet...');
        await page.goto('https://app.celoxis.com/psa/timesheet', { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('table', { timeout: 30000 }).catch(async () => {
            await page.screenshot({ path: path.join(__dirname, 'error_timesheet_timeout.png') });
            log('Saved error_timesheet_timeout.png');
            throw new Error('Timed out waiting for timesheet table to load.');
        });
        await page.waitForTimeout(2000);

        const firstDayKey = Object.keys(timesheetData)[0] || null;
        await navigateToCorrectWeek(page, filePath, firstDayKey, log);

        for (const [day, items] of Object.entries(timesheetData)) {
            const dayPrefix = day.slice(0, 3);
            const colIdx = DAY_COLUMN[dayPrefix];
            if (!colIdx) continue;

            for (const item of items) {
                const { workItem, hours, tasks } = item;
                log(`→ Entering ${hours}h for '${workItem}' on ${day}`);

                try {
                    const row = page.locator('table').nth(1).locator('tr')
                        .filter({ hasText: new RegExp(workItem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') })
                        .first();

                    if (await row.count() === 0) {
                        log(`   [!] Row not found: "${workItem}" — check the project name matches Celoxis exactly.`);
                        continue;
                    }

                    const cell = row.locator('td').nth(colIdx);
                    await cell.click({ force: true });
                    await page.waitForTimeout(500);

                    const inputBox = cell.getByRole('textbox');
                    if (await inputBox.count() > 0) {
                        await inputBox.fill(String(hours));
                        await inputBox.press('Tab');
                        await page.waitForTimeout(300);
                    }

                    // Re-click cell to reveal the note icon
                    await cell.click({ force: true });
                    await page.waitForTimeout(800);

                    if (tasks) {
                        log(`   Note: "${tasks.slice(0, 60)}${tasks.length > 60 ? '…' : ''}"`);

                        // Try multiple possible selectors for the note/task icon
                        const noteIconSelectors = [
                            '.fa-thin',
                            '[class*="fa-note"]',
                            '[class*="fa-file-lines"]',
                            '[class*="fa-memo"]',
                            '[class*="fa-pen"]',
                            'i[class*="fa"]',
                            'button[title*="note" i]',
                            'button[title*="task" i]',
                            'svg[data-icon*="note"]',
                        ];

                        let noteIcon = null;
                        for (const sel of noteIconSelectors) {
                            const candidate = cell.locator(sel).first();
                            if (await candidate.count() > 0) {
                                noteIcon = candidate;
                                log(`   Note icon found via: ${sel}`);
                                break;
                            }
                        }

                        if (!noteIcon) {
                            log(`   [WARN] Note icon not found in cell. Saving screenshot for diagnosis...`);
                            const safeName = workItem.replace(/[^a-z0-9]/gi, '_').slice(0, 30);
                            await page.screenshot({ path: path.join(__dirname, `debug_note_icon_${safeName}.png`) });
                            log(`   Saved debug_note_icon_${safeName}.png — share this to identify the correct icon selector.`);
                        } else {
                            await noteIcon.click({ force: true });
                            await page.waitForTimeout(800);

                            const editor = page.locator('div.fr-element[contenteditable="true"]');
                            if (await editor.isVisible({ timeout: 6000 }).catch(() => false)) {
                                await editor.fill(tasks);
                                await page.waitForTimeout(300);
                                log(`   ✅ Note entered.`);
                            } else {
                                log(`   [WARN] Note editor popup did not open.`);
                                await page.screenshot({ path: path.join(__dirname, `debug_note_editor_${workItem.replace(/[^a-z0-9]/gi, '_').slice(0, 30)}.png`) });
                            }

                            await page.getByRole('button', { name: 'OK' }).click();
                            await page.waitForTimeout(500);
                        }
                    }
                } catch (e) {
                    log(`   [!] Error on ${workItem}: ${e.message}`);
                    const safeName = workItem.replace(/[^a-z0-9]/gi, '_').slice(0, 40);
                    await page.screenshot({ path: path.join(__dirname, `error_${day}_${safeName}.png`) });
                    log(`   Screenshot saved.`);
                }
            }
        }

        log('\nSaving timesheet...');
        const saveBtn = page.getByRole('button', { name: 'Save' });
        if (await saveBtn.count() > 0) {
            await saveBtn.click();
            await page.waitForTimeout(2000);
            log('✅ Timesheet SAVED successfully!');
        } else {
            log('[!] Save button not found.');
        }

        await page.waitForTimeout(3000);
    } catch (err) {
        log(`[ERROR] Automation error: ${err.message}`);
    } finally {
        await context.close();
    }
}

module.exports = { runCeloxisAutomation };
