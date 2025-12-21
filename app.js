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

// 页面加载时初始化摄像头
initCamera();
