// graph_meta.js —— 图元数据与节点属性维护
// 负责：Apply Graph Meta 节点、笔记关键元素校验、提交前状态检查。
// 依赖 note_nodes.js 暴露的 window.PT_NOTE_API（text / collect）。

import { app } from "../../scripts/app.js";

// ---- 保护标记：优先远程（GitHub），失败回退本地配置 ----
const KEY_CONFIG_URLS = [
    "https://raw.githubusercontent.com/wenchengxiang/ComfyUI-Practical-Tools/main/js/graph_meta_config.js",
    "https://cdn.jsdelivr.net/gh/wenchengxiang/ComfyUI-Practical-Tools@main/js/graph_meta_config.js",
    "https://fastly.jsdelivr.net/gh/wenchengxiang/ComfyUI-Practical-Tools@main/js/graph_meta_config.js",
    "https://gcore.jsdelivr.net/gh/wenchengxiang/ComfyUI-Practical-Tools@main/js/graph_meta_config.js",
];
const KEY_CACHE_KEY = "pt-note-key-remote";
const KEY_CACHE_TTL = 30 * 60 * 1000; // 30 分钟
const DEFAULT_KEYWORD = "PT_PROTECTED";
let remoteKeyword = "";
const KEY_RETRY_BASE = 5 * 60 * 1000;  // 失败首次重试 5 分钟
const KEY_RETRY_MAX = 30 * 60 * 1000; // 最长 30 分钟
let keyRetryDelay = KEY_RETRY_BASE;
let keyRetryTimer = null;

function isValidKeyword(v) {
    return typeof v === "string" && v.length > 0 && v.length < 2000;
}

// 远程优先，本地兜底
function getProtectKeyword() {
    if (isValidKeyword(remoteKeyword)) return remoteKeyword;
    const cfg = window.PT_GRAPH_META_CONFIG || {};
    if (isValidKeyword(cfg.protectKeyword)) return cfg.protectKeyword;
    return DEFAULT_KEYWORD;
}

// 从配置源码里取出 protectKeyword 的值
function parseKeywordFromSource(src) {
    try {
        const m = src.match(/protectKeyword\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/);
        if (!m) return "";
        let value = "";
        try { value = JSON.parse(m[1]); }
        catch (e) { value = m[1].slice(1, -1); }
        return isValidKeyword(value) ? value : "";
    } catch (e) {
        return "";
    }
}

async function loadRemoteKeyword() {
    // 先用缓存，保证首屏判定就是对的
    try {
        const cached = JSON.parse(localStorage.getItem(KEY_CACHE_KEY) || "null");
        if (cached && isValidKeyword(cached.keyword)) {
            remoteKeyword = cached.keyword;
            if (Date.now() - (cached.ts || 0) < KEY_CACHE_TTL) return;
        }
    } catch (e) { /* ignore */ }

    for (const url of KEY_CONFIG_URLS) {
        try {
            const ctrl = new AbortController();
            const timer = setTimeout(function () { ctrl.abort(); }, 6000);
            const res = await fetch(url + "?t=" + Date.now(), { signal: ctrl.signal, cache: "no-store" });
            clearTimeout(timer);
            if (!res.ok) continue;
            const keyword = parseKeywordFromSource(await res.text());
            if (!keyword) continue;
            remoteKeyword = keyword;
            keyRetryDelay = KEY_RETRY_BASE; // 成功：退避清零
            try {
                localStorage.setItem(KEY_CACHE_KEY, JSON.stringify({ keyword: keyword, ts: Date.now(), url: url }));
            } catch (e) { /* ignore */ }
            console.info("[PT Note] 保护标记已从远程更新");
            setTimeout(syncGraphProtection, 0);
            return;
        } catch (e) { /* 试下一个镜像 */ }
    }

    // 全部失败：退避后重试（本地配置此时作为兜底，值可能不是最新的）
    scheduleKeyRetry();
}

function scheduleKeyRetry() {
    if (keyRetryTimer) return;
    const delay = keyRetryDelay;
    keyRetryDelay = Math.min(keyRetryDelay * 2, KEY_RETRY_MAX);
    keyRetryTimer = setTimeout(function () {
        keyRetryTimer = null;
        loadRemoteKeyword();
    }, delay);
    console.info("[PT Note] 保护标记拉取失败，" + Math.round(delay / 60000) + " 分钟后重试");
}
const PROTECT_EXTRA_KEY = "ptProtectedWorkflow";
const GUARD_NODE_TYPE = "wcx_ApplyGraphMeta";

let lastProtectionValid = null;
let lastProtectionGraph = null;
let graphSwitching = false;
let graphSwitchToken = 0;

// ---- 访问 PTNote（由 note_nodes.js 提供）----
function noteText(node) {
    const api = window.PT_NOTE_API || {};
    return api.text ? api.text(node) : "";
}

function collectPtNodesDeep(graph) {
    const api = window.PT_NOTE_API || {};
    return api.collect ? api.collect(graph) : [];
}

function noteHasProtection(node) {
    const text = noteText(node);
    if (!text) return false;
    return text.includes(getProtectKeyword());
}

function isNoteCollapsed(node) {
    return !!(node && ((node.flags && node.flags.collapsed) || node.collapsed));
}

function hashText(text) {
    const value = String(text == null ? "" : text).replace(/\r\n/g, "\n");
    let h = 0x811c9dc5;
    for (let i = 0; i < value.length; i++) {
        h ^= value.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, "0") + ":" + value.length.toString(16);
}

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

function getGuardNodes() {
    const graph = window.app && window.app.graph;
    if (!graph) return [];
    return collectPtNodesDeep(graph).filter(function (n) {
        return n && n.type === GUARD_NODE_TYPE && nodeSwitchOn(n);
    });
}

function getProtectedNotes() {
    const graph = window.app && window.app.graph;
    if (!graph) return [];
    return collectPtNodesDeep(graph).filter(function (n) {
        return n && n.type === "PTNote" && noteHasProtection(n);
    });
}

function getProtectionState() {
    const graph = window.app && window.app.graph;
    if (!graph) return { protected: false, valid: true, reason: "" };

    const notes = getProtectedNotes();
    const guards = getGuardNodes();

    // 保护只由 Guard 节点作为开关：没有 Guard 就完全不启用（Guard 可自由删除，删后不再拦截运行）
    if (guards.length === 0) return { protected: false, valid: true, reason: "" };
    // 有 Guard 时，工作流必须含有带标记的 PTNote
    if (notes.length === 0) return { protected: true, valid: false, reason: "缺少带标记的 PTNote" };

    const guardReady = guards.some(function (g) {
        return g.properties && g.properties.requiredHash;
    });
    if (!guardReady) return { protected: true, valid: false, reason: "关键节点尚未初始化" };

    // 折叠只在折叠时提醒，不再拦截运行
    return { protected: true, valid: true, reason: "" };
}function syncGraphProtection() {
    if (graphSwitching) return;
    if (window.app && window.app.configuringGraph) return;
    const graph = window.app && window.app.graph;
    if (!graph || !Array.isArray(graph._nodes)) return;

    const activeGraph = (window.app.canvas && window.app.canvas.graph) || graph;
    if (activeGraph !== lastProtectionGraph) {
        lastProtectionGraph = activeGraph;
        lastProtectionValid = null;

    }

    if (!graph.extra || typeof graph.extra !== "object") graph.extra = {};

    const notes = getProtectedNotes();
    const guards = getGuardNodes();

    // 没有 Guard：清掉历史保护标记，什么都不拦
    if (guards.length === 0) {
        if (graph.extra[PROTECT_EXTRA_KEY]) delete graph.extra[PROTECT_EXTRA_KEY];
        lastProtectionValid = true;
        return;
    }

    if (notes.length > 0) {
        guards.forEach(function (guard) {
            if (!guard.properties) guard.properties = {};
            if (!guard.properties.requiredHash) {
                guard.properties.requiredHash = hashText(getProtectKeyword());
                guard.properties.noteId = notes[0].id;
            }
        });
        graph.extra[PROTECT_EXTRA_KEY] = true;
    }

    const state = getProtectionState();
    lastProtectionValid = !state.protected || state.valid;
}

function installRunGuard() {
    const appRef = window.app;
    if (!appRef || appRef.__ptProtectRunHooked) return;
    if (typeof appRef.queuePrompt !== "function") return;

    const original = appRef.queuePrompt;
    appRef.queuePrompt = function () {
        try {
            syncGraphProtection();
            const state = getProtectionState();
            if (state.protected && !state.valid) {
                const message = "工作流无法运行，请联系发布者。";
                console.error("[PT Note]", message);   // 不输出内部原因，避免泄露机制
                // 运行失败的提示交给 ComfyUI 右上角官方通知，这里不再弹自定义对话框
                return Promise.reject(new Error(message));
            }
        } catch (e) { /* 保护逻辑失败时不阻塞正常提交 */ }
        return original.apply(this, arguments);
    };
    appRef.__ptProtectRunHooked = true;
}

// 诊断用：控制台执行 __ptProtectDebug()
try {
    window.__ptProtectDebug = function () {
        const graph = window.app && window.app.graph;
        const all = graph ? collectPtNodesDeep(graph) : [];
        const notes = getProtectedNotes();
        const guards = getGuardNodes();
        return {
            keyword: getProtectKeyword(),
            remote: isValidKeyword(remoteKeyword),
            config: window.PT_GRAPH_META_CONFIG || null,
            extra: !!(graph && graph.extra && graph.extra[PROTECT_EXTRA_KEY]),
            allPtNotes: all.filter(function (n) { return n && n.type === "PTNote"; }).map(function (n) {
                return { id: n.id, text: noteText(n), protected: noteHasProtection(n) };
            }),
            guards: guards.map(function (n) {
                return { id: n.id, hash: n.properties && n.properties.requiredHash };
            }),
            state: getProtectionState()
        };
    };
} catch (e) {}

app.registerExtension({
    name: "Practical-Tools.GraphMeta",

    beforeLoadGraph() {
        const token = ++graphSwitchToken;
        graphSwitching = true;
        lastProtectionValid = null;
        setTimeout(function () {
            if (token === graphSwitchToken) graphSwitching = false;
        }, 5000);
    },

    afterConfigureGraph() {
        graphSwitchToken++;
        lastProtectionValid = null;
        setTimeout(function () { graphSwitching = false; syncGraphProtection(); }, 0);
    },

    onGraphLoadError() {
        graphSwitchToken++;
        graphSwitching = false;
        lastProtectionValid = null;
    },

    setup() {
        setInterval(syncGraphProtection, 1000);
        setInterval(installRunGuard, 1000);
        syncGraphProtection();
        installRunGuard();
        loadRemoteKeyword(); // 保护标记：先缓存后远程，失败退避重试
    },

});
