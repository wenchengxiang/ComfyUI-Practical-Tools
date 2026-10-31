// ui_perf_tweaks.js — UI 性能优化
// 关节点阴影/动画/背景模糊，降低连线渲染质量，大画布更流畅
// 设置：Practical-Tools.EnableUIPerfTweaks（默认开）

(function () {
  "use strict";

  const STYLE_ID = "practical-tools-ui-perf";

  function isEnabled() {
    try {
      return app.ui.settings.getSettingValue("Practical-Tools.EnableUIPerfTweaks") ?? true;
    } catch (e) {
      return true;
    }
  }

  function applyCss() {
    if (!isEnabled()) {
      const old = document.getElementById(STYLE_ID);
      if (old) old.remove();
      return;
    }
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
/* 关节点阴影 */
.lg-node, .lg-node * { filter: none !important; }
/* 关节点过渡/动画 */
.lg-node, .lg-node * { transition: none !important; animation: none !important; }
/* 关背景模糊 */
.lg-node, .lg-node * { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
`;
    document.head.appendChild(style);
  }

  function applyCanvasPerf() {
    const canvas = window.app?.canvas;
    if (!canvas) return;
    if (isEnabled()) {
      canvas.render_connections_border = false;
      canvas.render_shadows = false;
      canvas.render_connections_shadows = false;
      canvas.set_canvas_dirty_on_mouse_event = false;
      canvas.highquality_render = false;
    } else {
      // 恢复默认
      canvas.render_connections_border = true;
      canvas.render_shadows = true;
      canvas.render_connections_shadows = true;
      canvas.set_canvas_dirty_on_mouse_event = true;
      canvas.highquality_render = true;
    }
    canvas.setDirty?.(true);
  }

  function start() {
    applyCss();
    let tries = 0;
    (function waitCanvas() {
      if (window.app?.canvas) {
        applyCanvasPerf();
        return;
      }
      if (++tries < 60) setTimeout(waitCanvas, 250);
    })();
  }

  window.addEventListener("pt-setting-changed", function (event) {
    if (!event || !event.detail || event.detail.id !== "Practical-Tools.EnableUIPerfTweaks") return;
    applyCss();
    applyCanvasPerf();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
