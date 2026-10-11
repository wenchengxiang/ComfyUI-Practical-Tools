// pose_editor.js — Practical-Tools OpenPose 姿势编辑器
// 侧边栏集成 + LoadImage 右键导入 PNG
// 编辑器基于 sd-webui-openpose-editor

console.log("Practical-Tools PoseEditor extension loaded.");

import { app } from "../../scripts/app.js";

let poseEditorIframe = null;
let lastRequestingNode = null;
let editorReady = false;
let uiZoom = 1.0;
let isMaximized = false;
let wasMaximizedBeforeFS = false;
let poseEditorContainer = null;
let persistentContainer = null;
let persistentToolbar = null;
let persistentIframeContainer = null;
let persistentOverlay = null;
let persistentOverlayContainer = null;
let maximizeBtn = null;
let zoomResetBtn = null;

// 编辑器 URL（本地构建版本，单文件内联）
const EDITOR_URL = "/extensions/Practical-Tools/pose_editor/index.html?theme=dark";


// ================================================================
// 递归查找子图内部的 LoadImage 节点
// ================================================================
function findAllLoadImageNodes(node) {
    if (!node) return [];
    const results = [];
    // 子图节点本身不加入结果（它的 image widget 是暴露的，不是真正的 LoadImage）
    if (!node.subgraph) {
        if (node.comfyClass === "LoadImage" || node.comfyClass === "LoadImageMask") {
            results.push(node);
        } else if (node.widgets && Array.isArray(node.widgets) && node.widgets.some(w => w.name === "image")) {
            results.push(node);
        }
    }
    // 子图内部节点
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
    // 1. 检查节点本身是否是标准 LoadImage
    if (node.comfyClass === "LoadImage" || node.comfyClass === "LoadImageMask") return node;
    // 2. 如果是子图节点，遍历其内部所有节点
    const subGraph = node.subgraph;
    if (subGraph && subGraph._nodes && Array.isArray(subGraph._nodes)) {
        // 优先找标准 LoadImage 节点
        for (const inner of subGraph._nodes) {
            if (inner && (inner.comfyClass === "LoadImage" || inner.comfyClass === "LoadImageMask")) {
                return inner;
            }
        }
        // 其次找有 image widget 的节点
        for (const inner of subGraph._nodes) {
            if (inner && inner.widgets && Array.isArray(inner.widgets) && inner.widgets.some(w => w.name === "image")) {
                return inner;
            }
        }
        // 最后递归检查嵌套子图
        for (const inner of subGraph._nodes) {
            if (inner && inner.subgraph) {
                const found = findLoadImageNodeRecursive(inner);
                if (found) return found;
            }
        }
    }
    // 3. 节点本身有 image widget（非标准 LoadImage）
    if (node.widgets && Array.isArray(node.widgets) && node.widgets.some(w => w.name === "image")) return node;
    return null;
}


// ================================================================
// 设置 LoadImage 节点的图像（兼容子图内部节点）
// ================================================================

// ================================================================
// 检查节点是否应该显示我们的菜单（LoadImage/LoadImageMask 或包含此类节点的子图）
// ================================================================
function shouldShowMenu(node) {
    if (!node) return false;
    // 节点本身是 LoadImage/LoadImageMask
    if (node.comfyClass === "LoadImage" || node.comfyClass === "LoadImageMask") return true;
    if (node.widgets && Array.isArray(node.widgets) && node.widgets.some(w => w.name === "image")) return true;
    // 子图内部包含 LoadImage/LoadImageMask
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

    // 手动加载图像预览
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

    // 调用 callback
    if (widget.callback) {
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
                // 索引不匹配时回退到第一个
                parentWidget = imageWidgets[0];
            }
            
            if (parentWidget) {
                parentWidget.value = imageName;
                if (parentWidget.callback) {
                    try { parentWidget.callback(imageName); } catch(e) {}
                }
                // 刷新子图节点显示
                if (parentSubgraphNode.setDirtyCanvas) {
                    parentSubgraphNode.setDirtyCanvas(true, true);
                }
            }
        }
    }
}

app.registerExtension({
    name: "PracticalTools.PoseEditor",

    setup() {
        console.log("Practical-Tools PoseEditor: setup called");

        // 检查设置开关（延迟到设置系统就绪后再判断）
        const checkPoseEditorEnabled = () => {
            let enabled = true;
            try {
                if (app.ui?.settings?.getSettingValue) {
                    enabled = app.ui.settings.getSettingValue("Practical-Tools.EnablePoseEditor", true);
                } else {
                    enabled = localStorage.getItem("Comfy.Settings.Practical-Tools.EnablePoseEditor") !== "false";
                }
            } catch (e) {}
            if (!enabled) {
                console.log("Practical-Tools PoseEditor: disabled by settings");
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

        // ------------------------------------------------------------
        // 侧边栏选项卡
        // ------------------------------------------------------------
        app.extensionManager.registerSidebarTab({
            id: "practical-tools-pose-editor",
            icon: "pi pi-user",
            title: "PoseEditor",
            tooltip: "OpenPose 姿势编辑器",
            type: "custom",
            render: el => {
                // Anchor - 只用于定位，内容在 persistentContainer 中
                el.style.width = "100%";
                el.style.height = "100%";
                const anchor = document.createElement("div");
                anchor.id = "practical-tools-pose-editor-anchor";
                anchor.style.cssText = "width:100%;height:100%;";
                el.appendChild(anchor);

                // 如果 persistentContainer 已存在，直接启动 syncPosition
                if (persistentContainer) {
                    requestAnimationFrame(syncPosition);
                    return;
                }

                // 创建 persistentContainer（fixed position, z-index 1500，比 Photopea 高）
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

                // 右侧背景条，覆盖 50px 拖拽空隙
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

                // 左侧：图标 + 名称
                const leftGroup = document.createElement("div");
                leftGroup.style.cssText = "display:flex; align-items:center; gap:8px;";
                leftGroup.innerHTML = `
                    <i class="pi pi-user" style="font-size:14px; opacity:0.9;"></i>
                    <span style="font-weight:bold; opacity:0.9;">PoseEditor</span>
                `;
                persistentToolbar.appendChild(leftGroup);

                // 中间占位
                const spacer = document.createElement("div");
                spacer.style.flex = "1";
                persistentToolbar.appendChild(spacer);

                // 右侧：缩放控制 + 刷新 + 最大化 + 全屏
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

                // 分隔
                const sep1 = document.createElement("div");
                sep1.style.width = "16px";
                rightGroup.appendChild(sep1);

                // 功能按钮组
                const actionGroup = document.createElement("div");
                actionGroup.style.cssText = "display:flex; align-items:center; gap:8px;";

                const refreshBtn = document.createElement("button");
                refreshBtn.style.cssText = btnStyle;
                refreshBtn.title = "刷新编辑器";
                refreshBtn.innerHTML = '<i class="pi pi-refresh"></i>';
                refreshBtn.onmouseover = () => { refreshBtn.style.background = "#333"; };
                refreshBtn.onmouseout = () => { refreshBtn.style.background = "#222"; };
                refreshBtn.onclick = () => {
                    if (poseEditorIframe) {
                        editorReady = false;
                        poseEditorIframe.src = EDITOR_URL;
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

                // 提示条
                const poseHintBar = document.createElement("div");
                poseHintBar.id = "practical-tools-pose-hint-bar";
                poseHintBar.style.cssText = "display:none; align-items:center; justify-content:center; gap:8px; padding:6px 12px; background:#2a2a2a; border-bottom:1px solid #333; color:#aaa; font-size:13px; font-family:sans-serif; pointer-events:none; flex-shrink:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;";
                poseHintBar.innerHTML = "<i class=\"pi pi-info-circle\" style=\"font-size:12px; color:#ef4444;\"></i><span style=\"color:#ef4444;\">在加载图像节点上右键，选择 Load image from PoseEditor 即可加载姿势图像</span>";
                // 注入闪烁动画样式
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

                // iframe
                editorReady = false;
                poseEditorIframe = document.createElement("iframe");
                poseEditorIframe.id = "practical-tools-pose-editor-iframe";
                poseEditorIframe.style.cssText = "width: 100%; height: 100%; border: none; transform-origin: top left; pointer-events: auto; margin-right: 0; overflow: hidden;";
                poseEditorIframe.scrolling = "no";
                poseEditorIframe.src = EDITOR_URL;
                poseEditorIframe.onload = () => {
                    console.log("[PT PoseEditor] iframe loaded");
                };
                persistentIframeContainer.appendChild(poseEditorIframe);

                // 创建最大化覆盖层
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
                // 克隆提示条到覆盖层（最大化/全屏时显示）
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

                    const iframe = document.getElementById("practical-tools-pose-editor-iframe");
                    if (!iframe) {
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
                        // 缓存上一次位置，只有变化时才更新样式（减少重排）
                        const cacheKey = "practical-tools-pose-pos";
                        const lastPos = window[cacheKey] || {};
                        const posChanged = lastPos.top !== rect.top || lastPos.left !== rect.left ||
                                           lastPos.width !== rect.width || lastPos.height !== rect.height;
                        window[cacheKey] = { top: rect.top, left: rect.left, width: rect.width, height: rect.height };

                        const wasHidden = persistentContainer.style.visibility !== "visible";
                        if (wasHidden) {
                            // 刚显示时弹出提示条
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

                        // 刚从隐藏变为显示时，强制更新样式（防止 left 还是 -10000px）
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
                        // 隐藏时低频检查（500ms），减少性能开销
                        setTimeout(syncPosition, 500);
                        return;
                    }

                    // 可见时高频同步
                    requestAnimationFrame(syncPosition);
                }

                // 应用缩放
                function applyZoom() {
                    const targetIframe = persistentOverlay.style.display === "flex" ? persistentOverlayContainer.querySelector("iframe") : poseEditorIframe;
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

                // 切换最大化
                function toggleMaximize() {
                    if (persistentOverlay.style.display === "flex") {
                        persistentOverlayContainer.removeChild(poseEditorIframe);
                        persistentIframeContainer.appendChild(poseEditorIframe);
                        persistentOverlay.style.display = "none";
                        isMaximized = false;
                        // 清除位置缓存，强制 syncPosition 更新样式（防止 left 还是 -10000px）
                        window["practical-tools-pose-pos"] = null;
                    } else {
                        persistentIframeContainer.removeChild(poseEditorIframe);
                        persistentOverlayContainer.appendChild(poseEditorIframe);
                        persistentOverlay.style.display = "flex";
                        isMaximized = true;
                    }
                    // 最大化/全屏时移除顶部栏的 -50px margin，避免图标超出屏幕
                    persistentToolbar.style.marginRight = isMaximized ? "0" : "-50px";
                    // 同时更新克隆的 overlayToolbar（最大化时显示的是这个）
                    const overlayTb = persistentOverlay.firstElementChild;
                    if (overlayTb) overlayTb.style.marginRight = isMaximized ? "0" : "-50px";
                    // 同步提示条状态
                    const origHint = document.getElementById("practical-tools-pose-hint-bar");
                    const overlayHint = document.getElementById("practical-tools-pose-hint-bar-overlay");
                    if (origHint && overlayHint) {
                        overlayHint.style.display = origHint.style.display;
                    }
                    updateMaximizeIcon();
                    applyZoom();
                }

                // 切换全屏
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

                // 更新最大化图标
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

                // 全屏变化监听
                document.addEventListener("fullscreenchange", () => {
                    const isFS = !!document.fullscreenElement;
                    // 全屏时隐藏最大化按钮，和 Photopea 一致
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

                // 确保侧边栏拖拽手柄在最上层，不被 persistentContainer 覆盖
                const raiseSplitterGutter = () => {
                    const gutters = document.querySelectorAll(".p-splitter-gutter:not(.hidden)");
                    gutters.forEach(g => { g.style.zIndex = "99999"; g.style.position = "relative"; });
                };
                raiseSplitterGutter();
                new MutationObserver(raiseSplitterGutter).observe(document.body, { childList: true, subtree: true });

                // 启动同步
                requestAnimationFrame(syncPosition);
            }
        });

        // ------------------------------------------------------------
        // postMessage 通信
        // ------------------------------------------------------------
        window.addEventListener("message", (event) => {
            if (!poseEditorIframe || event.source !== poseEditorIframe.contentWindow) {
                return;
            }

            const message = event.data;

            if (message.ready) {
                editorReady = true;
                const statusEl = document.getElementById("pt-pose-editor-status");
                if (statusEl) statusEl.textContent = "就绪";
                console.log("[PT PoseEditor] editor ready");
            }

            // 编辑器返回 PNG 数据
            if (message.type === "export_png" && message.data) {
                handlePngExport(message.data);
            }

            // 编辑器返回姿势 JSON
            if (message.poses && message.modalId !== undefined) {
                console.log("[PT PoseEditor] received poses JSON");
            }
        });
    },

    // ================================================================
    // 节点右键菜单
    // ================================================================
    getNodeMenuItems(node) {
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
            let imageUrl = null;
            if (tn.imgs?.length > 0) {
                imageUrl = tn.imgs[0].src;
            } else {
                const widget = tn.widgets?.find(w => w.name === "image");
                if (widget?.value) {
                    imageUrl = `/view?filename=${encodeURIComponent(widget.value)}&type=input&subfolder=`;
                }
            }
            if (imageUrl) sendReferenceImage(imageUrl);
            else alert("未找到图像");
        };

        // Send image
        if (allNodes.length === 1) {
            items.push({ content: "Send image to PoseEditor", callback: () => sendImg(allNodes[0]) });
        } else {
            items.push({
                content: "Send image to PoseEditor",
                has_submenu: true,
                submenu: { options: allNodes.map((n, i) => ({ content: "from " + getLabel(n, i), callback: () => sendImg(n) })) }
            });
        }

        // Import image
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
// 发送参考图像到编辑器
// ================================================================
async function sendReferenceImage(imageUrl) {
    // 判断 PoseEditor 是否已打开
    const container = document.getElementById("practical-tools-pose-editor-container");
    const anchor = document.getElementById("practical-tools-pose-editor-anchor");
    const isOpen = (container && container.style.visibility === "visible") ||
                   (anchor && anchor.getBoundingClientRect().width > 5);
    // 未打开时点击侧边栏按钮（和 Photopea 逻辑一致）
    if (!isOpen) {
        const tabButton = document.querySelector('.side-bar-button[aria-label="OpenPose 姿势编辑器"]');
        if (tabButton) tabButton.click();
    }
    // 等待编辑器就绪
    let waited = 0;
    while ((!poseEditorIframe || !editorReady) && waited < 5000) {
        await new Promise(r => setTimeout(r, 200));
        waited += 200;
        if (!poseEditorIframe) {
            poseEditorIframe = document.getElementById("practical-tools-pose-editor-iframe");
        }
    }
    if (!poseEditorIframe || !editorReady) {
        alert("编辑器尚未就绪，请先打开 PoseEditor 侧边栏等待加载完成");
        return;
    }
    poseEditorIframe.contentWindow.postMessage({
        type: "load_reference_image",
        url: imageUrl
    }, "*");
    console.log("[PT PoseEditor] sent reference image:", imageUrl);
}

// ================================================================
// 请求编辑器导出 PNG
// ================================================================
function requestPngExport() {
    if (!poseEditorIframe || !editorReady) {
        alert("编辑器尚未就绪，请先打开 PoseEditor 侧边栏等待加载完成");
        return;
    }

    poseEditorIframe.contentWindow.postMessage({
        type: "request_export_png"
    }, "*");

    console.log("[PT PoseEditor] requested PNG export");
}

// ================================================================
// 处理 PNG 导出：上传到 input 并设置到节点
// ================================================================
async function handlePngExport(dataUrl) {
    if (!lastRequestingNode) return;

    try {
        // dataURL 转 Blob
        const response = await fetch(dataUrl);
        const blob = await response.blob();

        // 生成文件名
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `pose_editor_${timestamp}.png`;

        // 上传到 input 目录
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

        // 设置到节点（兼容子图内部节点，同时更新子图暴露的 widget）
        const node = lastRequestingNode;
        console.log("[PT PoseEditor] setting image to node, found:", !!node);
        if (node) {
            setLoadImageValue(node, uploadedName);
            console.log("[PT PoseEditor] image widget set to:", uploadedName);
        }

        console.log("[PT PoseEditor] pose imported:", uploadedName);
    } catch (e) {
        console.error("[PT PoseEditor] PNG export error:", e);
        alert("导入姿势失败: " + e.message);
    }
}
