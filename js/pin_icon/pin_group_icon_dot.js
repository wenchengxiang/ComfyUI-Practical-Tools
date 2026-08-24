import { app } from "../../scripts/app.js";

const PATCH_FLAG =
    "__practical_tools_group_pin_icon_patched__";


function patchGroupPrototype() {

    const GroupClass =
        window.LiteGraph?.LGraphGroup;

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


    const originalDraw = prototype.draw;


    if (typeof originalDraw !== "function") {
        console.warn(
            "[Practical-Tools] LGraphGroup.draw not found."
        );

        return false;
    }


    prototype.draw = function (graphCanvas, ctx) {

        /*
         * =====================================================
         * 普通 Group
         * =====================================================
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
         * 保存真正状态
         */
        const oldPinned = flags.pinned;
        const oldTitle = this.title;


        try {

            /*
             * -------------------------------------------------
             * 临时增加固定提醒
             * -------------------------------------------------
             *
             * Group 原来的标题：
             *
             *     My Group
             *
             * 临时变成：
             *
             *     My Group ·
             */
            this.title = `${oldTitle}•`;


            /*
             * -------------------------------------------------
             * 临时关闭 pinned
             *
             * 防止原来的 📌 被绘制。
             */
            delete flags.pinned;


            /*
             * -------------------------------------------------
             * 完全使用 Group 原始绘制逻辑
             * -------------------------------------------------
             */
            return originalDraw.call(
                this,
                graphCanvas,
                ctx
            );

        } finally {

            /*
             * 恢复真正标题
             */
            this.title = oldTitle;


            /*
             * 恢复真正 pinned
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
        "[Practical-Tools] Group pin icon changed: 📌 → ·"
    );


    return true;
}



app.registerExtension({

    name: "Practical-Tools.GroupPinIcon",


    async setup() {

        /*
         * 尝试立即 patch
         */
        if (patchGroupPrototype()) {
            return;
        }


        /*
         * LiteGraph 如果稍后才初始化，
         * 继续检查。
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