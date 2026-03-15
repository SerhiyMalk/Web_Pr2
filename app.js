// --- Налаштування КРМ ---
const limits = {
    Q: { min: -500, max: 500, normMin: -100, normMax: 100 },
    Cos: { min: 0.6, max: 1.0, normMin: 0.92, normMax: 0.98 },
    U: { min: 350, max: 420, normMin: 380, normMax: 400 },
    Steps: { min: 0, max: 12, normMin: 2, normMax: 8 },
    Temp: { min: 10, max: 80, normMin: 20, normMax: 45 }
};

let dataHistory = []; // Для розрахунку трендів
let socketMockInterval = null;
let isConnected = false;

// --- 1. Ініціалізація графіка ---
const ctx = document.getElementById('mainChart').getContext('2d');
const historyChart = new Chart(ctx, {
    type: 'line',
    data: { labels: [], datasets: [
        { label: 'Реактивна потужність (кВАр)', data: [], borderColor: '#2196F3', tension: 0.3, yAxisID: 'y' },
        { label: 'Напруга (В)', data: [], borderColor: '#FFC107', tension: 0.3, yAxisID: 'y1' }
    ]},
    options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
            y: { type: 'linear', display: true, position: 'left' },
            y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false } }
        }
    }
});

// --- 2. PWA: Реєстрація Service Worker ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('SW зареєстровано!', reg.scope))
            .catch(err => console.error('Помилка реєстрації SW:', err));
    });
}

// --- 3. Система сповіщень (Notifications API) ---
function requestNotificationPermission() {
    if ("Notification" in window) {
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                new Notification("Сповіщення увімкнено", { body: "Ви отримуватимете критичні попередження КРМ." });
            }
        });
    }
}

function sendAlert(paramName, value) {
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Критичний показник КРМ!", {
            body: `Показник ${paramName} вийшов за межі: ${value}`,
            icon: "icon-192.png" // Сюди можна додати шлях до іконки
        });
    }
}

// --- 4. Прогнозування (Тренди) ---
function calculateTrend(paramArray) {
    if (paramArray.length < 3) return '➡️';
    const last = paramArray[paramArray.length - 1];
    const prev = paramArray[paramArray.length - 2];
    
    // Простий аналіз зміни
    if (last > prev * 1.05) return '↗️'; // Зростає більше ніж на 5%
    if (last < prev * 0.95) return '↘️'; // Спадає більше ніж на 5%
    return '➡️'; // Стабільно
}

// --- 5. WebSocket (Реалізація та Імітація) ---
function toggleConnection() {
    const btn = document.getElementById('ws-btn');
    if (isConnected) {
        clearInterval(socketMockInterval);
        isConnected = false;
        btn.textContent = 'WS: Відключено';
        btn.className = 'disconnected';
    } else {
        // У реальному проекті тут було б: const ws = new WebSocket('ws://сервер'); ws.onmessage = (e) => processData(e.data);
        socketMockInterval = setInterval(() => {
            const mockData = generateMockData();
            processIncomingData(mockData);
        }, 2000); // Отримання даних кожні 2 сек
        
        isConnected = true;
        btn.textContent = 'WS: Підключено';
        btn.className = 'connected';
    }
}

function generateMockData() {
    const random = (min, max) => (Math.random() * (max - min) + min);
    let steps = Math.round(random(limits.Steps.min, limits.Steps.max));
    return {
        timestamp: new Date(),
        Q: parseFloat(random(-150, 200).toFixed(0)),
        Cos: parseFloat(random(0.85, 0.99).toFixed(2)),
        U: parseFloat(random(370, 410).toFixed(0)),
        Temp: parseFloat(random(30, 65).toFixed(1)),
        Steps: steps,
        Contactors: Array.from({length: 12}, (_, i) => i < steps)
    };
}

function processIncomingData(data) {
    // Зберігаємо для трендів (до 10 останніх)
    dataHistory.push(data);
    if (dataHistory.length > 10) dataHistory.shift();

    // Оновлення UI
    document.getElementById('val-q').textContent = data.Q;
    document.getElementById('val-cos').textContent = data.Cos;
    document.getElementById('val-u').textContent = data.U;
    document.getElementById('val-temp').textContent = data.Temp;
    document.getElementById('val-steps').textContent = data.Steps;

    // Статуси та Сповіщення
    checkAndUpdateStatus('Q', data.Q, 'status-q');
    checkAndUpdateStatus('Cos', data.Cos, 'status-cos');
    checkAndUpdateStatus('U', data.U, 'status-u');
    checkAndUpdateStatus('Temp', data.Temp, 'status-temp');

    // Тренди
    document.getElementById('trend-q').textContent = calculateTrend(dataHistory.map(d => d.Q));
    document.getElementById('trend-u').textContent = calculateTrend(dataHistory.map(d => d.U));
    document.getElementById('trend-temp').textContent = calculateTrend(dataHistory.map(d => d.Temp));

    // Контактори
    const container = document.getElementById('contactors-container');
    container.innerHTML = '';
    data.Contactors.forEach((state, index) => {
        const div = document.createElement('div');
        div.className = `contactor ${state ? 'on' : ''}`;
        div.textContent = `K${index + 1}`;
        container.appendChild(div);
    });

    // Час та Графік
    const timeStr = data.timestamp.toLocaleTimeString('uk-UA');
    document.getElementById('last-update').textContent = `Останнє оновлення: ${timeStr}`;
    
    historyChart.data.labels.push(timeStr);
    historyChart.data.datasets[0].data.push(data.Q);
    historyChart.data.datasets[1].data.push(data.U);
    if (historyChart.data.labels.length > 15) {
        historyChart.data.labels.shift();
        historyChart.data.datasets[0].data.shift();
        historyChart.data.datasets[1].data.shift();
    }
    historyChart.update();
}

function checkAndUpdateStatus(paramKey, value, elementId) {
    const el = document.getElementById(elementId);
    const paramLimits = limits[paramKey];
    let status = 'normal';

    if (value < paramLimits.min || value > paramLimits.max) {
        status = 'critical';
    } else if (value < paramLimits.normMin || value > paramLimits.normMax) {
        status = 'warning';
    }

    const statusTexts = { 'normal': 'В нормі', 'warning': 'Відхилення', 'critical': 'Критично' };
    el.className = `status-badge status-${status}`;
    el.textContent = statusTexts[status];

    // Відправка системного сповіщення, якщо критично
    if (status === 'critical') {
        sendAlert(paramKey, value);
    }
}

function toggleTheme() { document.body.classList.toggle('dark-theme'); }

// Запуск
window.onload = () => toggleConnection();