// ============================================================================
// bugfix_node.js
// Practical-Tools 节点相关 Bug 修复合集
// ============================================================================
//
// 包含以下修复：
//   1. 折叠节点大小修复 (Folded Size Fix)
//      - 修复 Node 2.0 下带 widgets 的节点折叠后进入子图再回来，展开时大小丢失
//      - 设置项：Practical-Tools.EnableFoldedSizeFix（默认启用）
//
//   2. 节点层级修复 (Node Layer Fix)
//      - 修复 Node 2.0 下加载/切换工作流时折叠节点上浮的问题
//      - 设置项：Practical-Tools.EnableNodeLayerFix（默认启用）
//
//   3. 子图图像同步修复 (Subgraph Image Sync Fix)
//      - 修复子图外部选择图像后，子图内部 LoadImage/LoadImageMask 节点图像不更新
//      - 这是 ComfyUI 官方 bug，外部 widget 变化不会触发内部节点图像预览更新
//      - 无设置项，默认启用
// ============================================================================


// ============================================================================
// 修复 1：折叠节点大小修复
// ============================================================================
// 修复 Node 2.0 下带 widgets 的节点折叠后进入子图再回来，展开时大小丢失的 bug
// 方案：patch collapse + 动态样式表 !important 规则压过 Vue 的反复设置
// 用全局 Map 保存大小（key=节点id），避免进入子图后节点对象重建导致属性丢失

(function() {
    // 设置开关：未启用则直接退出（使用统一前缀 Practical-Tools.）
    try {
        const raw = localStorage.getItem("Comfy.Settings.Practical-Tools.EnableFoldedSizeFix");
        if (raw !== null && raw !== undefined && JSON.parse(raw) === false) return;
    } catch (e) { /* 默认启用 */ }

    const savedSizes = {};
    const lastGoodSizes = {};
    const restoreUntil = {};
    const lastCollapsedState = {};
    const forcingNodes = {}; // { nodeId: {width, height} }
    const STYLE_ID = 'pt-folded-size-fix-style';

    function getStyleEl() {
        let styleEl = document.getElementById(STYLE_ID);
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = STYLE_ID;
            document.head.appendChild(styleEl);
        }
        return styleEl;
    }

    function rebuildStyle() {
        const styleEl = getStyleEl();
        let css = '';
        for (const nodeId in forcingNodes) {
            const size = forcingNodes[nodeId];
            css += '[data-node-id="' + nodeId + '"] { --node-width: ' + size.width + ' !important; --node-height: ' + size.height + ' !important; }\n';
        }
        styleEl.textContent = css;
    }

    function startForcing(nodeId, size) {
        forcingNodes[nodeId] = size;
        rebuildStyle();
    }

    function stopForcing(nodeId) {
        if (forcingNodes[nodeId]) {
            delete forcingNodes[nodeId];
            rebuildStyle();
        }
    }

    function getActiveGraph() {
        if (typeof app === 'undefined') return null;
        if (app.canvas && app.canvas.graph) return app.canvas.graph;
        if (app.graph) return app.graph;
        return null;
    }

    function getNodeEl(node) {
        return document.querySelector('[data-node-id="' + node.id + '"]');
    }

    function getCssSize(nodeEl) {
        if (!nodeEl) return null;
        const w = nodeEl.style.getPropertyValue('--node-width');
        const h = nodeEl.style.getPropertyValue('--node-height');
        if (w && h && w !== 'NaNpx' && h !== 'NaNpx') {
            return {width: w, height: h};
        }
        return null;
    }

    function isNormalSize(size) {
        if (!size || !size.height || !size.width) return false;
        const h = parseInt(size.height);
        const w = parseInt(size.width);
        return !isNaN(h) && !isNaN(w) && h > 60 && w > 80;
    }

    function getSavedSize(nodeId) {
        return savedSizes[nodeId] || lastGoodSizes[nodeId];
    }

    // Patch collapse 方法
    if (typeof LGraphNode !== 'undefined' && LGraphNode.prototype.collapse) {
        const originalCollapse = LGraphNode.prototype.collapse;
        LGraphNode.prototype.collapse = function(force) {
            const isCurrentlyCollapsed = !!(this.flags && this.flags.collapsed);
            const willCollapse = (force === undefined) ? !isCurrentlyCollapsed : !!force;
            const nodeId = this.id;

            // 展开操作：启动 !important 强制大小
            if (isCurrentlyCollapsed && !willCollapse) {
                const savedSize = getSavedSize(nodeId);
                const result = originalCollapse.call(this, force);
                if (savedSize) {
                    startForcing(nodeId, savedSize);
                    restoreUntil[nodeId] = Date.now() + 3000;
                }
                return result;
            }

            // 折叠操作：保存当前大小，停止强制
            if (!isCurrentlyCollapsed && willCollapse) {
                const nodeEl = getNodeEl(this);
                const cssSize = getCssSize(nodeEl);
                if (isNormalSize(cssSize)) {
                    savedSizes[nodeId] = cssSize;
                } else if (lastGoodSizes[nodeId]) {
                    savedSizes[nodeId] = lastGoodSizes[nodeId];
                }
                stopForcing(nodeId);
                restoreUntil[nodeId] = null;
            }

            return originalCollapse.call(this, force);
        };
    }

    // 轮询备份
    function checkNodes() {
        const graph = getActiveGraph();
        if (!graph || !graph._nodes) return;
        const now = Date.now();

        for (const node of graph._nodes) {
            const nodeId = node.id;
            const nodeEl = getNodeEl(node);
            if (!nodeEl) continue;

            const cssSize = getCssSize(nodeEl);
            const isCollapsed = !!(node.flags && node.flags.collapsed);
            const wasCollapsed = !!lastCollapsedState[nodeId];

            // 持续记录最后一个正常大小（非强制状态下，且节点必须是展开的）
            if (!isCollapsed && isNormalSize(cssSize) && !forcingNodes[nodeId] && !restoreUntil[nodeId]) {
                lastGoodSizes[nodeId] = cssSize;
            }

            // 备份：检测刚展开
            if (!isCollapsed && wasCollapsed && !restoreUntil[nodeId]) {
                const savedSize = getSavedSize(nodeId);
                if (savedSize) {
                    startForcing(nodeId, savedSize);
                }
                restoreUntil[nodeId] = now + 3000;
            }

            // 备份：检测刚折叠
            if (isCollapsed && !wasCollapsed) {
                if (isNormalSize(cssSize) && !forcingNodes[nodeId]) {
                    savedSizes[nodeId] = cssSize;
                } else if (lastGoodSizes[nodeId]) {
                    savedSizes[nodeId] = lastGoodSizes[nodeId];
                }
                stopForcing(nodeId);
                restoreUntil[nodeId] = null;
            }

            lastCollapsedState[nodeId] = isCollapsed;

            // 恢复窗口结束：检查大小是否正常，不正常则重新强制
            if (restoreUntil[nodeId] && now >= restoreUntil[nodeId]) {
                const currentSize = getCssSize(nodeEl);
                const savedSize = getSavedSize(nodeId);
                if (!isCollapsed && savedSize && !isNormalSize(currentSize)) {
                    startForcing(nodeId, savedSize);
                    restoreUntil[nodeId] = now + 2000;
                } else {
                    stopForcing(nodeId);
                    restoreUntil[nodeId] = null;
                }
            }

            // 恢复窗口内如果节点被折叠，立即停止
            if (restoreUntil[nodeId] && now < restoreUntil[nodeId] && isCollapsed) {
                stopForcing(nodeId);
                restoreUntil[nodeId] = null;
            }
        }
    }

    // 【已禁用 2026-10-29】官方已修复，不再需要 50ms 轮询
    // // 设置开关：等待设置系统就绪后检查，未启用则不启动
    // let _initAttempts = 0;
    // function _tryStart() {
    //     _initAttempts++;
    //     try {
    //         if (typeof app !== "undefined" && app.ui && app.ui.settings) {
    //             const enabled = app.ui.settings.getSettingValue("Practical-Tools.EnableFoldedSizeFix", true);
    //             if (enabled === false) return;
    //             setInterval(checkNodes, 50);
    //             return;
    //         }
    //     } catch (e) { /* 默认启用 */ }
    //     if (_initAttempts < 100) setTimeout(_tryStart, 100);
    //     else setInterval(checkNodes, 50);
    // }
    // _tryStart();
})();


// ============================================================================
// 修复 2：节点层级修复
// ============================================================================
// 修复 ComfyUI Node 2.0 模式下，加载/切换工作流时折叠节点上浮的问题
//
// 问题根因：
// Node 2.0 下节点是 Vue DOM 元素，z-index 被设置为节点的 order（执行顺序），
// 而不是 _nodes 数组位置（添加顺序）。执行顺序靠后的折叠节点 order 值大，
// z-index 高，就会显示在覆盖节点之上（上浮）。
//
// 解决方案：
// 用 CSS !important + CSS 变量从样式层面强制 z-index，
// 非折叠节点整体加 10000 偏移，确保非折叠节点永远在折叠节点之上。
// 同一类型内按 _nodes 位置排序，点击/拖动置顶仍然生效。

(function() {
    "use strict";

    const CSS_CLASS = 'pt-layer-fix';
    const CSS_VAR = '--pt-z';

    // 注入 CSS 规则（!important 覆盖 Vue 内联 z-index）
    function injectStyles() {
        if (document.getElementById('pt-layer-fix-style')) return;
        const style = document.createElement('style');
        style.id = 'pt-layer-fix-style';
        style.textContent =
            '.' + CSS_CLASS + ' .lg-node { z-index: var(' + CSS_VAR + ') !important; }' +
            '.' + CSS_CLASS + ' .lg-node.pt-pinned { z-index: 99999 !important; }';
        document.head.appendChild(style);
        document.documentElement.classList.add(CSS_CLASS);
    }

    // 检测是否为 Node 2.0 模式
    function isNode2Mode() {
        return !!document.querySelector('#graph-canvas-container .ph-no-capture .lg-node');
    }

    // 检测是否为 Node 1.0 模式（LiteGraph canvas 渲染）
    function isNode1Mode() {
        return !isNode2Mode();
    }

    // 检查是否有节点正在被拖动
    function isDraggingNode() {
        try {
            if (app.canvas && app.canvas.dragging_node) return true;
            if (app.canvas && app.canvas.node_dragged) return true;
        } catch (e) {}
        return false;
    }

    // ========================================================================
    // Node 1.0 层级修复：重排 _nodes 数组，折叠节点在前，非折叠节点在后
    // canvas 按数组顺序绘制，先画的在底层，后画的在上层
    // 只在明确时机调用，不做定时轮询，避免干扰拖动/点击
    // ========================================================================
    let _lastNode1FixAt = 0;
    function fixNode1Layers() {
        try {
            if (!isNode1Mode()) return; // 仅 Node 1.0 生效
            const _now = Date.now();
            if (_now - _lastNode1FixAt < 80) return;
            _lastNode1FixAt = _now;
            if (!app || !app.canvas || typeof app.canvas.bringToFront !== 'function') return;
            const graph = getActiveGraph();
            if (!graph || !graph._nodes || graph._nodes.length === 0) return;

            // 使用官方 bringToFront API 设置层级
            // 先把所有折叠节点 bringToFront（order 较小，底层）
            // 再把所有非折叠节点 bringToFront（order 较大，上层）
            const collapsed = [];
            const expanded = [];
            for (let i = 0; i < graph._nodes.length; i++) {
                const node = graph._nodes[i];
                if (node.flags && node.flags.collapsed) {
                    collapsed.push(node);
                } else {
                    expanded.push(node);
                }
            }

            // 按顺序 bringToFront：先折叠，后非折叠
            // 这样非折叠节点的 order 会比折叠节点大，排在上面
            for (let i = 0; i < collapsed.length; i++) {
                app.canvas.bringToFront(collapsed[i]);
            }
            for (let i = 0; i < expanded.length; i++) {
                app.canvas.bringToFront(expanded[i]);
            }

            // 触发重绘
            if (graph.setDirtyCanvas) {
                graph.setDirtyCanvas(true, true);
            }
        } catch (e) {}
    }

    // Node 1.0：patch collapse，折叠/展开后触发重排
    function patchNode1Collapse() {
        if (typeof LGraphNode === 'undefined' || !LGraphNode.prototype) return;
        const proto = LGraphNode.prototype;
        if (!proto.collapse || proto.__ptCollapsePatched) return;

        const origCollapse = proto.collapse;
        proto.collapse = function(force) {
            const result = origCollapse.apply(this, arguments);
            // 折叠/展开后延迟重排，等 LiteGraph 内部状态更新完
            setTimeout(fixNode1Layers, 100);
            return result;
        };
        proto.__ptCollapsePatched = true;
    }

    // ========================================================================
    // Node 1.0 点击/拖动置顶：照搬 Node 2.0 setupNodeToFront 逻辑
    // 非折叠节点移到数组末尾（最上层），折叠节点移到折叠组末尾
    // ========================================================================
    function setupNode1ToFront() {
        function bringToFront1(node) {
            try {
                if (!node || !app || !app.canvas) return;
                // 使用官方 bringToFront（内部调用 setNodeOrder 修改 order 属性）
                if (typeof app.canvas.bringToFront === 'function') {
                    app.canvas.bringToFront(node);
                }
            } catch (e) {}
        }

        // 拖动时立即置顶（左键按下 + 移动）
        document.addEventListener('mousemove', function(e) {
            if (e.buttons !== 1) return;
            if (!app || !app.canvas) return;
            let node = app.canvas.current_node;
            if (!node && app.canvas.selected_nodes) {
                const sel = app.canvas.selected_nodes;
                const keys = Object.keys(sel);
                if (keys.length > 0) {
                    node = sel[keys[0]];
                }
            }
            if (node) bringToFront1(node);
        }, true);

        // 点击节点时置顶 + 折叠/展开后重排
        document.addEventListener('click', function(e) {
            if (!app || !app.canvas) return;
            const selected = app.canvas.selected_nodes;
            if (selected) {
                // selected_nodes 是以节点 id 为 key 的对象 { id: node }
                let node = null;
                const keys = Object.keys(selected);
                if (keys.length > 0) {
                    node = selected[keys[0]];
                }
                if (node) bringToFront1(node);
            }
            // 点击标题栏折叠/展开时不经过 node.collapse()，需在 click 后延迟重排
            setTimeout(fixNode1Layers, 50);
        }, false);
    }

    // 获取当前活动的 graph（canvas 上实际渲染的图，可能是子图）
    function getActiveGraph() {
        if (app.canvas && app.canvas.graph) return app.canvas.graph;
        return app.graph;
    }

    // 更新单个节点的 CSS 变量
    function updateNodeZ(node, el) {
        if (!node || !el) return;
        const graph = getActiveGraph();
        const pos = graph._nodes.indexOf(node);
        if (pos >= 0) {
            // 非折叠节点整体 z-index 加 10000 偏移，确保非折叠节点永远在折叠节点之上
            const isCollapsed = node.collapsed === true;
            const z = isCollapsed ? pos : (10000 + pos);
            el.style.setProperty(CSS_VAR, String(z));
        }
    }

    // 全量更新所有节点的 CSS 变量
    function updateAllNodes() {
        try {
            const graph = getActiveGraph();
            if (!graph || !graph._nodes) return;

            // 没有折叠节点时不需要调整层级，避免每 2 秒全量扫描
            let hasCollapsed = false;
            for (let i = 0; i < graph._nodes.length; i++) {
                const node = graph._nodes[i];
                if (node && node.flags && node.flags.collapsed) {
                    hasCollapsed = true;
                    break;
                }
            }
            if (!hasCollapsed) return;

            const container = document.querySelector('#graph-canvas-container .ph-no-capture');
            if (!container) return;

            const domNodes = container.querySelectorAll('[data-node-id]');
            for (let i = 0; i < domNodes.length; i++) {
                const el = domNodes[i];
                const node = graph.getNodeById(el.getAttribute('data-node-id'));
                updateNodeZ(node, el);
            }
        } catch (e) {}
    }

    // 固定延迟后执行全量更新（等待 Vue 渲染完成）
    function waitAndFix() {
        setTimeout(updateAllNodes, 800);
    }

    // 点击/拖动节点置顶：CSS !important 覆盖了原生置顶，需主动移到 _nodes 末尾
    function setupNodeToFront() {
        function pinNodeEl(node) {
            try {
                var allPinned = document.querySelectorAll('.pt-layer-fix .lg-node.pt-pinned');
                for (var i = 0; i < allPinned.length; i++) {
                    allPinned[i].classList.remove('pt-pinned');
                }
                if (node && node.id !== undefined && node.id !== null) {
                    var el = document.querySelector('[data-node-id="' + node.id + '"]');
                    if (el) el.classList.add('pt-pinned');
                }
            } catch (err) {}
        }

        function bringToFront(node) {
            pinNodeEl(node);
            const graph = getActiveGraph();
            const index = graph._nodes.indexOf(node);
            if (index < 0 || index === graph._nodes.length - 1) return;
            graph._nodes.splice(index, 1);
            graph._nodes.push(node);
            updateAllNodes();
        }

        // 拖动时立即置顶（左键按下 + 在节点上移动）
        document.addEventListener('mousemove', function(e) {
            if (e.buttons !== 1) return;
            if (!app) return;
            const graph = getActiveGraph();
            if (!graph) return;
            const nodeEl = e.target.closest ? e.target.closest('[data-node-id]') : null;
            if (!nodeEl) return;
            const node = graph.getNodeById(nodeEl.getAttribute('data-node-id'));
            if (node) bringToFront(node);
        }, true);

        // 点击节点时置顶
        document.addEventListener('click', function(e) {
            if (!app) return;
            const graph = getActiveGraph();
            if (!graph) return;
            const nodeEl = e.target.closest ? e.target.closest('[data-node-id]') : null;
            if (!nodeEl) return;
            const node = graph.getNodeById(nodeEl.getAttribute('data-node-id'));
            if (node) bringToFront(node);
        }, false);
    }

    // MutationObserver：监听新节点添加和节点属性变化，保持 CSS 变量正确
    function setupObserver() {
        const container = document.querySelector('#graph-canvas-container .ph-no-capture');
        if (!container) return;

        const observer = new MutationObserver(function(mutations) {
            for (const mutation of mutations) {
                // 新节点添加
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    for (const added of mutation.addedNodes) {
                        if (added.nodeType === 1) {
                            const el = added.matches && added.matches('[data-node-id]')
                                ? added
                                : (added.querySelector ? added.querySelector('[data-node-id]') : null);
                            if (el) {
                                const graph = getActiveGraph();
                                if (graph) {
                                    const node = graph.getNodeById(el.getAttribute('data-node-id'));
                                    updateNodeZ(node, el);
                                }
                            }
                        }
                    }
                }
                // 节点 style 变化（Vue 重新设置 z-index 时，确保 CSS 变量仍在）
                if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                    const el = mutation.target;
                    if (el.matches && el.matches('[data-node-id]')) {
                        if (!el.style.getPropertyValue(CSS_VAR)) {
                            const graph = getActiveGraph();
                            if (graph) {
                                const node = graph.getNodeById(el.getAttribute('data-node-id'));
                                updateNodeZ(node, el);
                            }
                        }
                    }
                }
            }
        });

        observer.observe(container, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style']
        });

        return observer;
    }

    let _node1FixSeq = 0;
    function scheduleNode1Fixes(delays) {
        const seq = ++_node1FixSeq;
        for (let i = 0; i < delays.length; i++) {
            setTimeout(function () {
                if (seq !== _node1FixSeq) return;
                fixNode1Layers();
            }, delays[i]);
        }
    }

    function init() {
        if (typeof app === 'undefined' || !app.loadGraphData) {
            setTimeout(init, 100);
            return;
        }

        // Node 1.0 修复：patch collapse + 点击/拖动置顶（执行时动态判断模式）
        patchNode1Collapse();
        setupNode1ToFront();

        // Node 1.0 初始层级修复（init 时直接调用，不依赖 loadGraphData patch）
        scheduleNode1Fixes([300, 1200]);

        // Node 2.0 修复：CSS z-index 方案
        injectStyles();
        setupNodeToFront();

        // patch loadGraphData：每次加载后修复
        const origLoadGraphData = app.loadGraphData.bind(app);
        app.loadGraphData = async function() {
            const result = await origLoadGraphData.apply(this, arguments);
            if (isNode2Mode()) {
                waitAndFix();
            }
            // Node 1.0 加载后修复（同步 + 延迟多次，确保立即生效）
            fixNode1Layers();
            scheduleNode1Fixes([100, 800]);
            return result;
        };

        // 设置 MutationObserver（延迟到 DOM 就绪）
        setTimeout(function() {
            if (isNode2Mode()) {
                setupObserver();
                updateAllNodes();
            }
        }, 1000);

        // patch canvas.setGraph：切换图（等待室返回、子图切换等）后触发层级修复
        function patchSetGraph() {
            const canvas = app.canvas;
            if (!canvas || typeof canvas.setGraph !== 'function' || canvas.__ptSetGraphPatched) return;
            const origSetGraph = canvas.setGraph.bind(canvas);
            canvas.setGraph = function() {
                const result = origSetGraph.apply(this, arguments);
                if (isNode2Mode()) {
                    setTimeout(updateAllNodes, 500);
                    setTimeout(updateAllNodes, 1200);
                }
                // Node 1.0 切换图后修复（同步 + 延迟多次，确保立即生效）
                fixNode1Layers();
                scheduleNode1Fixes([100, 800]);
                return result;
            };
            canvas.__ptSetGraphPatched = true;
        }
        let patchAttempts = 0;
        (function tryPatchSetGraph() {
            patchAttempts++;
            if (app.canvas && app.canvas.setGraph) {
                patchSetGraph();
            } else if (patchAttempts < 30) {
                setTimeout(tryPatchSetGraph, 200);
            }
        })();

        // 定时轮询兜底：每 2 秒全量检查一次
        setInterval(function() {
            if (isNode2Mode()) {
                updateAllNodes();
            }
        }, 2000);
    }

    // 设置开关：等待设置系统就绪后检查，未启用则不初始化
    let _initAttempts = 0;
    function _tryInit() {
        _initAttempts++;
        try {
            if (typeof app !== "undefined" && app.ui && app.ui.settings) {
                const enabled = app.ui.settings.getSettingValue("Practical-Tools.EnableNodeLayerFix") ?? true;
                if (enabled === false) return;
                init();
                return;
            }
        } catch (e) { /* 默认启用 */ }
        if (_initAttempts < 100) setTimeout(_tryInit, 100);
        else init();
    }
    _tryInit();
})();


// ============================================================================
// 修复 3：子图图像同步修复
// ============================================================================
// 修复 ComfyUI 子图节点外部选择图像后，子图内部 LoadImage/LoadImageMask 节点
// 的图像预览不更新的官方 bug。
//
// 问题根因：
// 子图节点暴露的 image widget（image_1, image_2...）值变化时，ComfyUI 不会
// 自动触发子图内部 LoadImage 节点的 widget.callback，导致内部图像预览不更新。
//
// 解决方案：
// 定时检查所有子图节点的 image widget 值，发现变化时按索引找到子图内部
// 对应的 LoadImage/LoadImageMask 节点，手动调用 setLoadImageValue 更新图像。

(function() {
    "use strict";

    // 设置 LoadImage/LoadImageMask 节点的图像值并更新预览
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
            if (typeof app !== 'undefined' && app.graph) {
                app.graph.setDirtyCanvas(true, true);
                if (app.canvas) app.canvas.setDirty(true, true);
            }
        };
        img.src = '/view?filename=' + encodeURIComponent(imageName) + '&type=input&subfolder=';

        // 调用 callback
        if (widget.callback) {
            try { widget.callback(imageName); } catch(e) {}
        }

        // 如果节点在子图内部，同时更新子图节点暴露的 widget
        if (node.graph && typeof app !== 'undefined' && app.graph && node.graph !== app.graph) {
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
                }
            }
        }
    }

    // 暴露为全局函数，供 photopea.js / pose_editor.js 复用
    window.ptSetLoadImageValue = setLoadImageValue;

    const subgraphWidgetCache = new Map();
    let lastNodeCount = 0;

    function syncSubgraphImages() {
        try {
            if (typeof app === 'undefined' || !app.graph || !app.graph._nodes) return;
            const nodes = app.graph._nodes;

            // 快速跳过：节点数没变且没有子图节点时不处理
            if (nodes.length === lastNodeCount) {
                let hasSubgraph = false;
                for (let i = 0; i < nodes.length; i++) {
                    if (nodes[i].subgraph) { hasSubgraph = true; break; }
                }
                if (!hasSubgraph) return;
            }
            lastNodeCount = nodes.length;

            for (const node of nodes) {
                if (!node.subgraph || !node.widgets) continue;
                const imageWidgets = node.widgets.filter(w =>
                    w.type === "combo" && w.name && w.name.startsWith("image")
                );
                if (imageWidgets.length === 0) continue;

                const cacheKey = node.id;
                const prevValues = subgraphWidgetCache.get(cacheKey) || {};
                let changed = false;

                for (let i = 0; i < imageWidgets.length; i++) {
                    const w = imageWidgets[i];
                    const val = w.value ? String(w.value) : "";
                    if (prevValues[w.name] !== val) {
                        prevValues[w.name] = val;
                        changed = true;
                        // 找到子图内部对应的 LoadImage 节点
                        if (node.subgraph._nodes && val) {
                            const innerLoadImages = node.subgraph._nodes.filter(n =>
                                n.comfyClass === "LoadImage" || n.comfyClass === "LoadImageMask" ||
                                (n.widgets && Array.isArray(n.widgets) && n.widgets.some(x => x.name === "image"))
                            );
                            const innerNode = innerLoadImages[i];
                            if (innerNode) {
                                setLoadImageValue(innerNode, val);
                            }
                        }
                    }
                }
                if (changed) {
                    subgraphWidgetCache.set(cacheKey, prevValues);
                }
            }
        } catch (e) {
            console.error("Practical-Tools: subgraph image sync error:", e);
        }
    }

    // 设置开关：未启用则不启动同步
    let _syncInitAttempts = 0;
    function startSync() {
        _syncInitAttempts++;
        try {
            if (typeof app !== "undefined" && app.ui && app.ui.settings) {
                const enabled = app.ui.settings.getSettingValue("Practical-Tools.EnableSubgraphImageSync") ?? true;
                if (enabled === false) return;
                setInterval(syncSubgraphImages, 800);
                return;
            }
        } catch (e) { /* 默认启用 */ }
        if (_syncInitAttempts < 100) setTimeout(startSync, 100);
        else setInterval(syncSubgraphImages, 800);
    }
    startSync();
})();
