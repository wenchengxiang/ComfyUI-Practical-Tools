import { app } from "../../scripts/app.js";

const PATCH_FLAG = "__practical_tools_group_pin_icon_patched__";


function patchGroupPrototype() {
    /*
     * 获取 LiteGraph 的 Group 类
     */
    const GroupClass = window.LiteGraph?.LGraphGroup;

    if (!GroupClass || !GroupClass.prototype) {
        return false;
    }


    const prototype = GroupClass.prototype;


    /*
     * 防止重复 patch
     */
    if (prototype[PATCH_FLAG]) {
        return true;
    }


    /*
     * Group 的原始绘制函数
     */
    const originalDraw = prototype.draw;

    if (typeof originalDraw !== "function") {
        console.warn(
            "[Practical-Tools] LGraphGroup.draw not found."
        );
        return false;
    }


    /*
     * 替换 Group draw
     */
    prototype.draw = function (graphCanvas, ctx) {

        /*
         * =====================================================
         * 普通 Group
         * =====================================================
         *
         * 完全使用 ComfyUI 原始绘制逻辑。
         */
        if (!this.pinned) {
            return originalDraw.call(
                this,
                graphCanvas,
                ctx
            );
        }


        /*
         * =====================================================
         * 固定 Group
         * =====================================================
         *
         * 临时关闭 pinned。
         *
         * LGraphGroup.draw() 原本会：
         *
         *     this.title + (this.pinned ? "📌" : "")
         *
         * 因此只需要让 draw() 执行期间
         * this.pinned 临时变成 false。
         *
         * Group 本身仍然保持真正的 pinned 状态。
         */

        const flags = this.flags;

        if (!flags) {
            return originalDraw.call(
                this,
                graphCanvas,
                ctx
            );
        }


        /*
         * 保存真正的 pinned 状态
         */
        const oldPinned = flags.pinned;


        try {

            /*
             * 临时取消 pinned
             *
             * 使用 delete，而不是：
             *
             *     flags.pinned = undefined
             *
             * 保持和我们已经验证稳定的 Node 版本一致。
             */
            delete flags.pinned;


            /*
             * 完全执行 ComfyUI 原始 Group 绘制。
             *
             * 不修改：
             * - ctx
             * - 标题
             * - 字体
             * - 坐标
             * - Group 尺寸
             * - Group 背景
             * - Group 边框
             * - 选中状态
             */
            return originalDraw.call(
                this,
                graphCanvas,
                ctx
            );

        } finally {

            /*
             * 恢复真正的 pinned 状态。
             */
            if (oldPinned !== undefined) {
                flags.pinned = oldPinned;
            } else {
                delete flags.pinned;
            }
        }
    };


    /*
     * 标记已经 patch
     */
    prototype[PATCH_FLAG] = true;


    console.log(
        "[Practical-Tools] Group pin icon patched."
    );


    return true;
}


/*
 * ============================================================
 * Extension
 * ============================================================
 */

app.registerExtension({

    name: "Practical-Tools.GroupPinIcon",


    async setup() {

        /*
         * LiteGraph 初始化完成后尝试 patch。
         */
        if (patchGroupPrototype()) {
            return;
        }


        /*
         * 如果此时 LGraphGroup 尚未准备好，
         * 稍后继续尝试。
         */
        let attempts = 0;


        const timer = setInterval(() => {

            attempts++;


            if (
                patchGroupPrototype() ||
                attempts >= 50
            ) {
                clearInterval(timer);
            }

        }, 200);
    }
});