import { app } from "../../scripts/app.js";

// =====================================================================
// Apply Plugin Version Notice
//
// 工作流里放这个节点，记录制作工作流时的插件版本。
// 打开工作流时，比较节点里的版本和当前安装插件版本。
// 仅在新打开工作流 / 刷新页面加载时提醒；切换标签不提醒。
// =====================================================================

const NODE_TYPE = "wcx_ApplyPluginVersionNotice";
const NODE_TITLE = "Apply Plugin Version Notice";
const DIALOG_KEY_PREFIX = "pt-plugin-node-notice-";
const STYLE_ID = "pt-plugin-node-notice-style";
const REMOTE_CONFIG_URL = "https://raw.githubusercontent.com/wenchengxiang/ComfyUI-Practical-Tools/main/js/plugin_version_notice_config.js";
const REMOTE_CONFIG_MIRRORS = [
    "https://cdn.jsdelivr.net/gh/wenchengxiang/ComfyUI-Practical-Tools@main/js/plugin_version_notice_config.js",
    "https://fastly.jsdelivr.net/gh/wenchengxiang/ComfyUI-Practical-Tools@main/js/plugin_version_notice_config.js",
    "https://gcore.jsdelivr.net/gh/wenchengxiang/ComfyUI-Practical-Tools@main/js/plugin_version_notice_config.js"
];
const REMOTE_CACHE_KEY = "PracticalTools.PluginRemoteVersion";
const REMOTE_TTL_OK = 60 * 60 * 1000;   // 成功结果缓存 1 小时
const REMOTE_TTL_FAIL = 10 * 60 * 1000; // 失败后 10 分钟内不再重试
const REMOTE_HEDGE_MS = 4000;           // 主链接先等 4 秒，再让镜像补位

const DEFAULT_REPO = "wenchengxiang/ComfyUI-Practical-Tools";
const DEFAULT_CHECK_HOURS = 1;

function normalizeLatestVersion(value) {
    const text = String(value == null ? "" : value).replace(/\r\n/g, "\n");
    const lineMatch = text.match(/最新版本(?:号)?\s*[:：]\s*([^\n]+)/);
    if (!lineMatch) return "";
    const match = lineMatch[1].match(/v?\d+(?:\.\d+)+/i);
    return match ? match[0].toLowerCase().replace(/^v/, "") : "";
}

function getCurrentPluginVersion() {
    const cfg = window.PT_PLUGIN_UPDATE_CONFIG || {};
    return normalizeLatestVersion(cfg.text);
}

function getPluginUrl() {
    const cfg = window.PT_PLUGIN_UPDATE_CONFIG || {};
    return cfg.url == null ? "" : String(cfg.url);
}

function extractVersion(value) {
    const text = String(value == null ? "" : value).replace(/\r\n/g, "\n");
    const match = text.match(/v?\d+(?:\.\d+)+/i);
    return match ? match[0].toLowerCase().replace(/^v/, "") : "";
}

function versionParts(value) {
    return String(value == null ? "" : value)
        .replace(/^v/i, "")
        .split("-")[0]
        .split(".")
        .map(function (part) { return parseInt(part, 10) || 0; });
}

// latest 是否严格大于 local
function isVersionNewer(latest, local) {
    const a = versionParts(latest);
    const b = versionParts(local);
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
        const x = a[i] || 0;
        const y = b[i] || 0;
        if (x > y) return true;
        if (x < y) return false;
    }
    return false;
}

function collectNodesDeep(graph, out, seen) {
    out = out || [];
    seen = seen || new Set();
    if (!graph || seen.has(graph)) return out;
    seen.add(graph);
    const nodes = graph._nodes || graph.nodes || [];
    if (!Array.isArray(nodes)) return out;
    for (const node of nodes) {
        if (!node) continue;
        out.push(node);
        if (node.subgraph) collectNodesDeep(node.subgraph, out, seen);
    }
    return out;
}

(function injectDialogWidthCss() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
        '[data-dialog-key^="pt-plugin-node-notice-"]{' +
        'max-width:420px !important;' +
        'width:min(420px, calc(100vw - 32px)) !important;' +
        '}';
    document.head.appendChild(style);
})();

class ApplyPluginVersionNotice extends LGraphNode {
    constructor() {
        super();
        this.title = NODE_TITLE;
        this.isVirtualNode = true;
        this.serialize_widgets = true;
        this.properties = this.properties || {};
        this.size = this.size || [240, 30];
        this.widgets = [];
    }

    onConfigure() {
        // 纯标记节点，不需要配置
    }
}

ApplyPluginVersionNotice.title = NODE_TITLE;
ApplyPluginVersionNotice.category = "Practical-Tools/FunctionSwitchNode";

let initialPageLoad = true;
let newOpenIntent = false;
let newOpenIntentTimer = 0;

function markNewOpenIntent() {
    newOpenIntent = true;
    clearTimeout(newOpenIntentTimer);
    newOpenIntentTimer = setTimeout(function () {
        newOpenIntent = false;
    }, 30000);
}

function consumeNewOpenIntent() {
    if (!newOpenIntent) return false;
    newOpenIntent = false;
    clearTimeout(newOpenIntentTimer);
    return true;
}

function installNewOpenTracking() {
    if (installNewOpenTracking.done) return;
    installNewOpenTracking.done = true;

    document.addEventListener("pointerdown", function (event) {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest(".close-workflow-button")) return;
        if (target.closest(".comfyui-workflows-panel") &&
            target.closest(".tree-explorer-item")) {
            markNewOpenIntent();
        }
    }, true);

    document.addEventListener("change", function (event) {
        const target = event.target;
        if (!target || target.tagName !== "INPUT" || target.type !== "file") return;
        const accept = String(target.accept || "").toLowerCase();
        if (accept.includes("json") || accept.includes(".json")) {
            markNewOpenIntent();
        }
    }, true);

    document.addEventListener("drop", function (event) {
        const files = event.dataTransfer && event.dataTransfer.files;
        if (!files || !files.length) return;
        for (const file of files) {
            if (/\.json$/i.test(file.name || "")) {
                markNewOpenIntent();
                break;
            }
        }
    }, true);
}

function relabelDialog(dialogKey) {
    let tries = 0;
    let renamed = 0;
    const timer = setInterval(function () {
        const root = document.querySelector('[data-dialog-key="' + dialogKey + '"]');
        if (root) {
            root.querySelectorAll("button").forEach(function (btn) {
                if (!btn.offsetParent) return;
                const text = (btn.textContent || "").trim();
                const icon = btn.querySelector("i");

                function setLabel(label, iconClass) {
                    if (icon) icon.className = iconClass;
                    let replaced = false;
                    btn.childNodes.forEach(function (node) {
                        if (node.nodeType === 3 && (node.textContent || "").trim() === text) {
                            node.textContent = " " + label;
                            replaced = true;
                        }
                    });
                    if (!replaced) {
                        if (icon) btn.appendChild(document.createTextNode(" " + label));
                        else btn.textContent = label;
                    }
                }

                if (text === "取消") {
                    setLabel("忽略提醒", "pi pi-times");
                    renamed++;
                } else if (text === "确定" || text === "确认") {
                    setLabel("更新插件", "pi pi-download");
                    renamed++;
                }
            });
        }
        if (renamed >= 2 || ++tries > 40) clearInterval(timer);
    }, 50);
}

async function openPluginManager() {
    try {
        const command = window.app && window.app.extensionManager &&
            window.app.extensionManager.command;
        if (!command || typeof command.execute !== "function") return false;

        await command.execute("Comfy.OpenManagerDialog");

        return await new Promise(function (resolve) {
            let attempts = 0;

            function fillSearch(root) {
                let inputTries = 0;
                function tryFill() {
                    const input = root && root.querySelector("input");
                    if (!input) {
                        if (inputTries++ < 6) setTimeout(tryFill, 200);
                        return;
                    }
                    try {
                        const setter = Object.getOwnPropertyDescriptor(
                            HTMLInputElement.prototype, "value"
                        ).set;
                        setter.call(input, "ComfyUI-Practical-Tools");
                        input.dispatchEvent(new Event("input", { bubbles: true }));
                        input.dispatchEvent(new Event("change", { bubbles: true }));
                        input.focus();
                    } catch (e) {}
                }
                tryFill();
            }

            function waitManager() {
                const root = document.querySelector(".manager-dialog");
                if (root) {
                    fillSearch(root);
                    resolve(true);
                    return;
                }
                if (attempts++ > 10) {
                    resolve(false);
                    return;
                }
                setTimeout(waitManager, 300);
            }

            setTimeout(waitManager, 300);
        });
    } catch (e) {
        return false;
    }
}

window.__ptOpenPluginManager = openPluginManager;

function showNotice(remote, currentVersion) {
    const title = "工作流插件更新提醒";
    const message = String((remote && remote.text) ||
        "发现新版本插件，建议更新后再使用工作流。");
    const downloadUrl = (remote && remote.url) || getPluginUrl();

    try {
        const dialog = window.app && window.app.extensionManager &&
            window.app.extensionManager.dialog;
        if (dialog && typeof dialog.confirm === "function") {
            const dialogKey = DIALOG_KEY_PREFIX + Date.now();
            relabelDialog(dialogKey);
            dialog.confirm({
                title: title,
                message: message,
                type: "default",
                key: dialogKey
            }).then(async function (confirmed) {
                if (!confirmed) return;
                let opened = false;
                try {
                    opened = await openPluginManager();
                } catch (e) {}
                if (!opened && downloadUrl) {
                    try {
                        window.open(downloadUrl, "_blank", "noopener,noreferrer");
                    } catch (e) {}
                }
            }).catch(function () {});
            return;
        }
    } catch (e) { /* ignore */ }

    try {
        if (window.app && window.app.ui && window.app.ui.dialog &&
            typeof window.app.ui.dialog.show === "function") {
            window.app.ui.dialog.show(title + "\n\n" + message);
            return;
        }
    } catch (e) { /* ignore */ }
    try { alert(title + "\n\n" + message); } catch (e) { /* ignore */ }
}

function unescapeJsString(value) {
    return String(value)
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
}

function parseRemoteConfig(raw) {
    if (!raw) return null;
    const textMatch = raw.match(/text\s*:\s*"((?:\\.|[^"\\])*)"/);
    const urlMatch = raw.match(/(?:^|\s)url\s*:\s*"([^"]*)"/m);
    if (!textMatch) return null;
    const text = unescapeJsString(textMatch[1]);
    const version = normalizeLatestVersion(text);
    if (!version) return null;
    return {
        text: text,
        url: urlMatch ? urlMatch[1] : "",
        version: version
    };
}

function fetchWithTimeout(url, options, timeoutMs, outerSignal) {
    if (typeof AbortController !== "function") return fetch(url, options);
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, timeoutMs || 8000);
    if (outerSignal) {
        if (outerSignal.aborted) controller.abort();
        else outerSignal.addEventListener("abort", function () { controller.abort(); }, { once: true });
    }
    return fetch(url, Object.assign({}, options, { signal: controller.signal }))
        .finally(function () { clearTimeout(timer); });
}
// 先请求主链接；hedgeMs 内没拿到内容，再让镜像一起补上。
// 主链接先回就用主链接 —— 镜像的定时器会被清掉，不会白发请求。
// 镜像迟迟不回也不拖累主链接，最坏 = hedgeMs + timeout。
function fetchHedged(urls, options, timeoutMs, hedgeMs, decode) {
    return new Promise(function (resolve, reject) {
        var settled = false;
        var pending = 0;
        var launched = 0;
        var timers = [];
        // 谁先赢就掐掉其余还在飞的请求，慢镜像不再白跑
        var group = (typeof AbortController === "function") ? new AbortController() : null;

        function finish(value) {
            if (settled) return;
            settled = true;
            for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
            if (group) { try { group.abort(); } catch (e) { /* ignore */ } }
            if (value) resolve(value);
            else reject(new Error("all failed"));
        }

        function launch(url) {
            if (settled) return;
            launched++;
            pending++;
            fetchWithTimeout(url, options, timeoutMs, group ? group.signal : null).then(function (response) {
                if (!response.ok) return "";
                return decode ? decode(response) : response.text();
            }).then(function (text) {
                pending--;
                if (text) { finish(text); return; }
                if (!pending && launched >= urls.length) finish("");
            }, function () {
                pending--;
                if (!pending && launched >= urls.length) finish("");
            });
        }

        if (!urls.length) { finish(""); return; }
        launch(urls[0]);
        for (var i = 1; i < urls.length; i++) {
            (function (url) {
                timers.push(setTimeout(function () { launch(url); }, hedgeMs));
            })(urls[i]);
        }
    });
}

function readRemoteCache() {
    try {
        return JSON.parse(localStorage.getItem(REMOTE_CACHE_KEY) || "null");
    } catch (e) {
        return null;
    }
}

function writeRemoteCache(value) {
    try {
        localStorage.setItem(REMOTE_CACHE_KEY, JSON.stringify(value));
    } catch (e) { /* ignore */ }
}

async function getRemoteVersion() {
    const now = Date.now();
    const cached = readRemoteCache();
    if (cached && cached.text && cached.version && cached.checkedAt &&
        now - cached.checkedAt < REMOTE_TTL_OK) {
        return cached;
    }
    // 上次失败后 10 分钟内不再发请求
    if (cached && cached.failedAt && now - cached.failedAt < REMOTE_TTL_FAIL) {
        return null;
    }

    const urls = [REMOTE_CONFIG_URL].concat(REMOTE_CONFIG_MIRRORS)
        .map(function (u) { return String(u || "").trim(); })
        .filter(function (u, i, arr) { return u && arr.indexOf(u) === i; });

    // 主链接先发，2 秒没回再让镜像补位
    let raw = "";
    try {
        raw = await fetchHedged(urls, {}, 8000, REMOTE_HEDGE_MS);
    } catch (e) { /* 全部失败 */ }

    const remote = raw ? parseRemoteConfig(raw) : null;
    if (!remote) {
        writeRemoteCache({
            text: (cached && cached.text) || "",
            url: (cached && cached.url) || "",
            version: (cached && cached.version) || "",
            checkedAt: (cached && cached.checkedAt) || 0,
            failedAt: Date.now()
        });
        return null;
    }

    writeRemoteCache({
        text: remote.text,
        url: remote.url,
        version: remote.version,
        checkedAt: Date.now()
    });
    return remote;
}

async function checkPluginVersion() {
    try {
        const graph = app.graph;
        if (!graph || !Array.isArray(graph._nodes)) return;

        const current = getCurrentPluginVersion();
        if (!current) return;

        const nodes = collectNodesDeep(graph).filter(function (n) {
            return n && n.type === NODE_TYPE;
        });
        if (nodes.length === 0) return;

        const remote = await getRemoteVersion();
        if (!remote || !remote.version) return;
        // 只有远端严格更新才提醒：镜像滞后返回旧版本时不该弹窗
        if (!isVersionNewer(remote.version, current)) return;

        showNotice(remote, current);
    } catch (e) { /* ignore */ }
}

app.registerExtension({
    name: "Practical-Tools.ApplyPluginVersionNotice",

    beforeRegisterVueAppNodeDefs(defs) {
        try {
            for (const def of defs) {
                if (def && def.name === NODE_TYPE) {
                    def.display_name = NODE_TITLE;
                }
            }
        } catch (e) { /* ignore */ }
    },

    afterLoadGraph() {
        const isInitialLoad = initialPageLoad;
        initialPageLoad = false;

        if (isInitialLoad) {
            setTimeout(checkPluginVersion, 500);
            return;
        }

        if (!consumeNewOpenIntent()) return;
        setTimeout(checkPluginVersion, 500);
    },

    registerCustomNodes() {
        LiteGraph.registerNodeType(NODE_TYPE, ApplyPluginVersionNotice);
        ApplyPluginVersionNotice.category = "Practical-Tools/FunctionSwitchNode";
        ApplyPluginVersionNotice.title = NODE_TITLE;
    },

    setup() {
        installNewOpenTracking();
    }
});
