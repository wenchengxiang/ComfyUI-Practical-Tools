// node_layer_fix.js
// 修复 ComfyUI Node 2.0 模式下，加载/切换工作流时折叠节点上浮的问题
//
// 问题根因（已验证）：
// Node 2.0 下节点是 Vue DOM 元素，z-index 被设置为节点的 order（执行顺序），
// 而不是 _nodes 数组位置（添加顺序）。执行顺序靠后的折叠节点 order 值大，
// z-index 高，就会显示在覆盖节点之上（上浮）。
// Node 1.0 下绘制顺序由 _nodes 决定，与执行顺序无关，所以没有此问题。
//
// 解决方案（v3）：
// 用 CSS !important + CSS 变量从样式层面强制 z-index，
// 非折叠节点整体加 10000 偏移，确保非折叠节点永远在折叠节点之上（解决粘贴后覆盖关系错乱）。
// 同一类型内按 _nodes 位置排序，点击/拖动置顶仍然生效。
// 1. 注入样式：.pt-layer-fix .lg-node { z-index: var(--pt-z) !important; }
// 2. 加载后 800ms 全量设置 --pt-z
// 3. MutationObserver 持续监听新节点和 style 变化，保持变量正确

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
            // v3：非折叠节点整体 z-index 加 10000 偏移，确保非折叠节点永远在折叠节点之上
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

        // 点击节点时置顶（冒泡阶段，getActiveGraph 修复后能正确找到节点）
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

    function init() {
        if (typeof app === 'undefined' || !app.loadGraphData) {
            setTimeout(init, 100);
            return;
        }

        injectStyles();
        setupNodeToFront();

        // patch loadGraphData：每次加载后修复
        const origLoadGraphData = app.loadGraphData.bind(app);
        app.loadGraphData = async function() {
            const result = await origLoadGraphData.apply(this, arguments);
            if (isNode2Mode()) {
                waitAndFix();
            }
            return result;
        };

        // 设置 MutationObserver（延迟到 DOM 就绪）
        setTimeout(function() {
            if (isNode2Mode()) {
                setupObserver();
                updateAllNodes();
            }
        }, 1000);
    }

    // 设置开关：等待设置系统就绪后检查，未启用则不初始化
    let _initAttempts = 0;
    function _tryInit() {
        _initAttempts++;
        try {
            if (typeof app !== "undefined" && app.ui && app.ui.settings) {
                const enabled = app.ui.settings.getSettingValue("PracticalTools.EnableNodeLayerFix", true);
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
