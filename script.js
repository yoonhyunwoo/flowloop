// 캔버스 및 컨텍스트 설정
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// 마우스 위치를 추적하는 변수 추가
let lastMousePosition = { x: 0, y: 0 };

const gridSizeControl = document.getElementById('grid-size-control');
const gridSizeValue = document.getElementById('grid-size-value');
const showGridCheckbox = document.getElementById('show-grid-checkbox');
const snapToGridCheckbox = document.getElementById('snap-to-grid-checkbox');



// 그리드 관련 이벤트 리스너
if (gridSizeControl) {
    gridSizeControl.addEventListener('input', (e) => {
        state.gridSize = parseInt(e.target.value);
        gridSizeValue.textContent = `${e.target.value}px`;
        draw();
    });
}

if (showGridCheckbox) {
    showGridCheckbox.addEventListener('change', (e) => {
        state.showGrid = e.target.checked;
        draw();
    });
}

if (snapToGridCheckbox) {
    snapToGridCheckbox.addEventListener('change', (e) => {
        state.snapToGrid = e.target.checked;
    });
}

// 애플리케이션 상태
const state = {
    nodes: [],
    path: [],
    history: [],
    currentMode: 'select',
    backgroundImage: null,
    isAnimating: false,
    animationFrameId: null,
    animationStyle: { fillColor: '#00ff00', strokeColor: '#000000', size: 8, glow: false, shadow: false },
    animationSettings: { duration: 3, multiDot: { enabled: false, interval: 200, dots: [], lastSpawnTime: 0 } },
    camera: { x: 0, y: 0, zoom: 1 },
    isPanning: false,
    lastPanPosition: { x: 0, y: 0 },
    spacebarPressed: false,
    draggedNode: null,
    dragOffset: { x: 0, y: 0 },
    // 그리드 관련 속성 추가
    gridSize: 20,
    snapToGrid: false,
    showGrid: false,
    hoveredNode: null,
};

// --- DOM 요소 ---
const selectModeButton = document.getElementById('select-mode');
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

// --- 모드 전환 ---
function setMode(mode) {
    state.currentMode = mode;
    // 모든 버튼에서 active 클래스 제거
    selectModeButton.classList.remove('active');
    addNodeButton.classList.remove('active');
    setPathButton.classList.remove('active');
    // 현재 모드 버튼에 active 클래스 추가
    if (mode === 'select') selectModeButton.classList.add('active');
    else if (mode === 'addNode') addNodeButton.classList.add('active');
    else if (mode === 'setPath') setPathButton.classList.add('active');
    
    // 모드 변경 후 커서 업데이트
    updateCursor();
}

// --- 이벤트 리스너 ---
selectModeButton.addEventListener('click', () => setMode('select'));
addNodeButton.addEventListener('click', () => setMode('addNode'));
setPathButton.addEventListener('click', () => {
    setMode('setPath');
    state.path = [];
    draw();
});

startAnimationButton.addEventListener('click', () => {
    if (state.path.length < 2) { alert("경로를 먼저 설정해주세요."); return; }
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

// --- 캔버스 이벤트 ---

canvas.addEventListener('mousedown', (e) => {
    const worldPos = getTransformedPoint(e.clientX, e.clientY);

    if (e.button === 1 || (e.button === 0 && state.spacebarPressed)) {
        state.isPanning = true;
        state.lastPanPosition = { x: e.clientX, y: e.clientY };
        canvas.style.cursor = 'grabbing';
        return;
    }

    if (e.button !== 0) return;

    if (state.currentMode === 'select') {
        const clickedNode = getNodeAt(worldPos.x, worldPos.y);
        if (clickedNode) {
            state.draggedNode = clickedNode;
            state.dragOffset = { x: worldPos.x - clickedNode.x, y: worldPos.y - clickedNode.y };
            saveState(); // 드래그 시작 전 상태 저장
        }
    }
});

canvas.addEventListener('mousemove', (e) => {
    lastMousePosition = { x: e.clientX, y: e.clientY };
    const worldPos = getTransformedPoint(e.clientX, e.clientY);
    
    // Check for hovered node and update the state
    if (state.currentMode === 'select' || state.currentMode === 'setPath') {
        state.hoveredNode = getNodeAt(worldPos.x, worldPos.y);
        draw(); // Redraw to show the highlight
    } else {
        state.hoveredNode = null;
    }    
    if (state.isPanning) {
        const dx = e.clientX - state.lastPanPosition.x;
        const dy = e.clientY - state.lastPanPosition.y;
        state.camera.x += dx;
        state.camera.y += dy;
        state.lastPanPosition = { x: e.clientX, y: e.clientY };
        draw();
    } else if (state.draggedNode) {
        const worldPos = getTransformedPoint(e.clientX, e.clientY);
        // 드래그 시에도 그리드에 스냅 적용
        state.draggedNode.x = snapToGrid(worldPos.x - state.dragOffset.x);
        state.draggedNode.y = snapToGrid(worldPos.y - state.dragOffset.y);
        draw();
    } else {
        updateCursor();
    }
});

canvas.addEventListener('mouseup', () => {
    state.isPanning = false;
    state.draggedNode = null;
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
    if (state.currentMode === 'addNode') {
        addNode(worldPos.x, worldPos.y);
    } else if (state.currentMode === 'setPath') {
        const clickedNode = getNodeAt(worldPos.x, worldPos.y);
        if (clickedNode) addNodeToPath(clickedNode);
    }
});

// --- 추가: 캔버스에서 마우스가 나갔을 때 처리 ---
canvas.addEventListener('mouseleave', () => {
    // 드래그나 패닝 중이 아닐 때만 기본 커서로 변경
    if (!state.isPanning && !state.draggedNode) {
        canvas.style.cursor = 'default';
    }
});

// --- 추가: 캔버스에 마우스가 들어왔을 때 처리 ---
canvas.addEventListener('mouseenter', (e) => {
    lastMousePosition = { x: e.clientX, y: e.clientY };
    updateCursor();
});

function drawGrid() {
    if (!state.showGrid) return;
    
    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1 / state.camera.zoom;
    
    // 현재 뷰포트 내의 그리드 선 계산
    const startX = Math.floor((-state.camera.x / state.camera.zoom) / state.gridSize) * state.gridSize;
    const endX = Math.ceil(((canvas.width - state.camera.x) / state.camera.zoom) / state.gridSize) * state.gridSize;
    const startY = Math.floor((-state.camera.y / state.camera.zoom) / state.gridSize) * state.gridSize;
    const endY = Math.ceil(((canvas.height - state.camera.y) / state.camera.zoom) / state.gridSize) * state.gridSize;
    
    // 수직선 그리기
    for (let x = startX; x <= endX; x += state.gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, startY);
        ctx.lineTo(x, endY);
        ctx.stroke();
    }
    
    // 수평선 그리기
    for (let y = startY; y <= endY; y += state.gridSize) {
        ctx.beginPath();
        ctx.moveTo(startX, y);
        ctx.lineTo(endX, y);
        ctx.stroke();
    }
    
    ctx.restore();
}


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
    // 패닝 중일 때
    if (state.isPanning) {
        canvas.style.cursor = 'grabbing';
        return;
    }
    
    // 스페이스바가 눌려있을 때
    if (state.spacebarPressed) {
        canvas.style.cursor = 'grab';
        return;
    }

    // 드래그 중일 때
    if (state.draggedNode) {
        canvas.style.cursor = 'grabbing';
        return;
    }

    // 모드별 커서 설정
    if (state.currentMode === 'addNode') {
        canvas.style.cursor = 'crosshair';
        return;
    }
    
    if (state.currentMode === 'select' || state.currentMode === 'setPath') {
        // 마우스 위치에서 노드 검사
        const rect = canvas.getBoundingClientRect();
        const worldPos = getTransformedPoint(lastMousePosition.x, lastMousePosition.y);
        const hoveredNode = getNodeAt(worldPos.x, worldPos.y);
        
        canvas.style.cursor = hoveredNode ? 'pointer' : 'default';
        return;
    }
    
    // 기본 커서
    canvas.style.cursor = 'default';
}

// --- 컨트롤러 이벤트 리스너 ---

// 스타일 컨트롤
fillColorControl.addEventListener('input', (e) => {
    state.animationStyle.fillColor = e.target.value;
});

strokeColorControl.addEventListener('input', (e) => {
    state.animationStyle.strokeColor = e.target.value;
});

sizeControl.addEventListener('input', (e) => {
    state.animationStyle.size = parseInt(e.target.value);
    sizeValue.textContent = e.target.value;
});

glowEffectCheckbox.addEventListener('change', (e) => {
    state.animationStyle.glow = e.target.checked;
    if (e.target.checked) {
        shadowEffectCheckbox.checked = false;
        state.animationStyle.shadow = false;
    }
});

shadowEffectCheckbox.addEventListener('change', (e) => {
    state.animationStyle.shadow = e.target.checked;
    if (e.target.checked) {
        glowEffectCheckbox.checked = false;
        state.animationStyle.glow = false;
    }
});

// 애니메이션 설정 컨트롤
durationControl.addEventListener('input', (e) => {
    state.animationSettings.duration = parseFloat(e.target.value);
    durationValue.textContent = `${e.target.value}초`;
});

multiDotCheckbox.addEventListener('change', (e) => {
    state.animationSettings.multiDot.enabled = e.target.checked;
    if (e.target.checked) {
        multiDotIntervalContainer.classList.remove('hidden');
    } else {
        multiDotIntervalContainer.classList.add('hidden');
    }
});

multiDotIntervalControl.addEventListener('input', (e) => {
    state.animationSettings.multiDot.interval = parseInt(e.target.value);
    multiDotIntervalValue.textContent = `${e.target.value}ms`;
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
    const snappedX = snapToGrid(x);
    const snappedY = snapToGrid(y);
    const newNode = { id: state.nodes.length + 1, x: snappedX, y: snappedY, radius: 15 };
    state.nodes.push(newNode);
    draw();
}

function addNodeToPath(node) {
    if (!state.path.includes(node)) { saveState(); state.path.push(node); draw(); }
}

function getNodeAt(x, y) {
    // 드래그 편의를 위해 노드를 역순으로 탐색 (위에 있는 노드 먼저 선택)
    for (let i = state.nodes.length - 1; i >= 0; i--) {
        const node = state.nodes[i];
        const distance = Math.sqrt((node.x - x) ** 2 + (node.y - y) ** 2);
        if (distance < node.radius) return node;
    }
    return null;
}

function snapToGrid(value) {
    if (!state.snapToGrid) return value;
    return Math.round(value / state.gridSize) * state.gridSize;
}

let lastTimestamp = 0;
function startAnimation() {
    if (state.isAnimating) return;
    state.isAnimating = true;
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
    if (!state.isAnimating) return;
    if (!lastTimestamp) lastTimestamp = timestamp;
    const deltaTime = timestamp - lastTimestamp;
    lastTimestamp = timestamp;
    const settings = state.animationSettings;
    const progressIncrement = deltaTime / (settings.duration * 1000);

    if (settings.multiDot.enabled) {
        settings.multiDot.lastSpawnTime += deltaTime;
        if (settings.multiDot.lastSpawnTime > settings.multiDot.interval) {
            settings.multiDot.dots.push({ progress: 0 });
            settings.multiDot.lastSpawnTime = 0;
        }
        settings.multiDot.dots.forEach(dot => dot.progress += progressIncrement);
        settings.multiDot.dots = settings.multiDot.dots.filter(dot => dot.progress <= 1);
    } else {
        if (settings.multiDot.dots.length === 0) settings.multiDot.dots.push({ progress: 0 });
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
    
    drawGrid(); // 그리드 그리기 추가
    drawPath();
    drawNodes();
    
    if (state.currentMode === 'setPath' && state.path.length > 0) {
        const rect = canvas.getBoundingClientRect();
        // Get the current mouse position in world coordinates
        const mouseWorldPos = getTransformedPoint(lastMousePosition.x, lastMousePosition.y);
        
        const lastNode = state.path[state.path.length - 1];
        
        ctx.beginPath();
        ctx.moveTo(lastNode.x, lastNode.y);
        ctx.lineTo(mouseWorldPos.x, mouseWorldPos.y);
        ctx.strokeStyle = '#007bff'; // A distinct color for the temporary line
        ctx.lineWidth = 2 / state.camera.zoom;
        ctx.setLineDash([5 / state.camera.zoom, 5 / state.camera.zoom]); // Dashed line for a temporary feel
        ctx.stroke();
        ctx.setLineDash([]); // Reset line dash to prevent it from affecting other drawings
    }

    if (state.isAnimating) {
        state.animationSettings.multiDot.dots.forEach(dot => {
            drawAnimatedCircle(dot.progress);
        });
    }
    
    ctx.restore();
}

function drawNodes() {
    state.nodes.forEach(node => {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
        ctx.shadowBlur = 5 / state.camera.zoom;
        ctx.shadowOffsetX = 2 / state.camera.zoom;
        ctx.shadowOffsetY = 2 / state.camera.zoom;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, 2 * Math.PI);
        const gradient = ctx.createRadialGradient(node.x - node.radius/3, node.y - node.radius/3, 0, node.x, node.y, node.radius);
        gradient.addColorStop(0, 'rgba(69, 170, 242, 1)');
        gradient.addColorStop(1, 'rgba(41, 128, 185, 1)');
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.restore();
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, 2 * Math.PI);
        ctx.strokeStyle = '#1e6b9a';
        ctx.lineWidth = 2 / state.camera.zoom;
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = `${12 / state.camera.zoom}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.id, node.x, node.y);
        if (state.hoveredNode && state.hoveredNode.id === node.id) {
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.radius + 3, 0, 2 * Math.PI); // Draw a larger circle as the highlight
            ctx.strokeStyle = '#ff9800'; // A bright, contrasting color for the highlight
            ctx.lineWidth = 3 / state.camera.zoom;
            ctx.stroke();
        }
    });
}

function drawPath() {
    if (state.path.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(state.path[0].x, state.path[0].y);
    for (let i = 1; i < state.path.length; i++) ctx.lineTo(state.path[i].x, state.path[i].y);
    ctx.strokeStyle = '#34495e';
    ctx.lineWidth = 5 / state.camera.zoom;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
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
    if (state.path.length < 2) { alert("GIF를 만들려면 먼저 경로를 설정해야 합니다."); return; }
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
    setMode('select');
    draw();
    saveState();
}

init();