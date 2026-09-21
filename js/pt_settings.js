// pt_settings.js — Practical-Tools 插件设置注册
// 在 ComfyUI 设置面板中添加 "Practical Tools" 分类下的开关项
// 设置值存储在 localStorage，key 格式：Comfy.Settings.PracticalTools.<id>
// 各功能脚本启动时读取此值决定是否启用；变更后刷新生效。

(function () {
    const SETTING_PREFIX = "PracticalTools.";

    // 等待 app 和设置系统就绪
    function waitForApp(cb) {
        if (typeof app !== "undefined" && app.ui && app.ui.settings) {
            cb();
        } else {
            setTimeout(() => waitForApp(cb), 100);
        }
    }

    waitForApp(function () {
        const settings = app.ui.settings;
        let _ready = false;
        setTimeout(function () { _ready = true; }, 500);

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
                    if (!_ready) return;
                    try {
                        const groups = document.querySelectorAll(".setting-group");
                        let container = null;
                        for (const g of groups) {
                            if (g.textContent && g.textContent.includes("启用节点层级修复")) {
                                container = g.parentElement;
                                break;
                            }
                        }
                        const toast = document.createElement("div");
                        toast.textContent = "「" + name + "」已" + (value ? "开启" : "关闭") + "，刷新后生效";
                        toast.style.cssText = "position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:99999;background:rgba(40,40,40,0.95);color:#fff;padding:14px 24px;border-radius:8px;font-size:14px;box-shadow:0 4px 20px rgba(0,0,0,0.5);border-left:4px solid #3b82f6;transition:opacity .3s;white-space:nowrap;";
                        if (container) {
                            container.style.position = container.style.position || "relative";
                            container.appendChild(toast);
                        } else {
                            document.body.appendChild(toast);
                        }
                        setTimeout(function () {
                            toast.style.opacity = "0";
                            setTimeout(function () { toast.remove(); }, 300);
                        }, 3000);
                    } catch (e) {
                        console.log("[PT] 设置变更（刷新后生效）:", name, value);
                    }
                },
            });
        }

        // 1. 节点层级修复
        addToggle(
            "EnableNodeLayerFix",
            "启用节点层级修复",
            true,
            "修复 Node 2.0 下节点覆盖/上浮、切换工作流后层级错乱的问题。"
        );

        // 2. 折叠节点大小修复
        addToggle(
            "EnableFoldedSizeFix",
            "启用折叠节点大小修复",
            true,
            "修复 Node 2.0 下节点折叠后进入子图再回来，展开时大小丢失的问题。"
        );

        // 3. 实时运行节点指示
        addToggle(
            "EnableRunIndicator",
            "启用实时运行节点指示",
            true,
            "右上角运行指示条（当前执行节点高亮、进度、等待区茶杯、槽位拖回辅助）。"
        );

        console.log("[PT] 设置项已注册: Practical Tools");

        // 在 PracticalTools 分类底部注入"保存设置并刷新页面"按钮
        function injectRefreshButton() {
            const groups = document.querySelectorAll('.setting-group');
            let ptContainer = null;
            let ptCount = 0;
            for (const g of groups) {
                const text = g.textContent || '';
                if (text.includes('启用节点层级修复') || text.includes('启用折叠节点大小修复') || text.includes('启用实时运行节点指示')) {
                    ptCount++;
                    if (!ptContainer) ptContainer = g.parentElement;
                }
            }
            if (ptCount === 3 && ptContainer) {
                if (!ptContainer.querySelector('#pt-save-refresh-btn')) {
                    const btnWrap = document.createElement('div');
                    btnWrap.style.cssText = 'margin-top:20px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.12);text-align:center;';
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
