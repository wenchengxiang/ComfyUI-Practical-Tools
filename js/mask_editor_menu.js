// mask_editor_menu.js — Practical-Tools 子图右键打开 MaskEditor
// 当子图内有 LoadImage / LoadImageMask 节点时，子图右键出现
// "Open image in MaskEditor" + 二级菜单 "from 哪个节点"
//
// 兼容 Node 1.0（LiteGraph）和 Node 2.0
// 调用 ComfyUI 内置 openMaskEditor(node) 打开遮罩编辑器

console.log("Practical-Tools MaskEditor menu extension loaded.");

import { app } from "../../scripts/app.js";



const PT_DEBUG = (() => { try { return localStorage.getItem("PracticalTools.Debug") === "1"; } catch (e) { return false; } })();
function ptLog(...args) { if (PT_DEBUG) console.log(...args); }

// ================================================================
// 判断节点是否是 LoadImage / LoadImageMask（或有 image widget）
// ================================================================
function isLoadImageNode(node) {
    if (!node) return false;
    if (node.comfyClass === "LoadImage" || node.comfyClass === "LoadImageMask") return true;
    if (node.widgets && Array.isArray(node.widgets) &&
        node.widgets.some(w => w.name === "image")) return true;
    return false;
}


// ================================================================
// 递归查找子图内部的所有 LoadImage / LoadImageMask 节点
// ================================================================
function findAllLoadImageNodes(node) {
    if (!node || !node.subgraph || !node.subgraph._nodes) return [];
    const results = [];

    for (const inner of node.subgraph._nodes) {
        if (!inner) continue;
        if (inner.subgraph) {
            // inner 是子图：递归进去找真正的 LoadImage；
            // 菜单项 label 用这层子图名（与 poseeditor/photopea 一致），不显示内层叶子节点名
            const nested = findAllLoadImageNodes(inner);
            for (const item of nested) {
                results.push({ node: item.node, label: getNodeDisplayName(inner) });
            }
        } else if (isLoadImageNode(inner)) {
            // 直接挂在当前子图下的加载节点：label 用节点名
            results.push({ node: inner, label: getNodeDisplayName(inner) });
        }
    }

    return results;
}


// ================================================================
// 检查节点是否应该显示菜单
// 只有子图（内部包含 LoadImage/LoadImageMask）才显示我们的菜单
// 普通的 LoadImage/LoadImageMask 节点用官方的 Edit mask 菜单，避免重复
// ================================================================
function shouldShowMenu(node) {
    if (!node) return false;
    // 普通的 LoadImage/LoadImageMask 节点不显示（官方已有菜单）
    if (!node.subgraph && isLoadImageNode(node)) return false;
    // 子图内部包含 LoadImage/LoadImageMask 才显示
    const inner = findAllLoadImageNodes(node);
    return inner.length > 0;
}


// ================================================================
// 获取节点显示名称
// ================================================================
function getNodeDisplayName(node) {
    if (!node) return "Unknown";
    if (node.title) return node.title;
    if (node.comfyClass) return node.comfyClass;
    if (node.type) return node.type;
    return "Node " + (node.id || "?");
}


// ================================================================
// 同步 LoadImage/LoadImageMask 节点的 image widget 到子图暴露的输入
// 参考 pose_editor.js 的 setLoadImageValue 逻辑
// 当 MaskEditor 编辑后，子图内部节点 widget 变化，需要同步更新
// 子图节点上暴露的 widget 值，否则外部预览节点拿到的是旧值
// ================================================================
function syncLoadImageWidgetToSubgraph(node, imageName) {
    if (!node || !node.widgets) return;

    // 手动加载图像预览（节点上的小预览图）
    const img = new Image();
    img.onload = () => {
        node.imgs = [img];
        if (node.graph && node.graph.setDirtyCanvas) {
            node.graph.setDirtyCanvas(true, true);
        }
        if (app.graph && app.graph.setDirtyCanvas) {
            app.graph.setDirtyCanvas(true, true);
        }
        if (app.canvas && app.canvas.setDirty) {
            app.canvas.setDirty(true, true);
        }
    };
    img.src = `/view?filename=${encodeURIComponent(imageName)}&type=input&subfolder=`;

    // 调用节点 widget 的 callback
    const widget = node.widgets.find(w => w.name === "image");
    if (widget && widget.callback) {
        try { widget.callback(imageName); } catch(e) {}
    }

    // 如果节点在子图内部，同时更新子图节点暴露的 widget
    if (node.graph && node.graph !== app.graph) {
        const parentSubgraphNode = app.graph._nodes.find(n => n.subgraph === node.graph);
        if (parentSubgraphNode && parentSubgraphNode.widgets) {
            // 找到当前节点在子图内部 LoadImage 列表中的索引
            const allInnerLoadImages = node.graph._nodes.filter(n =>
                n.comfyClass === "LoadImage" || n.comfyClass === "LoadImageMask" ||
                (n.widgets && Array.isArray(n.widgets) && n.widgets.some(w => w.name === "image"))
            );
            const nodeIndex = allInnerLoadImages.indexOf(node);

            // 找到子图暴露的所有 image combo widget
            const imageWidgets = parentSubgraphNode.widgets.filter(w =>
                w.type === "combo" && w.name && w.name.startsWith("image")
            );

            // 根据索引更新对应的 widget
            let parentWidget = null;
            if (nodeIndex >= 0 && nodeIndex < imageWidgets.length) {
                parentWidget = imageWidgets[nodeIndex];
            } else if (imageWidgets.length > 0) {
                parentWidget = imageWidgets[0];
            }

            if (parentWidget) {
                parentWidget.value = imageName;
                if (parentWidget.callback) {
                    try { parentWidget.callback(imageName); } catch(e) {}
                }
                if (parentSubgraphNode.setDirtyCanvas) {
                    parentSubgraphNode.setDirtyCanvas(true, true);
                }
                ptLog("[MaskEditor Menu] Synced image to subgraph widget:",
                    parentWidget.name, "=", imageName);
            }
        }
    }
}


// ================================================================
// 调用 ComfyUI 内置 openMaskEditor
// 注意：所有操作都延迟执行，确保右键菜单已关闭，避免 selectNode
// 触发菜单重渲染导致无限循环（单个节点时尤其容易触发）
// ================================================================
function openMaskEditorForNode(node) {
    if (!node) {
        console.error("[MaskEditor Menu] No node provided");
        return;
    }

    ptLog("[MaskEditor Menu] Opening for:", getNodeDisplayName(node), "id:", node.id);

    // 主动关闭可能残留的右键菜单（PrimeVue ContextMenu / LiteGraph 菜单）
    try {
        document.querySelectorAll('.p-contextmenu, .p-menu, .litemenu, .context-menu').forEach(el => {
            el.style.display = 'none';
            setTimeout(() => { el.remove(); }, 100);
        });
    } catch (e) {}

    // 延迟 100ms 让右键菜单完全关闭，再执行 selectNode（避免触发菜单重渲染循环）
    setTimeout(() => {
        // 记录当前 widget 值，用于检测编辑后的变化
        const imageWidget = node.widgets && node.widgets.find(w => w.name === "image");
        const initialValue = imageWidget ? imageWidget.value : null;
        ptLog("[MaskEditor Menu] Initial image value:", initialValue);

        // 启动轮询：检测 MaskEditor 编辑后 widget 值变化，同步到子图暴露的输入
        let pollCount = 0;
        const maxPolls = 120; // 最多轮询60秒（120 * 500ms）
        const pollTimer = setInterval(() => {
            pollCount++;
            if (pollCount > maxPolls) {
                clearInterval(pollTimer);
                return;
            }
            const currentWidget = node.widgets && node.widgets.find(w => w.name === "image");
            if (currentWidget && currentWidget.value !== initialValue) {
                ptLog("[MaskEditor Menu] Image changed:", initialValue, "->", currentWidget.value);
                syncLoadImageWidgetToSubgraph(node, currentWidget.value);
                clearInterval(pollTimer);
            }
        }, 500);

        // 方式1：全局函数 openMaskEditor(node)
        if (typeof window.openMaskEditor === "function") {
            ptLog("[MaskEditor Menu] Using window.openMaskEditor");
            window.openMaskEditor(node);
            return;
        }

        // 方式2：app.openMaskEditor(node)
        if (app && typeof app.openMaskEditor === "function") {
            ptLog("[MaskEditor Menu] Using app.openMaskEditor");
            app.openMaskEditor(node);
            return;
        }

        // 方式3：优先用 ComfyUI 内置的 getExtraMenuOptions 获取 "Open in MaskEditor" 菜单项
        // 这是官方打开方式，不需要 selectNode、不需要找按钮、不需要进入子图
        try {
            if (node && typeof node.getExtraMenuOptions === "function") {
                const _menu = [];
                node.getExtraMenuOptions(app.canvas, _menu);
                const _maskItem = _menu.find(function(m) {
                    return m && m.content && /MaskEditor|Mask Editor|遮罩/i.test(m.content);
                });
                if (_maskItem && typeof _maskItem.callback === "function") {
                    ptLog("[MaskEditor Menu] Using built-in getExtraMenuOptions:", _maskItem.content);
                    _maskItem.callback.call(node);
                    return;
                }
            }
        } catch (e) {
            console.warn("[MaskEditor Menu] getExtraMenuOptions failed, fallback to selectNode:", e);
        }

        // 回退方式：selectNode + 点击 mask 按钮
        try {
            // 子图内部节点不在当前画布上，需先进入子图才能渲染 DOM
            const _curGraph = app && app.canvas ? app.canvas.graph : null;
            const _nodeGraph = node.graph;
            if (_nodeGraph && _curGraph && _nodeGraph !== _curGraph) {
                try { app.canvas.setGraph(_nodeGraph); } catch(e) {}
            }
            if (app && app.canvas && typeof app.canvas.selectNode === "function") {
                app.canvas.selectNode(node, false);
            }
        } catch (e) {
            console.warn("[MaskEditor Menu] selectNode failed:", e);
        }

        setTimeout(() => {
            try {
                // ComfyUI 更新后按钮 aria-label 为"编辑或遮罩图片"
                let maskBtn = document.querySelector(
                    '[aria-label*="遮罩"], [title*="遮罩"], ' +
                    '[aria-label*="Mask Editor"], [title*="Mask Editor"]'
                );
                if (!maskBtn) {
                    const maskIcon = document.querySelector('i.icon-\\[comfy--mask\\]');
                    if (maskIcon) maskBtn = maskIcon.closest('button') || maskIcon.parentElement;
                }
                if (maskBtn) {
                    ptLog("[MaskEditor Menu] Clicking mask editor button (fallback)");
                    maskBtn.click();
                    return;
                }
                console.error("[MaskEditor Menu] Could not find mask editor button.");
                clearInterval(pollTimer);
            } catch (e) {
                console.error("[MaskEditor Menu] Button click failed:", e);
                clearInterval(pollTimer);
            }
        }, 150);
    }, 50);
}


// ================================================================
// 判断当前是 Node 1.0（LiteGraph）还是 Node 2.0
// Node 2.0 有 .lg-node 元素，Node 1.0 没有
// ================================================================
function isNodeV1() {
    return !document.querySelector(".lg-node");
}


// ================================================================
// 注册扩展
// ================================================================
app.registerExtension({
    name: "PracticalTools.MaskEditorMenu",

    // Node 2.0 右键菜单（官方扩展机制）
    getNodeMenuItems(node) {
        // Node 1.0 不走这里，避免和 getMenuOptions 重复
        if (isNodeV1()) return [];

        if (!shouldShowMenu(node)) return [];

        const allNodes = findAllLoadImageNodes(node);
        if (allNodes.length === 0) return [];

        // 单个加载节点：直接显示菜单项
        if (allNodes.length === 1) {
            const target = allNodes[0].node;
            return [
                {
                    content: "Open image in MaskEditor",
                    callback: () => {
                        openMaskEditorForNode(target);
                    }
                }
            ];
        }

        // 多个加载节点：二级菜单 "from 哪个来源"（label 为内层子图名或节点名）
        const submenuOptions = allNodes.map((s) => ({
            content: "from " + s.label,
            callback: () => {
                openMaskEditorForNode(s.node);
            }
        }));

        return [
            {
                content: "Open image in MaskEditor",
                has_submenu: true,
                submenu: {
                    options: submenuOptions
                }
            }
        ];
    },

    // Node 1.0 右键菜单（LiteGraph 原生 getMenuOptions）
    nodeCreated(node) {
        if (!node) return;
        // Node 2.0 不走这里，避免和 getNodeMenuItems 重复
        if (!isNodeV1()) return;

        // 保存原始 getMenuOptions
        const origGetMenuOptions = node.getMenuOptions;

        node.getMenuOptions = function (options) {
            let menu = origGetMenuOptions ? origGetMenuOptions.call(this, options) : [];
            if (!menu) menu = [];

            if (!shouldShowMenu(this)) return menu;

            const allNodes = findAllLoadImageNodes(this);
            if (allNodes.length === 0) return menu;

            // 分隔符
            if (menu.length > 0 && menu[menu.length - 1] !== null) {
                menu.push(null);
            }

            if (allNodes.length === 1) {
                const target = allNodes[0].node;
                menu.push({
                    content: "Open image in MaskEditor",
                    callback: () => {
                        openMaskEditorForNode(target);
                    }
                });
            } else {
                const submenuOptions = allNodes.map((s) => ({
                    content: "from " + s.label,
                    callback: () => {
                        openMaskEditorForNode(s.node);
                    }
                }));

                menu.push({
                    content: "Open image in MaskEditor",
                    has_submenu: true,
                    submenu: {
                        options: submenuOptions
                    }
                });
            }

            return menu;
        };
    }
});
