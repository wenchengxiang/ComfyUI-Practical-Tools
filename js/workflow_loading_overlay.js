// workflow_loading_overlay.js — 工作流加载遮罩（稳定版）
//
// 【消失时机】
//   不再等 app.loadGraphData() 的 Promise。那个 Promise 要等加载后的素材扫描
//   （缺模型/缺媒体检查）跑完才 resolve，可能比画布出现晚好几秒。
//   现在改为：
//     beforeLoadGraph      -> 显示遮罩，并等一帧确保它真的被画出来
//     afterConfigureGraph  -> 标记“下一次画布绘制前隐藏”
//     afterLoadGraph / onGraphLoadError -> 兜底隐藏
//   画布 draw 钩子在绘制之前移除遮罩，所以工作流出现的那一帧遮罩已经消失。
//
// 【空白工作流】
//   新建空白工作流同样会走 loadGraphData(blankGraph)。空图本身很快，但如果当前
//   开着大工作流，clean() 会先销毁旧图，可能耗时 1–2 秒；所以也显示遮罩，避免
//   用户误以为卡住。
//
// 【模板示例素材】
//   开关开启时，拦截模板示例素材的 GitHub 下载请求（快速 404），让官方流程
//   立刻进入 loadGraphData；示例素材需要用户自己在节点里重新选。
//   开关关闭时完全不干预，保持官方原行为。
//
// 【副作用】
//   跳过下载后，官方会弹一次“部分示例媒体无法准备。工作流将会打开；
//   请为所有缺失的输入选择你自己的文件。”，属于官方失败分支的固定提示。

(function () {
    "use strict";

    const SETTING_ID = "Practical-Tools.EnableWorkflowLoadingOverlay";
    const SETTING_KEY = "Comfy.Settings." + SETTING_ID;
    const OVERLAY_ID = "pt-wf-loading";
    const STYLE_ID = "pt-wf-loading-style";

    const TEMPLATE_INPUT_PREFIX =
        "https://raw.githubusercontent.com/Comfy-Org/workflow_templates/";

    const MAX_VISIBLE_MS = 30000;  // 异常兜底：加载一直不结束
    const PAINT_TIMEOUT_MS = 120;  // 后台标签页 rAF 不触发时的兜底
    const HIDE_FALLBACK_MS = 250;  // 配置完成后迟迟没有重绘时的兜底

    let el = null;
    let visible = false;
    let watchdog = 0;
    let loadDepth = 0;
    let hideArmed = false;
    let hideFallback = 0;

    const TEXT_LOADING = "正在加载工作流...";
    const TEXT_CLOSING = "正在关闭工作流...";
    const CLOSE_INTENT_MS = 20000;
    let closeIntentUntil = 0;
    let closeIntentTimer = 0;

    function markClosingWorkflow() {
        closeIntentUntil = Date.now() + CLOSE_INTENT_MS;
        clearTimeout(closeIntentTimer);
        closeIntentTimer = setTimeout(function () {
            closeIntentUntil = 0;
        }, CLOSE_INTENT_MS);
    }

    // 关闭工作流标签时，ComfyUI 会加载替代工作流/默认工作流；
    // 记录关闭意图，让接下来的 beforeLoadGraph 使用“正在关闭”文案。
    document.addEventListener("click", function (event) {
        const target = event.target;
        if (target instanceof Element &&
            target.closest('[data-testid="close-workflow-button"]')) {
            markClosingWorkflow();
        }
    }, true);

    function isEnabled() {
        try {
            const manager = window.app && window.app.extensionManager;
            const setting = manager && manager.setting;
            if (setting && typeof setting.get === "function") {
                const value = setting.get(SETTING_ID);
                if (typeof value === "boolean") return value;
            }
        } catch (_) { /* 设置存储还没就绪时忽略 */ }

        try {
            return (localStorage.getItem(SETTING_KEY) || "true") !== "false";
        } catch (_) {
            return true;
        }
    }

    function ensureOverlay() {
        if (el && document.body && document.body.contains(el)) return el;

        if (!document.getElementById(STYLE_ID)) {
            const style = document.createElement("style");
            style.id = STYLE_ID;
            style.textContent = [
                "@keyframes pt-spin{to{transform:rotate(360deg)}}",
                "#" + OVERLAY_ID + "{position:fixed;inset:0;z-index:2147483647;display:none;" +
                    "align-items:center;justify-content:center;pointer-events:none;" +
                    "font:14px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif}",
                "#" + OVERLAY_ID + " .pt-box{text-align:center;padding:24px 32px;background:rgba(0,0,0,.62);" +
                    "border:1px solid rgba(255,255,255,.08);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.35);min-width:220px}",
                "#" + OVERLAY_ID + " .pt-spin{width:22px;height:22px;border:3px solid rgba(255,255,255,.35);" +
                    "border-top-color:#fff;border-radius:50%;margin:0 auto 14px;animation:pt-spin 1.5s linear infinite !important;" +
                    "will-change:transform;filter:drop-shadow(0 1px 2px rgba(0,0,0,.8))}",
                "#" + OVERLAY_ID + " .pt-text{color:#fff;font-size:14px;white-space:nowrap;text-shadow:0 1px 3px rgba(0,0,0,.9)}"
            ].join("");
            (document.head || document.documentElement).appendChild(style);
        }

        el = document.createElement("div");
        el.id = OVERLAY_ID;
        el.innerHTML =
            '<div class="pt-box">' +
            '<div class="pt-spin"></div>' +
            '<div class="pt-text">正在加载工作流...</div>' +
            '</div>';
        document.body.appendChild(el);
        return el;
    }

    function show(text) {
        if (!document.body) return;
        ensureOverlay();
        const textEl = el.querySelector(".pt-text");
        if (textEl) textEl.textContent = text || TEXT_LOADING;
        el.style.display = "flex";
        visible = true;

        clearTimeout(watchdog);
        watchdog = setTimeout(function () {
            loadDepth = 0;
            hide();
        }, MAX_VISIBLE_MS);
    }

    function hide() {
        clearTimeout(watchdog);
        clearTimeout(hideFallback);
        watchdog = 0;
        hideFallback = 0;
        hideArmed = false;
        visible = false;
        if (el) el.style.display = "none";
    }

    // 只等一帧，让浏览器把遮罩画出来；真正的加载随后才开始。
    function waitOnePaint() {
        return new Promise(function (resolve) {
            let settled = false;
            const done = function () {
                if (settled) return;
                settled = true;
                resolve();
            };
            if (typeof requestAnimationFrame === "function") {
                requestAnimationFrame(function () {
                    requestAnimationFrame(done);
                });
            }
            setTimeout(done, PAINT_TIMEOUT_MS);
        });
    }

    // 标记：下一次画布绘制时，先摘掉遮罩，再画工作流。
    function armHideOnNextDraw() {
        if (loadDepth > 1) return;
        hideArmed = true;
        clearTimeout(hideFallback);
        hideFallback = setTimeout(hide, HIDE_FALLBACK_MS);
    }

    function beforeLoad() {
        if (!isEnabled()) return;

        loadDepth++;

        hideArmed = false;
        clearTimeout(hideFallback);

        const first = !visible;
        if (first) {
            show(Date.now() < closeIntentUntil ? TEXT_CLOSING : TEXT_LOADING);
        }
        return first ? waitOnePaint() : undefined;
    }

    function afterConfigure() {
        if (!isEnabled()) return;
        armHideOnNextDraw();
    }

    function finishLoad() {
        closeIntentUntil = 0;
        clearTimeout(closeIntentTimer);
        loadDepth = Math.max(0, loadDepth - 1);
        if (loadDepth > 0) return;

        // 工作流已经配置好：下一帧移除遮罩，让工作流出现的同一帧不再被盖住
        hideArmed = true;
        if (typeof requestAnimationFrame === "function") {
            requestAnimationFrame(hide);
        }
        clearTimeout(hideFallback);
        hideFallback = setTimeout(hide, 100);
    }

    // 画布绘制钩子：在绘制之前移除遮罩，保证“工作流出现的前一刻”消失
    function installDrawHook() {
        const ctor = window.LGraphCanvas;
        if (!ctor || !ctor.prototype || typeof ctor.prototype.draw !== "function") {
            return false;
        }
        const original = ctor.prototype.draw;
        if (original.__ptHideBeforeDraw) return true;

        ctor.prototype.draw = function () {
            if (hideArmed) hide();
            return original.apply(this, arguments);
        };
        ctor.prototype.draw.__ptHideBeforeDraw = true;
        return true;
    }

    function installExtension() {
        const app = window.app;
        if (!app || typeof app.registerExtension !== "function") return false;
        if (app.__ptLoadingOverlayRegistered) return true;

        app.registerExtension({
            name: "Practical-Tools.WorkflowLoadingOverlay",
            beforeLoadGraph: beforeLoad,
            afterConfigureGraph: afterConfigure,
            afterLoadGraph: finishLoad,
            onGraphLoadError: finishLoad
        });
        app.__ptLoadingOverlayRegistered = true;
        return true;
    }

    // ---------- 模板示例素材：开关开启时直接跳过下载 ----------

    function isTemplateInputUrl(url) {
        return (
            typeof url === "string" &&
            url.indexOf(TEMPLATE_INPUT_PREFIX) === 0 &&
            url.indexOf("/input/") !== -1
        );
    }

    function installFetchSkip() {
        const original = window.fetch;
        if (typeof original !== "function") return false;
        if (original.__ptTemplateSkipInstalled) return true;

        const wrapped = function (input, init) {
            let url = "";
            if (typeof input === "string") {
                url = input;
            } else if (input && typeof input === "object") {
                url = input.url || input.href || "";
            }

            if (isEnabled() && isTemplateInputUrl(url)) {
                return Promise.resolve(
                    new Response(null, { status: 404, statusText: "Not Found" })
                );
            }
            return original.apply(this, arguments);
        };
        wrapped.__ptTemplateSkipInstalled = true;
        window.fetch = wrapped;
        return true;
    }

    installFetchSkip();

    let tries = 0;
    (function boot() {
        const ready = installExtension() && installDrawHook();
        if (ready) return;
        if (++tries > 300) return;
        setTimeout(boot, 100);
    })();
    const bootInterval = setInterval(function () {
        installFetchSkip();
        if (installExtension() && installDrawHook()) clearInterval(bootInterval);
    }, 1500);
})();
