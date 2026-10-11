console.log("Practical-Tools Photopea extension loaded.");

import { app } from "../../scripts/app.js";


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


let photopeaWindow = null;
let persistentContainer = null;
let lastRequestingNode = null;
let lastExportKind = "image"; // "image", "layer", "layer_fit"


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
    name: "PracticalTools.Photopea",

    setup() {
        console.log("Practical-Tools Photopea: setup called");

        // 检查设置开关（延迟到设置系统就绪后再判断）
        const checkPhotopeaEnabled = () => {
            let enabled = true;
            try {
                if (app.ui?.settings?.getSettingValue) {
                    enabled = app.ui.settings.getSettingValue("Practical-Tools.EnablePhotopea", true);
                } else {
                    enabled = localStorage.getItem("Comfy.Settings.Practical-Tools.EnablePhotopea") !== "false";
                }
            } catch (e) {}
            if (!enabled) {
                console.log("Practical-Tools Photopea: disabled by settings");
                return true; // 返回 true 表示已禁用
            }
            return false;
        };
        if (checkPhotopeaEnabled()) return;
        // 设置系统可能还没就绪，延迟再检查一次
        setTimeout(() => {
            if (checkPhotopeaEnabled()) {
                // 如果此时才发现被禁用，移除已注册的侧边栏
                try {
                    const tab = document.querySelector("[data-id=\"practical-tools-photopea\"]");
                    if (tab) tab.remove();
                    const container = document.getElementById("practical-tools-photopea-container");
                    if (container) container.remove();
                } catch (e) {}
            }
        }, 1000);

        if (!app.extensionManager?.registerSidebarTab) {
            console.warn(
                "Practical-Tools Photopea: Sidebar Tab API not available."
            );
            return;
        }

        // ------------------------------------------------------------
        // Photopea Logo
        // ------------------------------------------------------------

        const baseUrl = new URL(".", import.meta.url).href;
        const logoUrl = `${baseUrl}photopea_logo.svg`;

        const style = document.createElement("style");

        style.textContent = `
            .pi-photopea-logo {
                mask-image: url('${logoUrl}');
                -webkit-mask-image: url('${logoUrl}');
                mask-size: contain;
                -webkit-mask-size: contain;
                mask-repeat: no-repeat;
                -webkit-mask-repeat: no-repeat;
                mask-position: center;
                -webkit-mask-position: center;
                background-color: currentColor;
                width: 1.2rem;
                height: 1.2rem;
                display: inline-block;
                vertical-align: middle;
            }

            .pi-photopea-logo::before {
                content: "" !important;
            }

            .practical-tools-photopea-toolbar {
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
            }

            .practical-tools-photopea-toolbar-btn {
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
            }

            .practical-tools-photopea-toolbar-btn:hover {
                background: #333;
                border-color: #555;
            }

            .practical-tools-photopea-toolbar-btn.active {
                background: #3b82f6;
                border-color: #60a5fa;
                color: white;
            }
        `;

        document.head.appendChild(style);

        // ------------------------------------------------------------
        // Photopea configuration
        // ------------------------------------------------------------

        const config = {
            environment: {
                theme: 5,
                lang: "zh-CN",
                intro: false,
                vmode: 0,
                api: true
            }
        };

        const encodedConfig =
            encodeURIComponent(
                JSON.stringify(config)
            );

        let isMaximized = false;
        let wasMaximizedBeforeFS = false;
        let uiZoom = 1.0;

        // ------------------------------------------------------------
        // Create Photopea container
        // ------------------------------------------------------------

        const setupPersistentContainer = () => {

            if (persistentContainer) {
                return;
            }

            persistentContainer =
                document.createElement("div");

            persistentContainer.id =
                "practical-tools-photopea-container";

            persistentContainer.style.position =
                "fixed";

            persistentContainer.style.top = "0";
            persistentContainer.style.left = "-10000px";

            persistentContainer.style.visibility =
                "hidden";

            persistentContainer.style.display =
                "flex";

            persistentContainer.style.flexDirection =
                "column";

            persistentContainer.style.zIndex =
                "1000";

            persistentContainer.style.background =
                "#1e1e1e";
            

            persistentContainer.style.pointerEvents = "none";

            persistentContainer.style.overflow =
                "visible";

            // 右侧背景条，覆盖 50px 拖拽空隙
            const rightBg = document.createElement("div");
            rightBg.style.cssText = "position:absolute; left:100%; top:0; width:50px; height:100%; background:#353535; pointer-events:none; z-index:5;";
            persistentContainer.appendChild(rightBg);

            // --------------------------------------------------------
            // Toolbar
            // --------------------------------------------------------

            const toolbar =
                document.createElement("div");

            toolbar.className =
                "practical-tools-photopea-toolbar";

            toolbar.innerHTML = `
                <div style="
                    display:flex;
                    align-items:center;
                    gap:8px;
                ">
                    <i
                        class="pi pi-palette"
                        style="width:16px;height:16px;"
                    ></i>

                    <span style="
                        font-weight:bold;
                        opacity:0.9;
                    ">
                        Photopea
                    </span>
                </div>

                <div style="flex:1;"></div>

                <div style="
                    display:flex;
                    align-items:center;
                    gap:2px;
                ">
                    <button
                        class="practical-tools-photopea-toolbar-btn"
                        id="practical-tools-photopea-zoom-out"
                        title="Zoom Out"
                    >
                        <i
                            class="pi pi-minus"
                            style="font-size:9px;"
                        ></i>
                    </button>

                    <button
                        class="practical-tools-photopea-toolbar-btn"
                        id="practical-tools-photopea-zoom-reset"
                        style="
                            font-size:10px;
                            padding:3px 6px;
                        "
                        title="Reset Zoom"
                    >
                        100%
                    </button>

                    <button
                        class="practical-tools-photopea-toolbar-btn"
                        id="practical-tools-photopea-zoom-in"
                        title="Zoom In"
                    >
                        <i
                            class="pi pi-plus"
                            style="font-size:9px;"
                        ></i>
                    </button>
                </div>

                <div style="width:4px;"></div>

                <button
                    class="practical-tools-photopea-toolbar-btn"
                    id="practical-tools-photopea-refresh"
                    title="刷新"
                >
                    <i class="pi pi-refresh"></i>
                </button>

                <button
                    class="practical-tools-photopea-toolbar-btn"
                    id="practical-tools-photopea-maximize"
                    title="Maximize View"
                >
                    <i class="pi pi-window-maximize"></i>
                </button>

                <button
                    class="practical-tools-photopea-toolbar-btn"
                    id="practical-tools-photopea-fullscreen"
                    title="Browser Fullscreen"
                >
                    <i class="pi pi-expand"></i>
                </button>
            `;

            // --------------------------------------------------------
            // Zoom
            // --------------------------------------------------------

            const refreshZoomUI = () => {

                const btn =
                    toolbar.querySelector(
                        "#practical-tools-photopea-zoom-reset"
                    );

                if (btn) {
                    btn.textContent =
                        `${Math.round(uiZoom * 100)}%`;
                }
            };

            toolbar.querySelector(
                "#practical-tools-photopea-zoom-in"
            ).onclick = () => {

                uiZoom += 0.05;

                refreshZoomUI();
            };

            toolbar.querySelector(
                "#practical-tools-photopea-zoom-out"
            ).onclick = () => {

                uiZoom =
                    Math.max(
                        0.1,
                        uiZoom - 0.05
                    );

                refreshZoomUI();
            };

            toolbar.querySelector(
                "#practical-tools-photopea-zoom-reset"
            ).onclick = () => {

                uiZoom = 1.0;

                refreshZoomUI();
            };

            refreshZoomUI();

            // --------------------------------------------------------
            // Refresh
            // --------------------------------------------------------

            const refreshBtn =
                toolbar.querySelector(
                    "#practical-tools-photopea-refresh"
                );

            // 刷新遮罩层，避免闪白
            const refreshMask = document.createElement("div");
            refreshMask.style.cssText = "position:absolute; left:0; top:34px; right:0; bottom:0; background:#1e1e1e; z-index:100; display:none; pointer-events:none;";
            persistentContainer.appendChild(refreshMask);

            refreshBtn.onclick = () => {
                if (iframe) {
                    refreshMask.style.display = "block";
                    const currentSrc = iframe.src;
                    iframe.src = "";
                    iframe.offsetHeight;
                    iframe.src = currentSrc;
                    setTimeout(() => { refreshMask.style.display = "none"; }, 300);
                }
            };

            // --------------------------------------------------------
            // Maximize
            // --------------------------------------------------------

            const maximizeToggle =
                toolbar.querySelector(
                    "#practical-tools-photopea-maximize"
                );

            const updateMaximizeUI = () => {

                const isFS =
                    !!document.fullscreenElement;

                // 最大化/全屏时移除顶部栏的 -50px margin，避免图标超出屏幕
                toolbar.style.marginRight = (isMaximized || isFS) ? "0" : "-50px";

                maximizeToggle.style.display =
                    isFS ? "none" : "flex";

                maximizeToggle.classList.toggle(
                    "active",
                    isMaximized
                );

                const icon =
                    maximizeToggle.querySelector("i");

                if (icon) {

                    icon.className =
                        isMaximized
                            ? "pi pi-window-minimize"
                            : "pi pi-window-maximize";
                }
            };

            maximizeToggle.onclick = () => {

                isMaximized =
                    !isMaximized;

                updateMaximizeUI();
            };

            // --------------------------------------------------------
            // Fullscreen
            // --------------------------------------------------------

            const fullscreenButton =
                toolbar.querySelector(
                    "#practical-tools-photopea-fullscreen"
                );

            fullscreenButton.onclick = () => {

                if (!document.fullscreenElement) {

                    wasMaximizedBeforeFS =
                        isMaximized;

                    isMaximized = true;

                    persistentContainer
                        .requestFullscreen()
                        .catch(error => {

                            console.error(
                                "Practical-Tools Photopea fullscreen error:",
                                error
                            );
                        });

                } else {

                    document.exitFullscreen();
                }
            };

            document.addEventListener(
                "fullscreenchange",
                () => {

                    if (!document.fullscreenElement) {

                        isMaximized =
                            wasMaximizedBeforeFS;
                    }

                    updateMaximizeUI();
                }
            );

            persistentContainer.appendChild(
                toolbar
            );

            // 提示条
            const photopeaHintBar = document.createElement("div");
            photopeaHintBar.id = "practical-tools-photopea-hint-bar";
            photopeaHintBar.style.cssText = "display:none; align-items:center; justify-content:center; gap:8px; padding:6px 12px; background:#2a2a2a; border-bottom:1px solid #333; color:#ef4444; font-size:13px; font-family:sans-serif; pointer-events:none; flex-shrink:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;";
            photopeaHintBar.innerHTML = "<i class=\"pi pi-info-circle\" style=\"font-size:12px; color:#ef4444;\"></i><span>在加载图像节点上右键，选择 Load image from Photopea 即可加载PS图像</span>";
            persistentContainer.appendChild(photopeaHintBar);

            // --------------------------------------------------------
            // Photopea iframe
            // --------------------------------------------------------

            const iframe =
                document.createElement("iframe");

            iframe.id =
                "practical-tools-photopea-iframe";

            iframe.style.border =
                "none";

            iframe.style.width =
                "100%";

            iframe.style.height =
                "100%";

            iframe.style.flex =
                "none";

            iframe.style.marginRight =
                "0";

            iframe.style.pointerEvents = "auto";
            iframe.style.maxWidth = "100%";
            iframe.style.background = "#1e1e1e";

            iframe.allow =
                "clipboard-read; clipboard-write; shift-ctrl-copy-paste";

            persistentContainer.appendChild(
                iframe
            );

            document.body.appendChild(
                persistentContainer
            );

            iframe.src =
                `https://www.photopea.com#${encodedConfig}`;

            photopeaWindow =
                iframe.contentWindow;
        };

        setupPersistentContainer();

        // ------------------------------------------------------------
        // Receive exported image from Photopea
        // ------------------------------------------------------------

        window.addEventListener(
            "message",
            async event => {

                if (
                    !persistentContainer ||
                    event.source !== photopeaWindow
                ) {
                    return;
                }

                if (
                    !(event.data instanceof ArrayBuffer)
                ) {
                    return;
                }

                let prefix =
                    "photopea_";

                if (
                    lastExportKind ===
                    "layer_fit"
                ) {
                    prefix =
                        "photopea_fit_";
                }

                const filename =
                    lastRequestingNode
                        ? `${prefix}${lastRequestingNode.id}.png`
                        : "photopea_export.png";

                const formData =
                    new FormData();

                formData.append(
                    "image",
                    new Blob(
                        [event.data],
                        {
                            type:
                                "image/png"
                        }
                    ),
                    filename
                );

                formData.append(
                    "overwrite",
                    "true"
                );

                try {

                    const response =
                        await fetch(
                            "/upload/image",
                            {
                                method: "POST",
                                body: formData
                            }
                        );

                    if (!response.ok) {

                        throw new Error(
                            `Upload failed: ${response.status}`
                        );
                    }

                    const result =
                        await response.json();

                    console.log(
                        "Practical-Tools Photopea: Uploaded:",
                        result.name
                    );

                    // ------------------------------------------------
                    // Update requesting node
                    // ------------------------------------------------

                    if (
                        lastRequestingNode
                    ) {

                        const node =
                            lastRequestingNode;

                        if (node) {

                            const isLoadImage =
                                node.comfyClass ===
                                "LoadImage";

                            const isLoadImageMask =
                                node.comfyClass ===
                                "LoadImageMask";

                            if (
                                isLoadImage ||
                                isLoadImageMask
                            ) {

                                const widget =
                                    node.widgets?.find(
                                        w =>
                                            w.name ===
                                            "image"
                                    );

                                if (widget) {
                                    setLoadImageValue(node, result.name);
                                }
                            }
                        }

                        lastRequestingNode =
                            null;

                        lastExportKind =
                            "image";
                    }

                    app.graph.setDirtyCanvas(
                        true,
                        true
                    );

                } catch (error) {

                    console.error(
                        "Practical-Tools Photopea: Upload error:",
                        error
                    );

                    lastRequestingNode =
                        null;

                    lastExportKind =
                        "image";
                }
            }
        );

        // ------------------------------------------------------------
        // Sidebar Tab
        // ------------------------------------------------------------

        app.extensionManager.registerSidebarTab({

            id:
                "practical-tools-photopea",

            // 原 Photopea 插件的官方图标
            icon:
                "pi pi-palette",

            title:
                "Photopea",

            tooltip:
                "Photopea Photo Editor",

            type:
                "custom",

            render: el => {

                el.id =
                    "practical-tools-photopea-anchor";

                el.style.width =
                    "100%";

                el.style.height =
                    "100%";
            }
        });

        // ------------------------------------------------------------
        // Sync Photopea position with Sidebar
        // ------------------------------------------------------------

        let lastMaximized = false;
        const syncPosition = () => {

            // 检测最大化状态变化，退回时强制更新样式
            const maximizedChanged = lastMaximized !== isMaximized;
            lastMaximized = isMaximized;

            if (!persistentContainer) {

                requestAnimationFrame(
                    syncPosition
                );

                return;
            }

            const iframe =
                document.getElementById(
                    "practical-tools-photopea-iframe"
                );

            if (!iframe) {

                requestAnimationFrame(
                    syncPosition
                );

                return;
            }

            // --------------------------------------------------------
            // Maximized
            // --------------------------------------------------------

            if (isMaximized) {

                persistentContainer.style.visibility =
                    "visible";

                persistentContainer.style.top =
                    "0";

                persistentContainer.style.left =
                    "0";

                persistentContainer.style.width =
                    "100vw";

                persistentContainer.style.height =
                    "100vh";

                persistentContainer.style.display =
                    "flex";

                const width =
                    window.innerWidth;

                const height =
                    window.innerHeight - 34;

                iframe.style.width =
                    `${width / uiZoom}px`;

                iframe.style.height =
                    `${height / uiZoom}px`;

                iframe.style.transform =
                    `scale(${uiZoom})`;

                iframe.style.transformOrigin =
                    "top left";

                requestAnimationFrame(
                    syncPosition
                );

                return;
            }

            // --------------------------------------------------------
            // Sidebar
            // --------------------------------------------------------

            const anchor =
                document.getElementById(
                    "practical-tools-photopea-anchor"
                );

            if (!anchor) {

                persistentContainer.style.visibility =
                    "hidden";

                persistentContainer.style.left =
                    "-10000px";

                requestAnimationFrame(
                    syncPosition
                );

                return;
            }

            const rect =
                anchor.getBoundingClientRect();

            if (
                rect.width > 5 &&
                rect.height > 5
            ) {

                // 缓存上一次位置，只有变化时才更新样式（减少重排）
                const cacheKey = "practical-tools-photopea-pos";
                const lastPos = window[cacheKey] || {};
                const posChanged = lastPos.top !== rect.top || lastPos.left !== rect.left ||
                                   lastPos.width !== rect.width || lastPos.height !== rect.height ||
                                   lastPos.uiZoom !== uiZoom;
                window[cacheKey] = { top: rect.top, left: rect.left, width: rect.width, height: rect.height, uiZoom: uiZoom };

                const wasHidden = persistentContainer.style.visibility !== "visible";
                if (wasHidden) {
                    const hintBar = document.getElementById("practical-tools-photopea-hint-bar");
                    if (hintBar) {
                        hintBar.style.display = "flex";
                        clearTimeout(window._photopeaHintTimer);
                        window._photopeaHintTimer = setTimeout(() => {
                            hintBar.style.display = "none";
                        }, 10000);
                    }
                    persistentContainer.style.visibility = "visible";
                    persistentContainer.style.display = "flex";
                }

                // 刚从隐藏变为显示，或刚从最大化退回时，强制更新样式
                if (posChanged || wasHidden || maximizedChanged) {
                    persistentContainer.style.top = `${rect.top}px`;
                    persistentContainer.style.left = `${rect.left}px`;
                    persistentContainer.style.width = `${rect.width - 50}px`;
                    persistentContainer.style.height = `${rect.height}px`;

                    const width = rect.width;
                    const height = rect.height - 34;
                    iframe.style.width = `${width / uiZoom}px`;
                    iframe.style.height = `${height / uiZoom}px`;
                    iframe.style.transform = `scale(${uiZoom})`;
                    iframe.style.transformOrigin = "top left";
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
            requestAnimationFrame(
                syncPosition
            );
        };

        // 边缘拖拽支持：鼠标在左边缘时临时禁用 iframe 事件，让侧边栏可以拖拽
        document.addEventListener("mousedown", (e) => {
            if (!persistentContainer || persistentContainer.style.visibility === "hidden") return;
            const rect = persistentContainer.getBoundingClientRect();
            if (e.clientX >= rect.left && e.clientX <= rect.left + 8) {
                const iframe = document.getElementById("practical-tools-photopea-iframe");
                if (iframe) iframe.style.pointerEvents = "none";
            }
        });
        document.addEventListener("mouseup", () => {
            const iframe = document.getElementById("practical-tools-photopea-iframe");
            if (iframe) iframe.style.pointerEvents = "auto";
            iframe.style.maxWidth = "100%";
        });

        // 确保侧边栏拖拽手柄在最上层，不被 persistentContainer 覆盖
        const raiseSplitterGutter = () => {
            const gutters = document.querySelectorAll(".p-splitter-gutter:not(.hidden)");
            gutters.forEach(g => { g.style.zIndex = "99999"; g.style.position = "relative"; });
        };
        raiseSplitterGutter();
        new MutationObserver(raiseSplitterGutter).observe(document.body, { childList: true, subtree: true });

        syncPosition();
    },

    // ================================================================
    // Node Context Menu
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

        // ------------------------------------------------------------
        // Open image
        // ------------------------------------------------------------

        // Send image 函数
        const sendImageToPhotopea = async (tn) => {
            if (!tn) { alert("未找到 LoadImage 节点"); return; }
            let imageUrl = null;
            if (tn.imgs?.length > 0) {
                imageUrl = tn.imgs[0].src;
            } else {
                const widget = tn.widgets?.find(w => w.name === "image");
                if (widget?.value) {
                    imageUrl = `/view?filename=${encodeURIComponent(widget.value)}&type=input`;
                }
            }
            if (!imageUrl) { alert("未找到图像"); return; }
            // 判断 Photopea 是否已打开：persistentContainer 可见 或 anchor 有尺寸
            const container = document.getElementById("practical-tools-photopea-container");
            const anchor = document.getElementById("practical-tools-photopea-anchor");
            const isOpen = (container && container.style.visibility === "visible") ||
                           (anchor && anchor.getBoundingClientRect().width > 5);
            // 未打开时才点击按钮，已打开直接发送（避免切换关闭）
            if (!isOpen) {
                const tabButton = document.querySelector('.side-bar-button[aria-label="Photopea Photo Editor"]');
                if (tabButton) tabButton.click();
                await new Promise(r => setTimeout(r, 500));
            }
            // 直接用 id 获取 iframe，最可靠
            const iframe = document.getElementById("practical-tools-photopea-iframe");
            if (!iframe) { alert("未找到 Photopea iframe"); return; }
            if (!iframe.contentWindow) { alert("iframe contentWindow 为空"); return; }
            try {
                const response = await fetch(imageUrl);
                if (!response.ok) { alert("fetch 失败: " + response.status); return; }
                const blob = await response.blob();
                const arrayBuffer = await blob.arrayBuffer();
                iframe.contentWindow.postMessage(arrayBuffer, "*");
            } catch (error) {
                alert("发送失败: " + error.message);
                console.error("Practical-Tools Photopea: Failed to open image:", error);
            }
        };

        // Send image
        if (allNodes.length === 1) {
            items.push({ content: "Send image to Photopea", callback: () => sendImageToPhotopea(allNodes[0]) });
        } else {
            items.push({
                content: "Send image to Photopea",
                has_submenu: true,
                submenu: { options: allNodes.map((n, i) => ({ content: "from " + getLabel(n, i), callback: () => sendImageToPhotopea(n) })) }
            });
        }


        // ============================================================
        // LoadImage / LoadImageMask export
        // ============================================================


            const sendExportScript =
                (targetNode, kind) => {

                    lastRequestingNode =
                        targetNode;

                    lastExportKind =
                        kind;

                    const container =
                        document.querySelector(
                            "#practical-tools-photopea-container"
                        );

                    const iframe =
                        container?.querySelector(
                            "iframe"
                        );

                    if (
                        !iframe?.contentWindow
                    ) {
                        return;
                    }

                    // ------------------------------------------------
                    // Full document
                    // ------------------------------------------------

                    if (
                        kind ===
                        "image"
                    ) {

                        iframe.contentWindow
                            .postMessage(
                                "app.activeDocument.saveToOE('png')",
                                "*"
                            );

                        return;
                    }

                    // ------------------------------------------------
                    // Active layer
                    // ------------------------------------------------

                    if (
                        kind ===
                        "layer"
                    ) {

                        const script = `
                            (function() {

                                var doc =
                                    app.activeDocument;

                                var active =
                                    doc.activeLayer;

                                if (!active)
                                    return;

                                var states = [];

                                function collect(cont) {

                                    for (
                                        var i = 0;
                                        i < cont.layers.length;
                                        i++
                                    ) {

                                        states.push({
                                            l: cont.layers[i],
                                            v: cont.layers[i].visible
                                        });

                                        if (
                                            cont.layers[i].layers
                                        ) {

                                            collect(
                                                cont.layers[i]
                                            );
                                        }
                                    }
                                }

                                collect(doc);

                                for (
                                    var i = 0;
                                    i < states.length;
                                    i++
                                ) {

                                    states[i].l.visible =
                                        false;
                                }

                                var curr =
                                    active;

                                while (
                                    curr &&
                                    curr !== doc
                                ) {

                                    curr.visible =
                                        true;

                                    curr =
                                        curr.parent;
                                }

                                doc.saveToOE(
                                    "png"
                                );

                                for (
                                    var i = 0;
                                    i < states.length;
                                    i++
                                ) {

                                    states[i].l.visible =
                                        states[i].v;
                                }

                            })();
                        `;

                        iframe.contentWindow
                            .postMessage(
                                script,
                                "*"
                            );

                        return;
                    }

                    // ------------------------------------------------
                    // Active layer: fit size
                    // ------------------------------------------------

                    if (
                        kind ===
                        "layer_fit"
                    ) {

                        const script = `
                            (function() {

                                var doc =
                                    app.activeDocument;

                                var active =
                                    doc.activeLayer;

                                if (!active)
                                    return;

                                var newDoc =
                                    app.documents.add(
                                        doc.width,
                                        doc.height,
                                        doc.resolution,
                                        "Fit Export",
                                        2,
                                        1
                                    );

                                app.activeDocument =
                                    doc;

                                active.duplicate(
                                    newDoc
                                );

                                app.activeDocument =
                                    newDoc;

                                try {
                                    newDoc.trim(0);
                                } catch(e) {}

                                newDoc.saveToOE(
                                    "png"
                                );

                                newDoc.close(2);

                            })();
                        `;

                        iframe.contentWindow
                            .postMessage(
                                script,
                                "*"
                            );
                    }
                };

            // --------------------------------------------------------
            // --------------------------------------------------------
            // --------------------------------------------------------
            // --------------------------------------------------------
            // --------------------------------------------------------
            // --------------------------------------------------------
            // --------------------------------------------------------
            // --------------------------------------------------------
            // --------------------------------------------------------
            // --------------------------------------------------------
            // --------------------------------------------------------
            // --------------------------------------------------------
            // Import image
            // --------------------------------------------------------

            if (allNodes.length === 1) {
                items.push({ content: "Load image from Photopea", callback: () => sendExportScript(allNodes[0], "image") });
            } else {
                items.push({
                    content: "Load image from Photopea",
                    has_submenu: true,
                    submenu: { options: allNodes.map((n, i) => ({ content: "to " + getLabel(n, i), callback: () => sendExportScript(n, "image") })) }
                });
            }

            // Import layer
            // --------------------------------------------------------

            if (allNodes.length === 1) {
                items.push({ content: "Load layer from Photopea", callback: () => sendExportScript(allNodes[0], "layer") });
            } else {
                items.push({
                    content: "Load layer from Photopea",
                    has_submenu: true,
                    submenu: { options: allNodes.map((n, i) => ({ content: "to " + getLabel(n, i), callback: () => sendExportScript(n, "layer") })) }
                });
            }


        return items;
    }
});