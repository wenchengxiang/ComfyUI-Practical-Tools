import { app } from "../../scripts/app.js";

/**
 * =====================================================================
 * UI 性能优化（Practical-Tools 随插件加载，无需额外配置）
 * =====================================================================
 *
 * 1. CSS 层（Node 2.0 DOM 渲染）：
 *    - 关节点阴影（drop-shadow，Tailwind 类）
 *    - 关节点过渡/动画（拖动、缩放时不再逐帧计算动画中间态）
 *    - 关背景模糊（backdrop-filter 是高开销合成层）
 *    - 节点位移 GPU 合成层已禁用（文字模糊 + 节点多时更卡）
 *
 * 2. Canvas 层（Node 2.0 连线是 Canvas 渲染，CSS 管不到）：
 *    - render_connections_border = false    关连线描边（半透明黑粗线）
 *    - render_shadows = false               关节点阴影（canvas 层双保险）
 *    - render_connections_shadows = false   关连线阴影（默认即关，保险）
 *    - set_canvas_dirty_on_mouse_event=false 鼠标移动不再触发整幅连线重绘（Node 2.0 hover 走 DOM，canvas 无需跟随鼠标每帧重绘；大画布最大空转点）
 *    - highquality_render = false           连线渲染质量降级（平滑度换性能，视觉略粗粝）
 *
 * 生效方式：ComfyUI 启动时自动加载（WEB_DIRECTORY = ./js）。
 * =====================================================================
 */

// ---------- 1. CSS 注入 ----------
const STYLE_ID = "practical-tools-ui-perf";
if (!document.getElementById(STYLE_ID)) {
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
/* 关节点阴影 */
.lg-node, .lg-node * { filter: none !important; }
/* 关节点过渡/动画 */
.lg-node, .lg-node * { transition: none !important; animation: none !important; }
/* 关背景模糊 */
.lg-node, .lg-node * { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
/* 节点位移走 GPU 合成层（已禁用：会缓存位图导致缩放后文字模糊，节点多时更卡） */
/* .lg-node { will-change: transform; } */
`;
  document.head.appendChild(style);
}

// ---------- 2. Canvas 渲染属性 ----------
function applyCanvasPerf() {
  const canvas = app?.canvas;
  if (!canvas) return;
  canvas.render_connections_border = false;           // 连线描边
  canvas.render_shadows = false;                      // 节点阴影（canvas 层）
  canvas.render_connections_shadows = false;          // 连线阴影
  canvas.set_canvas_dirty_on_mouse_event = false;     // 鼠标移动不触发整幅重绘
  canvas.highquality_render = false;                  // 连线渲染质量降级
  canvas.setDirty?.(true);
}

app.registerExtension({
  name: "Practical-Tools.UIPerfTweaks",
  setup() {
    // 立即尝试 + 轮询兜底（Node 2.0 的 canvas 可能在扩展加载后才就绪）
    applyCanvasPerf();
    let tries = 0;
    const timer = setInterval(() => {
      if (app?.canvas) {
        applyCanvasPerf();
        if (++tries >= 10) clearInterval(timer);
      }
    }, 500);
    setTimeout(() => clearInterval(timer), 10000);
  },
});
