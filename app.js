// 状态变量
let isRunning = false;
let totalSeconds = 0;
let timerInterval = null;
let faceDetected = false;
let camera = null;

// DOM 元素
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const timerDisplay = document.getElementById('timer');
const statusEl = document.getElementById('status');
const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');
const title = document.getElementById('title');
const videoContainer = document.getElementById('videoContainer');
const warningOverlay = document.getElementById('warningOverlay');
const warningText = document.getElementById('warningText');
const blurBtn = document.getElementById('blurBtn');
let isBlurred = false;

// 初始化人脸检测
const faceDetection = new FaceDetection({
    locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`;
    }
});

faceDetection.setOptions({
    model: 'short',
    minDetectionConfidence: 0.5
});

faceDetection.onResults(onResults);

// 更新视觉状态
function updateVisualState(state) {
    // state: 'focused', 'not-focused', 'idle'
    document.body.className = state;
    title.className = state;
    timerDisplay.className = 'timer-display ' + state;
    videoContainer.className = 'video-container ' + state;
    
    if (state === 'not-focused') {
        warningOverlay.classList.add('active');
        warningText.classList.add('show');
        statusEl.className = 'status paused';
        statusEl.textContent = '⚠️ 未检测到人脸！';
    } else if (state === 'focused') {
        warningOverlay.classList.remove('active');
        warningText.classList.remove('show');
        statusEl.className = 'status active';
        statusEl.textContent = '✨ 专注中...';
    } else {
        warningOverlay.classList.remove('active');
        warningText.classList.remove('show');
        statusEl.className = 'status idle-status';
        statusEl.textContent = '等待开始';
    }
}

// 人脸检测结果处理
function onResults(results) {
    faceDetected = results.detections && results.detections.length > 0;
    
    if (isRunning) {
        if (faceDetected) {
            updateVisualState('focused');
        } else {
            updateVisualState('not-focused');
        }
    }
}

// 初始化摄像头
async function initCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 480, height: 360, facingMode: 'user' }
        });
        video.srcObject = stream;
        
        camera = new Camera(video, {
            onFrame: async () => {
                await faceDetection.send({ image: video });
            },
            width: 480,
            height: 360
        });
        camera.start();
    } catch (err) {
        console.error('摄像头访问失败:', err);
        statusEl.textContent = '❌ 无法访问摄像头';
        statusEl.className = 'status paused';
    }
}

// 格式化时间显示
function formatTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return [hrs, mins, secs]
        .map(v => v.toString().padStart(2, '0'))
        .join(':');
}

// 更新计时器
function updateTimer() {
    if (isRunning && faceDetected) {
        totalSeconds++;
        timerDisplay.textContent = formatTime(totalSeconds);
    }
}

// 开始/暂停按钮
startBtn.addEventListener('click', () => {
    if (!isRunning) {
        isRunning = true;
        startBtn.textContent = '暂停';
        timerInterval = setInterval(updateTimer, 1000);
        if (faceDetected) {
            updateVisualState('focused');
        } else {
            updateVisualState('not-focused');
        }
    } else {
        isRunning = false;
        startBtn.textContent = '继续';
        clearInterval(timerInterval);
        updateVisualState('idle');
        statusEl.textContent = '⏸️ 已暂停';
    }
});

// 重置按钮
resetBtn.addEventListener('click', () => {
    isRunning = false;
    totalSeconds = 0;
    clearInterval(timerInterval);
    timerDisplay.textContent = '00:00:00';
    startBtn.textContent = '开始专注';
    updateVisualState('idle');
});

// 模糊切换按钮
blurBtn.addEventListener('click', () => {
    isBlurred = !isBlurred;
    video.classList.toggle('blurred', isBlurred);
    blurBtn.textContent = isBlurred ? '👁️ 显示视频' : '🙈 模糊视频';
});

// 页面加载时初始化摄像头
initCamera();

// ========== 打榜功能 ==========
const saveRecordBtn = document.getElementById('saveRecordBtn');
const nameModal = document.getElementById('nameModal');
const nameInput = document.getElementById('nameInput');
const confirmSaveBtn = document.getElementById('confirmSaveBtn');
const cancelSaveBtn = document.getElementById('cancelSaveBtn');
const leaderboardList = document.getElementById('leaderboardList');

// 从 localStorage 加载排行榜数据
function loadLeaderboard() {
    const data = localStorage.getItem('focusLeaderboard');
    return data ? JSON.parse(data) : [];
}

// 保存排行榜数据到 localStorage
function saveLeaderboard(records) {
    localStorage.setItem('focusLeaderboard', JSON.stringify(records));
}

// 渲染排行榜
function renderLeaderboard() {
    const records = loadLeaderboard();
    
    if (records.length === 0) {
        leaderboardList.innerHTML = '<li class="empty-list">暂无记录，开始专注并保存你的成绩吧！</li>';
        return;
    }
    
    // 按时长降序排序
    records.sort((a, b) => b.seconds - a.seconds);
    
    leaderboardList.innerHTML = records.map((record, index) => {
        let rankClass = '';
        let rankIcon = index + 1;
        if (index === 0) { rankClass = 'gold'; rankIcon = '🥇'; }
        else if (index === 1) { rankClass = 'silver'; rankIcon = '🥈'; }
        else if (index === 2) { rankClass = 'bronze'; rankIcon = '🥉'; }
        
        return `
            <li class="leaderboard-item" data-id="${record.id}">
                <span class="rank ${rankClass}">${rankIcon}</span>
                <div class="record-info">
                    <div class="record-name">${escapeHtml(record.name)}</div>
                    <div class="record-date">${record.date}</div>
                </div>
                <span class="record-time">${formatTime(record.seconds)}</span>
                <button class="delete-btn" onclick="deleteRecord('${record.id}')">🗑️</button>
            </li>
        `;
    }).join('');
}

// 防止 XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 生成唯一 ID
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// 保存记录
function saveRecord(name) {
    if (totalSeconds === 0) {
        alert('还没有专注时长，先开始专注吧！');
        return;
    }
    
    const records = loadLeaderboard();
    const newRecord = {
        id: generateId(),
        name: name.trim() || '匿名用户',
        seconds: totalSeconds,
        date: new Date().toLocaleString('zh-CN')
    };
    
    records.push(newRecord);
    saveLeaderboard(records);
    renderLeaderboard();
}

// 删除记录
function deleteRecord(id) {
    if (!confirm('确定要删除这条记录吗？')) return;
    
    let records = loadLeaderboard();
    records = records.filter(r => r.id !== id);
    saveLeaderboard(records);
    renderLeaderboard();
}

// 打开保存弹窗
saveRecordBtn.addEventListener('click', () => {
    if (totalSeconds === 0) {
        alert('还没有专注时长，先开始专注吧！');
        return;
    }
    nameModal.classList.add('show');
    nameInput.focus();
});

// 确认保存
confirmSaveBtn.addEventListener('click', () => {
    saveRecord(nameInput.value);
    nameModal.classList.remove('show');
    nameInput.value = '';
});

// 取消保存
cancelSaveBtn.addEventListener('click', () => {
    nameModal.classList.remove('show');
    nameInput.value = '';
});

// 回车键保存
nameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        confirmSaveBtn.click();
    }
});

// 点击弹窗外部关闭
nameModal.addEventListener('click', (e) => {
    if (e.target === nameModal) {
        nameModal.classList.remove('show');
        nameInput.value = '';
    }
});

// 页面加载时渲染排行榜
renderLeaderboard();
