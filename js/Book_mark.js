import { app } from "../../scripts/app.js";

/**
 * =====================================================================
 * Bookmark —— 书签节点（移植自 rgthree-comfy 的 Bookmark，已修正冲突）
 * =====================================================================
 *
 * 功能：
 *   - 添加一个书签节点，设置一个快捷键（默认自动分配 1~9、0、a~z 中
 *     第一个未占用的单键，可改成任意组合，如 "1"、"ctrl+1"、"alt+b"）
 *     和缩放比例（zoom，0.5~2）。
 *   - 画布任意位置按下快捷键（且不在输入框中输入时），画布立即跳转
 *     到该书签位置，并应用该书签保存的缩放比例。
 *   - 书签在子图里时，会自动打开对应子图再跳转。
 *   - 快捷键与缩放会随工作流保存/加载。
 *
 * 与 rgthree 共存时的修正：
 *   1. 不挂钩 LGraphCanvas.prototype.processKey 等任何共享画布方法，
 *      只用 window/document 事件监听，与 rgthree 的按键服务零交互。
 *   2. 默认快捷键为纯单键（1、2、3 ...），与 rgthree 默认分配一致。
 *      若同时安装 rgthree 且两边书签使用相同快捷键，按该键会同时
 *      触发两边跳转；如遇此情况，把其中一个改成不同键或组合键即可。
 *   3. 触发前校验书签是否属于当前工作流，切换工作流标签后，
 *      旧工作流的书签不会响应快捷键（不会跨工作流跳转）。
 *
 * 本文件为 rgthree-comfy (https://github.com/rgthree/rgthree-comfy)
 * 中 Bookmark 节点的自包含移植（去掉对 rgthree 基类/服务的依赖，
 * 保留全部功能）。原代码遵循 MIT License：
 *
 * =====================================================================
 * MIT License
 *
 * Copyright (c) 2023 Regis Gaughan, III (rgthree)
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS
 * BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
 * ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 * =====================================================================
 */

// =====================================================================
// 自包含按键服务：跟踪当前按下的键，并向书签节点派发按键事件
// （只用 window/document 监听，不挂钩任何共享画布方法）
// =====================================================================
const downKeys = {};            // 当前按下中的键（大写）
const keyListeners = new Set(); // 注册的书签节点 { node, fn }

function handleKeyDownOrUp(e) {
	const key = (e.key || "").toLocaleUpperCase();
	if (!key) return;
	// 去重：同一按键的重复事件只处理一次
	if (e.type === "keydown" && downKeys[key] === true) return;
	if (e.type === "keyup" && downKeys[key] === undefined) return;

	if (e.type === "keydown") {
		downKeys[key] = true;
		for (const l of [...keyListeners]) l.fn(e);
	} else {
		delete downKeys[key];
	}
}

function clearKeydowns() {
	for (const key in downKeys) delete downKeys[key];
}

window.addEventListener("keydown", handleKeyDownOrUp);
window.addEventListener("keyup", handleKeyDownOrUp);
document.addEventListener("visibilitychange", clearKeydowns);
window.addEventListener("blur", clearKeydowns);

// =====================================================================
// 快捷键解析与匹配
// =====================================================================
function getKeysFromShortcut(shortcut) {
	let keys;
	if (typeof shortcut === "string") {
		shortcut = shortcut.replace(/\s/g, "");
		shortcut = shortcut.replace(/^\+/, "__PLUS__").replace(/\+\+/, "+__PLUS__");
		keys = shortcut.split("+").map((i) => i.replace("__PLUS__", "+"));
	} else {
		keys = [...shortcut];
	}
	return keys.map((k) => k.toLocaleUpperCase());
}

function areAllKeysDown(keys) {
	keys = getKeysFromShortcut(keys);
	return keys.every((k) => downKeys[k]);
}

/** 判断当前按下的键是否“恰好等于”快捷键组合（可选允许带 Shift） */
function areOnlyKeysDown(keys, alsoAllowShift = false) {
	keys = getKeysFromShortcut(keys);
	const allKeysDown = areAllKeysDown(keys);
	const downKeysLength = Object.keys(downKeys).length;
	if (allKeysDown && keys.length === downKeysLength) {
		return true;
	}
	if (alsoAllowShift && !keys.includes("SHIFT") && keys.length === downKeysLength - 1) {
		return allKeysDown && areAllKeysDown(["SHIFT"]);
	}
	return false;
}

function getClosestOrSelf(target, selector) {
	if (!target) return null;
	return target.closest ? target.closest(selector) : null;
}

function wait(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// =====================================================================
// 当前工作流定位与书签工具
// =====================================================================
const SHORTCUT_DEFAULTS = "1234567890abcdefghijklmnopqrstuvwxyz".split("");

/** 当前画布显示的工作流根图 */
function getCurrentRootGraph() {
	const canvas = app.canvas;
	const current = canvas?.getCurrentGraph?.() ?? app.graph;
	return current?.rootGraph ?? current ?? null;
}

/** 判断节点是否属于某个图（含其全部子图） */
function isNodeInGraphTree(node, graph) {
	if (!graph) return false;
	if (graph === node.graph) return true;
	for (const n of graph.nodes ?? []) {
		if (n.isSubgraphNode?.() && n.subgraph && isNodeInGraphTree(node, n.subgraph)) {
			return true;
		}
	}
	return false;
}

/** 遍历当前工作流（根图 + 子图），收集全部书签节点 */
function collectBookmarkNodes() {
	const out = [];
	const walk = (graph) => {
		for (const n of graph.nodes ?? []) {
			if (n.type === "Bookmark") out.push(n);
			if (n.isSubgraphNode?.() && n.subgraph) walk(n.subgraph);
		}
	};
	const root = getCurrentRootGraph();
	if (root) walk(root);
	return out;
}

/** 在当前工作流中找一个包含指定子图的 Subgraph 节点 */
function findFromNodeForSubgraph(subgraphId) {
	const root = getCurrentRootGraph();
	if (!root) return null;
	const graphs = [root, ...(root.subgraphs?.values ? [...root.subgraphs.values()] : [])];
	for (const g of graphs) {
		const node = (g.nodes ?? [])
			.filter((n) => n.isSubgraphNode?.())
			.find((n) => n.subgraph?.id === subgraphId);
		if (node) return node;
	}
	return null;
}

/**
 * 自动分配下一个未使用的单键快捷键（1~9、0、a~z）。
 */
function getNextShortcut() {
	const used = new Set(collectBookmarkNodes().map((n) => n.shortcutKey));
	return SHORTCUT_DEFAULTS.find((char) => !used.has(char)) ?? "1";
}

// =====================================================================
// Bookmark 节点
// =====================================================================
class Bookmark extends LGraphNode {
	constructor(title = "Bookmark") {
		super(title);
		this.comfyClass = "Bookmark";
		this.isVirtualNode = true;
		this.serialize_widgets = true; // 快捷键/缩放随工作流保存
		this.___collapsed_width = 0;

		// 快捷键控件（默认自动分配 1~9、0、a~z 中第一个未占用的单键）
		const nextShortcutChar = getNextShortcut();
		this.addWidget("text", "shortcut_key", nextShortcutChar, (value) => {
			// 规范化：组合键（含 +）原样保留；单键只保留第一个字符
			const v = String(value ?? "").trim();
			this.widgets[0].value = v.includes("+") ? v : (v[0] || "1");
		}, {
			y: 8,
		});

		// 缩放控件（0.5 ~ 2 倍）
		this.addWidget("number", "zoom", 1, () => { }, {
			y: 8 + LiteGraph.NODE_WIDGET_HEIGHT + 4,
			max: 2,
			min: 0.5,
			precision: 2,
		});

		this.title = "🔖";
	}

	get _collapsed_width() {
		return this.___collapsed_width;
	}
	set _collapsed_width(_width) {
		// 折叠时按标题文字计算宽度，保证 🔖 完整显示
		const canvas = app.canvas;
		const ctx = canvas.canvas.getContext("2d");
		const oldFont = ctx.font;
		ctx.font = canvas.title_text_font || "14px Arial";
		this.___collapsed_width = 40 + ctx.measureText(this.title).width;
		ctx.font = oldFont;
	}

	/** 当前快捷键（小写，供比较用） */
	get shortcutKey() {
		return (this.widgets[0]?.value ?? "").toLocaleLowerCase();
	}

	onAdded(graph) {
		keyListeners.add({ node: this, fn: (e) => this.onKeypress(e) });
	}

	onRemoved() {
		for (const l of [...keyListeners]) {
			if (l.node === this) keyListeners.delete(l);
		}
	}

	/** 快捷键触发：只有书签属于当前工作流时才跳转 */
	onKeypress(event) {
		const target = event.target;
		if (getClosestOrSelf(target, 'input,textarea,[contenteditable="true"]')) {
			return; // 正在输入时忽略快捷键
		}
		// 关键：书签不在当前工作流（含其子图）里时直接忽略，
		// 防止切换工作流标签后旧工作流的书签响应按键造成跨工作流跳转
		if (!isNodeInGraphTree(this, getCurrentRootGraph())) {
			return;
		}
		if (areOnlyKeysDown(this.widgets[0]?.value ?? "", true)) {
			this.canvasToBookmark();
			event.preventDefault();
			event.stopPropagation();
		}
	}

	/** 点开搜索框且内容等于快捷键时，点击书签可录制新快捷键 */
	onMouseDown(event, pos, graphCanvas) {
		const input = document.querySelector(".graphdialog > input.value");
		if (input && input.value === (this.widgets[0]?.value ?? "")) {
			input.addEventListener("keydown", (e) => {
				handleKeyDownOrUp(e);
				e.preventDefault();
				e.stopPropagation();
				input.value = Object.keys(downKeys).join(" + ");
			});
		}
		return false;
	}

	/** 核心：让画布跳到本书签位置并应用缩放（双重校验当前工作流） */
	async canvasToBookmark() {
		const canvas = app.canvas;
		if (!canvas) return;
		// 双重保险：即使被直接调用，也只在当前工作流内生效
		if (!isNodeInGraphTree(this, getCurrentRootGraph())) {
			return;
		}
		// 书签在子图里时，先打开对应子图
		if (this.graph !== canvas.getCurrentGraph()) {
			const subgraph = this.graph;
			const fromNode = findFromNodeForSubgraph(subgraph.id);
			canvas.openSubgraph(subgraph, fromNode);
			await wait(16);
		}
		// 平移画布，让书签节点固定显示在左上角附近
		if (canvas?.ds?.offset) {
			canvas.ds.offset[0] = -this.pos[0] + 16;
			canvas.ds.offset[1] = -this.pos[1] + 40;
		}
		// 应用保存的缩放
		if (canvas?.ds?.scale != null) {
			canvas.ds.scale = Number(this.widgets[1].value || 1);
		}
		canvas.setDirty(true, true);
	}
}

// =====================================================================
// 静态定义与注册
// =====================================================================
Bookmark.type = "Bookmark";
Bookmark.title = "Bookmark";
Bookmark.slot_start_y = -20;

app.registerExtension({
	name: "Practical-Tools.Bookmark",
	registerCustomNodes() {
		LiteGraph.registerNodeType(Bookmark.type, Bookmark);
		Bookmark.category = "Practical-Tools/utils"; // registerNodeType 会从类型推导分类，注册后覆盖
	},
});
