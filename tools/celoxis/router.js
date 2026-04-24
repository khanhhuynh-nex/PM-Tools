const express = require('express');
const fs = require('fs');
const { createSSEStream } = require('../../shared/sse');
const { createUploader } = require('../../shared/upload');
const { runCeloxisAutomation } = require('./automation');

const router = express.Router();
const sse = createSSEStream();
const upload = createUploader();
let isRunning = false;

router.get('/logs', sse.middleware);

router.get('/status', (req, res) => {
    res.json({ isRunning });
});

router.post('/run', upload.single('timesheetFile'), async (req, res) => {
    if (isRunning) {
        return res.status(409).json({ error: 'Automation is already running.' });
    }

    const { email, password, headless } = req.body;
    const file = req.file;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }
    if (!file) {
        return res.status(400).json({ error: 'Timesheet file is required.' });
    }

    res.json({ status: 'started' });
    isRunning = true;
    sse.broadcast('running', 'status');

    try {
        await runCeloxisAutomation(file.path, headless === 'true', email, password, sse.log);
    } catch (err) {
        sse.log(`[FATAL ERROR] ${err.message}`);
    } finally {
        isRunning = false;
        sse.broadcast('idle', 'status');
        try { fs.unlinkSync(file.path); } catch (_) {}
    }
});

module.exports = router;
