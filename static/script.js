let timeLeft = 25 * 60;
let timerId = null;
let isRunning = false;
let currentMode = 'focus';

// Default Defaults
let MODES = {
    focus: { time: 25, color: '#ba4949' },
    short: { time: 5, color: '#38858a' },
    long:  { time: 15, color: '#397097' }
};

// --- INITIALIZATION ---
function loadConfig() {
    // 1. Load User ID
    let userUUID = localStorage.getItem('pomodoro_uuid');
    if (!userUUID) {
        userUUID = crypto.randomUUID();
        localStorage.setItem('pomodoro_uuid', userUUID);
    }

    // 2. Load Timer Settings
    const storedConfig = localStorage.getItem('pomodoro_config');
    if (storedConfig) {
        const parsed = JSON.parse(storedConfig);
        MODES.focus.time = parsed.focus;
        MODES.short.time = parsed.short;
        MODES.long.time = parsed.long;
    }

    // 3. Update UI
    document.getElementById('uuid-input').value = userUUID;
    document.getElementById('cfg-focus').value = MODES.focus.time;
    document.getElementById('cfg-short').value = MODES.short.time;
    document.getElementById('cfg-long').value = MODES.long.time;

    const feedUrl = `${window.location.protocol}//${window.location.host}/calendar/${userUUID}.ics`;
    document.getElementById('sub-link').href = feedUrl.replace(/^http/, 'webcal');
}

// --- SYNC & QUEUE ---
window.addEventListener('online', processQueue);

async function processQueue() {
    const queue = JSON.parse(localStorage.getItem('pomodoro_queue') || '[]');
    if (!queue.length) return;

    statusEl.textContent = "SYNCING...";
    const newQueue = [];

    for (const s of queue) {
        try {
            await fetch('/api/log', {
                method: 'POST', 
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(s)
            });
        } catch { newQueue.push(s); }
    }

    localStorage.setItem('pomodoro_queue', JSON.stringify(newQueue));
    statusEl.textContent = newQueue.length ? "OFFLINE SAVED" : "SYNCED";
}

function queueSession(duration) {
    const uuid = localStorage.getItem('pomodoro_uuid');
    const queue = JSON.parse(localStorage.getItem('pomodoro_queue') || '[]');
    queue.push({ uuid: uuid, duration, created_at: new Date().toISOString() });
    localStorage.setItem('pomodoro_queue', JSON.stringify(queue));

    if (navigator.onLine) processQueue();
    else statusEl.textContent = "SAVED OFFLINE";
}

// --- TIMER LOGIC ---
const timerEl = document.getElementById('timer');
const statusEl = document.getElementById('status');

function updateDisplay() {
    const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
    const s = (timeLeft % 60).toString().padStart(2, '0');
    timerEl.textContent = `${m}:${s}`;
    document.title = isRunning ? `${m}:${s} - Focus` : "Pomodoro";
}

// --- TABS LOGIC ---
function switchTab(tabName) {
    // 1. Update Buttons
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');

    // 2. Show Content
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');

    // 3. Load History if selected
    if (tabName === 'history') {
        loadHistory();
    }
}

// --- HISTORY LOGIC ---
async function loadHistory() {
    const listEl = document.getElementById('history-list');
    const uuid = localStorage.getItem('pomodoro_uuid');

    listEl.innerHTML = '<div class="loading-spinner">Loading...</div>';

    try {
        const res = await fetch(`/api/history?uuid=${uuid}`);
        const data = await res.json();

        if (data.length === 0) {
            listEl.innerHTML = '<div class="loading-spinner">No sessions yet.</div>';
            return;
        }

        let html = '';
        let lastDate = '';

        data.forEach(item => {
            // Format Date
            const d = new Date(item.start_time);
            const dateStr = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
            const timeStr = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

            // Check if it's "Today"
            const isToday = new Date().toDateString() === d.toDateString();
            const displayDate = isToday ? "Today" : dateStr;

            // Dot Color Class (Recent = Today)
            const dotClass = isToday ? 'recent' : '';

            html += `
            <div class="history-item ${dotClass}" id="row-${item.id}">
                <div class="h-date">${displayDate} • ${timeStr}</div>
                <div class="h-content">
                    <div class="h-info">
                        <strong>${item.duration} min</strong>
                        <span>Focus Session</span>
                    </div>
                    <button class="btn-del" onclick="deleteHistory(${item.id})">&times;</button>
                </div>
            </div>`;
        });

        listEl.innerHTML = html;

    } catch (e) {
        listEl.innerHTML = '<div class="loading-spinner">Offline (Cannot load history)</div>';
    }
}

async function deleteHistory(id) {
    if(!confirm("Delete this session?")) return;

    // Optimistic UI Update (remove immediately)
    const row = document.getElementById(`row-${id}`);
    row.style.opacity = '0.3';

    try {
        const uuid = localStorage.getItem('pomodoro_uuid');
        await fetch(`/api/history/${id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uuid: uuid })
        });

        // Remove completely
        row.remove();
    } catch (e) {
        alert("Failed to delete (Offline?)");
        row.style.opacity = '1';
    }
}


function setMode(mode) {
    if (isRunning) toggleTimer(); 
    currentMode = mode;
    timeLeft = MODES[mode].time * 60;

    // Theme
    const color = MODES[mode].color;
    document.documentElement.style.setProperty('--bg-focus', color);
    document.querySelector('meta[name="theme-color"]').setAttribute('content', color);

    // UI
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`btn-${mode}`).classList.add('active');

    updateDisplay();
    statusEl.textContent = "PRESS TO START";
    timerEl.style.opacity = "1";
}

function toggleTimer() {
    if (isRunning) {
        clearInterval(timerId);
        isRunning = false;
        statusEl.textContent = "PAUSED";
        timerEl.style.opacity = "0.5";
    } else {
        isRunning = true;
        statusEl.textContent = currentMode === 'focus' ? "FOCUSING" : "BREAK";
        timerEl.style.opacity = "1";

        timerId = setInterval(() => {
            if (timeLeft > 0) {
                timeLeft--;
                updateDisplay();
            } else {
                finishSession();
            }
        }, 1000);
    }
}

function finishSession() {
    clearInterval(timerId);
    isRunning = false;
    new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg').play();

    if (currentMode === 'focus') queueSession(MODES.focus.time);

    timeLeft = MODES[currentMode].time * 60;
    updateDisplay();
    statusEl.textContent = "COMPLETE";
}

// --- SETTINGS MANAGEMENT ---
function openModal() { 
    // Refresh inputs in case they were changed externally
    document.getElementById('cfg-focus').value = MODES.focus.time;
    document.getElementById('cfg-short').value = MODES.short.time;
    document.getElementById('cfg-long').value = MODES.long.time;
    document.getElementById('settings-modal').style.display = 'flex'; 
}

function closeModal() { document.getElementById('settings-modal').style.display = 'none'; }

function saveSettings() {
    // 1. Save UUID
    const uuidInput = document.getElementById('uuid-input').value.trim();
    if (uuidInput) localStorage.setItem('pomodoro_uuid', uuidInput);

    // 2. Save Timer Configs
    const newConfig = {
        focus: parseInt(document.getElementById('cfg-focus').value) || 25,
        short: parseInt(document.getElementById('cfg-short').value) || 5,
        long: parseInt(document.getElementById('cfg-long').value) || 15
    };

    localStorage.setItem('pomodoro_config', JSON.stringify(newConfig));

    // 3. Apply changes immediately
    MODES.focus.time = newConfig.focus;
    MODES.short.time = newConfig.short;
    MODES.long.time = newConfig.long;

    // Reset current timer to new setting
    setMode(currentMode);
    closeModal();
}

// Start
loadConfig();
setMode('focus');
