import { app } from "../../scripts/app.js";

const PATCH_FLAG = "__practical_tools_pin_icon_patched__";


function patchNodePrototype(node) {
    if (!node || !node.constructor || !node.constructor.prototype) {
        return false;
    }

    const prototype = node.constructor.prototype;

    /*
     * 防止重复 patch
     */
    if (prototype[PATCH_FLAG]) {
        return true;
    }

    const originalDrawTitleText = prototype.drawTitleText;

    if (typeof originalDrawTitleText !== "function") {
        console.warn(
            "[Practical-Tools] drawTitleText not found."
        );
        return false;
    }


    prototype.drawTitleText = function (ctx, options) {

        /*
         * =====================================================
         * 普通节点
         * =====================================================
         *
         * 完全不干涉 ComfyUI。
         */
        if (!this.pinned) {
            return originalDrawTitleText.call(
                this,
                ctx,
                options
            );
        }


        /*
         * =====================================================
         * 固定节点
         * =====================================================
         *
         * 不再使用 Proxy。
         *
         * 不再拦截 fillText。
         *
         * 不再自己重新绘制标题。
         *
         * 只是在调用 ComfyUI 原始 drawTitleText()
         * 的瞬间，把 pinned 状态临时关闭。
         */


        const flags = this.flags;

        if (!flags) {
            return originalDrawTitleText.call(
                this,
                ctx,
                options
            );
        }


        /*
         * 保存原始 pinned 状态
         */
        const oldPinned = flags.pinned;


        try {

            /*
             * 临时关闭 pinned。
             *
             * 这里使用 delete，而不是：
             *
             *     flags.pinned = undefined
             *
             * 因为 undefined 属性本身仍然存在，
             * 某些判断方式可能仍然认为它存在。
             */
            delete flags.pinned;


            /*
             * =================================================
             * 关键：
             *
             * 完全使用 ComfyUI 原本的标题绘制函数。
             *
             * 不修改 ctx。
             * 不修改 fillText。
             * 不修改字体。
             * 不修改坐标。
             * 不修改标题。
             * 不修改截断逻辑。
             * =================================================
             */
            originalDrawTitleText.call(
                this,
                ctx,
                options
            );

        } finally {

            /*
             * 恢复真正的 pinned 状态
             */
            if (oldPinned !== undefined) {
                flags.pinned = oldPinned;
            } else {
                delete flags.pinned;
            }
        }


        /*
         * =====================================================
         * 注意
         * =====================================================
         *
         * 这里暂时不自己绘制 "·"。
         *
         * 因为一旦自己重新绘制标题区域，
         * 就会重新引入：
         *
         * - 标题截断
         * - 字体
         * - X 坐标
         * - Y 坐标
         * - DPI
         * - 缩放
         * - 选中颜色
         * - 标题宽度
         *
         * 等问题。
         *
         * 当前版本的目标首先是：
         *
         *     固定节点 = 正常标题
         *     不再出现 📌
         *
         * 确认这一点稳定以后，
         * 再把 · 精确插入原图钉位置。
         */
    };


    prototype[PATCH_FLAG] = true;


    console.log(
        "[Practical-Tools] Node 1.0 Pin icon patch loaded."
    );

    return true;
}



function patchExistingNodes() {

    const graph = app.graph;

    if (!graph || !graph._nodes) {
        return false;
    }


    for (const node of graph._nodes) {

        if (patchNodePrototype(node)) {
            return true;
        }
    }


    return false;
}



app.registerExtension({

    name: "Practical-Tools.PinIcon",


    async setup() {

        /*
         * 尝试立即 patch
         */
        if (patchExistingNodes()) {
            return;
        }


        /*
         * 如果启动时还没有节点，
         * 稍后继续尝试。
         */
        let attempts = 0;


        const timer = setInterval(() => {

            attempts++;


            if (
                patchExistingNodes() ||
                attempts >= 50
            ) {
                clearInterval(timer);
            }

        }, 200);
    },


    /*
     * 新创建节点时也确保 prototype 已经 patch。
     */
    nodeCreated(node) {

        patchNodePrototype(node);
    }
});