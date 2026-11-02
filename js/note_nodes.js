import { app } from "../../scripts/app.js";

// 注入 CSS：Node 1.0 下用 !important 持久隐藏 DOM widget 容器（防止被 ComfyUI 渲染循环覆盖）
(function injectCss() {
    const id = "pt-note-dom-hidden-style";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent =
        ".pt-note-dom-hidden { display: none !important; }" +
        // 链接悬停换成蓝色手形光标：系统光标无法改颜色，只能整张替换。
        // url(...) 后两个数字是热点坐标（食指指尖），必须落在图片范围内。
        '.comfy-markdown-content a:hover{cursor:url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAB+ElEQVR4nGNkwAKERNRCGBgYMhkYGL4wMDBMf/fm1g4GegIhEbW9/nP+/wdhIRG1jbS0iwmHuD2MwcrG6ickosZGbwcwwxi/f/1mePfm1i96O4BugIUYRUIiaksZGBhAoTCdgYHhLwi/e3PrAt0cYNtxMwpEH65QZ9DT10749/cfw5UrDJUMDAzg3EGJY5hIVJ/AH7mOQTBmA4idqaOjeR6EhUTUquniAF4+XmSuHMghMMfQxQF4HCPNQCsHsLKxwtliYiLk2kPYAUI4ChuLpitwtlQKokQ2qDpDHQcIiagFComo7WJlY/0pJKLWTstSD6sDGBgYMm07brqCfJqWFlfBxMz8k94OYINxritVM1i3XmNQUJSjqwOm355ohyIom76bfg549+bWyhfPX9b/Wg8u7MgFvyjKBe/e3Go6efLsRJUbDeSa84IiB4DAuze3CuYvWD43mH01AxngCAOVCqLp5ZUtJBnwfU04WB9VHPDuza2zP3/8yH2/JIAozb5MyxjOnLkAajNSLQQY3r25NeXKlesdD6c549Vo/mYSQwUktMj2PQgw4pIQElFLZufgmBMfFwYuH2DA9ec8hjXrtjBcunh1CgMDQ9O7N7de08QBICAkosbJwMCQxsDAAGqm8zMwMIAsAzU+loGiC6xoFIyCUTAKGCgDAMrjmu+p5fx0AAAAAElFTkSuQmCC") 6 0,pointer !important;}';
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
// 注：PTNote 的“关键元素”保护与 Apply Graph Meta 已拆分到 graph_meta.js

function noteText(node) {
    if (!node) return "";
    const widget = (node.widgets || []).find(function (w) { return w && w.name === "text"; });
    const fromWidget = widget && widget.value != null ? String(widget.value) : "";
    if (fromWidget) return fromWidget;
    // 折叠时 Node 2.0 会卸载 DOM 编辑器，widget.value 可能变空 -> 回退到 properties.text
    const fromProps = node.properties && node.properties.text != null ? String(node.properties.text) : "";
    return fromProps || fromWidget;
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
    }

    onAdded() {}

    onRemoved() {
        if (typeof super.onRemoved === "function") super.onRemoved();
    }
}

window.PT_NOTE_API = { text: noteText, collect: collectPtNodesDeep };

PTNoteNode.title = "PTNode";
PTNoteNode.category = "Practical-Tools/utils";
PTNoteNode.collapsable = true;

app.registerExtension({
    name: "Practical-Tools.NoteNodes",

    setup() {
        // Node 1.0 时隐藏 PTNote 的 DOM 编辑器（仅兼容用）；文本同步走 widget.callback，无需轮询
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
    },

    registerCustomNodes() {
        LiteGraph.registerNodeType("PTNote", PTNoteNode);
        PTNoteNode.category = "Practical-Tools/utils";
    },
});
