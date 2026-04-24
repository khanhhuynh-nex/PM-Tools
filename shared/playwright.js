const { chromium } = require('playwright');

async function launchFreshBrowser() {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();
    return { browser, context, page };
}

async function launchPersistentBrowser(profilePath, headless = false) {
    const context = await chromium.launchPersistentContext(profilePath, {
        headless,
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US',
    });
    const page = context.pages[0] || await context.newPage();
    return { context, page };
}

module.exports = { launchFreshBrowser, launchPersistentBrowser };
