import { app } from "../../scripts/app.js";

// ============================================================
// 工作流版本提醒
//
// 发布新版本时只改配置文件：
//   workflow_version_notice_config.js
//
// 工作流里放一个 "Apply Workflow Version Notice" 节点，节点文本是旧版本。
// 用户更新插件后打开工作流，只比较版本号，不一致就弹提醒。
// ============================================================
function getLatestVersion() {
    const cfg = window.PT_WORKFLOW_VERSION_CONFIG;
    if (cfg && typeof cfg === "object") {
        return {
            text: cfg.text == null ? "" : String(cfg.text),
            url: cfg.url == null ? "" : String(cfg.url)
        };
    }
    return { text: "", url: "" };
}

const REMOTE_CACHE_KEY = "PracticalTools.WorkflowVersionRemote";
const REMOTE_TTL_OK = 60 * 60 * 1000;   // 成功结果缓存 1 小时
const REMOTE_TTL_FAIL = 10 * 60 * 1000; // 失败后 10 分钟内不再重试
const REMOTE_HEDGE_MS = 4000;           // 主链接先等 4 秒，再让镜像补位
const REMOTE_CONFIG_URL = "https://raw.githubusercontent.com/wenchengxiang/ComfyUI-Practical-Tools/main/js/workflow_version_notice_config.js";
const REMOTE_CONFIG_MIRRORS = [
    "https://cdn.jsdelivr.net/gh/wenchengxiang/ComfyUI-Practical-Tools@main/js/workflow_version_notice_config.js",
    "https://fastly.jsdelivr.net/gh/wenchengxiang/ComfyUI-Practical-Tools@main/js/workflow_version_notice_config.js",
    "https://gcore.jsdelivr.net/gh/wenchengxiang/ComfyUI-Practical-Tools@main/js/workflow_version_notice_config.js"
];

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

function decodeBase64Utf8(value) {
    try {
        const binary = atob(String(value).replace(/\s/g, ""));
        const bytes = Uint8Array.from(binary, function (ch) { return ch.charCodeAt(0); });
        return new TextDecoder().decode(bytes);
    } catch (e) {
        return "";
    }
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
    return {
        text: unescapeJsString(textMatch[1]),
        url: urlMatch ? urlMatch[1] : ""
    };
}

async function fetchRemoteLatest() {
    const urls = [REMOTE_CONFIG_URL].concat(REMOTE_CONFIG_MIRRORS)
        .map(function (u) { return String(u || "").trim(); })
        .filter(function (u, i, arr) { return u && arr.indexOf(u) === i; });

    const now = Date.now();
    const cached = readRemoteCache();
    if (cached && cached.text && cached.checkedAt && now - cached.checkedAt < REMOTE_TTL_OK) {
        return { text: cached.text, url: cached.url || "" };
    }
    // 上次失败后 10 分钟内不再发请求：断网时不会每次打开工作流都空等一轮
    if (cached && cached.failedAt && now - cached.failedAt < REMOTE_TTL_FAIL) {
        return null;
    }

    // 主链接先发，2 秒没回再让镜像补位
    let raw = "";
    try {
        raw = await fetchHedged(urls, {}, 8000, REMOTE_HEDGE_MS);
    } catch (e) { /* 全部失败，下面走 API 兜底 */ }

    // 镜像都失败时，再试 GitHub Contents API
    if (!raw) {
        const apiUrls = urls.map(function (url) {
            const match = url.match(/raw\.githubusercontent\.com\/([^\/]+)\/([^\/]+)\/([^\/]+)\/(.+)$/);
            if (!match) return null;
            return "https://api.github.com/repos/" + match[1] + "/" + match[2] +
                "/contents/" + match[4] + "?ref=" + match[3];
        }).filter(function (u) { return !!u; });

        try {
            raw = await fetchHedged(apiUrls, {
                headers: { Accept: "application/vnd.github+json" }
            }, 8000, REMOTE_HEDGE_MS, function (response) {
                return response.json().then(function (data) {
                    return decodeBase64Utf8(data.content || "");
                });
            });
        } catch (e) { /* ignore */ }
    }

    const remote = parseRemoteConfig(raw);
    if (!remote || !remote.text) {
        // 记住失败时间，10 分钟内不再重试；已经成功过的旧文本保留着
        writeRemoteCache({
            text: (cached && cached.text) || "",
            url: (cached && cached.url) || "",
            checkedAt: (cached && cached.checkedAt) || 0,
            failedAt: Date.now()
        });
        return null;
    }

    // 缓存只增不减：镜像滞后时不要把已记下的新版本覆盖成旧版本
    const incoming = normalizeLatestVersion(remote.text);
    const previous = cached && cached.text ? normalizeLatestVersion(cached.text) : "";
    if (!previous || !incoming || !isVersionNewer(previous, incoming)) {
        writeRemoteCache({ text: remote.text, url: remote.url, checkedAt: Date.now() });
    }
    return remote;
}

// 官方弹窗插入时就应用宽度，避免先按 md 渲染再被 JS 缩短
(function injectVersionDialogWidthCss() {
    const id = "pt-version-dialog-width-style";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent =
        '[data-dialog-key^="pt-workflow-version-notice-"]{' +
        'max-width:420px !important;' +
        'width:min(420px, calc(100vw - 32px)) !important;' +
        '}';
    document.head.appendChild(style);
})();

const NODE_TYPE = "wcx_ApplyWorkflowVersionNotice";
const NODE_TITLE = "Apply Workflow Version Notice";

function normalizeVersion(value) {
    // 通用提取：节点里的 v0.017 或任意文本中的版本号
    const text = String(value == null ? "" : value).replace(/\r\n/g, "\n");
    const match = text.match(/v?\d+(?:\.\d+)+/i);
    return match ? match[0].toLowerCase().replace(/^v/, "") : "";
}

function normalizeLatestVersion(value) {
    // 远端配置只认“最新版本:”这一行
    const text = String(value == null ? "" : value).replace(/\r\n/g, "\n");
    const lineMatch = text.match(/最新版本(?:号)?\s*[:：]\s*([^\n]+)/);
    if (!lineMatch) return "";
    const match = lineMatch[1].match(/v?\d+(?:\.\d+)+/i);
    return match ? match[0].toLowerCase().replace(/^v/, "") : "";
}

function versionNodeText(node) {
    if (!node) return "";
    const widget = (node.widgets || []).find(function (w) {
        return w && w.name === "text";
    });
    if (widget && widget.value != null) return String(widget.value);
    return node.properties && node.properties.text != null
        ? String(node.properties.text)
        : "";
}

function relabelVersionDialog(dialogKey) {
    // 官方 default 确认框：左“取消” -> “忽略提醒”，右“确定” -> “获取新版”
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
                    setLabel("获取新版", "pi pi-download");
                    renamed++;
                }
            });
        }
        if (renamed >= 2 || ++tries > 40) clearInterval(timer);
    }, 50);
}

function showVersionNotice(passedLatest) {
    const latest = passedLatest || getLatestVersion();
    const message = latest.text || "";

    try {
        const dialog = window.app && window.app.extensionManager &&
            window.app.extensionManager.dialog;
        if (dialog && typeof dialog.confirm === "function") {
            const dialogKey = "pt-workflow-version-notice-" + Date.now();
            relabelVersionDialog(dialogKey);
            dialog.confirm({
                title: "工作流更新提醒",
                message: message,
                type: "default",
                key: dialogKey
            }).then(function (confirmed) {
                if (confirmed && latest.url) {
                    try { window.open(latest.url, "_blank", "noopener,noreferrer"); } catch (e) {}
                }
            }).catch(function () {});
            return;
        }
    } catch (e) { /* ignore */ }

    try {
        if (window.app && window.app.ui && window.app.ui.dialog &&
            typeof window.app.ui.dialog.show === "function") {
            window.app.ui.dialog.show("工作流更新提醒\n\n" + message);
            return;
        }
    } catch (e) { /* ignore */ }
    try { alert("工作流更新提醒\n\n" + message); } catch (e) { /* ignore */ }
}

class WorkflowVersionNode extends LGraphNode {
    constructor() {
        super();
        this.title = NODE_TITLE;
        this.isVirtualNode = true;
        this.serialize_widgets = true;
        this.properties = this.properties || {};
        this.size = this.size || [260, 120];

        if (this.properties.text === undefined) {
            this.properties.text = "";
        }

        this.widgets = [];
        const creator = window.comfyAPI &&
            window.comfyAPI.widgets &&
            window.comfyAPI.widgets.ComfyWidgets &&
            window.comfyAPI.widgets.ComfyWidgets.STRING;

        if (typeof creator === "function") {
            const result = creator(this, "text", ["STRING", {
                default: this.properties.text || "",
                multiline: true
            }], app);
            const widget = result && result.widget;
            if (widget) {
                widget.value = this.properties.text || "";
                widget.callback = (value) => {
                    this.properties.text = value == null ? "" : value;
                };
            }
            if (result && result.minWidth) {
                this.size[0] = Math.max(this.size[0] || 0, result.minWidth);
            }
            if (result && result.minHeight) {
                this.size[1] = Math.max(this.size[1] || 0, result.minHeight);
            }
        } else {
            const widget = this.addWidget("string", "text", this.properties.text || "", () => {});
            if (widget) {
                widget.callback = (value) => {
                    this.properties.text = value == null ? "" : value;
                };
            }
        }
    }

    onConfigure() {
        const widget = (this.widgets || []).find(function (w) {
            return w && w.name === "text";
        });
        if (!widget) return;
        if (this.properties.text == null) {
            this.properties.text = widget.value == null ? "" : widget.value;
        } else {
            widget.value = this.properties.text;
        }
    }
}

WorkflowVersionNode.title = NODE_TITLE;
WorkflowVersionNode.category = "Practical-Tools/FunctionSwitchNode";

// 只有“从侧边栏打开”或“打开本地 JSON”才算新打开，切换标签不提醒。
// 刷新页面等同于首次加载，会提醒。
let newOpenIntent = false;
let newOpenIntentTimer = 0;
let initialPageLoad = true;

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

function collectVersionNodesDeep(graph, out, seen) {
    out = out || [];
    seen = seen || new Set();
    if (!graph || seen.has(graph)) return out;
    seen.add(graph);
    const nodes = graph._nodes || graph.nodes || [];
    if (!Array.isArray(nodes)) return out;
    for (const n of nodes) {
        if (!n) continue;
        out.push(n);
        if (n.subgraph) collectVersionNodesDeep(n.subgraph, out, seen);
    }
    return out;
}

function versionParts(value) {
    return String(value == null ? "" : value)
        .replace(/^v/i, "")
        .split("-")[0]
        .split(".")
        .map(function (part) { return parseInt(part, 10) || 0; });
}

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

async function checkWorkflowVersion() {
    try {
        const graph = app.graph;
        if (!graph) return;

        const nodes = collectVersionNodesDeep(graph).filter(function (n) {
            return n && n.type === NODE_TYPE;
        });
        if (nodes.length === 0) return;

        const remote = await fetchRemoteLatest();
        if (!remote) return;
        const latest = remote;
        const expected = normalizeLatestVersion(latest.text);
        if (!expected) return;

        // 只有远端严格更新才算过期。镜像同步滞后时会返回更旧的版本号，
        // 用"不相等"判断会让用户每次打开工作流都收到假提醒。
        const outdated = nodes.some(function (n) {
            const local = normalizeVersion(versionNodeText(n));
            return local && isVersionNewer(expected, local);
        });
        if (!outdated) return;

        showVersionNotice(latest);
    } catch (e) { /* ignore */ }
}

try {
    window.__ptVersionDebug = function () {
        const latest = getLatestVersion();
        const graph = app.graph;
        const nodes = graph ? collectVersionNodesDeep(graph).filter(function (n) {
            return n && n.type === NODE_TYPE;
        }) : [];
        return {
            config: latest,
            expected: normalizeLatestVersion(latest.text),
            nodes: nodes.map(function (n) {
                const text = versionNodeText(n);
                return {
                    id: n.id,
                    type: n.type,
                    text: text,
                    version: normalizeVersion(text)
                };
            }),
            newOpenIntent: newOpenIntent
        };
    };
    window.__ptVersionCheck = checkWorkflowVersion;
} catch (e) {}

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

app.registerExtension({
    name: "Practical-Tools.WorkflowVersion",

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

        // 刷新页面：第一次加载也检查
        if (isInitialLoad) {
            setTimeout(checkWorkflowVersion, 500);
            return;
        }

        // 之后只有从侧边栏/本地文件新打开才检查；切换标签不检查
        if (!consumeNewOpenIntent()) return;
        setTimeout(checkWorkflowVersion, 500);
    },

    registerCustomNodes() {
        LiteGraph.registerNodeType(NODE_TYPE, WorkflowVersionNode);
        WorkflowVersionNode.category = "Practical-Tools/FunctionSwitchNode";
        WorkflowVersionNode.title = NODE_TITLE;
    },

    setup() {
        installNewOpenTracking();
    }
});
