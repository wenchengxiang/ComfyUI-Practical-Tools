/**
 * Menu Max Height —— 把 node2.0 reka-combobox 下拉列表最大高度改为 448px
 */
(function() {
    "use strict";

    function injectStyle() {
        if (document.getElementById("menu-max-height-style")) return;
        var style = document.createElement("style");
        style.id = "menu-max-height-style";
        style.textContent = `
            [data-reka-popper-content-wrapper] .max-h-56 {
                max-height: 448px !important;
            }
        `;
        document.head.appendChild(style);
        console.log("[MenuMaxHeight] 下拉列表最大高度已设为 448px");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", injectStyle);
    } else {
        injectStyle();
    }
})();