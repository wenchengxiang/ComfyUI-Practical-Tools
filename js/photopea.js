console.log("Practical-Tools Photopea extension loaded.");

import { app } from "../../scripts/app.js";

let photopeaWindow = null;
let persistentContainer = null;
let lastRequestingNodeId = null;
let lastExportKind = "image"; // "image", "layer", "layer_fit"

app.registerExtension({
    name: "PracticalTools.Photopea",

    setup() {
        console.log("Practical-Tools Photopea: setup called");

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
                background: #111;
                border-bottom: 1px solid #333;
                color: #ddd;
                font-family: sans-serif;
                font-size: 11px;
                height: 34px;
                box-sizing: border-box;
                flex-shrink: 0;
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
                theme: 2,
                lang: "en",
                intro: false,
                vmode: 0,
                api: true
            }
        };

        const encodedConfig =
            encodeURIComponent(
                JSON.stringify(config)
            );

        let adsHidden = false;
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
                "#000";

            persistentContainer.style.pointerEvents =
                "auto";

            persistentContainer.style.overflow =
                "hidden";

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
                        class="pi pi-photopea-logo"
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
                    id="practical-tools-photopea-ad-toggle"
                    title="Hide Ads"
                >
                    <i class="pi pi-eye-slash"></i>
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
            // Ads
            // --------------------------------------------------------

            const adToggle =
                toolbar.querySelector(
                    "#practical-tools-photopea-ad-toggle"
                );

            adToggle.onclick = () => {

                adsHidden =
                    !adsHidden;

                adToggle.classList.toggle(
                    "active",
                    adsHidden
                );
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
                    lastRequestingNodeId
                        ? `${prefix}${lastRequestingNodeId}.png`
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
                        lastRequestingNodeId
                    ) {

                        const node =
                            app.graph.getNodeById(
                                lastRequestingNodeId
                            );

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

                                    widget.value =
                                        result.name;

                                    if (
                                        widget.callback
                                    ) {

                                        widget.callback(
                                            widget.value
                                        );
                                    }

                                    node.setDirtyCanvas?.(
                                        true,
                                        true
                                    );
                                }
                            }
                        }

                        lastRequestingNodeId =
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

                    lastRequestingNodeId =
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
                "pi pi-photopea-logo",

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

        const syncPosition = () => {

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

                const extraWidth =
                    adsHidden
                        ? 300
                        : 0;

                const width =
                    window.innerWidth;

                const height =
                    window.innerHeight - 34;

                iframe.style.width =
                    `${(width + extraWidth) / uiZoom}px`;

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

                persistentContainer.style.visibility =
                    "visible";

                persistentContainer.style.top =
                    `${rect.top}px`;

                persistentContainer.style.left =
                    `${rect.left}px`;

                persistentContainer.style.width =
                    `${rect.width}px`;

                persistentContainer.style.height =
                    `${rect.height}px`;

                persistentContainer.style.display =
                    "flex";

                const extraWidth =
                    adsHidden
                        ? 300
                        : 0;

                const width =
                    rect.width;

                const height =
                    rect.height - 34;

                iframe.style.width =
                    `${(width + extraWidth * uiZoom) / uiZoom}px`;

                iframe.style.height =
                    `${height / uiZoom}px`;

                iframe.style.transform =
                    `scale(${uiZoom})`;

                iframe.style.transformOrigin =
                    "top left";

            } else {

                persistentContainer.style.visibility =
                    "hidden";

                persistentContainer.style.left =
                    "-10000px";
            }

            requestAnimationFrame(
                syncPosition
            );
        };

        syncPosition();
    },

    // ================================================================
    // Node Context Menu
    // ================================================================

    getNodeMenuItems(node) {

        const items = [];

        // ------------------------------------------------------------
        // 支持 LoadImage 和 LoadImageMask
        // ------------------------------------------------------------

        const isLoadImage =
            node.comfyClass ===
            "LoadImage";

        const isLoadImageMask =
            node.comfyClass ===
            "LoadImageMask";

        const isImageLoader =
            isLoadImage ||
            isLoadImageMask;

        // ------------------------------------------------------------
        // 判断节点是否有图像
        // ------------------------------------------------------------

        const hasImages =
            node.imgs?.length > 0 ||
            (
                node.widgets &&
                node.widgets.some(
                    w =>
                        w.name ===
                        "image"
                )
            );

        // ------------------------------------------------------------
        // Open image
        // ------------------------------------------------------------

        if (
            hasImages ||
            isImageLoader
        ) {

            items.push({

                content:
                    "Photopea - Open image",

                callback:
                    async () => {

                        let imageUrl =
                            null;

                        // --------------------------------------------
                        // 节点预览
                        // --------------------------------------------

                        if (
                            node.imgs?.length > 0
                        ) {

                            imageUrl =
                                node.imgs[0].src;

                        } else {

                            // ----------------------------------------
                            // LoadImage / LoadImageMask
                            // ----------------------------------------

                            const widget =
                                node.widgets?.find(
                                    w =>
                                        w.name ===
                                        "image"
                                );

                            if (
                                widget?.value
                            ) {

                                imageUrl =
                                    `/view?filename=${encodeURIComponent(
                                        widget.value
                                    )}&type=input`;
                            }
                        }

                        if (!imageUrl) {
                            return;
                        }

                        // --------------------------------------------
                        // 打开 Photopea Sidebar
                        // --------------------------------------------

                        const tabButton =
                            document.querySelector(
                                `.comfy-sidebar-tab-btn[data-id="practical-tools-photopea"]`
                            ) ||
                            document.querySelector(
                                `.comfy-sidebar-tab-btn[title="Photopea"]`
                            );

                        if (tabButton) {

                            tabButton.click();

                        } else {

                            const sideButton =
                                document.querySelector(
                                    `button[data-tab-id="practical-tools-photopea"]`
                                );

                            if (sideButton) {
                                sideButton.click();
                            }
                        }

                        // --------------------------------------------
                        // 发送图像给 Photopea
                        // --------------------------------------------

                        try {

                            const response =
                                await fetch(
                                    imageUrl
                                );

                            if (!response.ok) {

                                throw new Error(
                                    "Failed to fetch image"
                                );
                            }

                            const blob =
                                await response.blob();

                            const buffer =
                                await blob.arrayBuffer();

                            const iframe =
                                document.querySelector(
                                    "#practical-tools-photopea-iframe"
                                );

                            if (
                                iframe?.contentWindow
                            ) {

                                iframe.contentWindow
                                    .postMessage(
                                        buffer,
                                        "*"
                                    );
                            }

                        } catch (error) {

                            console.error(
                                "Practical-Tools Photopea: Failed to open image:",
                                error
                            );
                        }
                    }
            });
        }

        // ============================================================
        // LoadImage / LoadImageMask export
        // ============================================================

        if (isImageLoader) {

            const sendExportScript =
                (nodeId, kind) => {

                    lastRequestingNodeId =
                        nodeId;

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
            // Import image
            // --------------------------------------------------------

            items.push({

                content:
                    "Photopea - Import image",

                callback:
                    () =>
                        sendExportScript(
                            node.id,
                            "image"
                        )
            });

            // --------------------------------------------------------
            // Import layer
            // --------------------------------------------------------

            items.push({

                content:
                    "Photopea - Import layer",

                callback:
                    () =>
                        sendExportScript(
                            node.id,
                            "layer"
                        )
            });

            // --------------------------------------------------------
            // Import layer: fit size
            // --------------------------------------------------------

            items.push({

                content:
                    "Photopea - Import layer: fit size",

                callback:
                    () =>
                        sendExportScript(
                            node.id,
                            "layer_fit"
                        )
            });
        }

        return items;
    }
});