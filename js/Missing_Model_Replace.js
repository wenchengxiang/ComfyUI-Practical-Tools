/**
 * Missing Model Replace —— 加载他人工作流时自动替换缺失模型
 * 仅当工作流中包含 "wcx_Apply_Missing_Model_Replace" 节点时才触发
 * 通用方案：直接用每个 combo widget 自带的 options.values 作为可用列表，
 * 不依赖硬编码的 widget→文件夹映射，任何模型加载节点均可自动处理
 * 支持主图和子图（含嵌套），支持子图提升（expose）的 widget
 */
import { app } from "../../scripts/app.js";


const PT_DEBUG = (() => { try { return localStorage.getItem("PracticalTools.Debug") === "1"; } catch (e) { return false; } })();
function ptLog(...args) { if (PT_DEBUG) console.log(...args); }

ptLog("%c[Missing Model Replace] 脚本加载", "color: #9C27B0;");

const SWITCH_NODE_TYPE = "wcx_Apply_Missing_Model_Replace";

// ===== 模型名归一化 =====
function normalizeName(s) {
    return String(s).toLowerCase().replace(/\.[^.]+$/, "").replace(/^[\/\\]+/, "");
}

function normalizeNameNoPath(s) {
    return String(s).toLowerCase().replace(/\.[^.]+$/, "").replace(/^.*[\/\\]/, "");
}

function normalizeNameAggressive(s) {
    return String(s).toLowerCase().replace(/\.[^.]+$/, "").replace(/^[\/\\]+/, "")
        .replace(/[\s_-]+/g, "").replace(/[^\w\u4e00-\u9fa5\/\\]/g, "");
}

function looksLikeModelFile(val) {
    if (!val || typeof val !== "string") return false;
    return /\.(safetensors|pt|pth|ckpt|bin|gguf|onnx|pkl)$/i.test(val);
}

// ===== 存在性判断：带路径匹配 OR 纯文件名匹配 =====
function modelExistsInList(val, list) {
    if (!val || !list || list.length === 0) return false;
    const norm = normalizeName(val);
    const normNoPath = normalizeNameNoPath(val);
    if (!norm && !normNoPath) return false;
    for (const item of list) {
        if (typeof item !== "string") continue;
        if (norm && normalizeName(item) === norm) return true;
        if (normNoPath && normalizeNameNoPath(item) === normNoPath) return true;
    }
    return false;
}

// ===== 编辑距离相似度 =====
function levenshtein(a, b) {
    if (!a || !b) return (a || "").length + (b || "").length;
    const m = a.length, n = b.length;
    const dp = [];
    for (let i = 0; i <= m; i++) { dp[i] = [i]; }
    for (let j = 0; j <= n; j++) { dp[0][j] = j; }
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = a[i-1] === b[j-1] ? 0 : 1;
            dp[i][j] = Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+cost);
        }
    }
    return dp[m][n];
}

function similarity(a, b) {
    if (!a && !b) return 1;
    if (!a || !b) return 0;
    const dist = levenshtein(a, b);
    return 1 - dist / Math.max(a.length, b.length);
}

// ===== 最佳匹配：带路径精确 → 去路径精确 → 包含匹配 → 编辑距离 =====
function findBestMatch(missing, candidates) {
    if (!missing || !candidates || candidates.length === 0) return null;
    const strCandidates = candidates.filter(function(c) { return typeof c === "string"; });
    if (strCandidates.length === 0) return null;

    // 1. 带路径精确匹配
    const missingNorm = normalizeName(missing);
    if (missingNorm) {
        for (const c of strCandidates) {
            if (normalizeName(c) === missingNorm) return c;
        }
    }
    // 2. 去路径精确匹配
    const missingNoPath = normalizeNameNoPath(missing);
    if (missingNoPath) {
        for (const c of strCandidates) {
            if (normalizeNameNoPath(c) === missingNoPath) return c;
        }
    }
    // 3. 激进归一化后包含匹配（阈值降低到0.4）
    const missingAggro = normalizeNameAggressive(missing);
    if (missingAggro) {
        let bestMatch = null, bestScore = 0;
        for (const c of strCandidates) {
            const cNorm = normalizeNameAggressive(c);
            if (!cNorm) continue;
            if (cNorm.includes(missingAggro) || missingAggro.includes(cNorm)) {
                const score = Math.min(cNorm.length, missingAggro.length) / Math.max(cNorm.length, missingAggro.length);
                if (score > bestScore) { bestScore = score; bestMatch = c; }
            }
        }
        if (bestMatch && bestScore >= 0.4) return bestMatch;
    }
    // 4. 编辑距离相似度（阈值0.5）
    let bestMatch = null, bestSim = 0;
    for (const c of strCandidates) {
        const sim = similarity(normalizeNameNoPath(missing), normalizeNameNoPath(c));
        if (sim > bestSim) { bestSim = sim; bestMatch = c; }
    }
    return (bestMatch && bestSim >= 0.5) ? bestMatch : null;
}

// ===== 获取 widget 的可用选项列表（兼容数组/对象/函数） =====
function getWidgetOptions(widget) {
    if (!widget || !widget.options) return [];
    if (Array.isArray(widget.options)) return widget.options;
    if (widget.options.values) {
        if (Array.isArray(widget.options.values)) return widget.options.values;
        if (typeof widget.options.values === "function") {
            try { return widget.options.values() || []; } catch (e) { return []; }
        }
    }
    if (typeof widget.options === "function") {
        try { return widget.options() || []; } catch (e) { return []; }
    }
    return [];
}

// ===== 递归收集所有节点（主子图） =====
function collectAllNodes(nodes, result, depth) {
    result = result || [];
    depth = depth || 0;
    if (depth > 10) return result;
    if (!nodes || !Array.isArray(nodes)) return result;
    for (const node of nodes) {
        if (!node) continue;
        result.push(node);
        if (node.subgraph && node.subgraph.nodes) {
            collectAllNodes(node.subgraph.nodes, result, depth + 1);
        }
    }
    return result;
}

// ===== 开关节点检测 =====
function nodeSwitchOn(node) {
    // 节点上的“启用”开关；旧工作流没有该 widget 时视为启用
    try {
        const w = (node.widgets || []).find(function (x) { return x && x.name === "开关"; });
        if (w) return w.value !== false && w.value !== 0;
        const raw = node.widgets_values;
        if (Array.isArray(raw) && raw.length) return raw[0] !== false && raw[0] !== 0;
    } catch (e) { /* ignore */ }
    return true;
}
function isAutoFixEnabled() {
    if (!app.graph || !app.graph._nodes) return false;
    const allNodes = collectAllNodes(app.graph._nodes);
    for (const node of allNodes) {
        if (node.type === SWITCH_NODE_TYPE && nodeSwitchOn(node)) return true;
    }
    return false;
}

// ===== 工作流切换检测 =====
function getNodeSignature() {
    if (!app.graph || !app.graph._nodes) return "";
    return app.graph._nodes.map(function(n) { return n.id; }).sort(function(a,b) { return a-b; }).join(",");
}

// ===== 快捷键探测与模拟 =====
function getRefreshShortcut() {
    try {
        const sv = app.ui && app.ui.settings && app.ui.settings.settingsValues;
        if (sv) {
            const newBindings = sv["Comfy.Keybinding.NewBindings"];
            if (Array.isArray(newBindings)) {
                for (const b of newBindings) {
                    if (b.commandId === "Comfy.RefreshNodeDefinitions" && b.combo) {
                        const parts = [];
                        if (b.combo.ctrl) parts.push("Ctrl");
                        if (b.combo.alt) parts.push("Alt");
                        if (b.combo.shift) parts.push("Shift");
                        parts.push(b.combo.key);
                        return parts.join("+");
                    }
                }
            }
            const unsetBindings = sv["Comfy.Keybinding.UnsetBindings"];
            if (Array.isArray(unsetBindings)) {
                for (const b of unsetBindings) {
                    if (b.commandId === "Comfy.RefreshNodeDefinitions") return null;
                }
            }
        }
    } catch (e) {}
    return "r";
}

function simulateKey(shortcutStr, targetEl) {
    if (!shortcutStr) return false;
    const parts = String(shortcutStr).split("+").map(function(s) { return s.trim(); });
    const keyPart = parts[parts.length - 1];
    const hasCtrl = parts.indexOf("Ctrl") !== -1 || parts.indexOf("Control") !== -1;
    const hasShift = parts.indexOf("Shift") !== -1;
    const hasAlt = parts.indexOf("Alt") !== -1;
    const hasMeta = parts.indexOf("Meta") !== -1 || parts.indexOf("Command") !== -1;
    let keyCode = 0, code = "", key = keyPart;
    if (keyPart.length === 1) {
        keyCode = keyPart.toUpperCase().charCodeAt(0);
        code = "Key" + keyPart.toUpperCase();
    } else if (/^F\d+$/.test(keyPart)) {
        keyCode = 111 + parseInt(keyPart.substring(1));
        code = keyPart;
    } else {
        keyCode = keyPart.toUpperCase().charCodeAt(0);
        code = keyPart;
    }
    const opts = { key: key, code: code, keyCode: keyCode, which: keyCode,
        ctrlKey: hasCtrl, shiftKey: hasShift, altKey: hasAlt, metaKey: hasMeta,
        bubbles: true, cancelable: true };
    const el = targetEl || document;
    try { el.dispatchEvent(new KeyboardEvent("keydown", opts)); } catch (e) {}
    try { el.dispatchEvent(new KeyboardEvent("keyup", opts)); } catch (e) {}
    return true;
}

function triggerRefreshNodeDefinitions() {
    try {
        if (app.refreshComboInNode && app.graph && app.graph._nodes) {
            for (const n of app.graph._nodes) {
                try { app.refreshComboInNode(n); } catch (e) {}
            }
        }
    } catch (e) {}
    const shortcut = getRefreshShortcut();
    if (!shortcut) return false;
    try {
        const canvasEl = app.canvas && (app.canvas.canvas || app.canvas.element);
        if (canvasEl) {
            try { canvasEl.focus(); } catch (e) {}
            simulateKey(shortcut, canvasEl);
            return true;
        }
    } catch (e) {}
    try { simulateKey(shortcut, document); return true; } catch (e) {}
    return false;
}

// ===== 统一设置 widget 值并同步 =====
function applyWidgetValue(node, widget, value) {
    widget.value = value;
    if (node.widgets_values && Array.isArray(node.widgets_values)) {
        const wIdx = node.widgets.indexOf(widget);
        if (wIdx >= 0 && wIdx < node.widgets_values.length) {
            node.widgets_values[wIdx] = value;
        }
    }
    // 确保新值在选项列表中
    if (widget.options && widget.options.values && Array.isArray(widget.options.values)) {
        if (widget.options.values.indexOf(value) === -1) {
            widget.options.values.push(value);
        }
    }
    // 调用 callback（子图提升 widget 会同步到内部节点）
    if (typeof widget.callback === "function") {
        try { widget.callback(value); } catch (e) {}
    }
    if (typeof node.onWidgetChanged === "function") {
        try { node.onWidgetChanged(widget, value); } catch (e) {}
    }
}

// ===== 核心：扫描并替换缺失模型 =====
async function fixMissingModels(reason, force) {
    if (!app.graph || !app.graph._nodes) return;
    if (!force && !isAutoFixEnabled()) {
        ptLog("[Missing Model Replace] (" + reason + ") 未包含开关节点，跳过");
        return;
    }

    const allNodes = collectAllNodes(app.graph._nodes);
    if (allNodes.length === 0) return;

    const fixes = [];
    for (const node of allNodes) {
        if (!node.widgets) continue;
        for (const widget of node.widgets) {
            if (!widget) continue;
            if (widget.type !== "combo" && widget.type !== "select") continue;
            const currentValue = widget.value;
            if (!looksLikeModelFile(currentValue)) continue;

            // 直接用 widget 自带的选项列表，不依赖文件夹映射
            const available = getWidgetOptions(widget);
            if (available.length === 0) continue;
            // 验证这确实是模型选择器：选项列表中至少有一个模型文件
            const modelOptions = available.filter(function(c) { return typeof c === "string" && looksLikeModelFile(c); });
            if (modelOptions.length === 0) continue;
            if (modelExistsInList(currentValue, available)) continue;

            let match = findBestMatch(currentValue, available);
            let isRandom = false;
            if (!match) {
                match = modelOptions[Math.floor(Math.random() * modelOptions.length)];
                isRandom = true;
            }
            if (match && match !== currentValue) {
                fixes.push({
                    node: node.title || node.type || "unknown",
                    widget: widget.name, from: currentValue, to: match, random: isRandom,
                });
                applyWidgetValue(node, widget, match);
            }
        }
    }

    if (fixes.length > 0) {
        ptLog("%c[Missing Model Replace] (" + reason + ") 替换" + fixes.length + "个缺失模型：",
            "color: #4CAF50; font-weight: bold;");
        for (const f of fixes) {
            ptLog("  " + (f.random ? "[随机]" : "[匹配]") + " " + f.node + " / " + f.widget + ": " + f.from + " -> " + f.to);
        }
        setTimeout(function() {
            triggerRefreshNodeDefinitions();
            setTimeout(function() {
                try {
                    if (app.graph) app.graph.setDirtyCanvas(true, true);
                    if (app.canvas && app.canvas.draw) app.canvas.draw(true, true);
                } catch (e) {}
            }, 500);
        }, 300);
    } else {
        ptLog("[Missing Model Replace] (" + reason + ") 无缺失模型");
    }
}

// ===== 触发机制：页面首次加载 + 每次打开工作流（loadGraphData）=====
let _initialFixDone = false;
let _loadGraphHooked = false;

function hookLoadGraphData() {
    if (_loadGraphHooked) return;
    if (typeof app.loadGraphData !== "function") return;
    _loadGraphHooked = true;
    const _origLoad = app.loadGraphData.bind(app);
    app.loadGraphData = function() {
        const result = _origLoad.apply(this, arguments);
        setTimeout(function() { fixMissingModels("工作流加载"); }, 1500);
        return result;
    };
    ptLog("[Missing Model Replace] 已 hook loadGraphData");
}

const _initChecker = setInterval(function() {
    if (app.graph && app.graph._nodes && app.graph._nodes.length > 0) {
        hookLoadGraphData();
        if (!_initialFixDone) {
            _initialFixDone = true;
            setTimeout(function() { fixMissingModels("首次加载"); }, 1500);
        }
    } else {
        hookLoadGraphData();
    }
}, 1500);

ptLog("%c[Missing Model Replace] 加载完成", "color: #9C27B0;");