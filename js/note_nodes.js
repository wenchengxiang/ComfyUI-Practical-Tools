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

/** 给 PTNote 文本 widget 的 .dom-widget 容器切换隐藏 class */
function setDomWidgetHidden(widget, hidden) {
    if (!widget || !widget.element) return;
    const container = widget.element.closest(".dom-widget");
    if (container) container.classList.toggle("pt-note-dom-hidden", hidden);
}

// ============================================================
// PT Note —— 可切换 Plain text / Markdown 的笔记节点（默认配色）
//   Node 2.0：完整多行文本 / Markdown 编辑器 + 底部模式切换
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

class PTNoteNode extends LGraphNode {
    constructor() {
        super();
        this.title = "PT Note";
        this.isVirtualNode = true;
        this.serialize_widgets = true;
        this.properties = this.properties || {};
        if (this.properties.text === undefined) this.properties.text = "";
        if (this.properties.mode === undefined) this.properties.mode = false; // false=Plain text, true=Markdown

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

        if (textWidget) {
            textWidget.draw = function (ctx, node, width, y, height, lowQuality) {
                // 仅 Node 1.0（canvas 渲染）会调用本方法：用 CSS class 持久隐藏 DOM 容器
                setDomWidgetHidden(this, true);
                if (typeof this.drawVueOnlyWarning === "function") {
                    this.drawVueOnlyWarning(ctx, { width: width }, "PT Note");
                }
            };
        }
        return result;
    }

    /** 创建全部 widgets：text（在上）+ mode 切换（在下） */
    _buildWidgets() {
        this.widgets = [];

        const textResult = this._createTextWidget();

        const modeWidget = this.addWidget(
            "toggle",
            "mode",
            !!this.properties.mode,
            (v) => { this._switchMode(v); },
            { on: "Markdown", off: "Plain text", serialize: false }
        );
        // Node 1.0 下不绘制模式开关；Node 2.0 由 Vue 渲染（不调用 draw）
        modeWidget.draw = function () {};

        // creator 已把 text 放入 widgets，toggle 紧随其后，顺序即 [text, mode]
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

    /** 切换 Plain text / Markdown（仅 Node 2.0 可触发；重建文本 widget，mode 开关保持不动） */
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
        // 反序列化后：同步 mode 开关
        const modeWidget = this.widgets.find((w) => w.name === "mode");
        if (modeWidget) modeWidget.value = !!this.properties.mode;

        const wantMarkdown = !!this.properties.mode;
        const textWidget = this.widgets.find((w) => w.name === "text");
        const isMarkdown = !!textWidget && (textWidget.type === "markdown" || textWidget.type === "MARKDOWN");

        if (wantMarkdown !== isMarkdown) {
            // 延迟到 configure 完成后重建，避免与 widgets_values 应用、tiptap 异步初始化的时序冲突
            const self = this;
            setTimeout(function () {
                if (!self.properties.text && textWidget && textWidget.value != null) {
                    self.properties.text = textWidget.value;
                }
                self._removeTextWidget();
                const textResult = self._createTextWidget();
                self._moveTextToFront();
                // 反序列化重建时完全保留用户保存的节点大小，不做 minSize 提升或 computeSize 重设
                app.graph.setDirtyCanvas(true, true);
            }, 0);
        }
    }
}

PTNoteNode.title = "PT Note";
PTNoteNode.category = "Practical-Tools/utils";
PTNoteNode.collapsable = true;

app.registerExtension({
    name: "Practical-Tools.NoteNodes",

    setup() {
        // 轻量轮询：Node 1.0 时隐藏所有 PTNote 的 DOM 编辑器容器，Node 2.0 时恢复
        setInterval(function () {
            const isV1 = !document.querySelector(".lg-node");
            if (!app.graph || !app.graph._nodes) return;
            for (const n of app.graph._nodes) {
                if (n.type !== "PTNote") continue;
                const w = n.widgets && n.widgets.find(function (x) { return x.name === "text"; });
                setDomWidgetHidden(w, isV1);
            }
        }, 200);
    },

    registerCustomNodes() {
        LiteGraph.registerNodeType("PTNote", PTNoteNode);
        // registerNodeType 会按类型名推导分类，这里强制覆盖
        PTNoteNode.category = "Practical-Tools/utils";
    },
});
