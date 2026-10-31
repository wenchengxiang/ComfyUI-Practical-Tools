// hide_workflow_preview.js — 按设置隐藏/显示工作流标签悬停预览
//
// 旧版问题：
//   1. 从 localStorage["Comfy.Settings.Practical-Tools.EnableWorkflowTabPreview"] 读值，
//      但 ComfyUI 1.57 的设置存在 /settings 接口和内存 store 里，不写 localStorage；
//   2. default 逻辑反了：localStorage 为 null 时也判定为隐藏，导致设置默认 false
//      （应显示预览）时仍然隐藏；
//   3. 只在 focus / visibilitychange 时刷新，在设置面板里切换开关不会立即生效。
//
// 本版：
//   - 从 app.extensionManager.setting.get()（回退 app.ui.settings.getSettingValue(id)）读值；
//   - hide = (value === true)：开=隐藏，关=显示，默认 false=显示；
//   - 启动等设置系统就绪，之后每 0.5 秒轻量检查一次，切换开关最多 0.5 秒生效。

(function () {
    "use strict";

    const SETTING_ID = "Practical-Tools.EnableWorkflowTabPreview";
    const STYLE_ID = "pt-hide-workflow-preview";
    const RULE = ".workflow-popover-fade{display:none !important;}";

    let style = null;
    let ready = false;
    let lastHide = null;

    function ensureStyle() {
        if (style && document.head.contains(style)) return style;
        style = document.getElementById(STYLE_ID);
        if (!style) {
            style = document.createElement("style");
            style.id = STYLE_ID;
            document.head.appendChild(style);
        }
        return style;
    }

    function readSetting() {
        // 1. 新版设置 API
        try {
            const manager = window.app && window.app.extensionManager;
            const setting = manager && manager.setting;
            if (setting && typeof setting.get === "function") {
                const value = setting.get(SETTING_ID);
                if (typeof value === "boolean") {
                    ready = true;
                    return value;
                }
            }
        } catch (_) { /* 设置系统还没就绪 */ }

        // 2. 旧版兼容
        try {
            const settings = window.app && window.app.ui && window.app.ui.settings;
            if (settings && typeof settings.getSettingValue === "function") {
                const value = settings.getSettingValue(SETTING_ID);
                if (typeof value === "boolean") {
                    ready = true;
                    return value;
                }
            }
        } catch (_) { /* 忽略 */ }

        return undefined;
    }

    function apply() {
        const value = readSetting();
        if (typeof value !== "boolean") return;

        const hide = value === true;
        if (hide === lastHide) return;
        lastHide = hide;
        ensureStyle().textContent = hide ? RULE : "";
    }

    // 启动时等设置系统就绪
    let tries = 0;
    (function boot() {
        apply();
        if (ready) return;
        if (++tries > 600) return; // 最多等 60 秒
        setTimeout(boot, 100);
    })();

    window.addEventListener("focus", apply);
    document.addEventListener("visibilitychange", apply);

    window.addEventListener("pt-setting-changed", function (event) {
        if (event && event.detail && event.detail.id === SETTING_ID) apply();
    });
})();
