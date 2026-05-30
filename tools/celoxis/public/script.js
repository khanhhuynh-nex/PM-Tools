document.addEventListener('DOMContentLoaded', () => {
    const timesheetFileInput = document.getElementById('timesheetFile');
    const dropZone = document.getElementById('dropZone');
    const fileInfo = document.getElementById('fileInfo');
    const fileName = document.getElementById('fileName');
    const clearFileBtn = document.getElementById('clearFile');
    const runBtn = document.getElementById('runBtn');
    const logConsole = document.getElementById('logConsole');
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');

    let selectedFile = null;

    // File drop zone
    dropZone.addEventListener('click', () => timesheetFileInput.click());
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (files.length > 0 && /\.txt$/i.test(files[0].name)) {
            selectFile(files[0]);
        } else {
            appendLog('[WARN] Please drop a valid .txt timesheet file.', 'warn');
        }
    });
    timesheetFileInput.addEventListener('change', () => {
        if (timesheetFileInput.files.length > 0) selectFile(timesheetFileInput.files[0]);
    });

    function selectFile(file) {
        selectedFile = file;
        fileName.textContent = file.name;
        fileInfo.classList.remove('hidden');
        dropZone.style.display = 'none';
    }

    clearFileBtn.addEventListener('click', () => {
        selectedFile = null;
        timesheetFileInput.value = '';
        fileInfo.classList.add('hidden');
        dropZone.style.display = '';
    });

    // SSE log stream
    let eventSource = null;

    function connectSSE() {
        if (eventSource) eventSource.close();
        eventSource = new EventSource('/api/celoxis/logs');
        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'log') appendLog(data.message);
                else if (data.type === 'status') setStatus(data.message);
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
        } else if (message.includes('[OK]') || message.includes('✅')) {
            p.classList.add('log-ok');
        } else if (message.includes('[WARN]') || message.includes('⚠️')) {
            p.classList.add('log-warn');
        } else if (message.includes('[ERROR]') || message.includes('[FATAL') || message.includes('[!]')) {
            p.classList.add('log-error');
        } else if (message.includes('→')) {
            p.classList.add('log-highlight');
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

    runBtn.addEventListener('click', async () => {
        if (!selectedFile) {
            appendLog('[ERROR] Please upload a timesheet .txt file.', 'error');
            return;
        }

        const formData = new FormData();
        formData.append('timesheetFile', selectedFile);

        runBtn.disabled = true;
        runBtn.querySelector('span').textContent = 'Running...';

        appendLog('');
        appendLog('==============================================');
        appendLog(`Starting timesheet automation: ${selectedFile.name}`);
        appendLog('==============================================');
        appendLog('');

        try {
            const response = await fetch('/api/celoxis/run', { method: 'POST', body: formData });
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
