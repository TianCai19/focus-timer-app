// 状态变量
let isRunning = false;
let totalSeconds = 0;
let timerInterval = null;
let camera = null;
let cocoModel = null;
let isModelLoading = false;

// 检测模式: 'face' 或 'phone'
let detectionMode = 'face';
let faceDetected = false;
let phoneDetected = false;

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

// 人脸检测器（延迟初始化）
let faceDetection = null;
let faceDetectionRunning = false;

function initFaceDetection() {
    if (faceDetection) return;
    
    faceDetection = new FaceDetection({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`;
        }
    });

    faceDetection.setOptions({
        model: 'short',
        minDetectionConfidence: 0.5
    });

    faceDetection.onResults(onFaceResults);
}

// 更新视觉状态
function updateVisualState(state) {
    // state: 'focused', 'not-focused', 'idle', 'phone-detected'
    document.body.className = state === 'phone-detected' ? 'not-focused' : state;
    title.className = state === 'phone-detected' ? 'not-focused' : state;
    timerDisplay.className = 'timer-display ' + (state === 'phone-detected' ? 'not-focused' : state);
    videoContainer.className = 'video-container ' + (state === 'phone-detected' ? 'not-focused' : state);
    
    if (state === 'phone-detected') {
        warningOverlay.classList.add('active');
        warningText.textContent = '📱 放下手机！';
        warningText.classList.add('show');
        statusEl.className = 'status paused';
        statusEl.textContent = '📱 检测到手机！';
    } else if (state === 'not-focused') {
        warningOverlay.classList.add('active');
        warningText.textContent = '⚠️ 请回到屏幕前';
        warningText.classList.add('show');
        statusEl.className = 'status paused';
        statusEl.textContent = detectionMode === 'face' ? '⚠️ 未检测到人脸！' : '⚠️ 未检测到手机';
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
function onFaceResults(results) {
    if (detectionMode !== 'face') return;
    
    faceDetected = results.detections && results.detections.length > 0;
    
    if (isRunning) {
        updateFocusState();
    }
}

// 统一更新专注状态
function updateFocusState() {
    if (!isRunning) return;
    
    if (detectionMode === 'face') {
        if (faceDetected) {
            updateVisualState('focused');
            stopAlertMusic();
        } else {
            updateVisualState('not-focused');
            playAlertMusic();
        }
    } else if (detectionMode === 'phone') {
        if (phoneDetected) {
            updateVisualState('phone-detected');
            playAlertMusic();
        } else {
            updateVisualState('focused');
            stopAlertMusic();
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
        await video.play();
        
        // 默认启动人脸检测模式
        startFaceDetectionMode();
    } catch (err) {
        console.error('摄像头访问失败:', err);
        statusEl.textContent = '❌ 无法访问摄像头';
        statusEl.className = 'status paused';
    }
}

// 人脸检测循环
async function faceDetectionLoop() {
    if (!faceDetectionRunning || detectionMode !== 'face') return;
    
    if (faceDetection && video.readyState >= 2) {
        await faceDetection.send({ image: video });
    }
    
    requestAnimationFrame(faceDetectionLoop);
}

// 启动人脸检测模式
function startFaceDetectionMode() {
    stopPhoneDetection();
    detectionMode = 'face';
    faceDetected = false;
    
    initFaceDetection();
    
    faceDetectionRunning = true;
    faceDetectionLoop();
    
    console.log('人脸检测模式已启动');
}

// 启动手机检测模式
async function startPhoneDetectionMode() {
    // 停止人脸检测循环
    faceDetectionRunning = false;
    
    detectionMode = 'phone';
    phoneDetected = false;
    
    const phoneStatusEl = document.getElementById('phoneStatus');
    
    // 加载模型
    if (!cocoModel) {
        if (isModelLoading) return;
        
        isModelLoading = true;
        phoneStatusEl.textContent = '加载模型中...';
        phoneStatusEl.className = 'phone-status loading';
        
        try {
            cocoModel = await cocoSsd.load();
            console.log('COCO-SSD 模型加载完成');
        } catch (err) {
            console.error('模型加载失败:', err);
            phoneStatusEl.textContent = '加载失败';
            phoneStatusEl.className = 'phone-status';
            document.getElementById('phoneDetectionToggle').checked = false;
            isModelLoading = false;
            // 回退到人脸检测
            startFaceDetectionMode();
            return;
        }
        isModelLoading = false;
    }
    
    phoneStatusEl.textContent = '检测中...';
    phoneStatusEl.className = 'phone-status ready';
    
    startPhoneDetection();
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
    let canCount = false;
    
    if (detectionMode === 'face') {
        canCount = faceDetected;
    } else if (detectionMode === 'phone') {
        canCount = !phoneDetected; // 没检测到手机时才计时
    }
    
    if (isRunning && canCount) {
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
        updateFocusState();
    } else {
        isRunning = false;
        startBtn.textContent = '继续';
        clearInterval(timerInterval);
        updateVisualState('idle');
        statusEl.textContent = '⏸️ 已暂停';
        stopAlertMusic();
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
    stopAlertMusic();
});

// 模糊切换按钮
blurBtn.addEventListener('click', () => {
    isBlurred = !isBlurred;
    video.classList.toggle('blurred', isBlurred);
    blurBtn.textContent = isBlurred ? '👁️ 显示视频' : '🙈 模糊视频';
});

// 页面加载时初始化摄像头
initCamera();

// ========== 提醒音乐功能 ==========
const selectAudioBtn = document.getElementById('selectAudioBtn');
const audioFileInput = document.getElementById('audioFileInput');
const audioNameEl = document.getElementById('audioName');

let alertAudio = new Audio('59323269-1-192.mp3'); // 默认音频
alertAudio.loop = true;
let isAlertPlaying = false;

// 更新显示
audioNameEl.textContent = '默认音乐';
audioNameEl.className = 'audio-name active';

selectAudioBtn.addEventListener('click', () => {
    audioFileInput.click();
});

audioFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        // 释放之前的音频
        if (alertAudio) {
            alertAudio.pause();
            if (alertAudio.src.startsWith('blob:')) {
                URL.revokeObjectURL(alertAudio.src);
            }
        }
        
        alertAudio = new Audio(URL.createObjectURL(file));
        alertAudio.loop = true;
        audioNameEl.textContent = file.name;
        audioNameEl.className = 'audio-name active';
        console.log('已选择音乐:', file.name);
    }
});

// 播放提醒音乐
function playAlertMusic() {
    if (alertAudio && !isAlertPlaying) {
        alertAudio.play().catch(err => console.log('音频播放失败:', err));
        isAlertPlaying = true;
    }
}

// 停止提醒音乐
function stopAlertMusic() {
    if (alertAudio && isAlertPlaying) {
        alertAudio.pause();
        alertAudio.currentTime = 0;
        isAlertPlaying = false;
    }
}

// ========== 手机检测功能 ==========
const phoneDetectionToggle = document.getElementById('phoneDetectionToggle');
const phoneStatusEl = document.getElementById('phoneStatus');

let phoneDetectionInterval = null;

function startPhoneDetection() {
    if (phoneDetectionInterval) return;
    
    phoneDetectionInterval = setInterval(async () => {
        if (detectionMode !== 'phone' || !cocoModel) return;
        
        try {
            const predictions = await cocoModel.detect(video);
            const hasPhone = predictions.some(p => 
                p.class === 'cell phone' && p.score > 0.5
            );
            
            if (hasPhone !== phoneDetected) {
                phoneDetected = hasPhone;
                if (phoneDetected) {
                    phoneStatusEl.textContent = '检测到手机!';
                    phoneStatusEl.className = 'phone-status detected';
                } else {
                    phoneStatusEl.textContent = '检测中...';
                    phoneStatusEl.className = 'phone-status ready';
                }
                if (isRunning) {
                    updateFocusState();
                }
            }
        } catch (err) {
            console.error('手机检测错误:', err);
        }
    }, 500);
}

function stopPhoneDetection() {
    if (phoneDetectionInterval) {
        clearInterval(phoneDetectionInterval);
        phoneDetectionInterval = null;
    }
    phoneDetected = false;
    phoneStatusEl.textContent = '';
    phoneStatusEl.className = 'phone-status';
}

// 手机检测开关（模式切换）
phoneDetectionToggle.addEventListener('change', (e) => {
    if (e.target.checked) {
        // 切换到手机检测模式
        startPhoneDetectionMode();
    } else {
        // 切换回人脸检测模式
        startFaceDetectionMode();
    }
    
    if (isRunning) {
        updateFocusState();
    }
});


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
