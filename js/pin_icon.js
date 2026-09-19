import { app } from "../../scripts/app.js";

const PIN_CHAR = "ᴘ";

function patchPinnedDraw(prototype, drawMethod, flag, logMsg) {
    if (!prototype) return false;
    if (prototype[flag]) return true;

    const original = prototype[drawMethod];
    if (typeof original !== "function") return false;

    prototype[drawMethod] = function (...args) {
        if (!this.pinned) return original.apply(this, args);
        const flags = this.flags;
        if (!flags) return original.apply(this, args);

        const oldPinned = flags.pinned;
        const oldTitle = this.title;
        try {
            this.title = `${oldTitle} ${PIN_CHAR}`;
            delete flags.pinned;
            return original.apply(this, args);
        } finally {
            this.title = oldTitle;
            if (oldPinned !== undefined) flags.pinned = oldPinned;
            else delete flags.pinned;
        }
    };

    prototype[flag] = true;
    console.log(logMsg);
    return true;
}

function patchExistingNodes() {
    const graph = app.graph;
    if (!graph || !graph._nodes) return false;
    for (const node of graph._nodes) {
        if (patchPinnedDraw(
            node.constructor?.prototype,
            "drawTitleText",
            "__pt_node_pin_patched__",
            "[Practical-Tools] Node pin icon: 📌 → ᴘ"
        )) return true;
    }
    return false;
}

function patchGroup() {
    const GroupClass = window.LiteGraph?.LGraphGroup;
    if (!GroupClass) return false;
    return patchPinnedDraw(
        GroupClass.prototype,
        "draw",
        "__pt_group_pin_patched__",
        "[Practical-Tools] Group pin icon: 📌 → ᴘ"
    );
}

function waitFor(fn) {
    if (fn()) return;
    let attempts = 0;
    const timer = setInterval(() => {
        attempts++;
        if (fn() || attempts >= 50) clearInterval(timer);
    }, 200);
}

app.registerExtension({
    name: "Practical-Tools.PinIcon",

    async setup() {
        waitFor(patchExistingNodes);
        waitFor(patchGroup);
    },

    nodeCreated(node) {
        patchPinnedDraw(
            node.constructor?.prototype,
            "drawTitleText",
            "__pt_node_pin_patched__",
            "[Practical-Tools] Node pin icon: 📌 → ᴘ"
        );
    }
});