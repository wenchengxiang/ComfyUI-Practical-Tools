/**
 * Practical-Tools
 * Group Header Bypass Toggle
 *
 * Based on rgthree Group Header Fast Toggle behavior.
 *
 * Only provides:
 *     Group Header -> Bypass
 *
 * Bypass mode:
 *     4
 *
 * Restore mode:
 *     LiteGraph.ALWAYS
 */

import { app } from "../../scripts/app.js";

const BTN_SIZE = 20;
const BTN_MARGIN = 6;
const BTN_GRID = BTN_SIZE / 8;


/* =========================================================
 * Helpers
 * ========================================================= */

function getGroupNodes(group) {
    group.recomputeInsideNodes();

    if (Array.isArray(group._nodes)) {
        return group._nodes;
    }

    return [];
}


function getMousePosition() {
    const canvas = app.canvas;

    if (!canvas) {
        return null;
    }

    /*
     * ComfyUI canvas normally keeps the latest graph mouse
     * position here.
     */

    if (
        Array.isArray(canvas.graph_mouse) &&
        canvas.graph_mouse.length >= 2
    ) {
        return {
            x: canvas.graph_mouse[0],
            y: canvas.graph_mouse[1],
        };
    }

    return null;
}


/* =========================================================
 * Group state
 *
 * This follows rgthree's actual logic.
 * ========================================================= */

function getGroupState(group) {
    const nodes = getGroupNodes(group);

    let anyActive = false;
    let allMuted = !!nodes.length;
    let allBypassed = !!nodes.length;

    for (const node of nodes) {

        if (!node) {
            continue;
        }

        anyActive =
            anyActive ||
            node.mode === LiteGraph.ALWAYS;

        allMuted =
            allMuted &&
            node.mode === LiteGraph.NEVER;

        allBypassed =
            allBypassed &&
            node.mode === 4;

        /*
         * Same early-exit idea as rgthree.
         */

        if (
            anyActive ||
            (!allMuted && !allBypassed)
        ) {
            break;
        }
    }

    return {
        nodes,
        anyActive,
        allMuted,
        allBypassed,
    };
}


/* =========================================================
 * Bypass toggle
 *
 * Exact behavior of rgthree:
 *
 *     all bypassed -> ALWAYS
 *     otherwise    -> BYPASS (4)
 * ========================================================= */

function toggleGroupBypass(group) {

    const state =
        getGroupState(group);

    if (!state.nodes.length) {
        return;
    }

    const newMode =
        state.allBypassed
            ? LiteGraph.ALWAYS
            : 4;


    /*
     * Change every node in the Group.
     */

    for (const node of state.nodes) {

        if (!node) {
            continue;
        }

        node.mode = newMode;
    }


    /*
     * Refresh workflow.
     */

    if (
        typeof app.canvas.setDirty ===
        "function"
    ) {
        app.canvas.setDirty(
            true,
            true
        );
    }

    if (
        typeof app.canvas.setDirtyCanvas ===
        "function"
    ) {
        app.canvas.setDirtyCanvas(
            true,
            true
        );
    }
}


/* =========================================================
 * Button hit detection
 *
 * Same position as rgthree when Bypass is the only button.
 * ========================================================= */

function isBypassButtonClicked(
    group,
    mouseX,
    mouseY
) {

    const pos =
        group.pos ||
        group._pos;

    const size =
        group.size ||
        group._size;


    if (!pos || !size) {
        return false;
    }


    const x =
        pos[0] +
        size[0] -
        BTN_SIZE -
        BTN_MARGIN;

    const y =
        pos[1] +
        BTN_MARGIN;


    return (
        LiteGraph.isInsideRectangle(
            mouseX,
            mouseY,
            x,
            y,
            BTN_SIZE,
            BTN_SIZE
        )
    );
}


/* =========================================================
 * Draw Bypass icon
 *
 * This is the same basic icon geometry used by rgthree.
 * ========================================================= */

function drawBypassIcon(
    ctx,
    x,
    y,
    on
) {

    const midX =
        x +
        BTN_SIZE / 2;

    const midY =
        y +
        BTN_SIZE / 2;


    ctx.beginPath();

    ctx.lineJoin =
        "round";

    ctx.lineCap =
        "round";

    ctx.lineWidth =
        2;


    /*
     * rgthree's Bypass icon.
     *
     * OFF:
     *
     *  ---------------->
     *          o
     *
     * ON:
     *
     *  ----( )--->
     */

    const lineChanges = on
        ? `
            a ${BTN_GRID * 3},
              ${BTN_GRID * 3}
              0 1, 1
              ${BTN_GRID * 6},0

            l ${BTN_GRID * 2.0} 0
          `
        : `
            l ${BTN_GRID * 8} 0
          `;


    ctx.stroke(
        new Path2D(`
            M ${x} ${midY}

            ${lineChanges}

            M ${x + BTN_SIZE} ${midY}
            l -2  2

            M ${x + BTN_SIZE} ${midY}
            l -2 -2
        `)
    );


    /*
     * The small movable circle.
     */

    ctx.fill(
        new Path2D(
            circlePath(
                x +
                    BTN_GRID * 3,
                midY,
                BTN_GRID * 1.8
            )
        )
    );
}


/* =========================================================
 * Circle path
 * ========================================================= */

function circlePath(
    cx,
    cy,
    radius
) {

    return `
        M ${cx} ${cy}

        m ${radius}, 0

        a ${radius},
          ${radius}
          0 1, 1
          -${radius * 2},0

        a ${radius},
          ${radius}
          0 1, 1
          ${radius * 2},0
    `;
}


/* =========================================================
 * Draw Group Header button
 * ========================================================= */

function drawGroupBypassButton(
    ctx,
    group
) {

    const state =
        getGroupState(group);

    if (!state.nodes.length) {
        return;
    }


    const pos =
        group._pos ||
        group.pos;

    const size =
        group._size ||
        group.size;


    if (!pos || !size) {
        return;
    }


    const x =
        pos[0] +
        size[0] -
        BTN_MARGIN -
        BTN_SIZE;

    const y =
        pos[1] +
        BTN_MARGIN;


    /*
     * Same state detection as rgthree:
     *
     * icon is ON only when all nodes are bypassed.
     */

    const on =
        state.allBypassed;


    /*
     * Match Group color.
     */

    ctx.fillStyle =
        ctx.strokeStyle =
            group.color || "#335";


    drawBypassIcon(
        ctx,
        x,
        y,
        on
    );
}


/* =========================================================
 * Extension
 * ========================================================= */

app.registerExtension({

    name:
        "PracticalTools.GroupHeaderBypassToggle",


    async setup() {

        /*
         * Prevent duplicate installation.
         */

        if (
            window.__PracticalToolsGroupHeaderBypassToggle
        ) {
            return;
        }

        window.__PracticalToolsGroupHeaderBypassToggle =
            true;


        /* =====================================================
         * Refresh canvas
         *
         * Same reason as rgthree:
         * LiteGraph only draws Groups when canvas is dirty.
         * ===================================================== */

        setInterval(
            () => {

                const mouse =
                    getMousePosition();

                if (!mouse) {
                    return;
                }


                if (
                    typeof app.canvas.setDirty ===
                    "function"
                ) {
                    app.canvas.setDirty(
                        true,
                        true
                    );
                }

            },
            250
        );


        /* =====================================================
         * Group drawing hook
         * ===================================================== */

        const originalDrawGroups =
            LGraphCanvas.prototype.drawGroups;


        if (
            originalDrawGroups
                .__practicalToolsGroupBypass
        ) {
            return;
        }


        const drawGroups =
            function (
                canvasEl,
                ctx
            ) {

                /*
                 * First:
                 * normal ComfyUI Group drawing.
                 */

                originalDrawGroups.apply(
                    this,
                    arguments
                );


                /*
                 * Need latest mouse position.
                 */

                const mouse =
                    getMousePosition();

                if (!mouse) {
                    return;
                }


                const graph =
                    app.canvas?.graph;

                if (!graph) {
                    return;
                }


                /*
                 * Only show the icon on the
                 * Group currently under mouse.
                 */

                const group =
                    graph.getGroupOnPos(
                        mouse.x,
                        mouse.y
                    );


                if (!group) {
                    return;
                }


                /*
                 * Draw.
                 */

                ctx.save();

                drawGroupBypassButton(
                    ctx,
                    group
                );

                ctx.restore();
            };


        drawGroups
            .__practicalToolsGroupBypass =
            true;


        LGraphCanvas.prototype.drawGroups =
            drawGroups;


        /* =====================================================
         * Mouse handling
         * ===================================================== */

        const canvasElement =
            app.canvas?.canvas;


        if (!canvasElement) {

            console.warn(
                "[Practical-Tools] " +
                "Group Header Bypass Toggle: " +
                "canvas not found."
            );

            return;
        }


        canvasElement.addEventListener(
            "pointerdown",
            (event) => {

                /*
                 * Left click only.
                 */

                if (
                    event.button !== 0
                ) {
                    return;
                }


                const canvas =
                    app.canvas;

                if (!canvas) {
                    return;
                }


                /*
                 * Use ComfyUI's graph mouse position.
                 */

                const mouse =
                    getMousePosition();

                if (!mouse) {
                    return;
                }


                const graph =
                    canvas.graph;

                if (!graph) {
                    return;
                }


                /*
                 * Find Group.
                 */

                const group =
                    graph.getGroupOnPos(
                        mouse.x,
                        mouse.y
                    );


                if (!group) {
                    return;
                }


                /*
                 * Check button.
                 */

                if (
                    !isBypassButtonClicked(
                        group,
                        mouse.x,
                        mouse.y
                    )
                ) {
                    return;
                }


                /*
                 * Execute exact Bypass toggle.
                 */

                toggleGroupBypass(
                    group
                );


                /*
                 * Prevent Group dragging.
                 */

                event.preventDefault();

                event.stopPropagation();

                if (
                    typeof event.stopImmediatePropagation ===
                    "function"
                ) {
                    event.stopImmediatePropagation();
                }

            },
            true
        );


        console.log(
            "[Practical-Tools] " +
            "Group Header Bypass Toggle loaded."
        );
    }
});