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
const immersiveHud = document.getElementById('immersiveHud');
const hudToggleBtn = document.getElementById('hudToggleBtn');
const immersiveBtn = document.getElementById('immersiveBtn');
const quitImmersiveBtn = document.getElementById('quitImmersiveBtn');
let isImmersive = false;
const motivationTextEl = document.getElementById('motivationText');
let isBlurred = true;

// 激励语料库（50 条）
const MOTIVATION_PHRASES = [
    '把注意力放在下一分钟就好。',
    '你正在变得更强大。',
    '先开始，之后再变好。',
    '专注不是压抑，而是选择。',
    '每一次回到当下，都是胜利。',
    '今天的你，比昨天更自律一点。',
    '别急，稳住节奏。',
    '只做一件事，就已经很了不起。',
    '你能把这段时间守住。',
    '把“想做”变成“正在做”。',
    '现在做的，会在未来回报你。',
    '慢一点，但不停。',
    '把分心当作提醒：回到屏幕前。',
    '你在训练自己的注意力肌肉。',
    '专注是送给自己的礼物。',
    '你不需要完美，只需要持续。',
    '每 1 分钟都算数。',
    '保持清醒，保持简单。',
    '做难事时，先把呼吸放慢。',
    '此刻专注，未来更自由。',
    '把手机放下，把目标拿起。',
    '下一步最重要。',
    '把注意力交给任务。',
    '你比分心更有力量。',
    '今天的成果来自现在的坚持。',
    '一次只做一件事。',
    '你已经开始了，继续。',
    '现在的专注，正在累积。',
    '不必焦虑，把手头这一步做好。',
    '少想一点，多做一点。',
    '能量在流动，别停。',
    '把目标拆小，马上行动。',
    '你配得上这段高质量时间。',
    '把注意力放回眼前。',
    '你正在建立稳定的节奏。',
    '先完成，再优化。',
    '在这段时间里，你只需要专注。',
    '今天的努力，会被时间看见。',
    '你很接近了，再坚持一会儿。',
    '把干扰关在门外。',
    '稳住，你做得到。',
    '深呼吸，回到任务。',
    '专注让你更快结束。',
    '这不是苦撑，是成长。',
    '把注意力当作资产来管理。',
    '把分心视作噪音，忽略它。',
    '此刻专注，就是最好的自爱。',
    '你正在赢回自己的时间。',
    '让今天的你为明天铺路。',
    '别担心进度，先把这一段守住。'
];

let currentVisualState = 'idle';
let lastMotivation = '';
let motivationInterval = null;

const STATE_CLASSES = ['focused', 'not-focused', 'idle'];

function applyStateClass(el, stateClass, requiredBaseClass) {
    if (!el) return;
    if (requiredBaseClass) el.classList.add(requiredBaseClass);
    for (const c of STATE_CLASSES) el.classList.remove(c);
    el.classList.add(stateClass);
}

function setImmersive(active) {
    document.body.classList.toggle('immersive', active);
    if (immersiveHud) immersiveHud.setAttribute('aria-hidden', active ? 'false' : 'true');
}

function pickMotivation() {
    if (!MOTIVATION_PHRASES.length) return '';
    let next = lastMotivation;
    for (let i = 0; i < 5 && next === lastMotivation; i++) {
        next = MOTIVATION_PHRASES[Math.floor(Math.random() * MOTIVATION_PHRASES.length)];
    }
    lastMotivation = next;
    return next;
}

function setMotivation(text, subtle = false) {
    if (!motivationTextEl) return;
    motivationTextEl.textContent = text || '';
    motivationTextEl.classList.toggle('subtle', subtle);
}

function syncHudControls() {
    if (!hudToggleBtn) return;
    // 复用 startBtn 当前文本来判断按钮显示
    const t = startBtn?.textContent || '';
    if (t.includes('暂停')) hudToggleBtn.textContent = '⏸️';
    else if (t.includes('继续')) hudToggleBtn.textContent = '▶️';
    else hudToggleBtn.textContent = '▶️';
}

function startMotivationLoop() {
    stopMotivationLoop();
    motivationInterval = setInterval(() => {
        if (!isRunning) return;
        if (currentVisualState === 'focused') {
            setMotivation(pickMotivation(), false);
        }
    }, 45000);
}

function stopMotivationLoop() {
    if (motivationInterval) {
        clearInterval(motivationInterval);
        motivationInterval = null;
    }
}

// HUD 按钮绑定（通过复用原按钮逻辑保证一致）
if (hudToggleBtn) {
    hudToggleBtn.addEventListener('click', () => {
        startBtn?.click();
    });
}


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
    const normalized = state === 'phone-detected' ? 'not-focused' : state;
    applyStateClass(document.body, normalized);
    applyStateClass(title, normalized);
    applyStateClass(timerDisplay, normalized, 'timer-display');
    applyStateClass(videoContainer, normalized, 'video-container');

    // 进入专注时自动启用沉浸模式；暂停/重置会关闭
    
    if (state === 'phone-detected') {
        warningOverlay.classList.add('active');
        warningText.textContent = '📱 放下手机！';
        warningText.classList.add('show');
        statusEl.className = 'status paused';
        statusEl.textContent = '📱 检测到手机！';
                if (currentVisualState !== state) setMotivation('把手机放下，注意力留给你正在做的事。', false);
    } else if (state === 'not-focused') {
        warningOverlay.classList.add('active');
        warningText.textContent = '⚠️ 请回到屏幕前';
        warningText.classList.add('show');
        statusEl.className = 'status paused';
        statusEl.textContent = detectionMode === 'face' ? '⚠️ 未检测到人脸！' : '⚠️ 未检测到手机';
                if (currentVisualState !== state) setMotivation('没关系，回到屏幕前，继续专注。', false);
    } else if (state === 'focused') {
        warningOverlay.classList.remove('active');
        warningText.classList.remove('show');
        statusEl.className = 'status active';
        statusEl.textContent = '✨ 专注中...';
                if (currentVisualState !== state) setMotivation(pickMotivation(), false);
    } else {
        warningOverlay.classList.remove('active');
        warningText.classList.remove('show');
        statusEl.className = 'status idle-status';
        statusEl.textContent = '等待开始';
                if (currentVisualState !== state) setMotivation('准备好就开始一段专注。', true);
    }

    currentVisualState = state;
    syncHudControls();
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
            video: {
                facingMode: 'user',
                width: { ideal: 480 },
                height: { ideal: 360 }
            }
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
        startMotivationLoop();
        updateFocusState();
    } else {
        isRunning = false;
        startBtn.textContent = '继续';
        clearInterval(timerInterval);
        updateVisualState('idle');
        statusEl.textContent = '⏸️ 已暂停';
                setMotivation('暂停一下也没关系，准备好就继续。', true);
        stopMotivationLoop();
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
    stopMotivationLoop();
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

// 初始化激励文案
setMotivation('准备好就开始一段专注。', true);

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

if (immersiveBtn) {
    immersiveBtn.addEventListener('click', () => {
        isImmersive = true;
        setImmersive(true);
    });
}
if (quitImmersiveBtn) {
    quitImmersiveBtn.addEventListener('click', () => {
        isImmersive = false;
        setImmersive(false);
    });
}
