// bugfix_node_folded_size.js
// 修复 Node 2.0 下带 widgets 的节点折叠后进入子图再回来，展开时大小丢失的 bug
// 方案：patch collapse + 动态样式表 !important 规则压过 Vue 的反复设置
// 用全局 Map 保存大小（key=节点id），避免进入子图后节点对象重建导致属性丢失

(function() {
    // 设置开关：未启用则直接退出
    try {
        const raw = localStorage.getItem("Comfy.Settings.PracticalTools.EnableFoldedSizeFix");
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
        if (!size || !size.height) return false;
        const h = parseInt(size.height);
        return !isNaN(h) && h > 50;
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
                    restoreUntil[nodeId] = Date.now() + 1500;
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

            // 持续记录最后一个正常大小（非强制状态下）
            if (isNormalSize(cssSize) && !forcingNodes[nodeId] && !restoreUntil[nodeId]) {
                lastGoodSizes[nodeId] = cssSize;
            }

            // 备份：检测刚展开
            if (!isCollapsed && wasCollapsed && !restoreUntil[nodeId]) {
                const savedSize = getSavedSize(nodeId);
                if (savedSize) {
                    startForcing(nodeId, savedSize);
                }
                restoreUntil[nodeId] = now + 1500;
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

            // 恢复窗口结束：停止强制
            if (restoreUntil[nodeId] && now >= restoreUntil[nodeId]) {
                stopForcing(nodeId);
                restoreUntil[nodeId] = null;
            }

            // 恢复窗口内如果节点被折叠，立即停止
            if (restoreUntil[nodeId] && now < restoreUntil[nodeId] && isCollapsed) {
                stopForcing(nodeId);
                restoreUntil[nodeId] = null;
            }
        }
    }

    // 设置开关：等待设置系统就绪后检查，未启用则不启动
    let _initAttempts = 0;
    function _tryStart() {
        _initAttempts++;
        try {
            if (typeof app !== "undefined" && app.ui && app.ui.settings) {
                const enabled = app.ui.settings.getSettingValue("PracticalTools.EnableFoldedSizeFix", true);
                if (enabled === false) return;
                setInterval(checkNodes, 50);
                return;
            }
        } catch (e) { /* 默认启用 */ }
        if (_initAttempts < 100) setTimeout(_tryStart, 100);
        else setInterval(checkNodes, 50);
    }
    _tryStart();
})();
