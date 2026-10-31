// subgraph_loading_overlay.js — 进出子图时显示加载遮罩
//
// 大工作流里进出子图可能很慢（要重建/销毁大量 Vue 节点），这个文件独立于
// workflow_loading_overlay.js，只负责子图导航：
//   - 点击子图节点底部的“进入”按钮 / 面包屑返回时，先显示遮罩；
//   - 在画布下一次绘制前隐藏，避免盖住已经出现的内容；
//   - 设置：Practical-Tools.EnableSubgraphLoadingOverlay（默认开）。

(function () {
    "use strict";

    const SETTING_ID = "Practical-Tools.EnableSubgraphLoadingOverlay";
    const OVERLAY_ID = "pt-subgraph-loading";
    const STYLE_ID = "pt-subgraph-loading-style";
    const MIN_VISIBLE_MS = 0;
    const MAX_VISIBLE_MS = 2000;

    let el = null;
    let textEl = null;
    let visible = false;
    let hideArmed = false;
    let hideNotBefore = 0;
    let hideTimer = 0;
    let pendingTimer = 0;
    let navigated = false;

    function isEnabled() {
        try {
            const manager = window.app && window.app.extensionManager;
            const setting = manager && manager.setting;
            if (setting && typeof setting.get === "function") {
                const value = setting.get(SETTING_ID);
                if (typeof value === "boolean") return value;
            }
        } catch (_) { /* 设置还没就绪 */ }

        try {
            const settings = window.app && window.app.ui && window.app.ui.settings;
            if (settings && typeof settings.getSettingValue === "function") {
                const value = settings.getSettingValue(SETTING_ID);
                if (typeof value === "boolean") return value;
            }
        } catch (_) { /* 忽略 */ }

        return true;
    }

    function ensureStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
#${OVERLAY_ID} {
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    display: none;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    font: 14px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif;
}
#${OVERLAY_ID}.pt-sg-visible { display: flex; }
#${OVERLAY_ID} .pt-box {
    text-align: center;
    padding: 24px 32px;
    background: rgba(0, 0, 0, .62);
    border: 1px solid rgba(255, 255, 255, .08);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, .35);
    min-width: 220px;
}
#${OVERLAY_ID} .pt-spin {
    width: 22px;
    height: 22px;
    border: 3px solid rgba(255, 255, 255, .35);
    border-top-color: #fff;
    border-radius: 50%;
    margin: 0 auto 14px;
    animation: pt-sg-spin 1.5s linear infinite !important;
    will-change: transform;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, .8));
}
#${OVERLAY_ID} .pt-text {
    color: #fff;
    font-size: 14px;
    white-space: nowrap;
    text-shadow: 0 1px 3px rgba(0, 0, 0, .9);
}
@keyframes pt-sg-spin { to { transform: rotate(360deg); } }
`;
        document.head.appendChild(style);
    }

    function ensureOverlay() {
        if (el && document.body && document.body.contains(el)) return el;
        ensureStyle();
        el = document.getElementById(OVERLAY_ID);
        if (!el) {
            el = document.createElement("div");
            el.id = OVERLAY_ID;
            el.innerHTML = '<div class="pt-box"><div class="pt-spin"></div><div class="pt-text"></div></div>';
            textEl = el.querySelector(".pt-text");
            document.body.appendChild(el);
        } else {
            textEl = el.querySelector(".pt-text");
        }
        return el;
    }

    function show(text) {
        if (!isEnabled()) return;
        ensureOverlay();
        if (textEl) textEl.textContent = text || "正在进入子图...";
        el.classList.add("pt-sg-visible");
        visible = true;
        navigated = false;
        clearTimeout(pendingTimer);
        pendingTimer = setTimeout(function () {
            if (!navigated) hide();
        }, 1200);
    }

    function hide() {
        if (el) el.classList.remove("pt-sg-visible");
        visible = false;
        hideArmed = false;
        clearTimeout(hideTimer);
        hideTimer = 0;
        clearTimeout(pendingTimer);
        pendingTimer = 0;
    }

    function armHide() {
        hideArmed = true;
        hideNotBefore = performance.now() + MIN_VISIBLE_MS;
        clearTimeout(hideTimer);
        hideTimer = setTimeout(hide, MAX_VISIBLE_MS);
    }

    function isSubgraph(graph) {
        if (!graph) return false;
        try {
            return graph.isSubgraph === true || (graph.constructor && graph.constructor.name === "Subgraph");
        } catch (_) {
            return false;
        }
    }

    function installDrawHook() {
        const ctor = window.LGraphCanvas;
        if (!ctor || !ctor.prototype || typeof ctor.prototype.draw !== "function") return false;
        const original = ctor.prototype.draw;
        if (original.__ptSubgraphHideBeforeDraw) return true;

        ctor.prototype.draw = function () {
            if (hideArmed && performance.now() >= hideNotBefore) hide();
            return original.apply(this, arguments);
        };
        ctor.prototype.draw.__ptSubgraphHideBeforeDraw = true;
        return true;
    }

    function installCanvasHooks() {
        const app = window.app;
        const canvas = app && app.canvas;
        if (!canvas || typeof canvas.openSubgraph !== "function") return false;
        if (canvas.__ptSubgraphOverlayHooked) return true;

        const origOpen = canvas.openSubgraph;
        canvas.openSubgraph = function () {
            if (!isEnabled()) return origOpen.apply(this, arguments);
            try {
                if (!visible) show("正在进入子图...");
                navigated = true;
                const result = origOpen.apply(this, arguments);
                armHide();
                return result;
            } catch (err) {
                hide();
                throw err;
            }
        };

        const origSetGraph = canvas.setGraph;
        canvas.setGraph = function (newGraph) {
            const leaving = isSubgraph(this.graph) && newGraph !== this.graph;
            const result = origSetGraph.apply(this, arguments);
            if (leaving && !(window.app && window.app.configuringGraph) && !document.body.classList.contains("pt-in-waiting-room") && isEnabled()) {
                try {
                    if (!visible) show("正在退出子图...");
                    navigated = true;
                    armHide();
                } catch (_) { /* ignore */ }
            }
            return result;
        };

        canvas.__ptSubgraphOverlayHooked = true;
        return true;
    }

    function onPointerDown(event) {
        if (!isEnabled()) return;
        const target = event.target;
        if (!(target instanceof Element)) return;

        // 茶杯：进入/退出等待区（等待区本质也是子图）
        if (target.closest("#pt-cup-btn")) {
            const inRoom = document.body.classList.contains("pt-in-waiting-room");
            show(inRoom ? "正在退出子图..." : "正在进入子图...");
            return;
        }
        // 子图节点底部的“进入”按钮：按下时就显示，给浏览器一帧时间绘制遮罩
        if (target.closest('[data-testid="subgraph-enter-button"]')) {
            show("正在进入子图...");
            return;
        }
        // 只有“返回按钮”和“非激活的面包屑项”才是真正退出子图。
        // 左侧菜单按钮、当前激活项、下拉菜单、重命名输入框都不触发。
        if (target.closest('[data-testid="subgraph-breadcrumb-back"]')) {
            show("正在退出子图...");
            return;
        }
        const crumbItem = target.closest('[data-testid^="subgraph-breadcrumb-item-"]');
        if (crumbItem && crumbItem.getAttribute("data-active") === null) {
            show("正在退出子图...");
        }
    }

    document.addEventListener("pointerdown", onPointerDown, true);

    function boot() {
        if (installDrawHook() && installCanvasHooks()) return;
        setTimeout(boot, 200);
    }
    boot();

    console.log("[PT] 子图加载遮罩已安装");
})();
