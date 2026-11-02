// apply_node_size.js —— 让 Apply 系列标记节点保持在“可调节的最小尺寸”
//
// 背景：ComfyUI 加载节点后会调用 expandToFitContent()，
//      即 size = max(保存的 size, computeSize())，于是手动拖小的尺寸会被撑回去。
// 这里在 configure 之后把工作流里保存的尺寸原样贴回，并做一次下限保护（不设上限），
// 所以：新建节点 = computeSize()（最小可调节尺寸），加载节点 = 你保存时的尺寸。

import { app } from "../../scripts/app.js";

const TYPES = new Set([
    "wcx_ApplyGraphMeta",
    "wcx_ApplyPluginVersionNotice",
    "wcx_ApplyWorkflowVersionNotice",
    "wcx_Apply_AutoWaitingRoom",
    "wcx_Apply_GraphConstantFolderFastCache",
    "wcx_Apply_Missing_Model_Replace",
    "wcx_Apply_Hide_Partner_Login_Reminder",
]);

const MIN_W = 80;
const MIN_H = 24;

/** 把保存的尺寸贴回去（带下限保护） */
function restoreSize(node, size) {
    try {
        if (!node || !size || size.length < 2) return;
        const w = Math.max(MIN_W, Math.round(size[0]));
        const h = Math.max(MIN_H, Math.round(size[1]));
        if (node.size[0] === w && node.size[1] === h) return;
        node.size[0] = w;
        node.size[1] = h;
        if (typeof node.setDirtyCanvas === "function") node.setDirtyCanvas(true, true);
        if (app.canvas && typeof app.canvas.setDirty === "function") app.canvas.setDirty(true, true);
    } catch (e) { /* ignore */ }
}

/** 新建节点：用 computeSize() 作为最小可调节尺寸 */
function fitNewNode(node) {
    try {
        if (!node || typeof node.computeSize !== "function") return;
        const min = node.computeSize();
        if (min && min.length) node.size = [Math.round(min[0]), Math.round(min[1])];
        if (typeof node.setDirtyCanvas === "function") node.setDirtyCanvas(true, true);
    } catch (e) { /* ignore */ }
}

app.registerExtension({
    name: "Practical-Tools.ApplyNodeSize",

    beforeRegisterNodeDef(nodeType, nodeData) {
        try {
            if (!nodeData || !TYPES.has(nodeData.name)) return;

            // 1) configure：记下 JSON 里的尺寸，等官方的 expandToFitContent 跑完后贴回去
            const origConfigure = nodeType.prototype.configure;
            nodeType.prototype.configure = function (info) {
                const saved = info && Array.isArray(info.size) ? info.size.slice() : null;
                const r = origConfigure ? origConfigure.apply(this, arguments) : undefined;
                if (saved) {
                    const self = this;
                    restoreSize(self, saved);
                    // 官方可能在控件就绪后再撑一次，这里补两次
                    setTimeout(function () { restoreSize(self, saved); }, 0);
                    setTimeout(function () { restoreSize(self, saved); }, 150);
                }
                return r;
            };

            // 2) onAdded：只有“新建”才用 computeSize；加载已有节点走 configure 的保存尺寸
            const origAdded = nodeType.prototype.onAdded;
            nodeType.prototype.onAdded = function () {
                const r = origAdded ? origAdded.apply(this, arguments) : undefined;
                const self = this;
                if (!Array.isArray(self.size) || self.size[0] <= 0 || self.size[1] <= 0) {
                    setTimeout(function () { fitNewNode(self); }, 0);
                }
                return r;
            };
        } catch (e) { /* ignore */ }
    },
});
