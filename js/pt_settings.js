// pt_settings.js — Practical-Tools 插件设置注册
// 在 ComfyUI 设置面板中添加 "Practical Tools" 分类下的开关项
// 设置值存储在 localStorage，key 格式：Comfy.Settings.PracticalTools.<id>
// 各功能脚本启动时读取此值决定是否启用；变更后刷新生效。

(function () {
    const SETTING_PREFIX = "Practical-Tools.";

    // 等待 app 和设置系统就绪
    function waitForApp(cb) {
        if (typeof app !== "undefined" && app.ui && app.ui.settings) {
            cb();
        } else {
            setTimeout(() => waitForApp(cb), 100);
        }
    }

    // 迁移旧前缀设置值到新前缀
    (function migrateSettings() {
        const oldPrefix = "Comfy.Settings.PracticalTools.";
        const newPrefix = "Comfy.Settings.Practical-Tools.";
        const keys = ["EnableNodeLayerFix", "EnableFoldedSizeFix", "EnableSubgraphImageSync", "EnableRunIndicator", "EnablePhotopea", "EnablePoseEditor"];
        keys.forEach(function(key) {
            const oldKey = oldPrefix + key;
            const newKey = newPrefix + key;
            const oldVal = localStorage.getItem(oldKey);
            if (oldVal !== null && localStorage.getItem(newKey) === null) {
                localStorage.setItem(newKey, oldVal);
            }
        });
    })();

    waitForApp(function () {
        const settings = app.ui.settings;
        let _ready = false;
        setTimeout(function () { _ready = true; }, 500);

        function notifySettingChanged(id, value) {
            try {
                window.dispatchEvent(new CustomEvent("pt-setting-changed", { detail: { id: id, value: value } }));
            } catch (e) {}
        }

        // 通用：添加布尔开关
        function addToggle(id, name, defaultValue, tooltip) {
            const fullId = SETTING_PREFIX + id;
            settings.addSetting({
                id: fullId,
                name: name,
                type: "boolean",
                defaultValue: defaultValue,
                tooltip: tooltip || "",
                onChange: function (value) {
                    notifySettingChanged(fullId, value);
                    if (!_ready) return;
                    try {
                        const groups = document.querySelectorAll(".setting-group");
                        let container = null;
                        for (const g of groups) {
                            if (g.textContent && (g.textContent.includes("启用折叠节点自动置底") || g.textContent.includes("启用折叠节点大小修复"))) {
                                container = g.parentElement;
                                break;
                            }
                        }
                        // 兜底：任意 setting-group 的父元素
                        if (!container && groups.length > 0) {
                            container = groups[0].parentElement;
                        }
                        if (container) {
                            container.style.position = "relative";
                        }
                        const toast = document.createElement("div");
                        const displayName = name.replace(/^启用\s*/, "");
                        toast.textContent = "「" + displayName + "」已" + (value ? "开启" : "关闭") + "，下拉保存设置";
                        toast.style.cssText = "position:fixed;top:50%;transform:translateY(-50%);z-index:99999;background:rgba(40,40,40,0.95);color:#fff;padding:16px 28px;border-radius:8px;font-size:14px;box-shadow:0 4px 20px rgba(0,0,0,0.5);border-left:4px solid #3b82f6;transition:opacity .3s;width:380px;text-align:center;line-height:1.5;box-sizing:border-box;";
                        if (container) {
                            var cRect = container.getBoundingClientRect(); var centerX = cRect.left + cRect.width / 2; toast.style.left = (centerX - 190) + "px";
                            document.body.appendChild(toast);
                        } else {
                            toast.style.left = "50%"; toast.style.transform = "translate(-50%,-50%)";
                            document.body.appendChild(toast);
                        }
                        setTimeout(function () {
                            toast.style.opacity = "0";
                            setTimeout(function () { toast.remove(); }, 300);
                        }, 5000);
                    } catch (e) {
                        console.log("[PT] 设置变更（刷新后生效）:", name, value);
                    }
                },
            });
        }

        // 1. 折叠节点自动置底
        addToggle(
            "EnableNodeLayerFix",
            "启用折叠节点自动置底",
            true,
            "折叠节点始终压在展开节点下方，避免折叠节点挡住展开节点内容（Node 2.0 / 1.0 均生效）。"
        );

        // 2. 折叠节点大小修复【已禁用 2026-10-29：官方已修复，50ms 轮询已注释】
        // addToggle(
        //     "EnableFoldedSizeFix",
        //     "启用折叠节点大小修复",
        //     true,
        //     "修复 Node 2.0 下节点折叠后进入子图再回来，展开时大小丢失的问题。"
        // );

        // 3. 子图图像同步修复
        addToggle(
            "EnableSubgraphImageSync",
            "启用子图图像同步修复",
            true,
            "修复子图外部选择图像后，子图内部 LoadImage/LoadImageMask 节点图像不更新的问题。"
        );

        // 4. 实时运行节点指示
        addToggle(
            "EnableRunIndicator",
            "启用实时运行节点指示",
            true,
            "右上角运行指示条（当前执行节点高亮、进度、等待区茶杯、槽位拖回辅助）。"
        );

        // 4. Photopea 图像编辑器
        addToggle(
            "EnablePhotopea",
            "启用 Photopea 图像编辑器",
            true,
            "侧边栏 Photopea 选项卡，在线编辑图像。"
        );

        // 5. PoseEditor 姿势编辑器
        addToggle(
            "EnablePoseEditor",
            "启用 PoseEditor 姿势编辑器",
            true,
            "侧边栏 PoseEditor 选项卡，编辑 OpenPose 姿势。"
        );

        // 6. UI 性能优化
        addToggle(
            "EnableUIPerfTweaks",
            "UI 性能优化",
            true,
            "关节点阴影/动画/背景模糊，降低连线渲染质量，大画布更流畅。关闭后恢复原生效果。"
        );

        addToggle(
            "EnableWorkflowLoadingOverlay",
            "启用工作流加载提醒",
            true,
            "切换工作流/关闭标签时显示加载提示，避免长时间白屏。"
        );

        addToggle(
            "EnableSubgraphLoadingOverlay",
            "进出子图显示加载提醒",
            true,
            "进入/退出子图时显示加载遮罩，避免大工作流切换子图时看起来卡住。"
        );



        addToggle(
            "EnableWorkflowTabPreview",
            "关闭工作流标签悬停预览",
            false,
            "鼠标悬停在工作流标签上时显示工作流缩略预览。"
        );
        // 6. 前端内存提示（刷新按钮）：一个开关 + 两个阈值，同组显示
        function addSlider(id, name, attrs, defaultValue, tooltip, leafKey) {
            settings.addSetting({
                id: SETTING_PREFIX + id,
                category: ["Practical-Tools", "前端内存提示", leafKey],
                name: name,
                type: "slider",
                attrs: attrs,
                defaultValue: defaultValue,
                tooltip: tooltip || "",
            });
        }



        addSlider(
            "MemGuardDomThreshold",
            "提示阈值元素（个）",
            { min: 20000, max: 400000, step: 5000 },
            60000,
            "页面元素数量达到该值的 3/4 时刷新按钮变黄，超过时变红。适用于非 Chromium 系浏览器。",
            "1 提示阈值元素"
        );
        addSlider(
            "MemGuardThresholdMB",
            "提示阈值内存（MB）",
            { min: 300, max: 6000, step: 100 },
            1200,
            "JS 堆占用达到该值的 3/4 时刷新按钮变黄，超过时变红。适用于 Chromium 系浏览器。",
            "2 提示阈值内存"
        );        settings.addSetting({
            id: SETTING_PREFIX + "EnableMemGuard",
            category: ["Practical-Tools", "前端内存提示", "3 启用刷新按钮"],
            name: "启用刷新按钮",
            type: "boolean",
            defaultValue: true,
            tooltip: "在画布工具栏常驻刷新按钮；超过提示阈值时按钮变红。",
            onChange: function () {
                try {
                    if (window.__ptMemGuard) {
                        window.__ptMemGuard.check();
                        window.__ptMemGuard.attach();
                    }
                } catch (e) {}
            },
        });

        settings.addSetting({
            id: SETTING_PREFIX + "BookmarkOpacity",
            category: ["Practical-Tools", "书签", "1 书签节点透明度"],
            name: "书签节点透明度",
            type: "slider",
            attrs: { min: 0.1, max: 1, step: 0.05 },
            defaultValue: 0.1,
            tooltip: "Bookmark 书签节点的显示透明度。默认 0.1（几乎透明）；鼠标悬停或选中时自动恢复不透明。",
            onChange: function () {
                try {
                    if (typeof window.__ptApplyBookmarkOpacity === "function") {
                        window.__ptApplyBookmarkOpacity();
                    }
                    if (window.app && window.app.canvas) window.app.canvas.setDirty(true, true);
                } catch (e) {}
            },
        });

        console.log("[PT] 设置项已注册: Practical Tools");

        // 首次安装插件时，将节点标签三项默认设为"无"、API定价徽章默认关；之后不再干预，用户更改有效
        const PT_FIRST_INSTALL_FLAG = "PracticalTools.FirstInstall.NodeBadgeDefaults";
        const NODE_BADGE_KEYS = [
            "Comfy.NodeBadge.NodeLifeCycleBadgeMode",
            "Comfy.NodeBadge.NodeIdBadgeMode",
            "Comfy.NodeBadge.NodeSourceBadgeMode"
        ];
        try {
            if (!localStorage.getItem(PT_FIRST_INSTALL_FLAG)) {
                // 首次安装：强制设默认值
                const storedSettings = JSON.parse(localStorage.getItem("Comfy.Settings") || "{}");
                for (const key of NODE_BADGE_KEYS) {
                    storedSettings[key] = "None";
                    if (typeof settings.setSettingValue === "function") {
                        settings.setSettingValue(key, "None");
                    }
                }
                // API 节点定价徽章默认关
                storedSettings["Comfy.NodeBadge.ShowApiPricing"] = false;
                if (typeof settings.setSettingValue === "function") {
                    settings.setSettingValue("Comfy.NodeBadge.ShowApiPricing", false);
                }

                // 首次安装：默认开启官方“持久化工作流状态并在页面重新加载时恢复”
                storedSettings["Comfy.Workflow.Persist"] = true;
                if (typeof settings.setSettingValue === "function") {
                    settings.setSettingValue("Comfy.Workflow.Persist", true);
                }
                localStorage.setItem("Comfy.Settings", JSON.stringify(storedSettings));
                localStorage.setItem(PT_FIRST_INSTALL_FLAG, "1");
                console.log("[PT] 首次安装：节点标签三项设为无，API定价徽章设为关，工作流状态持久化设为开");
            }
        } catch (e) {
            console.log("[PT] 设置节点标签默认值失败:", e);
        }

        // 在 PracticalTools 分类底部注入"保存设置并刷新页面"按钮
        function injectRefreshButton() {
            const groups = document.querySelectorAll('.setting-group');
            let ptContainer = null;
            let ptCount = 0;
            for (const g of groups) {
                const text = g.textContent || '';
                if (text.includes('启用折叠节点自动置底') || text.includes('启用折叠节点大小修复') || text.includes('启用实时运行节点指示') || text.includes('启用 Photopea') || text.includes('启用 PoseEditor') || text.includes('UI 性能优化')) {
                    ptCount++;
                    if (!ptContainer) ptContainer = g.parentElement;
                }
            }
            if (ptCount >= 3 && ptContainer) {
                if (!ptContainer.querySelector('#pt-save-refresh-btn')) {
                    const btnWrap = document.createElement('div');
                    btnWrap.style.cssText = 'margin-top:12px;padding:12px 0 48px 0;border-top:1px solid rgba(255,255,255,0.12);text-align:center;';
                    const btn = document.createElement('button');
                    btn.id = 'pt-save-refresh-btn';
                    btn.textContent = '保存设置并刷新页面';
                    btn.style.cssText = 'background:#3b82f6;color:#fff;border:none;padding:10px 28px;border-radius:5px;font-size:13px;font-weight:500;cursor:pointer;transition:background .2s;';
                    btn.onmouseover = function () { btn.style.background = '#2563eb'; };
                    btn.onmouseout = function () { btn.style.background = '#3b82f6'; };
                    btn.onclick = function () { location.reload(); };
                    btnWrap.appendChild(btn);
                    ptContainer.appendChild(btnWrap);
                }
            } else {
                const oldBtn = document.getElementById('pt-save-refresh-btn');
                if (oldBtn && oldBtn.parentElement) oldBtn.parentElement.remove();
            }
        }

        // 监听设置面板 DOM 变化，自动注入按钮
        const observer = new MutationObserver(function () {
            injectRefreshButton();
        });
        observer.observe(document.body, { childList: true, subtree: true });
        // 初始尝试一次
        setTimeout(injectRefreshButton, 500);
    });
})();
