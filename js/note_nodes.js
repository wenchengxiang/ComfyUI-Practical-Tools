import { app } from "../../scripts/app.js";

// 注入 CSS：Node 1.0 下用 !important 持久隐藏 DOM widget 容器（防止被 ComfyUI 渲染循环覆盖）
(function injectCss() {
    const id = "pt-note-dom-hidden-style";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = ".pt-note-dom-hidden { display: none !important; }";
    document.head.appendChild(style);
})();

// 官方弹窗插入时就应用宽度，避免先按 md 渲染再被 JS 缩短
(function injectProtectionDialogWidthCss() {
    const id = "pt-note-dialog-width-style";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent =
        '[data-dialog-key^="pt-note-protection-"]{' +
        'max-width:420px !important;' +
        'width:min(420px, calc(100vw - 32px)) !important;' +
        '}';
    document.head.appendChild(style);
})();

/** 给 PTNote 文本 widget 的 .dom-widget 容器切换隐藏 class */
function setDomWidgetHidden(widget, hidden) {
    if (!widget || !widget.element) return;
    const container = widget.element.closest(".dom-widget");
    if (container) container.classList.toggle("pt-note-dom-hidden", hidden);
}

// ============================================================
// PT Note —— 可切换 Plain text / Markdown 的笔记节点（默认配色）
//   Node 2.0：完整多行文本 / Markdown 编辑器（模式切换按钮已移除，编辑器类型由工作流 JSON 的 properties.mode 决定）
//   Node 1.0：仅显示 "PT Note: 仅限 Node 2.0" 提示条，不提供编辑
//
// 核心机制（与官方 Note、ImageCompare 完全一致）：
//   文本 widget 始终是 DOMWidgetImpl（由 ComfyWidgets.STRING / MARKDOWN 创建），
//   该对象在 Node 1.0 / 2.0 切换期间保持不变，ComfyUI 只切换渲染层：
//     - Node 2.0：Vue 渲染 DOM 编辑器（不调用 widget.draw）
//     - Node 1.0：canvas 调用 widget.draw —— 此处隐藏 DOM 元素、绘制提示条
//   因此无需监听前端模式开关、无需在切换时清空/重建 widgets，
//   同一对象两种渲染，往返切换不会错乱、不会空白。
// ============================================================

// ============================================================
// PT Note 保护标记 + 隐藏 Guard 节点
//   - PTNote 内容包含配置里的 protectKeyword 时，进入“受保护”状态；
//   - 必须同时存在 wcx_ApplyWorkflowKeyGuard，且 Guard 里保存的内容哈希与笔记一致；
//   - 删除笔记、删除 Guard、或改掉笔记内容，都会提示“请勿修改工作流关键元素，否则工作流将无法运行。”；
//   - 运行时缺少任意关键元素，会拒绝提交并报“工作流缺少关键元素”；
//   - 完整复制（PTNote + Guard 都在、内容没改）正常运行。
//   保护标记在 note_nodes_key_config.js 中编辑，不需要改源码。
// ============================================================
function getProtectKeyword() {
    const cfg = window.PT_NOTE_CONFIG;
    if (cfg && typeof cfg.protectKeyword === "string" && cfg.protectKeyword.length > 0) {
        return cfg.protectKeyword;
    }
    return "PT_PROTECTED";
}
const PROTECT_EXTRA_KEY = "ptProtectedWorkflow";
const GUARD_NODE_TYPE = "wcx_ApplyWorkflowKeyGuard";

let lastProtectionValid = null;
let lastProtectWarnAt = 0;
let lastProtectionGraph = null;
let graphSwitching = false;
let graphSwitchToken = 0;
const editingNotes = new Set();

function noteText(node) {
    if (!node) return "";
    const widget = (node.widgets || []).find(function (w) { return w && w.name === "text"; });
    if (widget && widget.value != null) return String(widget.value);
    return node.properties && node.properties.text != null ? String(node.properties.text) : "";
}

function noteHasProtection(node) {
    return noteText(node).includes(getProtectKeyword());
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

function collectPtNodesDeep(graph, out, seen) {
    out = out || [];
    seen = seen || new Set();
    if (!graph || seen.has(graph)) return out;
    seen.add(graph);
    const nodes = graph._nodes || graph.nodes || [];
    if (!Array.isArray(nodes)) return out;
    for (const n of nodes) {
        if (!n) continue;
        out.push(n);
        if (n.subgraph) collectPtNodesDeep(n.subgraph, out, seen);
    }
    return out;
}

function getGuardNodes() {
    const graph = window.app && window.app.graph;
    if (!graph) return [];
    return collectPtNodesDeep(graph).filter(function (n) {
        return n && n.type === GUARD_NODE_TYPE;
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

    const extra = graph.extra || {};
    const notes = getProtectedNotes();
    const guards = getGuardNodes();
    const hasGuardHash = guards.some(function (g) {
        return g.properties && g.properties.requiredHash;
    });
    const isProtected = !!extra[PROTECT_EXTRA_KEY] || notes.length > 0 || hasGuardHash;

    if (!isProtected) return { protected: false, valid: true, reason: "" };
    if (notes.length === 0) return { protected: true, valid: false, reason: "缺少 PTNote 说明节点" };
    if (guards.length === 0) return { protected: true, valid: false, reason: "缺少 Workflow Key Guard 节点" };

    const guardReady = guards.some(function (g) {
        return g.properties && g.properties.requiredHash;
    });
    if (!guardReady) {
        return { protected: true, valid: false, reason: "关键节点尚未初始化" };
    }

    if (notes.some(isNoteCollapsed)) {
        // 折叠不提醒，但运行时不允许
        return { protected: true, valid: false, reason: "PTNote 被折叠", silent: true };
    }

    return { protected: true, valid: true, reason: "" };
}

function undoLastChange() {
    try {
        const command = window.app && window.app.extensionManager &&
            window.app.extensionManager.command;
        if (command && typeof command.execute === "function") {
            Promise.resolve(command.execute("Comfy.Undo")).catch(function () {});
        }
    } catch (e) { /* ignore */ }
}

function relabelProtectionDialog(dialogKey) {
    let tries = 0;
    const timer = setInterval(function () {
        const root = document.querySelector('[data-dialog-key="' + dialogKey + '"]');
        if (root) {
            root.querySelectorAll("button").forEach(function (btn) {
                if (!btn.offsetParent) return;
                const text = (btn.textContent || "").trim();
                const icon = btn.querySelector("i");

                function setLabel(btn, icon, label, iconClass) {
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

                // 默认确认框：左“取消” -> “忽略警告”，右“确定” -> “撤销修改”
                if (text === "取消") {
                    setLabel(btn, icon, "忽略警告", "pi pi-times");
                } else if (text === "确定" || text === "确认") {
                    setLabel(btn, icon, "撤销修改", "pi pi-undo");
                }
            });
        }
        if (++tries > 40) clearInterval(timer);
    }, 50);
}

function showProtectionError(message, title, onUndo) {
    const dialogTitle = title || "工作流修改警告";

    try {
        const dialog = window.app && window.app.extensionManager &&
            window.app.extensionManager.dialog;
        if (dialog && typeof dialog.confirm === "function") {
            const dialogKey = "pt-note-protection-" + Date.now();
            relabelProtectionDialog(dialogKey);
            dialog.confirm({
                title: dialogTitle,
                message: message,
                type: "default",
                key: dialogKey
            }).then(function (confirmed) {
                if (confirmed === true && typeof onUndo === "function") onUndo();
            }).catch(function () {});
            return;
        }
    } catch (e) { /* ignore */ }

    try {
        if (window.app && window.app.ui && window.app.ui.dialog && typeof window.app.ui.dialog.show === "function") {
            window.app.ui.dialog.show(dialogTitle + "\n\n" + message);
            return;
        }
    } catch (e) { /* ignore */ }
    try { alert(dialogTitle + "\n\n" + message); } catch (e) { /* ignore */ }
}

function warnProtection(message, title, onUndo) {
    const now = Date.now();
    if (now - lastProtectWarnAt < 3000) return;
    lastProtectWarnAt = now;
    showProtectionError(message, title, onUndo);
}

function bindNoteEditorFocus(node, widget) {
    const el = widget && widget.element;
    if (!el || el.__ptProtectFocusBound) return;
    el.__ptProtectFocusBound = true;
    el.addEventListener("focusin", function () {
        editingNotes.add(node);
        node._ptProtectedAtFocus = noteHasProtection(node);
    });
    el.addEventListener("focusout", function () {
        editingNotes.delete(node);
        setTimeout(function () { commitNoteEdit(node); }, 0);
    });
}

function bindAllNoteEditors() {
    const graph = window.app && window.app.graph;
    if (!graph) return;
    collectPtNodesDeep(graph).forEach(function (node) {
        if (!node || node.type !== "PTNote") return;
        const widget = (node.widgets || []).find(function (w) { return w && w.name === "text"; });
        bindNoteEditorFocus(node, widget);
    });
}

let focusTrackingInstalled = false;
function installDocumentFocusTracking() {
    if (focusTrackingInstalled) return;
    focusTrackingInstalled = true;

    function nodeFromTarget(target) {
        if (!(target instanceof Element)) return null;
        const nodeEl = target.closest("[data-node-id]");
        if (!nodeEl) return null;
        const graph = window.app && window.app.graph;
        if (!graph || typeof graph.getNodeById !== "function") return null;
        const node = graph.getNodeById(nodeEl.getAttribute("data-node-id"));
        return node && node.type === "PTNote" ? node : null;
    }

    document.addEventListener("focusin", function (event) {
        const node = nodeFromTarget(event.target);
        if (!node) return;
        editingNotes.add(node);
        node._ptProtectedAtFocus = noteHasProtection(node);
    }, true);

    document.addEventListener("focusout", function (event) {
        const node = nodeFromTarget(event.target);
        if (!node) return;
        editingNotes.delete(node);
        setTimeout(function () { commitNoteEdit(node); }, 0);
    }, true);
}

function commitNoteEdit(node) {
    if (editingNotes.has(node)) return;
    try {
        const wasProtected = !!node._ptProtectedAtFocus;
        node._ptProtectedAtFocus = false;
        if (wasProtected && !noteHasProtection(node)) {
            warnProtection("请勿修改工作流关键元素，否则工作流将无法运行。", undefined, undoLastChange);
        }
    } catch (e) { /* ignore */ }
    syncGraphProtection();
}

function syncGraphProtection() {
    if (graphSwitching) return;
    if (window.app && window.app.configuringGraph) return;
    const graph = window.app && window.app.graph;
    if (!graph || !Array.isArray(graph._nodes)) return;

    const activeGraph = (window.app.canvas && window.app.canvas.graph) || graph;
    if (activeGraph !== lastProtectionGraph) {
        lastProtectionGraph = activeGraph;
        lastProtectionValid = null;
        editingNotes.clear();
    }

    if (editingNotes.size > 0) return;
    if (!graph.extra || typeof graph.extra !== "object") graph.extra = {};

    const notes = getProtectedNotes();
    const guards = getGuardNodes();

    if (notes.length > 0 && guards.length > 0) {
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
    if (state.protected && !state.valid && lastProtectionValid === true && !state.silent) {
        warnProtection("请勿修改工作流关键元素，否则工作流将无法运行。", undefined, undoLastChange);
    }
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
                const message = "工作流缺少关键元素，无法运行。";
                console.error("[PT Note]", message, state.reason);
                // 运行失败的提示交给 ComfyUI 右上角官方通知，这里不再弹自定义对话框
                return Promise.reject(new Error(message));
            }
        } catch (e) { /* 保护逻辑失败时不阻塞正常提交 */ }
        return original.apply(this, arguments);
    };
    appRef.__ptProtectRunHooked = true;
}

class wcx_ApplyWorkflowKeyGuard extends LGraphNode {
    constructor() {
        super();
        this.title = "Apply Workflow Key Guard";
        this.isVirtualNode = true;
        this.serialize_widgets = true;
        this.properties = this.properties || {};
        if (this.properties.requiredHash === undefined) this.properties.requiredHash = "";
        if (this.properties.noteId === undefined) this.properties.noteId = null;
        this.widgets = [];
        this.size = [140, 30];
        this.flags = this.flags || {};
        this.flags.collapsed = true;
    }

    onAdded() {
        setTimeout(syncGraphProtection, 0);
    }

    onConfigure() {
        setTimeout(syncGraphProtection, 0);
    }

    onRemoved() {
        try {
            const graph = window.app && window.app.graph;
            const activeGraph = (window.app && window.app.canvas && window.app.canvas.graph) || graph;
            const graphChanged = this.graph && activeGraph && this.graph !== activeGraph;
            if (!graphChanged && !graphSwitching && (!window.app || !window.app.configuringGraph)) {
                const extra = graph && graph.extra;
                if ((this.properties && this.properties.requiredHash) ||
                    (extra && extra[PROTECT_EXTRA_KEY])) {
                    warnProtection("请勿修改工作流关键元素，否则工作流将无法运行。", undefined, undoLastChange);
                }
            }
        } catch (e) { /* ignore */ }
        setTimeout(syncGraphProtection, 0);
        if (typeof super.onRemoved === "function") super.onRemoved();
    }
}

wcx_ApplyWorkflowKeyGuard.title = "Apply Workflow Key Guard";
wcx_ApplyWorkflowKeyGuard.category = "Practical-Tools/FunctionSwitchNode";

class PTNoteNode extends LGraphNode {
    constructor() {
        super();
        this.title = "PTNode";
        this.isVirtualNode = true;
        this.serialize_widgets = true;
        this.properties = this.properties || {};
        if (this.properties.text === undefined) this.properties.text = "";
        if (this.properties.mode === undefined) this.properties.mode = true; // false=Plain text, true=Markdown

        this.widgets = [];
        this._buildWidgets();
    }

    /**
     * 创建文本 widget（STRING 多行 或 MARKDOWN），并包装其 draw：
     * Node 1.0 隐藏 DOM 编辑器、绘制提示条；Node 2.0 不调用 draw，Vue 正常渲染。
     * 返回 ComfyWidgets 创建器的结果（含 minWidth/minHeight）。
     */
    _createTextWidget() {
        const typeName = this.properties.mode ? "MARKDOWN" : "STRING";
        const creator = comfyAPI.widgets.ComfyWidgets[typeName];
        const inputData = ["STRING", { default: this.properties.text || "", multiline: true }];
        const result = creator(this, "text", inputData, app);
        const textWidget = result.widget;

        if (textWidget && textWidget.options) textWidget.options.hideOnZoom = true;

        // 强制同步初始文本（MARKDOWN tiptap 异步初始化可能覆盖 default）
        if (textWidget) textWidget.value = this.properties.text || "";

        // 打字时实时同步到 properties.text（和官方 Note 一样），不再需要轮询
        const self = this;
        textWidget.callback = function (value) {
            self.properties.text = value == null ? "" : value;
            // 输入过程中不提示；等 focusout / 提交时再检查
        };
        setTimeout(function () { bindNoteEditorFocus(self, textWidget); }, 0);

        if (textWidget) {
            textWidget.draw = function (ctx, node, width, y, height, lowQuality) {
                // 仅 Node 1.0（canvas 渲染）会调用本方法：用 CSS class 持久隐藏 DOM 容器
                setDomWidgetHidden(this, true);
                if (typeof this.drawVueOnlyWarning === "function") {
                    // 保持原来的样式，只是把提示框向下移动 10px
                    ctx.save();
                    ctx.translate(0, 10);
                    this.drawVueOnlyWarning(ctx, { width: width }, "PTNote");
                    ctx.restore();
                }
            };
        }
        return result;
    }

    /** 创建全部 widgets：text（在上）；模式切换按钮已移除 */
    _buildWidgets() {
        this.widgets = [];

        const textResult = this._createTextWidget();

        // 已移除 Markdown/Plain text 切换按钮（原 mode toggle）。
        // properties.mode 仍保留：反序列化时按工作流 JSON 恢复对应编辑器类型。

        // creator 已把 text 放入 widgets
        this._applyMinSize(textResult);
    }

    _applyMinSize(textResult) {
        if (!textResult) return;
        if (textResult.minWidth) this.size[0] = Math.max(this.size[0] || 0, textResult.minWidth);
        if (textResult.minHeight) this.size[1] = Math.max(this.size[1] || 0, textResult.minHeight);
    }

    /** 保证 text 位于 mode 之前（重建 text 后它会落在末尾） */
    _moveTextToFront() {
        const textIdx = this.widgets.findIndex((w) => w.name === "text");
        if (textIdx > 0) {
            const [text] = this.widgets.splice(textIdx, 1);
            this.widgets.unshift(text);
        }
    }

    _removeTextWidget() {
        const idx = this.widgets.findIndex((w) => w.name === "text");
        if (idx < 0) return null;
        const old = this.widgets[idx];
        // 先通知 ComfyUI 清理（onRemove 会从内部 DOM 映射表移除，防止渲染循环把容器加回来）
        if (typeof old.onRemove === "function") {
            try { old.onRemove(); } catch (e) {}
        }
        if (old.element) {
            // 移除整个 .dom-widget 容器，防止残留孤儿 DOM
            const container = old.element.closest(".dom-widget");
            if (container && container.parentNode) {
                container.parentNode.removeChild(container);
            } else if (old.element.parentNode) {
                old.element.parentNode.removeChild(old.element);
            }
        }
        this.widgets.splice(idx, 1);
        return old;
    }

    /** 切换 Plain text / Markdown（模式切换按钮已移除，本方法保留供属性级调用或未来恢复按钮使用；重建文本 widget） */
    _switchMode(mode) {
        mode = !!mode;
        if (this.properties.mode === mode) return;
        this.properties.mode = mode;

        // 同步用户当前编辑的文本（切换后用它作为新 widget 的初始值）
        const oldText = this.widgets.find((w) => w.name === "text");
        if (oldText && oldText.value != null) this.properties.text = oldText.value;

        this._removeTextWidget();
        const textResult = this._createTextWidget();
        this._moveTextToFront();
        // 切换模式时完全保留用户手动调整的节点大小，不做 minSize 提升
        app.graph.setDirtyCanvas(true, true);
    }

    onConfigure() {
        // 反序列化后：按 properties.mode 恢复编辑器类型（模式切换按钮已移除，无 widget 需同步）
        const wantMarkdown = !!this.properties.mode;
        const textWidget = this.widgets.find((w) => w.name === "text");
        const isMarkdown = !!textWidget && (textWidget.type === "markdown" || textWidget.type === "MARKDOWN");

        if (wantMarkdown !== isMarkdown) {
            // 延迟到 configure 完成后重建，避免与 widgets_values 应用、tiptap 异步初始化的时序冲突
            const self = this;
            setTimeout(function () {
                // 重建时优先采用 text widget 当前值（widgets_values 已应用，代表用户最新编辑内容），
                // 避免用陈旧的 properties.text 覆盖用户编辑内容
                const currentValue = (textWidget && textWidget.value != null) ? textWidget.value : self.properties.text;
                self.properties.text = (currentValue == null ? "" : currentValue);
                self._removeTextWidget();
                const textResult = self._createTextWidget();
                self._moveTextToFront();
                // 反序列化重建时完全保留用户保存的节点大小，不做 minSize 提升或 computeSize 重设
                app.graph.setDirtyCanvas(true, true);
            }, 0);
        }
        setTimeout(syncGraphProtection, 0);
    }

    onAdded() {
        syncGraphProtection();
    }

    onRemoved() {
        try {
            const graph = window.app && window.app.graph;
            const activeGraph = (window.app && window.app.canvas && window.app.canvas.graph) || graph;
            const graphChanged = this.graph && activeGraph && this.graph !== activeGraph;
            if (!graphChanged && !graphSwitching && (!window.app || !window.app.configuringGraph)) {
                if (noteHasProtection(this)) {
                    warnProtection("请勿修改工作流关键元素，否则工作流将无法运行。", undefined, undoLastChange);
                }
            }
        } catch (e) { /* ignore */ }
        setTimeout(syncGraphProtection, 0);
        if (typeof super.onRemoved === "function") super.onRemoved();
    }
}

PTNoteNode.title = "PTNode";
PTNoteNode.category = "Practical-Tools/utils";
PTNoteNode.collapsable = true;

// 诊断用：控制台执行 __ptProtectDebug()
try {
    window.__ptProtectDebug = function () {
        const graph = window.app && window.app.graph;
        const all = graph ? collectPtNodesDeep(graph) : [];
        const notes = getProtectedNotes();
        const guards = getGuardNodes();
        return {
            keyword: getProtectKeyword(),
            config: window.PT_NOTE_CONFIG || null,
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
    name: "Practical-Tools.NoteNodes",

    beforeRegisterVueAppNodeDefs(defs) {
        try {
            for (const def of defs) {
                if (def && def.name === GUARD_NODE_TYPE) {
                    def.display_name = "Apply Workflow Key Guard";
                }
            }
        } catch (e) { /* ignore */ }
    },

    beforeLoadGraph() {
        const token = ++graphSwitchToken;
        graphSwitching = true;
        lastProtectionValid = null;
        editingNotes.clear();
        // 兜底：如果 afterConfigureGraph 没有触发，5 秒后恢复
        setTimeout(function () {
            if (token === graphSwitchToken) graphSwitching = false;
        }, 5000);
    },

    afterConfigureGraph() {
        graphSwitchToken++;
        lastProtectionValid = null;
        setTimeout(function () {
            graphSwitching = false;
            syncGraphProtection();
        }, 0);
    },

    onGraphLoadError() {
        graphSwitchToken++;
        graphSwitching = false;
        lastProtectionValid = null;
    },

    setup() {
        installDocumentFocusTracking();
        // 轻量轮询：Node 1.0 时隐藏所有 PTNote 的 DOM 编辑器容器，Node 2.0 时恢复；
        // 同时把编辑内容兜底同步到 properties.text（DOM 输入更新 widget.value 时不会经过 value setter）
        // node1.0 隐藏 DOM 编辑器（仅兼容用）；文本同步已走 widget.callback，无需轮询
        setInterval(function () {
            const isV1 = !document.querySelector(".lg-node");
            if (!isV1) return;
            if (!app.graph || !app.graph._nodes) return;
            for (const n of app.graph._nodes) {
                if (n.type !== "PTNote") continue;
                const w = n.widgets && n.widgets.find(function (x) { return x.name === "text"; });
                setDomWidgetHidden(w, true);
            }
        }, 1000);

        setInterval(function () {
            bindAllNoteEditors();
            syncGraphProtection();
            installRunGuard();
        }, 1000);
        bindAllNoteEditors();
        syncGraphProtection();
        installRunGuard();
    },

    registerCustomNodes() {
        LiteGraph.registerNodeType("PTNote", PTNoteNode);
        LiteGraph.registerNodeType(GUARD_NODE_TYPE, wcx_ApplyWorkflowKeyGuard);
        // registerNodeType 会按类型名推导分类，这里强制覆盖
        PTNoteNode.category = "Practical-Tools/utils";
        wcx_ApplyWorkflowKeyGuard.category = "Practical-Tools/FunctionSwitchNode";
    },
});
