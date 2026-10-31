// pose_editor.js — Practical-Tools OpenPose 姿势编辑器（多实例版）
// 侧边栏集成 + LoadImage 右键导入 PNG
// 编辑器基于 sd-webui-openpose-editor
// 多实例：每次 send 创建新实例（上限10个），标签栏切换，load 加载当前选中实例

console.log("Practical-Tools PoseEditor extension loaded (multi-instance).");

import { app } from "../../scripts/app.js";


const PT_DEBUG = (() => { try { return localStorage.getItem("PracticalTools.Debug") === "1"; } catch (e) { return false; } })();
function ptLog(...args) { if (PT_DEBUG) console.log(...args); }

// ================================================================
// 多实例管理
// ================================================================
let poseEditorInstances = [];   // [{id, name, iframe, ready, sourceNode}]
let activeInstanceId = null;
let instanceCounter = 0;
const MAX_INSTANCES = 10;

let lastRequestingNode = null;
let uiZoom = 1.0;
let isMaximized = false;
let wasMaximizedBeforeFS = false;
let persistentContainer = null;
let persistentToolbar = null;
let persistentTabBar = null;       // 侧边栏标签栏
let persistentIframeContainer = null;
let persistentOverlay = null;
let persistentOverlayContainer = null;
let persistentOverlayTabBar = null; // 最大化覆盖层标签栏
let maximizeBtn = null;
let zoomResetBtn = null;

// 用模块自身地址推导插件根目录，与安装目录名无关
function detectPluginBasePath() {
    try {
        // pose_editor.js 由 ComfyUI 以 ES 模块方式加载，
        // import.meta.url 形如 http://host/extensions/<目录名>/pose_editor.js
        return new URL("./", import.meta.url).pathname;
    } catch (e) { /* 退回下面按 script 标签推断 */ }
    var scripts = document.querySelectorAll('script[src*="pose_editor.js"]');
    for (var i = 0; i < scripts.length; i++) {
        var m = scripts[i].src.match(/\/extensions\/([^/]+)\//);
        if (m) return "/extensions/" + m[1] + "/";
    }
    return "/extensions/";
}
var PLUGIN_BASE = detectPluginBasePath();
var EDITOR_URL = PLUGIN_BASE + "pose_editor/index.html?theme=dark";


// ================================================================
// 递归查找子图内部的 LoadImage 节点
// ================================================================
function findAllLoadImageNodes(node) {
    if (!node) return [];
    const results = [];
    if (!node.subgraph) {
        if (node.comfyClass === "LoadImage" || node.comfyClass === "LoadImageMask") {
            results.push(node);
        } else if (node.widgets && Array.isArray(node.widgets) && node.widgets.some(w => w.name === "image")) {
            results.push(node);
        }
    }
    if (node.subgraph && node.subgraph._nodes && Array.isArray(node.subgraph._nodes)) {
        for (const inner of node.subgraph._nodes) {
            if (!inner) continue;
            if (inner.comfyClass === "LoadImage" || inner.comfyClass === "LoadImageMask") {
                results.push(inner);
            } else if (inner.widgets && Array.isArray(inner.widgets) && inner.widgets.some(w => w.name === "image")) {
                results.push(inner);
            }
        }
    }
    return results;
}

function findLoadImageNodeRecursive(node) {
    if (!node) return null;
    if (node.comfyClass === "LoadImage" || node.comfyClass === "LoadImageMask") return node;
    const subGraph = node.subgraph;
    if (subGraph && subGraph._nodes && Array.isArray(subGraph._nodes)) {
        for (const inner of subGraph._nodes) {
            if (inner && (inner.comfyClass === "LoadImage" || inner.comfyClass === "LoadImageMask")) {
                return inner;
            }
        }
        for (const inner of subGraph._nodes) {
            if (inner && inner.widgets && Array.isArray(inner.widgets) && inner.widgets.some(w => w.name === "image")) {
                return inner;
            }
        }
        for (const inner of subGraph._nodes) {
            if (inner && inner.subgraph) {
                const found = findLoadImageNodeRecursive(inner);
                if (found) return found;
            }
        }
    }
    if (node.widgets && Array.isArray(node.widgets) && node.widgets.some(w => w.name === "image")) return node;
    return null;
}


// ================================================================
// 检查节点是否应该显示我们的菜单
// ================================================================
function shouldShowMenu(node) {
    if (!node) return false;
    if (node.comfyClass === "LoadImage" || node.comfyClass === "LoadImageMask") return true;
    if (node.widgets && Array.isArray(node.widgets) && node.widgets.some(w => w.name === "image")) return true;
    if (node.subgraph && node.subgraph._nodes && Array.isArray(node.subgraph._nodes)) {
        for (const inner of node.subgraph._nodes) {
            if (!inner) continue;
            if (inner.comfyClass === "LoadImage" || inner.comfyClass === "LoadImageMask") return true;
            if (inner.widgets && Array.isArray(inner.widgets) && inner.widgets.some(w => w.name === "image")) return true;
        }
    }
    return false;
}

function setLoadImageValue(node, imageName) {
    if (!node || !node.widgets) return;
    const widget = node.widgets.find(w => w.name === "image");
    if (!widget) return;

    widget.value = imageName;

    const img = new Image();
    img.onload = () => {
        node.imgs = [img];
        if (node.graph && node.graph.setDirtyCanvas) {
            node.graph.setDirtyCanvas(true, true);
        }
        app.graph.setDirtyCanvas(true, true);
        app.canvas.setDirty(true, true);
    };
    img.src = `/view?filename=${encodeURIComponent(imageName)}&type=input&subfolder=`;

    if (widget.callback) {
        try { widget.callback(imageName); } catch(e) {}
    }

    if (node.graph && node.graph !== app.graph) {
        const parentSubgraphNode = app.graph._nodes.find(n => n.subgraph === node.graph);
        if (parentSubgraphNode && parentSubgraphNode.widgets) {
            const allInnerLoadImages = node.graph._nodes.filter(n =>
                n.comfyClass === "LoadImage" || n.comfyClass === "LoadImageMask" ||
                (n.widgets && Array.isArray(n.widgets) && n.widgets.some(w => w.name === "image"))
            );
            const nodeIndex = allInnerLoadImages.indexOf(node);

            const imageWidgets = parentSubgraphNode.widgets.filter(w =>
                w.type === "combo" && w.name && w.name.startsWith("image")
            );

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
            }
        }
    }
}


// ================================================================
// 多实例：创建新实例
// ================================================================
function createInstance() {
    if (poseEditorInstances.length >= MAX_INSTANCES) {
        alert(`最多支持 ${MAX_INSTANCES} 个 PoseEditor 实例，请先关闭一些实例。`);
        return null;
    }

    instanceCounter++;
    const id = `pose-instance-${instanceCounter}`;
    const name = "Pose";

    const iframe = document.createElement("iframe");
    iframe.id = `practical-tools-pose-editor-iframe-${instanceCounter}`;
    iframe.dataset.instanceId = id;
    iframe.style.cssText = "width: 100%; height: 100%; border: none; transform-origin: top left; pointer-events: auto; margin-right: 0; overflow: hidden;";
    iframe.scrolling = "no";
    iframe.src = EDITOR_URL;
    iframe.onload = () => {
        ptLog(`[PT PoseEditor] iframe loaded: ${name}`);
        instance.iframeLoaded = true;
    };

    const instance = {
        id: id,
        name: name,
        iframe: iframe,
        ready: false,
        sourceNode: null
    };

    poseEditorInstances.push(instance);

    // 和单实例完全一致：先设置 src，再 appendChild 到 DOM
    const container = isMaximized ? persistentOverlayContainer : persistentIframeContainer;
    if (container) {
        container.appendChild(iframe);
    }

    // 添加标签
    addTab(instance);

    // 自动选中新实例
    switchInstance(id);

    ptLog(`[PT PoseEditor] Created instance: ${name} (total: ${poseEditorInstances.length})`);
    return instance;
}

// ================================================================
// 多实例：获取当前活动实例
// ================================================================
function getActiveInstance() {
    return poseEditorInstances.find(i => i.id === activeInstanceId);
}

// ================================================================
// 多实例：切换实例
// ================================================================
function switchInstance(id) {
    activeInstanceId = id;
    poseEditorInstances.forEach(inst => {
        inst.iframe.style.display = inst.id === id ? "block" : "none";
    });
    updateTabActiveState();
    // 注意：applyZoom 定义在 render 内部，此处不调用，缩放由 render 内按钮处理
}

// ================================================================
// 多实例：关闭实例
// ================================================================
function closeInstance(id) {
    const idx = poseEditorInstances.findIndex(i => i.id === id);
    if (idx === -1) return;

    const instance = poseEditorInstances[idx];
    ptLog(`[PT PoseEditor] Closing instance: ${instance.name}`);

    // 移除 iframe
    if (instance.iframe && instance.iframe.parentNode) {
        instance.iframe.parentNode.removeChild(instance.iframe);
    }

    poseEditorInstances.splice(idx, 1);
    removeTab(id);

    // 如果关闭的是当前活动实例，切换到第一个
    if (activeInstanceId === id) {
        if (poseEditorInstances.length > 0) {
            switchInstance(poseEditorInstances[0].id);
        } else {
            activeInstanceId = null;
        }
    }
}

// ================================================================
// 多实例：标签栏 - 添加标签
// ================================================================
function addTab(instance) {
    const createTabEl = (tabBar) => {
        if (!tabBar) return null;
        const tab = document.createElement("div");
        tab.className = "pt-pose-tab";
        tab.dataset.instanceId = instance.id;
        tab.style.cssText = `
            display: flex; align-items: center; gap: 6px;
            padding: 4px 10px; background: #222; border: 1px solid #444;
            border-radius: 4px 4px 0 0; cursor: pointer; color: #ccc;
            font-size: 11px; font-family: sans-serif; user-select: none;
            white-space: nowrap; pointer-events: auto;
        `;
        tab.innerHTML = `<span class="pt-pose-tab-name">${instance.name}</span>`;

        // 关闭按钮
        const closeBtn = document.createElement("span");
        closeBtn.style.cssText = "cursor:pointer; opacity:0.6; font-size:12px; line-height:1; padding:0 2px;";
        closeBtn.innerHTML = "×";
        closeBtn.onmouseover = () => { closeBtn.style.opacity = "1"; closeBtn.style.color = "#ef4444"; };
        closeBtn.onmouseout = () => { closeBtn.style.opacity = "0.6"; closeBtn.style.color = ""; };
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            closeInstance(instance.id);
        };
        tab.appendChild(closeBtn);

        tab.onclick = () => switchInstance(instance.id);
        tab.onmouseover = () => { if (instance.id !== activeInstanceId) tab.style.background = "#2a2a2a"; };
        tab.onmouseout = () => { if (instance.id !== activeInstanceId) tab.style.background = "#222"; };

        // 插入到 "+" 按钮之前
        const addBtn = tabBar.querySelector(".pt-pose-add-btn");
        if (addBtn) {
            tabBar.insertBefore(tab, addBtn);
        } else {
            tabBar.appendChild(tab);
        }
        return tab;
    };

    createTabEl(persistentTabBar);
    createTabEl(persistentOverlayTabBar);
}

// ================================================================
// 多实例：标签栏 - 移除标签
// ================================================================
function removeTab(id) {
    [persistentTabBar, persistentOverlayTabBar].forEach(tabBar => {
        if (!tabBar) return;
        const tab = tabBar.querySelector(`[data-instance-id="${id}"]`);
        if (tab) tab.remove();
    });
}

// ================================================================
// 多实例：标签栏 - 更新选中状态
// ================================================================
function updateTabActiveState() {
    [persistentTabBar, persistentOverlayTabBar].forEach(tabBar => {
        if (!tabBar) return;
        tabBar.querySelectorAll(".pt-pose-tab").forEach(tab => {
            const isActive = tab.dataset.instanceId === activeInstanceId;
            tab.style.background = isActive ? "#333" : "#222";
            tab.style.color = isActive ? "#fff" : "#ccc";
            tab.style.borderBottomColor = isActive ? "#333" : "#444";
            tab.style.fontWeight = isActive ? "bold" : "normal";
        });
    });
}


app.registerExtension({
    name: "PracticalTools.PoseEditor",

    setup() {
        ptLog("Practical-Tools PoseEditor: setup called");

        const checkPoseEditorEnabled = () => {
            let enabled = true;
            try {
                if (app.ui?.settings?.getSettingValue) {
                    enabled = app.ui.settings.getSettingValue("Practical-Tools.EnablePoseEditor") ?? true;
                } else {
                    enabled = localStorage.getItem("Comfy.Settings.Practical-Tools.EnablePoseEditor") !== "false";
                }
            } catch (e) {}
            if (!enabled) {
                ptLog("Practical-Tools PoseEditor: disabled by settings");
                return true;
            }
            return false;
        };
        if (checkPoseEditorEnabled()) return;
        setTimeout(() => {
            if (checkPoseEditorEnabled()) {
                try {
                    const tab = document.querySelector("[data-id=\"practical-tools-pose-editor\"]");
                    if (tab) tab.remove();
                    const container = document.getElementById("practical-tools-pose-editor-container");
                    if (container) container.remove();
                } catch (e) {}
            }
        }, 1000);

        if (!app.extensionManager?.registerSidebarTab) {
            console.warn("Practical-Tools PoseEditor: Sidebar Tab API not available.");
            return;
        }

        app.extensionManager.registerSidebarTab({
            id: "practical-tools-pose-editor",
            icon: "pi pi-user",
            title: "PoseEditor",
            tooltip: "OpenPose 姿势编辑器",
            type: "custom",
            render: el => {
                el.style.width = "100%";
                el.style.height = "100%";
                const anchor = document.createElement("div");
                anchor.id = "practical-tools-pose-editor-anchor";
                anchor.style.cssText = "width:100%;height:100%;";
                el.appendChild(anchor);

                if (persistentContainer) {
                    requestAnimationFrame(syncPosition);
                    return;
                }

                // persistentContainer
                persistentContainer = document.createElement("div");
                persistentContainer.id = "practical-tools-pose-editor-container";
                persistentContainer.style.cssText = `
                    position: fixed;
                    z-index: 1500;
                    background: #1a1a1a;
                    display: flex;
                    flex-direction: column;
                    overflow: visible;
                    visibility: hidden;
                    left: -10000px;
                    pointer-events: none;
                `;
                document.body.appendChild(persistentContainer);

                // 右侧背景条
                const poseRightBg = document.createElement("div");
                poseRightBg.style.cssText = "position:absolute; left:100%; top:0; width:50px; height:100%; background:#181818; pointer-events:none; z-index:5;";
                persistentContainer.appendChild(poseRightBg);

                // 工具栏
                persistentToolbar = document.createElement("div");
                persistentToolbar.style.cssText = `
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 0 10px;
                    background: #1a1a1a;
                    border-bottom: 1px solid #333;
                    color: #ddd;
                    font-family: sans-serif;
                    font-size: 11px;
                    height: 34px;
                    box-sizing: border-box;
                    flex-shrink: 0;
                    pointer-events: none;
                    margin-right: -50px;
                    position: relative;
                    z-index: 10;
                `;

                const leftGroup = document.createElement("div");
                leftGroup.style.cssText = "display:flex; align-items:center; gap:8px;";
                leftGroup.innerHTML = `
                    <i class="pi pi-user" style="font-size:14px; opacity:0.9;"></i>
                    <span style="font-weight:bold; opacity:0.9;">PoseEditor</span>
                `;
                persistentToolbar.appendChild(leftGroup);

                const spacer = document.createElement("div");
                spacer.style.flex = "1";
                persistentToolbar.appendChild(spacer);

                const rightGroup = document.createElement("div");
                rightGroup.style.cssText = "display:flex; align-items:center; gap:2px;";

                const btnStyle = `
                    background: #222;
                    border: 1px solid #444;
                    color: #eee;
                    padding: 3px 8px;
                    border-radius: 4px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 11px;
                    transition: all 0.2s;
                    pointer-events: auto;
                `;

                // 缩放组
                const zoomGroup = document.createElement("div");
                zoomGroup.style.cssText = "display:flex; align-items:center; gap:2px;";

                const zoomOutBtn = document.createElement("button");
                zoomOutBtn.style.cssText = btnStyle;
                zoomOutBtn.title = "缩小";
                zoomOutBtn.innerHTML = '<i class="pi pi-minus" style="font-size:9px;"></i>';
                zoomOutBtn.onmouseover = () => { zoomOutBtn.style.background = "#333"; };
                zoomOutBtn.onmouseout = () => { zoomOutBtn.style.background = "#222"; };
                zoomOutBtn.onclick = () => {
                    uiZoom = Math.max(0.1, uiZoom - 0.1);
                    applyZoom();
                };
                zoomGroup.appendChild(zoomOutBtn);

                zoomResetBtn = document.createElement("button");
                zoomResetBtn.style.cssText = btnStyle + "padding: 3px 6px; font-size: 10px;";
                zoomResetBtn.id = "pt-pose-zoom-reset";
                zoomResetBtn.textContent = "100%";
                zoomResetBtn.title = "重置缩放";
                zoomResetBtn.onmouseover = () => { zoomResetBtn.style.background = "#333"; };
                zoomResetBtn.onmouseout = () => { zoomResetBtn.style.background = "#222"; };
                zoomResetBtn.onclick = () => {
                    uiZoom = 1.0;
                    applyZoom();
                };
                zoomGroup.appendChild(zoomResetBtn);

                const zoomInBtn = document.createElement("button");
                zoomInBtn.style.cssText = btnStyle;
                zoomInBtn.title = "放大";
                zoomInBtn.innerHTML = '<i class="pi pi-plus" style="font-size:9px;"></i>';
                zoomInBtn.onmouseover = () => { zoomInBtn.style.background = "#333"; };
                zoomInBtn.onmouseout = () => { zoomInBtn.style.background = "#222"; };
                zoomInBtn.onclick = () => {
                    uiZoom = Math.min(3.0, uiZoom + 0.1);
                    applyZoom();
                };
                zoomGroup.appendChild(zoomInBtn);

                rightGroup.appendChild(zoomGroup);

                const sep1 = document.createElement("div");
                sep1.style.width = "16px";
                rightGroup.appendChild(sep1);

                const actionGroup = document.createElement("div");
                actionGroup.style.cssText = "display:flex; align-items:center; gap:8px;";

                const refreshBtn = document.createElement("button");
                refreshBtn.style.cssText = btnStyle;
                refreshBtn.title = "刷新当前实例";
                refreshBtn.innerHTML = '<i class="pi pi-refresh"></i>';
                refreshBtn.onmouseover = () => { refreshBtn.style.background = "#333"; };
                refreshBtn.onmouseout = () => { refreshBtn.style.background = "#222"; };
                refreshBtn.onclick = () => {
                    const inst = getActiveInstance();
                    if (inst && inst.iframe) {
                        inst.ready = false;
                        inst.iframe.src = EDITOR_URL;
                    }
                };
                actionGroup.appendChild(refreshBtn);

                maximizeBtn = document.createElement("button");
                maximizeBtn.style.cssText = btnStyle;
                maximizeBtn.title = "最大化";
                maximizeBtn.innerHTML = '<i class="pi pi-window-maximize"></i>';
                maximizeBtn.onmouseover = () => { maximizeBtn.style.background = "#333"; };
                maximizeBtn.onmouseout = () => { maximizeBtn.style.background = "#222"; };
                maximizeBtn.onclick = () => {
                    toggleMaximize();
                };
                actionGroup.appendChild(maximizeBtn);

                const fullscreenBtn = document.createElement("button");
                fullscreenBtn.style.cssText = btnStyle;
                fullscreenBtn.title = "全屏";
                fullscreenBtn.innerHTML = '<i class="pi pi-expand"></i>';
                fullscreenBtn.onmouseover = () => { fullscreenBtn.style.background = "#333"; };
                fullscreenBtn.onmouseout = () => { fullscreenBtn.style.background = "#222"; };
                fullscreenBtn.onclick = () => {
                    toggleFullscreen();
                };
                actionGroup.appendChild(fullscreenBtn);

                rightGroup.appendChild(actionGroup);
                persistentToolbar.appendChild(rightGroup);
                persistentContainer.appendChild(persistentToolbar);

                // ===== 标签栏（多实例） =====
                persistentTabBar = document.createElement("div");
                persistentTabBar.style.cssText = `
                    display: flex;
                    align-items: flex-end;
                    gap: 2px;
                    padding: 4px 10px 0 10px;
                    background: #1a1a1a;
                    border-bottom: 1px solid #444;
                    flex-shrink: 0;
                    pointer-events: none;
                    margin-right: -50px;
                    position: relative;
                    z-index: 10;
                    min-height: 28px;
                    overflow-x: auto;
                    overflow-y: hidden;
                `;
                persistentContainer.appendChild(persistentTabBar);

                // "+" 按钮：手动创建新实例
                const addTabBtn = document.createElement("div");
                addTabBtn.className = "pt-pose-add-btn";
                addTabBtn.style.cssText = `
                    display: flex; align-items: center; justify-content: center;
                    padding: 4px 8px; background: #222; border: 1px solid #444;
                    border-radius: 4px 4px 0 0; cursor: pointer; color: #888;
                    font-size: 11px; font-weight: bold; font-family: sans-serif;
                    user-select: none; pointer-events: auto;
                    flex-shrink: 0;
                `;
                addTabBtn.innerHTML = "+";
                addTabBtn.title = "新建 PoseEditor 实例";
                addTabBtn.onmouseover = () => { addTabBtn.style.color = "#fff"; addTabBtn.style.background = "#2a2a2a"; };
                addTabBtn.onmouseout = () => { addTabBtn.style.color = "#888"; addTabBtn.style.background = "#222"; };
                addTabBtn.onclick = () => createInstance();
                persistentTabBar.appendChild(addTabBtn);

                // 提示条
                const poseHintBar = document.createElement("div");
                poseHintBar.id = "practical-tools-pose-hint-bar";
                poseHintBar.style.cssText = "display:none; align-items:center; justify-content:center; gap:8px; padding:6px 12px; background:#2a2a2a; border-bottom:1px solid #333; color:#aaa; font-size:13px; font-family:sans-serif; pointer-events:none; flex-shrink:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;";
                poseHintBar.innerHTML = "<i class=\"pi pi-info-circle\" style=\"font-size:12px; color:#ef4444;\"></i><span style=\"color:#ef4444;\">在加载图像节点上右键，选择 Load image from PoseEditor 即可加载当前选中实例的姿势图像</span>";
                if (!document.getElementById("practical-tools-pose-hint-style")) {
                    const hintStyle = document.createElement("style");
                    hintStyle.id = "practical-tools-pose-hint-style";
                    hintStyle.textContent = "@keyframes pose-hint-blink { 0% { opacity: 1; } 50% { opacity: 0; } }";
                    document.head.appendChild(hintStyle);
                }
                persistentContainer.appendChild(poseHintBar);

                // iframe 容器
                persistentIframeContainer = document.createElement("div");
                persistentIframeContainer.style.cssText = "flex: 1; width: 100%; overflow: hidden; position: relative; pointer-events: none; background: #1a1a1a;";
                persistentContainer.appendChild(persistentIframeContainer);

                // ===== 最大化覆盖层 =====
                persistentOverlay = document.createElement("div");
                persistentOverlay.style.cssText = `
                    display: none;
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100vw;
                    height: 100vh;
                    background: #1a1a1a;
                    z-index: 9999;
                    flex-direction: column;
                `;
                document.body.appendChild(persistentOverlay);

                const overlayToolbar = persistentToolbar.cloneNode(true);
                persistentOverlay.appendChild(overlayToolbar);

                // 覆盖层标签栏
                persistentOverlayTabBar = persistentTabBar.cloneNode(true);
                // cloneNode 不复制事件，重新绑定 overlay 的 "+" 按钮
                const overlayAddBtn = persistentOverlayTabBar.querySelector(".pt-pose-add-btn");
                if (overlayAddBtn) {
                    overlayAddBtn.onclick = () => createInstance();
                    overlayAddBtn.onmouseover = () => { overlayAddBtn.style.color = "#fff"; overlayAddBtn.style.background = "#2a2a2a"; };
                    overlayAddBtn.onmouseout = () => { overlayAddBtn.style.color = "#888"; overlayAddBtn.style.background = "#222"; };
                }
                persistentOverlayTabBar.innerHTML = ""; // 清空克隆的标签，重新绑定
                persistentOverlay.appendChild(persistentOverlayTabBar);

                const overlayHintBar = poseHintBar.cloneNode(true);
                overlayHintBar.id = "practical-tools-pose-hint-bar-overlay";
                persistentOverlay.appendChild(overlayHintBar);

                persistentOverlayContainer = document.createElement("div");
                persistentOverlayContainer.style.cssText = "flex: 1; width: 100%; overflow: visible; position: relative;";
                persistentOverlay.appendChild(persistentOverlayContainer);

                // 重新绑定覆盖层工具栏按钮
                const overlayButtons = overlayToolbar.querySelectorAll("button");
                const origButtons = rightGroup.querySelectorAll("button");
                overlayButtons.forEach((btn, i) => {
                    if (origButtons[i]) {
                        btn.onclick = origButtons[i].onclick;
                        btn.onmouseover = origButtons[i].onmouseover;
                        btn.onmouseout = origButtons[i].onmouseout;
                    }
                });

                // 同步位置
                function syncPosition() {
                    if (!persistentContainer) {
                        requestAnimationFrame(syncPosition);
                        return;
                    }

                    if (isMaximized) {
                        persistentContainer.style.visibility = "hidden";
                        persistentContainer.style.left = "-10000px";
                        requestAnimationFrame(syncPosition);
                        return;
                    }

                    const anchorEl = document.getElementById("practical-tools-pose-editor-anchor");
                    if (!anchorEl) {
                        persistentContainer.style.visibility = "hidden";
                        persistentContainer.style.left = "-10000px";
                        requestAnimationFrame(syncPosition);
                        return;
                    }

                    const rect = anchorEl.getBoundingClientRect();
                    if (rect.width > 5 && rect.height > 5) {
                        const cacheKey = "practical-tools-pose-pos";
                        const lastPos = window[cacheKey] || {};
                        const posChanged = lastPos.top !== rect.top || lastPos.left !== rect.left ||
                                           lastPos.width !== rect.width || lastPos.height !== rect.height;
                        window[cacheKey] = { top: rect.top, left: rect.left, width: rect.width, height: rect.height };

                        const wasHidden = persistentContainer.style.visibility !== "visible";
                        if (wasHidden) {
                            const hintBar = document.getElementById("practical-tools-pose-hint-bar");
                            const hintBarOverlay = document.getElementById("practical-tools-pose-hint-bar-overlay");
                            if (hintBar) hintBar.style.display = "flex";
                            if (hintBarOverlay) hintBarOverlay.style.display = "flex";
                            clearTimeout(window._poseHintTimer);
                            window._poseHintTimer = setTimeout(() => {
                                if (hintBar) hintBar.style.display = "none";
                                if (hintBarOverlay) hintBarOverlay.style.display = "none";
                            }, 10000);
                            persistentContainer.style.visibility = "visible";
                        }

                        if (posChanged || wasHidden) {
                            persistentContainer.style.left = rect.left + "px";
                            persistentContainer.style.top = rect.top + "px";
                            persistentContainer.style.width = (rect.width - 50) + "px";
                            persistentContainer.style.height = rect.height + "px";
                        }
                    } else {
                        if (persistentContainer.style.visibility !== "hidden") {
                            persistentContainer.style.visibility = "hidden";
                            persistentContainer.style.left = "-10000px";
                        }
                        setTimeout(syncPosition, 500);
                        return;
                    }

                    requestAnimationFrame(syncPosition);
                }

                // 应用缩放（到当前活动实例）
                function applyZoom() {
                    const inst = getActiveInstance();
                    const targetIframe = inst ? inst.iframe : null;
                    if (targetIframe) {
                        if (uiZoom === 1.0) {
                            targetIframe.style.transform = "";
                            targetIframe.style.width = "100%";
                            targetIframe.style.height = "100%";
                        } else {
                            targetIframe.style.transform = `scale(${uiZoom})`;
                            targetIframe.style.width = `${100 / uiZoom}%`;
                            targetIframe.style.height = `${100 / uiZoom}%`;
                        }
                    }
                    if (zoomResetBtn) zoomResetBtn.textContent = `${Math.round(uiZoom * 100)}%`;
                    const overlayZoomBtn = overlayToolbar.querySelector("#pt-pose-zoom-reset");
                    if (overlayZoomBtn) overlayZoomBtn.textContent = `${Math.round(uiZoom * 100)}%`;
                }

                // 切换最大化（移动所有 iframe）
                function toggleMaximize() {
                    if (persistentOverlay.style.display === "flex") {
                        // 从最大化恢复：把所有 iframe 移回侧边栏容器
                        poseEditorInstances.forEach(inst => {
                            if (inst.iframe.parentNode === persistentOverlayContainer) {
                                persistentOverlayContainer.removeChild(inst.iframe);
                                persistentIframeContainer.appendChild(inst.iframe);
                            }
                        });
                        persistentOverlay.style.display = "none";
                        isMaximized = false;
                        window["practical-tools-pose-pos"] = null;
                    } else {
                        // 进入最大化：把所有 iframe 移到覆盖层容器
                        poseEditorInstances.forEach(inst => {
                            if (inst.iframe.parentNode === persistentIframeContainer) {
                                persistentIframeContainer.removeChild(inst.iframe);
                                persistentOverlayContainer.appendChild(inst.iframe);
                            }
                        });
                        persistentOverlay.style.display = "flex";
                        isMaximized = true;
                    }
                    persistentToolbar.style.marginRight = isMaximized ? "0" : "-50px";
                    persistentTabBar.style.marginRight = isMaximized ? "0" : "-50px";
                    const overlayTb = persistentOverlay.firstElementChild;
                    if (overlayTb) overlayTb.style.marginRight = isMaximized ? "0" : "-50px";
                    persistentOverlayTabBar.style.marginRight = isMaximized ? "0" : "-50px";
                    const origHint = document.getElementById("practical-tools-pose-hint-bar");
                    const overlayHint = document.getElementById("practical-tools-pose-hint-bar-overlay");
                    if (origHint && overlayHint) {
                        overlayHint.style.display = origHint.style.display;
                    }
                    updateMaximizeIcon();
                    applyZoom();
                }

                function toggleFullscreen() {
                    if (!document.fullscreenElement) {
                        wasMaximizedBeforeFS = isMaximized;
                        if (!isMaximized) {
                            toggleMaximize();
                        }
                        persistentOverlay.requestFullscreen().catch(err => console.error("Fullscreen error:", err));
                    } else {
                        document.exitFullscreen();
                    }
                }

                function updateMaximizeIcon() {
                    if (maximizeBtn) {
                        const icon = maximizeBtn.querySelector("i");
                        if (icon) {
                            icon.className = isMaximized ? "pi pi-window-minimize" : "pi pi-window-maximize";
                        }
                    }
                    const overlayIcon = overlayToolbar.querySelectorAll("button")[4]?.querySelector("i");
                    if (overlayIcon) {
                        overlayIcon.className = isMaximized ? "pi pi-window-minimize" : "pi pi-window-maximize";
                    }
                }

                document.addEventListener("fullscreenchange", () => {
                    const isFS = !!document.fullscreenElement;
                    if (maximizeBtn) {
                        maximizeBtn.style.display = isFS ? "none" : "flex";
                    }
                    const overlayMaxBtn = overlayToolbar.querySelectorAll("button")[4];
                    if (overlayMaxBtn) {
                        overlayMaxBtn.style.display = isFS ? "none" : "flex";
                    }
                    if (!isFS) {
                        if (!wasMaximizedBeforeFS && isMaximized) {
                            toggleMaximize();
                        }
                    }
                });

                const raiseSplitterGutter = () => {
                    const gutters = document.querySelectorAll(".p-splitter-gutter:not(.hidden)");
                    gutters.forEach(g => { g.style.zIndex = "99999"; g.style.position = "relative"; });
                };
                raiseSplitterGutter();
                new MutationObserver(raiseSplitterGutter).observe(document.body, { childList: true, subtree: true });

                requestAnimationFrame(syncPosition);

                // 侧边栏首次打开时，延迟创建默认实例
                if (poseEditorInstances.length === 0) {
                    setTimeout(() => {
                        if (poseEditorInstances.length === 0) {
                            createInstance();
                        }
                    }, 400);
                }
            }
        });

        // ================================================================
        // postMessage 通信（多实例：通过 event.source 匹配）
        // ================================================================
        window.addEventListener("message", (event) => {
            // 找到消息来源的实例
            const instance = poseEditorInstances.find(inst =>
                inst.iframe && event.source === inst.iframe.contentWindow
            );
            if (!instance) return;

            const message = event.data;

            if (message.ready) {
                instance.ready = true;
                ptLog(`[PT PoseEditor] editor ready: ${instance.name}`);
            }

            if (message.type === "export_png" && message.data) {
                handlePngExport(message.data);
            }

            if (message.poses && message.modalId !== undefined) {
                ptLog(`[PT PoseEditor] received poses JSON from ${instance.name}`);
            }
        });
    },

    // ================================================================
    // 节点右键菜单
    // ================================================================
    getNodeMenuItems(node) {
        ptLog("[PT PoseEditor] getNodeMenuItems called, node:", node?.comfyClass, "shouldShow:", shouldShowMenu(node));
        if (!shouldShowMenu(node)) return [];
        const items = [];
        const allNodes = findAllLoadImageNodes(node);
        if (allNodes.length === 0) return [];

        const getLabel = (n, idx) => {
            if (n.title) return n.title;
            const w = n.widgets?.find(w => w.name === "image");
            if (w && w.value) return w.value;
            return n.comfyClass + " #" + (idx + 1);
        };

        const sendImg = (tn) => {
            ptLog("[PT PoseEditor] sendImg called, node:", tn?.comfyClass, "title:", tn?.title);
            let imageUrl = null;
            if (tn.imgs?.length > 0) {
                imageUrl = tn.imgs[0].src;
                ptLog("[PT PoseEditor] imageUrl from imgs:", imageUrl);
            } else {
                const widget = tn.widgets?.find(w => w.name === "image");
                ptLog("[PT PoseEditor] image widget:", widget?.name, "value:", widget?.value);
                if (widget?.value) {
                    imageUrl = `/view?filename=${encodeURIComponent(widget.value)}&type=input&subfolder=`;
                    ptLog("[PT PoseEditor] imageUrl from widget:", imageUrl);
                }
            }
            if (imageUrl) {
                ptLog("[PT PoseEditor] calling sendReferenceImage...");
                sendReferenceImage(imageUrl, tn);
            } else {
                console.error("[PT PoseEditor] no imageUrl found!");
                alert("未找到图像");
            }
        };

        // Send image（每次创建新实例）
        if (allNodes.length === 1) {
            items.push({ content: "Send image to PoseEditor", callback: () => sendImg(allNodes[0]) });
        } else {
            items.push({
                content: "Send image to PoseEditor",
                has_submenu: true,
                submenu: { options: allNodes.map((n, i) => ({ content: "from " + getLabel(n, i), callback: () => sendImg(n) })) }
            });
        }

        // Load image（从当前选中实例加载）
        if (allNodes.length === 1) {
            items.push({ content: "Load image from PoseEditor", callback: () => { lastRequestingNode = allNodes[0]; requestPngExport(); } });
        } else {
            items.push({
                content: "Load image from PoseEditor",
                has_submenu: true,
                submenu: { options: allNodes.map((n, i) => ({ content: "to " + getLabel(n, i), callback: () => { lastRequestingNode = n; requestPngExport(); } })) }
            });
        }

        return items;
    }
});

// ================================================================
// 发送参考图像到编辑器（多实例：每次创建新实例）
// ================================================================
async function sendReferenceImage(imageUrl, sourceNode) {
    // 判断 PoseEditor 是否已打开
    const container = document.getElementById("practical-tools-pose-editor-container");
    const anchor = document.getElementById("practical-tools-pose-editor-anchor");
    const isOpen = (container && container.style.visibility === "visible") ||
                   (anchor && anchor.getBoundingClientRect().width > 5);
    if (!isOpen) {
        const tabButton = document.querySelector('.side-bar-button[aria-label="OpenPose 姿势编辑器"]');
        if (tabButton) tabButton.click();
    }

    // 等待 iframe 容器就绪且可见
    let waited = 0;
    let readyContainer = null;
    while (waited < 5000) {
        readyContainer = persistentIframeContainer || persistentOverlayContainer;
        if (readyContainer) {
            const pc = document.getElementById("practical-tools-pose-editor-container");
            const isVisible = pc && (pc.style.visibility === "visible" || pc.getBoundingClientRect().width > 5);
            if (isVisible) break;
        }
        await new Promise(r => setTimeout(r, 200));
        waited += 200;
    }
    if (!readyContainer) {
        alert("编辑器尚未就绪，请先打开 PoseEditor 侧边栏等待加载完成");
        return;
    }
    ptLog(`[PT PoseEditor] container ready and visible after ${waited}ms`);

    // 每次 send 创建新实例
    const instance = createInstance();
    if (!instance) return; // 超过上限
    instance.sourceNode = sourceNode || null;

    ptLog(`[PT PoseEditor] Instance ${instance.name} created, waiting for iframe load...`);
    ptLog(`[PT PoseEditor] imageUrl:`, imageUrl);
    ptLog(`[PT PoseEditor] iframe src:`, instance.iframe.src);

    // 等待 iframe load 事件（最多 15 秒）
    let loadWaited = 0;
    while (!instance.iframeLoaded && loadWaited < 15000) {
        await new Promise(r => setTimeout(r, 200));
        loadWaited += 200;
    }
    if (!instance.iframeLoaded) {
        console.error(`[PT PoseEditor] Instance ${instance.name} load timeout after 15s`);
        alert("编辑器加载超时，请检查网络或稍后重试");
        return;
    }
    ptLog(`[PT PoseEditor] Instance ${instance.name} loaded, waiting 1000ms for Vue mount...`);

    // load 后等待 1 秒，确保 Vue 挂载、canvas 初始化、message 监听器注册完成
    await new Promise(r => setTimeout(r, 1000));
    instance.ready = true;

    // 只发送一次
    const freshIframe = document.getElementById(instance.iframe.id);
    if (freshIframe && freshIframe.contentWindow) {
        freshIframe.contentWindow.postMessage({
            type: "load_reference_image",
            url: imageUrl
        }, "*");
        ptLog(`[PT PoseEditor] sent reference image to ${instance.name} (once)`);
    } else {
        console.error(`[PT PoseEditor] Failed to send: iframe not found`);
    }
}

// ================================================================
// 请求编辑器导出 PNG（从当前选中实例）
// ================================================================
function requestPngExport() {
    const instance = getActiveInstance();
    if (!instance || !instance.iframe || !instance.ready) {
        alert("当前没有可用的 PoseEditor 实例，请先 Send image 创建一个实例");
        return;
    }

    instance.iframe.contentWindow.postMessage({
        type: "request_export_png"
    }, "*");

    ptLog(`[PT PoseEditor] requested PNG export from ${instance.name}`);
}

// ================================================================
// 处理 PNG 导出：上传到 input 并设置到节点
// ================================================================
async function handlePngExport(dataUrl) {
    if (!lastRequestingNode) return;

    try {
        const response = await fetch(dataUrl);
        const blob = await response.blob();

        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `pose_editor_${timestamp}.png`;

        const formData = new FormData();
        formData.append("image", blob, filename);
        formData.append("overwrite", "true");

        const uploadResponse = await fetch("/upload/image", {
            method: "POST",
            body: formData
        });

        if (!uploadResponse.ok) {
            throw new Error("上传失败");
        }

        const result = await uploadResponse.json();
        const uploadedName = result.name || filename;

        const node = lastRequestingNode;
        if (node) {
            setLoadImageValue(node, uploadedName);
            ptLog("[PT PoseEditor] image widget set to:", uploadedName);
        }

        ptLog("[PT PoseEditor] pose imported:", uploadedName);
    } catch (e) {
        console.error("[PT PoseEditor] PNG export error:", e);
        alert("导入姿势失败: " + e.message);
    }
}
