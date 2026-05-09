const { chromium } = require('playwright');

async function launchFreshBrowser() {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();
    return { browser, context, page };
}

async function launchPersistentBrowser(profilePath) {
    const launchOptions = {
        headless: false,
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US',
        args: ['--disable-blink-features=AutomationControlled'],
    };

    // Prefer system Chrome over Playwright's Chromium — reCAPTCHA trusts real Chrome fingerprints.
    // Falls back to bundled Chromium if Chrome isn't installed.
    let context;
    try {
        context = await chromium.launchPersistentContext(profilePath, {
            ...launchOptions,
            channel: 'chrome',
        });
    } catch {
        context = await chromium.launchPersistentContext(profilePath, launchOptions);
    }

    const page = context.pages[0] || await context.newPage();
    return { context, page };
}

module.exports = { launchFreshBrowser, launchPersistentBrowser };
