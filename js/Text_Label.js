import { app } from "../../scripts/app.js";

/**
 * =====================================================================
 * Text Label —— 纯文字标签节点（非传统节点 UI）
 * =====================================================================
 *
 * 功能：
 *   - 节点本身只是一段可拖动、可旋转的文字：没有输入/输出端口、
 *     没有标题栏、没有节点背景框，画布上只有文字本身。
 *   - 双击节点打开属性面板，可编辑：
 *       文字内容  -> Title 字段（面板第一项）
 *       文字颜色  -> fontColor（hex，支持 #RRGGBBAA 半透明写法）
 *       透明度    -> opacity（0~100，独立控制整体透明度）
 *       字号大小  -> fontSize（px）
 *       字体      -> fontFamily
 *       对齐方式  -> textAlign（left / center / right）
 *       背景色    -> backgroundColor（默认透明，可填 #RRGGBBAA）
 *       内边距    -> padding
 *       背景圆角  -> borderRadius
 *       旋转角度  -> angle（度）
 *   - 文字内容支持多行：在属性面板 Title 里按 Shift+Enter 换行。
 *
 * 实现方式：仿 rgthree-comfy 的 Label 节点（纯前端虚拟节点），
 * 通过自定义 draw() 直接绘制文字，并挂钩 LGraphCanvas.drawNode 让
 * 节点背景完全透明。
 *
 * 关键点：必须设置 isVirtualNode = true（rgthree 的 Label 继承的
 * RgthreeBaseVirtualNode 也是这么做的）。前端 graphToPrompt 生成
 * 执行 prompt 时会跳过 isVirtualNode 的节点，否则节点会被当作
 * 后端节点发送，后端找不到 "Text Label" 类就报
 * "missing_node_type: Node not found. The custom node may not be
 * installed."。
 * =====================================================================
 */

class TextLabel extends LGraphNode {
	constructor(title = "双击此处编辑文字") {
		super(title);
		this.comfyClass = "Text Label";
		this.isVirtualNode = true; // 关键：纯前端虚拟节点，不参与后端执行
		this.resizable = false;

		// 可编辑属性（双击节点后显示在属性面板中）
		this.properties["fontSize"] = 20;                // 字号（px）
		this.properties["fontColor"] = "#ffffff";        // 文字颜色（hex，支持 #RRGGBBAA）
		this.properties["opacity"] = 100;                // 透明度 0~100（100 不透明）
		this.properties["fontFamily"] = "Arial";         // 字体
		this.properties["textAlign"] = "left";           // 对齐方式
		this.properties["backgroundColor"] = "transparent"; // 背景色（默认透明）
		this.properties["padding"] = 0;                  // 内边距（px）
		this.properties["borderRadius"] = 0;             // 背景圆角（px）
		this.properties["angle"] = 0;                    // 旋转角度（度）

		this.color = "#fff0";
		this.bgcolor = "#fff0";
	}

	/**
	 * 自定义绘制：节点框完全透明，只画文字。
	 */
	draw(ctx) {
		this.flags = this.flags || {};
		this.flags.allow_interaction = !this.flags.pinned;

		ctx.save();

		this.color = "#fff0";
		this.bgcolor = "#fff0";

		const fontSize = Math.max(Number(this.properties["fontSize"]) || 12, 1);
		const opacity = Math.min(Math.max(Number(this.properties["opacity"]) ?? 100, 0), 100);
		const fontColor = this.properties["fontColor"] || "#ffffff";
		const backgroundColor = this.properties["backgroundColor"] || "";
		const fontFamily = this.properties["fontFamily"] || "Arial";
		const padding = Number(this.properties["padding"]) || 0;
		const textAlign = this.properties["textAlign"] || "left";

		ctx.font = `${fontSize}px ${fontFamily}`;

		// 把标题当作文字内容（支持 \n 转义与多行）
		const processedTitle = (this.title ?? "")
			.replace(/\\n/g, "\n")
			.replace(/\n*$/, "");
		const lines = processedTitle.split("\n");

		// 按最长一行计算节点宽度，节点高度 = 字号 × 行数
		const maxWidth = Math.max(1, ...lines.map((s) => ctx.measureText(s).width));
		this.size[0] = Math.ceil(maxWidth + padding * 2);
		this.size[1] = Math.ceil(fontSize * lines.length + padding * 2);

		// 旋转
		const angleDeg = parseInt(String(this.properties["angle"] ?? 0)) || 0;
		if (angleDeg) {
			const cx = this.size[0] / 2;
			const cy = this.size[1] / 2;
			ctx.translate(cx, cy);
			ctx.rotate((angleDeg * Math.PI) / 180);
			ctx.translate(-cx, -cy);
		}

		// 背景
		if (backgroundColor) {
			const borderRadius = Number(this.properties["borderRadius"]) || 0;
			ctx.beginPath();
			if (typeof ctx.roundRect === "function") {
				ctx.roundRect(0, 0, this.size[0], this.size[1], borderRadius);
			} else {
				ctx.rect(0, 0, this.size[0], this.size[1]);
			}
			ctx.fillStyle = backgroundColor;
			ctx.fill();
		}

		// 文字
		ctx.globalAlpha = opacity / 100;
		ctx.textAlign = "left";
		ctx.textBaseline = "top";
		ctx.fillStyle = fontColor;

		let textX = padding;
		if (textAlign === "center") {
			ctx.textAlign = "center";
			textX = this.size[0] / 2;
		} else if (textAlign === "right") {
			ctx.textAlign = "right";
			textX = this.size[0] - padding;
		}

		let currentY = padding;
		for (let i = 0; i < lines.length; i++) {
			ctx.fillText(lines[i] || " ", textX, currentY);
			currentY += fontSize;
		}

		ctx.restore();
	}

	/**
	 * 双击打开属性面板（编辑文字/颜色/透明度/大小等）。
	 */
	onDblClick(event, pos, canvas) {
		LGraphCanvas.active_canvas.showShowNodePanel(this);
	}

	/**
	 * 属性面板中去掉无意义的 Mode / Color 两项。
	 */
	onShowCustomPanelInfo(panel) {
		panel.querySelector('div.property[data-property="Mode"]')?.remove();
		panel.querySelector('div.property[data-property="Color"]')?.remove();
	}

	/**
	 * 禁止拖拽改变节点大小（节点大小由文字内容自动决定）。
	 */
	inResizeCorner(x, y) {
		return this.resizable;
	}

	getHelp() {
		return `
      <p>纯文字标签节点，画布上只显示文字本身。</p>
      <p>
        双击节点打开属性面板：Title 编辑文字内容（Shift+Enter 换行），
        fontColor 文字颜色（hex，如 #FFFFFF 或半透明 #FFFFFF88），
        opacity 透明度（0~100），fontSize 字号（px）。
      </p>`;
	}
}

// =====================================================================
// 静态定义（注册信息 + 属性面板元数据）
// =====================================================================
TextLabel.type = "Text Label";
TextLabel.title = "Text Label";
TextLabel.title_mode = LiteGraph.NO_TITLE; // 无标题栏
TextLabel.collapsable = false;
TextLabel.category = "Practical-Tools/utils";

// 属性面板元数据（getPropertyInfo 会读取 constructor["@属性名"]）
TextLabel["@fontSize"] = { type: "number" };
TextLabel["@fontColor"] = { type: "string" };
TextLabel["@opacity"] = { type: "number" };
TextLabel["@fontFamily"] = { type: "string" };
TextLabel["@textAlign"] = { type: "combo", values: ["left", "center", "right"] };
TextLabel["@backgroundColor"] = { type: "string" };
TextLabel["@padding"] = { type: "number" };
TextLabel["@borderRadius"] = { type: "number" };
TextLabel["@angle"] = { type: "number" };

// =====================================================================
// 让节点的背景/边框完全透明：drawNode 前强制置透明，再补画文字
// =====================================================================
const oldDrawNode = LGraphCanvas.prototype.drawNode;
LGraphCanvas.prototype.drawNode = function (node, ctx) {
	if (node.constructor === TextLabel) {
		node.bgcolor = "transparent";
		node.color = "transparent";
		const v = oldDrawNode.apply(this, arguments);
		node.draw(ctx);
		return v;
	}
	return oldDrawNode.apply(this, arguments);
};

// =====================================================================
// 钉住（Pin）后的标签允许点击穿透，不挡下面的节点
// =====================================================================
let wcxMouseDownEvent = null;
const oldProcessMouseDown = LGraphCanvas.prototype.processMouseDown;
if (oldProcessMouseDown) {
	LGraphCanvas.prototype.processMouseDown = function (e) {
		wcxMouseDownEvent = e;
		try {
			return oldProcessMouseDown.apply(this, arguments);
		} finally {
			wcxMouseDownEvent = null;
		}
	};
}

const oldGetNodeOnPos = LGraph.prototype.getNodeOnPos;
if (oldGetNodeOnPos) {
	LGraph.prototype.getNodeOnPos = function (x, y, nodes_list) {
		if (
			nodes_list &&
			wcxMouseDownEvent &&
			wcxMouseDownEvent.type?.includes("down") &&
			(wcxMouseDownEvent.which === 1 || wcxMouseDownEvent.button === 0)
		) {
			const isDoubleClick =
				LiteGraph.getTime() - (LGraphCanvas.active_canvas?.last_mouseclick ?? 0) < 300;
			// 单击穿透钉住的标签，双击仍可选中编辑
			if (!isDoubleClick) {
				nodes_list = [...nodes_list].filter(
					(n) => !(n instanceof TextLabel) || !n.flags?.pinned
				);
			}
		}
		return oldGetNodeOnPos.apply(this, [x, y, nodes_list]);
	};
}

// =====================================================================
// 注册节点（registerNodeType 会从类型字符串推导分类，这里注册后再覆盖）
// =====================================================================
app.registerExtension({
	name: "Practical-Tools.TextLabel",
	registerCustomNodes() {
		LiteGraph.registerNodeType(TextLabel.type, TextLabel);
		TextLabel.category = "Practical-Tools/utils";
	},
});
