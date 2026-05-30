document.addEventListener('DOMContentLoaded', () => {
    const excelFileInput = document.getElementById('excelFile');
    const dropZone = document.getElementById('dropZone');
    const fileInfo = document.getElementById('fileInfo');
    const fileName = document.getElementById('fileName');
    const clearFileBtn = document.getElementById('clearFile');
    const noValuesInput = document.getElementById('noValues');
    const runBtn = document.getElementById('runBtn');
    const logConsole = document.getElementById('logConsole');
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const prBanner = document.getElementById('prBanner');
    const prNumber = document.getElementById('prNumber');

    let selectedFile = null;

    dropZone.addEventListener('click', () => excelFileInput.click());
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (files.length > 0 && /\.xlsx?$/i.test(files[0].name)) {
            selectFile(files[0]);
        } else {
            appendLog('[WARN] Please drop a valid .xlsx or .xls file.', 'warn');
        }
    });
    excelFileInput.addEventListener('change', () => {
        if (excelFileInput.files.length > 0) selectFile(excelFileInput.files[0]);
    });

    function selectFile(file) {
        selectedFile = file;
        fileName.textContent = file.name;
        fileInfo.classList.remove('hidden');
        dropZone.style.display = 'none';
    }

    clearFileBtn.addEventListener('click', () => {
        selectedFile = null;
        excelFileInput.value = '';
        fileInfo.classList.add('hidden');
        dropZone.style.display = '';
    });

    let eventSource = null;

    function connectSSE() {
        if (eventSource) eventSource.close();
        eventSource = new EventSource('/api/epicor/logs');
        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'log') appendLog(data.message);
                else if (data.type === 'status') setStatus(data.message);
                else if (data.type === 'pr_number') showPRNumber(data.message);
            } catch (e) {
                appendLog(event.data);
            }
        };
        eventSource.onerror = () => appendLog('[WARN] Lost connection to server. Reconnecting...', 'warn');
    }

    connectSSE();

    function appendLog(message, forceClass = null) {
        const p = document.createElement('p');
        p.classList.add('log-entry');
        if (forceClass) {
            p.classList.add(`log-${forceClass}`);
        } else if (message.includes('[OK]')) {
            p.classList.add('log-ok');
        } else if (message.includes('[WARN]')) {
            p.classList.add('log-warn');
        } else if (message.includes('[ERROR]') || message.includes('[FATAL')) {
            p.classList.add('log-error');
        } else if (message.includes('GENERATED PR NUMBER') || message.includes('===')) {
            p.classList.add('log-highlight');
        } else if (message.includes('✅')) {
            p.classList.add('log-ok');
        }
        p.textContent = message;
        logConsole.appendChild(p);
        logConsole.scrollTop = logConsole.scrollHeight;
    }

    function setStatus(status) {
        statusDot.className = `status-dot ${status}`;
        statusText.textContent = status === 'running' ? 'Running' : 'Idle';
        if (status === 'idle') {
            runBtn.disabled = false;
            runBtn.querySelector('span').textContent = 'Run Automation';
        }
    }

    function showPRNumber(num) {
        prNumber.textContent = num;
        prBanner.classList.remove('hidden');
    }

    runBtn.addEventListener('click', async () => {
        const noValues = noValuesInput.value.trim();

        if (!selectedFile) { appendLog('[ERROR] Please upload an Excel file.', 'error'); return; }
        if (!noValues) { appendLog('[ERROR] Please enter at least one row "No" value.', 'error'); return; }

        const formData = new FormData();
        formData.append('noValues', noValues);
        formData.append('excelFile', selectedFile);

        runBtn.disabled = true;
        runBtn.querySelector('span').textContent = 'Running...';
        prBanner.classList.add('hidden');

        appendLog('');
        appendLog('==============================================');
        appendLog(`Initiating automation for Nos: ${noValues}`);
        appendLog(`Source File: ${selectedFile.name}`);
        appendLog('==============================================');
        appendLog('');

        try {
            const response = await fetch('/api/epicor/run', { method: 'POST', body: formData });
            if (!response.ok) {
                const errData = await response.json();
                appendLog(`[ERROR] ${errData.error}`, 'error');
                runBtn.disabled = false;
                runBtn.querySelector('span').textContent = 'Run Automation';
            }
        } catch (err) {
            appendLog(`[ERROR] Network error: ${err.message}`, 'error');
            runBtn.disabled = false;
            runBtn.querySelector('span').textContent = 'Run Automation';
        }
    });
});
