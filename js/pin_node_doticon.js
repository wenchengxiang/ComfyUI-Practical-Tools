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
         * 完全使用 ComfyUI 原始逻辑。
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
         * 保存真正的状态
         */
        const oldPinned = flags.pinned;
        const oldTitle = this.title;


        try {

            /*
             * -------------------------------------------------
             * 临时把标题增加一个 ·
             * -------------------------------------------------
             *
             * 不自己绘制。
             *
             * 直接让 ComfyUI 原来的标题绘制函数
             * 自己处理这个字符的位置。
             */
            this.title = `${oldTitle}•`;


            /*
             * -------------------------------------------------
             * 临时取消 pinned
             * -------------------------------------------------
             *
             * 防止 ComfyUI 再绘制原来的 📌。
             */
            delete flags.pinned;


            /*
             * -------------------------------------------------
             * 完全使用 ComfyUI 原始标题绘制
             * -------------------------------------------------
             */
            return originalDrawTitleText.call(
                this,
                ctx,
                options
            );

        } finally {

            /*
             * -------------------------------------------------
             * 恢复真正的标题
             * -------------------------------------------------
             */
            this.title = oldTitle;


            /*
             * -------------------------------------------------
             * 恢复真正的 pinned 状态
             * -------------------------------------------------
             */
            if (oldPinned !== undefined) {
                flags.pinned = oldPinned;
            } else {
                delete flags.pinned;
            }
        }
    };


    prototype[PATCH_FLAG] = true;


    console.log(
        "[Practical-Tools] Node 1.0 pin icon changed: 📌 → ·"
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
         * 稍后继续检查。
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
     * 新创建节点
     */
    nodeCreated(node) {

        patchNodePrototype(node);
    }
});