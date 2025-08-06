// 캔버스 및 컨텍스트 설정
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// 애플리케이션 상태
const state = {
    nodes: [],
    path: [],
    history: [],
    isAddingNode: false,
    isSettingPath: false,
    backgroundImage: null,
    isAnimating: false,
    animationFrameId: null,
    animationStyle: {
        fillColor: '#00ff00',
        strokeColor: '#000000',
        size: 8,
        glow: false,
        shadow: false,
    },
    animationSettings: {
        duration: 3,
        multiDot: {
            enabled: false,
            interval: 200, // ms
            dots: [], // { progress: number }
            lastSpawnTime: 0,
        }
    },
    camera: { x: 0, y: 0, zoom: 1 },
    isPanning: false,
    lastPanPosition: { x: 0, y: 0 },
    spacebarPressed: false,
};

// --- DOM 요소 ---
const addNodeButton = document.getElementById('add-node');
const setPathButton = document.getElementById('set-path');
const startAnimationButton = document.getElementById('start-animation');
const stopAnimationButton = document.getElementById('stop-animation');
const saveGifButton = document.getElementById('save-gif');
const uploadImageInput = document.getElementById('upload-image');
const loadingOverlay = document.getElementById('loading-overlay');
// 스타일 사이드바
const fillColorControl = document.getElementById('fill-color-control');
const strokeColorControl = document.getElementById('stroke-color-control');
const sizeControl = document.getElementById('size-control');
const sizeValue = document.getElementById('size-value');
const glowEffectCheckbox = document.getElementById('glow-effect');
const shadowEffectCheckbox = document.getElementById('shadow-effect');
// 설정 사이드바
const durationControl = document.getElementById('duration-control');
const durationValue = document.getElementById('duration-value');
const multiDotCheckbox = document.getElementById('multi-dot-effect');
const multiDotIntervalContainer = document.getElementById('multi-dot-interval-container');
const multiDotIntervalControl = document.getElementById('multi-dot-interval');
const multiDotIntervalValue = document.getElementById('multi-dot-interval-value');


// --- 이벤트 리스너 ---

addNodeButton.addEventListener('click', () => {
    stopAnimation();
    state.isAddingNode = true;
    state.isSettingPath = false;
    canvas.style.cursor = 'crosshair';
});

setPathButton.addEventListener('click', () => {
    stopAnimation();
    state.isAddingNode = false;
    state.isSettingPath = true;
    state.path = [];
    canvas.style.cursor = 'pointer';
});

startAnimationButton.addEventListener('click', () => {
    if (state.path.length < 2) {
        alert("경로를 먼저 설정해주세요.");
        return;
    }
    startAnimation();
});

stopAnimationButton.addEventListener('click', stopAnimation);
saveGifButton.addEventListener('click', generateGif);

uploadImageInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                state.backgroundImage = img;
                state.camera = { x: 0, y: 0, zoom: 1 };
                canvas.width = img.width;
                canvas.height = img.height;
                draw();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
});

// --- 캔버스 이벤트 (패닝 및 줌) ---

canvas.addEventListener('mousedown', (e) => {
    if (e.button === 1 || (e.button === 0 && state.spacebarPressed)) {
        state.isPanning = true;
        state.lastPanPosition = { x: e.clientX, y: e.clientY };
        canvas.style.cursor = 'grabbing';
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (state.isPanning) {
        const dx = e.clientX - state.lastPanPosition.x;
        const dy = e.clientY - state.lastPanPosition.y;
        state.camera.x += dx;
        state.camera.y += dy;
        state.lastPanPosition = { x: e.clientX, y: e.clientY };
        draw();
    }
});

canvas.addEventListener('mouseup', () => {
    state.isPanning = false;
    updateCursor();
});

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomIntensity = 0.1;
    const wheel = e.deltaY < 0 ? 1 : -1;
    const zoomFactor = Math.exp(wheel * zoomIntensity);
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    state.camera.x = (state.camera.x - mouseX) * zoomFactor + mouseX;
    state.camera.y = (state.camera.y - mouseY) * zoomFactor + mouseY;
    state.camera.zoom *= zoomFactor;
    draw();
});

canvas.addEventListener('click', (event) => {
    if (state.spacebarPressed || event.button !== 0) return;
    const worldPos = getTransformedPoint(event.clientX, event.clientY);
    if (state.isAddingNode) {
        addNode(worldPos.x, worldPos.y);
    } else if (state.isSettingPath) {
        const clickedNode = getNodeAt(worldPos.x, worldPos.y);
        if (clickedNode) addNodeToPath(clickedNode);
    }
});

// --- 키보드 이벤트 ---

document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
        event.preventDefault();
        undo();
    }
    if (event.code === 'Space' && !state.spacebarPressed) {
        event.preventDefault();
        state.spacebarPressed = true;
        updateCursor();
    }
});

document.addEventListener('keyup', (event) => {
    if (event.code === 'Space') {
        state.spacebarPressed = false;
        updateCursor();
    }
});

// --- UI 업데이트 함수 ---

function updateCursor() {
    if (state.isPanning) canvas.style.cursor = 'grabbing';
    else if (state.spacebarPressed) canvas.style.cursor = 'grab';
    else if (state.isAddingNode) canvas.style.cursor = 'crosshair';
    else canvas.style.cursor = 'default';
}

// --- 컨트롤러 이벤트 리스너 ---

durationControl.addEventListener('input', (e) => {
    state.animationSettings.duration = parseFloat(e.target.value);
    durationValue.textContent = `${state.animationSettings.duration.toFixed(1)}초`;
});

fillColorControl.addEventListener('input', (e) => { state.animationStyle.fillColor = e.target.value; if(state.isAnimating) draw(); });
strokeColorControl.addEventListener('input', (e) => { state.animationStyle.strokeColor = e.target.value; if(state.isAnimating) draw(); });
sizeControl.addEventListener('input', (e) => { state.animationStyle.size = parseInt(e.target.value, 10); sizeValue.textContent = state.animationStyle.size; if(state.isAnimating) draw(); });

glowEffectCheckbox.addEventListener('change', (e) => {
    state.animationStyle.glow = e.target.checked;
    if (state.animationStyle.glow && state.animationStyle.shadow) {
        shadowEffectCheckbox.checked = false;
        state.animationStyle.shadow = false;
    }
    draw();
});

shadowEffectCheckbox.addEventListener('change', (e) => {
    state.animationStyle.shadow = e.target.checked;
    if (state.animationStyle.shadow && state.animationStyle.glow) {
        glowEffectCheckbox.checked = false;
        state.animationStyle.glow = false;
    }
    draw();
});

multiDotCheckbox.addEventListener('change', (e) => {
    state.animationSettings.multiDot.enabled = e.target.checked;
    multiDotIntervalContainer.classList.toggle('hidden', !e.target.checked);
    // 애니메이션 모드를 변경하면, 현재 애니메이션 상태를 초기화
    stopAnimation();
    startAnimation();
});

multiDotIntervalControl.addEventListener('input', (e) => {
    state.animationSettings.multiDot.interval = parseInt(e.target.value, 10);
    multiDotIntervalValue.textContent = `${state.animationSettings.multiDot.interval}ms`;
});

// --- 핵심 기능 함수 ---

function getTransformedPoint(x, y) {
    const rect = canvas.getBoundingClientRect();
    const screenX = x - rect.left;
    const screenY = y - rect.top;
    return { x: (screenX - state.camera.x) / state.camera.zoom, y: (screenY - state.camera.y) / state.camera.zoom };
}

function saveState() {
    const stateToSave = { nodes: JSON.parse(JSON.stringify(state.nodes)), path: state.path.map(node => node.id) };
    state.history.push(stateToSave);
}

function undo() {
    if (state.history.length === 0) return;
    const prevState = state.history.pop();
    state.nodes = prevState.nodes;
    state.path = prevState.path.map(id => state.nodes.find(n => n.id === id)).filter(n => n);
    draw();
}

function addNode(x, y) {
    saveState();
    const newNode = { id: state.nodes.length + 1, x, y, radius: 15 };
    state.nodes.push(newNode);
    draw();
}

function addNodeToPath(node) {
    if (!state.path.includes(node)) { saveState(); state.path.push(node); draw(); }
}

function getNodeAt(x, y) {
    for (let i = state.nodes.length - 1; i >= 0; i--) {
        const node = state.nodes[i];
        const distance = Math.sqrt((node.x - x) ** 2 + (node.y - y) ** 2);
        if (distance < node.radius) return node;
    }
    return null;
}

let lastTimestamp = 0;
function startAnimation() {
    if (state.isAnimating) return;
    state.isAnimating = true;
    // 애니메이션 시작 시 점 배열 초기화
    state.animationSettings.multiDot.dots = state.animationSettings.multiDot.enabled ? [] : [{ progress: 0 }];
    state.animationSettings.multiDot.lastSpawnTime = 0;
    lastTimestamp = 0;
    requestAnimationFrame(animate);
}

function stopAnimation() {
    if (!state.isAnimating) return;
    state.isAnimating = false;
    cancelAnimationFrame(state.animationFrameId);
    draw();
}

function animate(timestamp) {
    if (!state.isAnimating) return; // 중지되었으면 바로 종료
    if (!lastTimestamp) lastTimestamp = timestamp;
    const deltaTime = timestamp - lastTimestamp;
    lastTimestamp = timestamp;
    const settings = state.animationSettings;
    const progressIncrement = deltaTime / (settings.duration * 1000);

    if (settings.multiDot.enabled) {
        // 새로운 점 생성
        settings.multiDot.lastSpawnTime += deltaTime;
        if (settings.multiDot.lastSpawnTime > settings.multiDot.interval) {
            settings.multiDot.dots.push({ progress: 0 });
            settings.multiDot.lastSpawnTime = 0;
        }
        // 모든 점 업데이트 및 제거
        settings.multiDot.dots.forEach(dot => dot.progress += progressIncrement);
        settings.multiDot.dots = settings.multiDot.dots.filter(dot => dot.progress <= 1);
    } else {
        // 단일 점 업데이트
        if (settings.multiDot.dots.length === 0) {
             settings.multiDot.dots.push({ progress: 0 });
        }
        let currentProgress = settings.multiDot.dots[0].progress;
        currentProgress = (currentProgress + progressIncrement) % 1;
        settings.multiDot.dots[0].progress = currentProgress;
    }

    draw();
    state.animationFrameId = requestAnimationFrame(animate);
}

function draw() {
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(state.camera.x, state.camera.y);
    ctx.scale(state.camera.zoom, state.camera.zoom);

    if (state.backgroundImage) ctx.drawImage(state.backgroundImage, 0, 0, canvas.width, canvas.height);
    drawPath();
    drawNodes();
    if (state.isAnimating) {
        state.animationSettings.multiDot.dots.forEach(dot => {
            drawAnimatedCircle(dot.progress);
        });
    }
    
    ctx.restore();
}

function drawNodes() {
    state.nodes.forEach(node => {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.id, node.x, node.y);
    });
}

function drawPath() {
    if (state.path.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(state.path[0].x, state.path[0].y);
    for (let i = 1; i < state.path.length; i++) ctx.lineTo(state.path[i].x, state.path[i].y);
    ctx.strokeStyle = 'blue';
    ctx.lineWidth = 3 / state.camera.zoom;
    ctx.stroke();
}

function drawAnimatedCircle(progress) {
    if (state.path.length < 2) return;
    const { size, fillColor, strokeColor, glow, shadow } = state.animationStyle;
    const scaledSize = size / state.camera.zoom;
    const totalPathLength = getPathLength();
    const currentPositionOnPath = totalPathLength * progress;
    let accumulatedLength = 0;

    for (let i = 0; i < state.path.length - 1; i++) {
        const startNode = state.path[i];
        const endNode = state.path[i + 1];
        const segmentLength = Math.sqrt((endNode.x - startNode.x) ** 2 + (endNode.y - startNode.y) ** 2);
        if (accumulatedLength + segmentLength >= currentPositionOnPath) {
            const ratio = (currentPositionOnPath - accumulatedLength) / segmentLength;
            const x = startNode.x + (endNode.x - startNode.x) * ratio;
            const y = startNode.y + (endNode.y - startNode.y) * ratio;
            ctx.save();
            if (shadow) {
                ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                ctx.shadowBlur = 10 / state.camera.zoom;
                ctx.shadowOffsetX = 5 / state.camera.zoom;
                ctx.shadowOffsetY = 5 / state.camera.zoom;
            } else if (glow) {
                ctx.shadowColor = fillColor;
                ctx.shadowBlur = 20 / state.camera.zoom;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
            }
            ctx.beginPath();
            ctx.arc(x, y, scaledSize, 0, 2 * Math.PI);
            ctx.fillStyle = fillColor;
            ctx.fill();
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 1 / state.camera.zoom;
            ctx.stroke();
            ctx.restore();
            break;
        }
        accumulatedLength += segmentLength;
    }
}

function getPathLength() {
    let totalLength = 0;
    for (let i = 0; i < state.path.length - 1; i++) {
        const startNode = state.path[i];
        const endNode = state.path[i + 1];
        totalLength += Math.sqrt((endNode.x - startNode.x) ** 2 + (endNode.y - startNode.y) ** 2);
    }
    return totalLength;
}

function generateGif() {
    if (state.path.length < 2) {
        alert("GIF를 만들려면 먼저 경로를 설정해야 합니다.");
        return;
    }
    stopAnimation();
    saveGifButton.disabled = true;
    loadingOverlay.classList.remove('hidden');
    void loadingOverlay.offsetHeight;

    setTimeout(() => {
        const gif = new GIF({ workers: 2, quality: 10, width: canvas.width, height: canvas.height, workerScript: 'gif.worker.js' });
        const fps = 30;
        const totalFrames = state.animationSettings.duration * fps;
        const frameDelay = 1000 / fps;

        const drawForGif = (progress) => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (state.backgroundImage) ctx.drawImage(state.backgroundImage, 0, 0, canvas.width, canvas.height);
            
            if (state.animationSettings.multiDot.enabled) {
                const intervalSeconds = state.animationSettings.multiDot.interval / 1000;
                const numDots = Math.floor(state.animationSettings.duration / intervalSeconds);
                for (let i = 0; i < numDots; i++) {
                    const dotProgress = (progress - (i * intervalSeconds / state.animationSettings.duration) + 1) % 1;
                    drawAnimatedCircle(dotProgress);
                }
            } else {
                drawAnimatedCircle(progress);
            }
        };

        for (let i = 0; i < totalFrames; i++) {
            drawForGif(i / totalFrames);
            gif.addFrame(ctx, { copy: true, delay: frameDelay });
        }

        gif.on('finished', function (blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'flowloop-animation.gif';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            saveGifButton.disabled = false;
            loadingOverlay.classList.add('hidden');
            draw();
        });

        gif.render();
    }, 0);
}

function init() {
    draw();
    saveState();
}

init();