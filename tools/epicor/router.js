const express = require('express');
const fs = require('fs');
const { createSSEStream } = require('../../shared/sse');
const { createUploader } = require('../../shared/upload');
const { runEpicorAutomation } = require('./automation');

const router = express.Router();
const sse = createSSEStream();
const upload = createUploader();
let isRunning = false;

router.get('/logs', sse.middleware);

router.get('/status', (req, res) => {
    res.json({ isRunning });
});

router.post('/run', upload.single('excelFile'), async (req, res) => {
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

    const nos = noValues.replace(/,/g, ' ').split(/\s+/).filter(Boolean).map(Number);
    if (nos.some(isNaN) || nos.length === 0) {
        return res.status(400).json({ error: 'Invalid "No" values. Please enter numbers only.' });
    }

    res.json({ status: 'started', nos });
    isRunning = true;
    sse.broadcast('running', 'status');

    try {
        await runEpicorAutomation(file.path, username, password, nos, sse.log, sse.broadcast);
    } catch (err) {
        sse.log(`[FATAL ERROR] ${err.message}`);
    } finally {
        isRunning = false;
        sse.broadcast('idle', 'status');
        try { fs.unlinkSync(file.path); } catch (_) {}
    }
});

module.exports = router;
