// app.js - The Nexus Agentic Engine

// --- STATE MANAGEMENT ---
const state = {
    canvas: { x: 0, y: 0, scale: 1 },
    nodes: [],
    connections: [],
    tools: [
        { id: 't1', type: 'trigger', title: 'Trigger Node', subtitle: 'Starts the workflow', color: '#10b981', icon: 'zap' },
        { id: 't2', type: 'gemini', title: 'Google Gemini Pro', subtitle: 'LLM Processing', color: '#3b82f6', icon: 'brain-circuit' },
        { id: 't3', type: 'groq', title: 'Groq Llama 3', subtitle: 'Ultra-fast Inference', color: '#f97316', icon: 'rocket' }
    ],
    drag: {
        isPanning: false, startX: 0, startY: 0,
        isDraggingNode: false, nodeId: null, offsetX: 0, offsetY: 0,
        isDrawingWire: false, fromNodeId: null, tempWireX: 0, tempWireY: 0,
        isDraggingTool: false, activeTool: null
    },
    selectedNodeId: null
};

// --- DOM ELEMENTS ---
const DOM = {
    canvasContainer: document.getElementById('canvas-container'),
    transformLayer: document.getElementById('transform-layer'),
    svgLayer: document.getElementById('svg-layer'),
    nodesLayer: document.getElementById('nodes-layer'),
    toolList: document.getElementById('tool-list'),
    searchInput: document.getElementById('search-tools'),
    zoomLevel: document.getElementById('zoom-level'),
    sidebar: document.getElementById('sidebar'),
    
    configDrawer: document.getElementById('config-drawer'),
    configTitle: document.getElementById('config-title'),
    configPrompt: document.getElementById('config-prompt'),
    configApiKey: document.getElementById('config-apikey'),
    configEndpoint: document.getElementById('config-endpoint'),
    
    customModal: document.getElementById('custom-modal'),
    customModalContent: document.getElementById('custom-modal-content'),
    
    dragGhost: document.getElementById('drag-ghost'),
    ghostIconContainer: document.getElementById('ghost-icon-container'),
    ghostIcon: document.getElementById('ghost-icon'),
    ghostTitle: document.getElementById('ghost-title')
};

// --- UTILITIES ---
function getCoords(e) {
    if (e.touches && e.touches.length > 0) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.changedTouches && e.changedTouches.length > 0) {
        return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
}

function generateId(prefix) {
    return prefix + '_' + Math.random().toString(36).substr(2, 9);
}

// --- INITIALIZATION ---
function init() {
    lucide.createIcons();
    renderSidebar(state.tools);
    setupCanvasEvents();
    setupToolbarEvents();
    setupDrawerEvents();
    setupModalEvents();
    setupSidebarEvents();
    setupExecutionEngine();
    
    // Center canvas
    const rect = DOM.canvasContainer.getBoundingClientRect();
    state.canvas.x = rect.width / 2;
    state.canvas.y = rect.height / 2;
    updateCanvasTransform();
}

// --- SIDEBAR & SEARCH LOGIC ---
function renderSidebar(toolsToRender) {
    DOM.toolList.innerHTML = '';
    toolsToRender.forEach(tool => {
        const el = document.createElement('div');
        el.className = 'bg-slate-800 border border-slate-700 rounded-xl p-3 cursor-grab hover:border-slate-500 hover:shadow-lg transition-all flex items-center gap-3 group select-none touch-none';
        
        el.innerHTML = `
            <div class="w-10 h-10 rounded-lg flex items-center justify-center shadow-inner pointer-events-none" style="background-color: ${tool.color}20; border: 1px solid ${tool.color}50;">
                <i data-lucide="${tool.icon}" class="w-5 h-5" style="color: ${tool.color}"></i>
            </div>
            <div class="pointer-events-none">
                <h3 class="text-sm font-semibold text-slate-200 group-hover:text-white transition-colors">${tool.title}</h3>
                <p class="text-xs text-slate-500">${tool.subtitle}</p>
            </div>
        `;

        // Universal Drag Start for Tools
        const startToolDrag = (e) => {
            e.preventDefault();
            state.drag.isDraggingTool = true;
            state.drag.activeTool = tool;
            
            const coords = getCoords(e);
            DOM.dragGhost.style.display = 'flex';
            DOM.dragGhost.style.left = `${coords.x}px`;
            DOM.dragGhost.style.top = `${coords.y}px`;
            
            DOM.ghostIconContainer.style.backgroundColor = `${tool.color}20`;
            DOM.ghostIconContainer.style.borderColor = `${tool.color}50`;
            DOM.ghostIcon.setAttribute('data-lucide', tool.icon);
            DOM.ghostIcon.style.color = tool.color;
            DOM.ghostTitle.textContent = tool.title;
            lucide.createIcons({ root: DOM.dragGhost });
            
            if (window.innerWidth < 768) {
                DOM.sidebar.classList.add('-translate-x-full');
            }
        };

        el.addEventListener('mousedown', startToolDrag);
        el.addEventListener('touchstart', startToolDrag, { passive: false });
        DOM.toolList.appendChild(el);
    });
    lucide.createIcons({ root: DOM.toolList });
}

function setupSidebarEvents() {
    DOM.searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = state.tools.filter(t => t.title.toLowerCase().includes(term) || t.subtitle.toLowerCase().includes(term));
        renderSidebar(filtered);
    });

    document.getElementById('btn-toggle-sidebar').addEventListener('click', () => {
        DOM.sidebar.classList.remove('-translate-x-full');
    });
    document.getElementById('btn-close-sidebar').addEventListener('click', () => {
        DOM.sidebar.classList.add('-translate-x-full');
    });
}

// --- CANVAS PHYSICS (PAN, ZOOM, DRAG, WIRE) ---
function updateCanvasTransform() {
    DOM.transformLayer.style.transform = `translate(${state.canvas.x}px, ${state.canvas.y}px) scale(${state.canvas.scale})`;
    DOM.zoomLevel.textContent = `${Math.round(state.canvas.scale * 100)}%`;
}

function setupCanvasEvents() {
    // Global Move Handler
    const handleMove = (e) => {
        const coords = getCoords(e);

        // 1. Tool Dragging (from sidebar)
        if (state.drag.isDraggingTool) {
            e.preventDefault();
            DOM.dragGhost.style.left = `${coords.x}px`;
            DOM.dragGhost.style.top = `${coords.y}px`;
            return;
        }

        // 2. Canvas Panning
        if (state.drag.isPanning) {
            e.preventDefault();
            state.canvas.x = coords.x - state.drag.startX;
            state.canvas.y = coords.y - state.drag.startY;
            updateCanvasTransform();
            return;
        }

        // 3. Node Dragging
        if (state.drag.isDraggingNode && state.drag.nodeId) {
            e.preventDefault();
            const node = state.nodes.find(n => n.id === state.drag.nodeId);
            if (node) {
                node.x = (coords.x - state.canvas.x) / state.canvas.scale - state.drag.offsetX;
                node.y = (coords.y - state.canvas.y) / state.canvas.scale - state.drag.offsetY;
                updateNodePosition(node);
                renderConnections();
            }
            return;
        }

        // 4. Wire Drawing
        if (state.drag.isDrawingWire) {
            e.preventDefault();
            state.drag.tempWireX = (coords.x - state.canvas.x) / state.canvas.scale;
            state.drag.tempWireY = (coords.y - state.canvas.y) / state.canvas.scale;
            renderConnections();
        }
    };

    // Global End Handler
    const handleEnd = (e) => {
        const coords = getCoords(e);

        // 1. Drop Tool
        if (state.drag.isDraggingTool && state.drag.activeTool) {
            DOM.dragGhost.style.display = 'none';
            const rect = DOM.canvasContainer.getBoundingClientRect();
            if (coords.x > rect.left && coords.x < rect.right && coords.y > rect.top && coords.y < rect.bottom) {
                const dropX = (coords.x - rect.left - state.canvas.x) / state.canvas.scale;
                const dropY = (coords.y - rect.top - state.canvas.y) / state.canvas.scale;
                createNode(state.drag.activeTool, dropX - 144, dropY - 40);
            }
            state.drag.isDraggingTool = false;
            state.drag.activeTool = null;
        }

        // 2. End Wire Drawing
        if (state.drag.isDrawingWire) {
            // For touch, we need to find the element under the finger
            const targetEl = document.elementFromPoint(coords.x, coords.y);
            if (targetEl && targetEl.dataset.handle === 'input') {
                const toNodeId = targetEl.dataset.nodeId;
                if (state.drag.fromNodeId && state.drag.fromNodeId !== toNodeId) {
                    const exists = state.connections.some(c => c.fromNode === state.drag.fromNodeId && c.toNode === toNodeId);
                    if (!exists) {
                        state.connections.push({
                            id: generateId('conn'),
                            fromNode: state.drag.fromNodeId,
                            toNode: toNodeId
                        });
                    }
                }
            }
            state.drag.isDrawingWire = false;
            renderConnections();
        }

        state.drag.isPanning = false;
        state.drag.isDraggingNode = false;
        DOM.canvasContainer.style.cursor = 'grab';
    };

    // Canvas Pan Start
    const startPan = (e) => {
        if (e.target === DOM.canvasContainer || e.target.classList.contains('canvas-bg') || e.target === DOM.svgLayer) {
            const coords = getCoords(e);
            state.drag.isPanning = true;
            state.drag.startX = coords.x - state.canvas.x;
            state.drag.startY = coords.y - state.canvas.y;
            DOM.canvasContainer.style.cursor = 'grabbing';
            closeConfigDrawer();
        }
    };

    // Bind Global Events
    window.addEventListener('mousemove', handleMove, { passive: false });
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchend', handleEnd);
    
    DOM.canvasContainer.addEventListener('mousedown', startPan);
    DOM.canvasContainer.addEventListener('touchstart', startPan, { passive: false });

    // Zooming
    DOM.canvasContainer.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomSensitivity = 0.0015;
        const delta = -e.deltaY * zoomSensitivity;
        const newScale = Math.min(Math.max(0.2, state.canvas.scale + delta), 3);

        const rect = DOM.canvasContainer.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        state.canvas.x = mouseX - (mouseX - state.canvas.x) * (newScale / state.canvas.scale);
        state.canvas.y = mouseY - (mouseY - state.canvas.y) * (newScale / state.canvas.scale);
        state.canvas.scale = newScale;

        updateCanvasTransform();
    }, { passive: false });
}

// --- NODE LOGIC ---
function createNode(tool, x, y) {
    const node = {
        id: generateId('node'),
        ...tool,
        x: x, y: y,
        data: { prompt: '', apiKey: '', endpoint: tool.endpoint || '' }
    };
    state.nodes.push(node);
    renderNode(node);
}

function renderNode(node) {
    const el = document.createElement('div');
    el.id = node.id;
    el.className = 'absolute w-72 bg-slate-800 rounded-xl shadow-2xl border border-slate-700 flex flex-col group select-none touch-none';
    el.style.left = `${node.x}px`;
    el.style.top = `${node.y}px`;

    el.innerHTML = `
        <div class="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-xl" style="background-color: ${node.color}"></div>
        
        <div class="node-handle absolute w-5 h-5 bg-slate-700 border-2 border-slate-400 rounded-full z-30 cursor-crosshair flex items-center justify-center" style="left: -10px; top: 32px;" data-handle="input" data-node-id="${node.id}"></div>
        
        <div class="node-handle absolute w-5 h-5 bg-slate-700 border-2 border-slate-400 rounded-full z-30 cursor-crosshair flex items-center justify-center" style="right: -10px; top: 32px;" data-handle="output" data-node-id="${node.id}"></div>

        <div class="node-header p-4 pl-6 flex items-center gap-3 cursor-grab active:cursor-grabbing border-b border-slate-700/50">
            <div class="w-8 h-8 rounded bg-slate-900 flex items-center justify-center shadow-inner border border-slate-700 pointer-events-none">
                <i data-lucide="${node.icon}" class="w-4 h-4" style="color: ${node.color}"></i>
            </div>
            <div class="pointer-events-none">
                <h3 class="text-sm font-bold text-slate-100">${node.title}</h3>
                <p class="text-[10px] text-slate-400 uppercase tracking-wider">${node.type}</p>
            </div>
        </div>
        
        <div class="node-body p-4 pl-6 cursor-pointer hover:bg-slate-700/30 transition-colors rounded-b-xl">
            <p class="text-xs text-slate-400 line-clamp-2 pointer-events-none">${node.subtitle}</p>
        </div>
    `;

    DOM.nodesLayer.appendChild(el);
    lucide.createIcons({ root: el });

    // Node Dragging
    const header = el.querySelector('.node-header');
    const startNodeDrag = (e) => {
        e.stopPropagation();
        const coords = getCoords(e);
        state.drag.isDraggingNode = true;
        state.drag.nodeId = node.id;
        state.drag.offsetX = (coords.x - state.canvas.x) / state.canvas.scale - node.x;
        state.drag.offsetY = (coords.y - state.canvas.y) / state.canvas.scale - node.y;
    };
    header.addEventListener('mousedown', startNodeDrag);
    header.addEventListener('touchstart', startNodeDrag, { passive: false });

    // Open Config
    const body = el.querySelector('.node-body');
    const openConfig = (e) => {
        e.stopPropagation();
        openConfigDrawer(node.id);
    };
    body.addEventListener('click', openConfig);
    body.addEventListener('touchend', (e) => {
        if(!state.drag.isPanning && !state.drag.isDraggingNode) openConfig(e);
    });

    // Wire Drawing
    const outHandle = el.querySelector('[data-handle="output"]');
    const startWire = (e) => {
        e.stopPropagation();
        state.drag.isDrawingWire = true;
        state.drag.fromNodeId = node.id;
        const coords = getCoords(e);
        state.drag.tempWireX = (coords.x - state.canvas.x) / state.canvas.scale;
        state.drag.tempWireY = (coords.y - state.canvas.y) / state.canvas.scale;
    };
    outHandle.addEventListener('mousedown', startWire);
    outHandle.addEventListener('touchstart', startWire, { passive: false });
}

function updateNodePosition(node) {
    const el = document.getElementById(node.id);
    if (el) {
        el.style.left = `${node.x}px`;
        el.style.top = `${node.y}px`;
    }
}

// --- SVG BEZIER WIRE LOGIC ---
function renderConnections() {
    let svgHTML = '';

    state.connections.forEach(conn => {
        const fromNode = state.nodes.find(n => n.id === conn.fromNode);
        const toNode = state.nodes.find(n => n.id === conn.toNode);
        
        if (fromNode && toNode) {
            const x1 = fromNode.x + 288;
            const y1 = fromNode.y + 42; // 32px top + 10px half handle
            const x2 = toNode.x;
            const y2 = toNode.y + 42;
            svgHTML += createBezierPath(x1, y1, x2, y2, '#64748b', false);
        }
    });

    if (state.drag.isDrawingWire && state.drag.fromNodeId) {
        const fromNode = state.nodes.find(n => n.id === state.drag.fromNodeId);
        if (fromNode) {
            const x1 = fromNode.x + 288;
            const y1 = fromNode.y + 42;
            const x2 = state.drag.tempWireX;
            const y2 = state.drag.tempWireY;
            svgHTML += createBezierPath(x1, y1, x2, y2, '#22d3ee', true);
        }
    }

    DOM.svgLayer.innerHTML = svgHTML;
}

function createBezierPath(x1, y1, x2, y2, color, isTemp) {
    const dx = Math.abs(x2 - x1);
    const offset = Math.max(dx * 0.5, 50);
    const pathData = `M ${x1} ${y1} C ${x1 + offset} ${y1}, ${x2 - offset} ${y2}, ${x2} ${y2}`;
    const classes = isTemp ? 'stroke-cyan-400 wire-path' : 'stroke-slate-500 hover:stroke-cyan-400 transition-colors cursor-pointer';
    const strokeWidth = isTemp ? '3' : '2';
    return `<path d="${pathData}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" class="${classes}" />`;
}

// --- CONFIG DRAWER LOGIC ---
function openConfigDrawer(nodeId) {
    state.selectedNodeId = nodeId;
    const node = state.nodes.find(n => n.id === nodeId);
    if (!node) return;

    DOM.configTitle.innerHTML = `<i data-lucide="${node.icon}" class="w-5 h-5" style="color: ${node.color}"></i> ${node.title}`;
    DOM.configPrompt.value = node.data.prompt || '';
    DOM.configApiKey.value = node.data.apiKey || '';
    DOM.configEndpoint.value = node.data.endpoint || '';

    DOM.configDrawer.classList.remove('translate-x-full');
    lucide.createIcons({ root: DOM.configTitle });
}

function closeConfigDrawer() {
    DOM.configDrawer.classList.add('translate-x-full');
    state.selectedNodeId = null;
}

function setupDrawerEvents() {
    const closeBtn = document.getElementById('btn-close-config');
    const saveBtn = document.getElementById('btn-save-config');
    
    const closeAction = (e) => { e.preventDefault(); closeConfigDrawer(); };
    closeBtn.addEventListener('click', closeAction);
    closeBtn.addEventListener('touchend', closeAction);
    
    const saveAction = (e) => {
        e.preventDefault();
        if (state.selectedNodeId) {
            const node = state.nodes.find(n => n.id === state.selectedNodeId);
            if (node) {
                node.data.prompt = DOM.configPrompt.value;
                node.data.apiKey = DOM.configApiKey.value;
                node.data.endpoint = DOM.configEndpoint.value;
            }
        }
        closeConfigDrawer();
    };
    saveBtn.addEventListener('click', saveAction);
    saveBtn.addEventListener('touchend', saveAction);
}

// --- CUSTOM NODE MODAL LOGIC ---
function setupModalEvents() {
    const btnOpen = document.getElementById('btn-create-custom');
    const btnClose = document.getElementById('btn-close-modal');
    const btnCancel = document.getElementById('btn-cancel-modal');
    const btnSave = document.getElementById('btn-save-custom');

    const openModal = (e) => {
        e.preventDefault();
        DOM.customModal.classList.remove('hidden');
        setTimeout(() => {
            DOM.customModalContent.classList.remove('scale-95', 'opacity-0');
            DOM.customModalContent.classList.add('scale-100', 'opacity-100');
        }, 10);
    };

    const closeModal = (e) => {
        if(e) e.preventDefault();
        DOM.customModalContent.classList.remove('scale-100', 'opacity-100');
        DOM.customModalContent.classList.add('scale-95', 'opacity-0');
        setTimeout(() => { DOM.customModal.classList.add('hidden'); }, 200);
    };

    const saveModal = (e) => {
        e.preventDefault();
        const name = document.getElementById('custom-name').value || 'Custom Node';
        const color = document.getElementById('custom-color').value || '#a855f7';
        const icon = document.getElementById('custom-icon').value || 'box';
        const api = document.getElementById('custom-api').value || '';

        const newTool = {
            id: generateId('t'),
            type: 'custom',
            title: name,
            subtitle: 'User Defined Tool',
            color: color,
            icon: icon,
            endpoint: api
        };

        state.tools.push(newTool);
        renderSidebar(state.tools);
        closeModal();
        
        document.getElementById('custom-name').value = '';
        document.getElementById('custom-api').value = '';
    };

    btnOpen.addEventListener('click', openModal);
    btnOpen.addEventListener('touchend', openModal);
    
    btnClose.addEventListener('click', closeModal);
    btnClose.addEventListener('touchend', closeModal);
    
    btnCancel.addEventListener('click', closeModal);
    btnCancel.addEventListener('touchend', closeModal);
    
    btnSave.addEventListener('click', saveModal);
    btnSave.addEventListener('touchend', saveModal);
}

// --- TOOLBAR & EXECUTION ENGINE ---
function setupToolbarEvents() {
    const zoomIn = (e) => { e.preventDefault(); state.canvas.scale = Math.min(3, state.canvas.scale + 0.2); updateCanvasTransform(); };
    const zoomOut = (e) => { e.preventDefault(); state.canvas.scale = Math.max(0.2, state.canvas.scale - 0.2); updateCanvasTransform(); };
    const resetView = (e) => { 
        e.preventDefault(); 
        state.canvas.scale = 1; 
        const rect = DOM.canvasContainer.getBoundingClientRect();
        state.canvas.x = rect.width / 2;
        state.canvas.y = rect.height / 2;
        updateCanvasTransform(); 
    };

    document.getElementById('btn-zoom-in').addEventListener('click', zoomIn);
    document.getElementById('btn-zoom-in').addEventListener('touchend', zoomIn);
    
    document.getElementById('btn-zoom-out').addEventListener('click', zoomOut);
    document.getElementById('btn-zoom-out').addEventListener('touchend', zoomOut);
    
    document.getElementById('btn-reset-view').addEventListener('click', resetView);
    document.getElementById('btn-reset-view').addEventListener('touchend', resetView);
}

function setupExecutionEngine() {
    const executeBtn = document.getElementById('btn-execute');
    
    const executeWorkflow = (e) => {
        e.preventDefault();
        if (state.nodes.length === 0) {
            alert("Canvas is empty. Add nodes to execute.");
            return;
        }

        // Topological Sort
        const adjList = new Map();
        const inDegree = new Map();
        
        state.nodes.forEach(n => {
            adjList.set(n.id, []);
            inDegree.set(n.id, 0);
        });

        state.connections.forEach(c => {
            if(adjList.has(c.fromNode) && inDegree.has(c.toNode)) {
                adjList.get(c.fromNode).push(c.toNode);
                inDegree.set(c.toNode, inDegree.get(c.toNode) + 1);
            }
        });

        const queue = [];
        inDegree.forEach((deg, id) => {
            if (deg === 0) queue.push(id);
        });

        const order = [];
        while(queue.length > 0) {
            const curr = queue.shift();
            order.push(curr);
            adjList.get(curr).forEach(neighbor => {
                inDegree.set(neighbor, inDegree.get(neighbor) - 1);
                if (inDegree.get(neighbor) === 0) queue.push(neighbor);
            });
        }

        if (order.length !== state.nodes.length) {
            alert("Execution Failed: Cycle detected or disconnected graph structure.");
            return;
        }

        const pathNames = order.map(id => state.nodes.find(n => n.id === id).title).join(" ➔ ");
        console.log("--- NEXUS EXECUTION PATH ---");
        order.forEach((id, index) => {
            const node = state.nodes.find(n => n.id === id);
            console.log(`${index + 1}. [${node.title}] - Prompt: "${node.data.prompt}"`);
        });
        
        alert(`Nexus Workflow Executed Successfully!\n\nExecution Path:\n${pathNames}\n\n(Check console for detailed payload)`);
    };

    executeBtn.addEventListener('click', executeWorkflow);
    executeBtn.addEventListener('touchend', executeWorkflow);
}

// Boot up
init();