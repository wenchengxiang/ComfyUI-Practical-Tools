// node_layer_fix.js
// 修复 ComfyUI Node 2.0 模式下，加载/切换工作流时折叠节点上浮的问题
//
// 问题根因（已验证）：
// Node 2.0 下节点是 Vue DOM 元素，z-index 被设置为节点的 order（执行顺序），
// 而不是 _nodes 数组位置（添加顺序）。执行顺序靠后的折叠节点 order 值大，
// z-index 高，就会显示在覆盖节点之上（上浮）。
// Node 1.0 下绘制顺序由 _nodes 决定，与执行顺序无关，所以没有此问题。
//
// 解决方案：
// 用 CSS !important + CSS 变量从样式层面强制 z-index = _nodes 位置，
// Vue 的内联样式（非 !important）无法覆盖 !important 的 CSS 规则。
// 1. 注入样式：.pt-layer-fix .lg-node { z-index: var(--pt-z) !important; }
// 2. 加载后 800ms 全量设置 --pt-z = _nodes 位置
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
            '.' + CSS_CLASS + ' .lg-node { z-index: var(' + CSS_VAR + ') !important; }';
        document.head.appendChild(style);
        document.documentElement.classList.add(CSS_CLASS);
    }

    // 检测是否为 Node 2.0 模式
    function isNode2Mode() {
        return !!document.querySelector('#graph-canvas-container .ph-no-capture .lg-node');
    }

    // 更新单个节点的 CSS 变量
    function updateNodeZ(node, el) {
        if (!node || !el) return;
        const pos = app.graph._nodes.indexOf(node);
        if (pos >= 0) {
            el.style.setProperty(CSS_VAR, String(pos));
        }
    }

    // 全量更新所有节点的 CSS 变量
    function updateAllNodes() {
        try {
            const graph = app.graph;
            if (!graph || !graph._nodes) return;
            if (app.rootGraph && graph !== app.rootGraph) return;
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
        function bringToFront(node) {
            const index = app.graph._nodes.indexOf(node);
            if (index < 0 || index === app.graph._nodes.length - 1) return;
            app.graph._nodes.splice(index, 1);
            app.graph._nodes.push(node);
            updateAllNodes();
        }

        // 拖动时立即置顶（左键按下 + 在节点上移动）
        document.addEventListener('mousemove', function(e) {
            if (e.buttons !== 1) return;
            if (!app || !app.graph) return;
            if (app.rootGraph && app.graph !== app.rootGraph) return;
            const nodeEl = e.target.closest ? e.target.closest('[data-node-id]') : null;
            if (!nodeEl) return;
            const node = app.graph.getNodeById(nodeEl.getAttribute('data-node-id'));
            if (node) bringToFront(node);
        }, true);

        // 单纯点击时置顶（拖动不触发 click）
        document.addEventListener('click', function(e) {
            if (!app || !app.graph) return;
            if (app.rootGraph && app.graph !== app.rootGraph) return;
            const nodeEl = e.target.closest ? e.target.closest('[data-node-id]') : null;
            if (!nodeEl) return;
            const node = app.graph.getNodeById(nodeEl.getAttribute('data-node-id'));
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
                            if (el && app.graph) {
                                const node = app.graph.getNodeById(el.getAttribute('data-node-id'));
                                updateNodeZ(node, el);
                            }
                        }
                    }
                }
                // 节点 style 变化（Vue 重新设置 z-index 时，确保 CSS 变量仍在）
                if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                    const el = mutation.target;
                    if (el.matches && el.matches('[data-node-id]') && app.graph) {
                        if (!el.style.getPropertyValue(CSS_VAR)) {
                            const node = app.graph.getNodeById(el.getAttribute('data-node-id'));
                            updateNodeZ(node, el);
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

    init();
})();
