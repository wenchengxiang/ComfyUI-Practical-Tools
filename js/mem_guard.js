// mem_guard.js — 前端内存累积监测 + 画布工具栏常驻刷新按钮
// 说明：ComfyUI 页面开久了，JS 堆与 DOM 会持续增长；后端卸载模型不会回收这块内存。
//      在右下角「画布工具栏」里常驻一个刷新按钮：
//        - 正常：与其它按钮同色（白），悬停提示「刷新画布」
//        - 超过阈值：图标变红，悬停提示「前端内存积重，刷新画布清理」（文字同红色）
//      悬浮提示复用官方 tooltip 的样式（深色框、6px 圆角、12px 文字、底部小箭头）
//      箭头按按钮中心定位，气泡被视口边缘夹住时也能指向图标
// 设置：
//   Practical-Tools.EnableMemGuard         开关（默认开）
//   Practical-Tools.MemGuardThresholdMB    堆占用提示阈值，单位 MB（默认 1200）
//   Practical-Tools.MemGuardDomThreshold   DOM 元素数提示阈值（默认 60000，仅在没有堆数据时使用）
(function () {
	"use strict";

	if (window.__ptMemGuard) return;

	const SET_ENABLED = "Practical-Tools.EnableMemGuard";
	const SET_MB = "Practical-Tools.MemGuardThresholdMB";
	const SET_DOM = "Practical-Tools.MemGuardDomThreshold";
	const BTN_ID = "pt-mem-guard-btn";
	const CHECK_MS = 5000;
	const TOOLBAR_SEL = 'div[role="toolbar"][aria-label="画布工具栏"]';
	const TIP_NORMAL = "刷新画布";
	const TIP_WARN = "前端内存积重，刷新画布清理";
	const WARN_COLOR = "#ff6b6b";
	const TIP_DELAY_MS = 420; /* 官方 300ms + 实测官方 Vue 挂载开销约 120ms */
	const TIP_SKIP_MS = 300; /* 官方 skipDelayDuration：窗口内再次悬停直接开 */

	let baselineMB = 0;
	let peakMB = 0;
	let peakDom = 0;
	let warn = false;
	let checkTimer = null;
	let attachTimer = null;

	function getSetting(id, dft) {
		try {
			return app.ui.settings.getSettingValue(id) ?? dft;
		} catch (e) {
			return dft;
		}
	}

	function heapMB() {
		try {
			const m = performance && performance.memory;
			if (!m || !m.usedJSHeapSize) return null;
			return m.usedJSHeapSize / 1048576;
		} catch (e) {
			return null;
		}
	}

	function domCount() {
		try {
			return document.getElementsByTagName("*").length;
		} catch (e) {
			return 0;
		}
	}

	function fmtMB(v) {
		if (v >= 1024) return (v / 1024).toFixed(2) + " GB";
		return Math.round(v) + " MB";
	}

	function iconSvg() {
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.setAttribute("viewBox", "0 0 24 24");
		svg.setAttribute("width", "16");
		svg.setAttribute("height", "16");
		svg.setAttribute("fill", "none");
		svg.setAttribute("stroke", "currentColor");
		svg.setAttribute("stroke-width", "2");
		svg.setAttribute("stroke-linecap", "round");
		svg.setAttribute("stroke-linejoin", "round");
		svg.setAttribute("aria-hidden", "true");
		const p1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
		p1.setAttribute("d", "M21 12a9 9 0 1 1-2.64-6.36");
		const p2 = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
		p2.setAttribute("points", "21 3 21 9 15 9");
		svg.appendChild(p1);
		svg.appendChild(p2);
		return svg;
	}

	let tipWrap = null;
	let tipBox = null;
	let tipLabel = null;
	let tipArrow = null;
	let tipArrowPath = null;
	let tipFlipped = false;
	let tipLastHideAt = 0;
	let tipShowTimer = null;

	function tipText() {
		return warn ? TIP_WARN : TIP_NORMAL;
	}

	function ensureTip() {
		if (tipWrap && tipWrap.parentNode) return tipWrap;
		tipWrap = document.createElement("div");
		tipWrap.id = "pt-mem-guard-tip";
		tipWrap.style.cssText =
			"position:fixed;left:0;top:0;z-index:1700;pointer-events:none;display:none;";
		tipBox = document.createElement("div");
		tipBox.className =
			"z-1700 max-w-96 rounded-md border border-border-default bg-base-background px-3 py-2 text-xs/tight whitespace-pre-line text-base-foreground shadow-interface";
		tipBox.setAttribute("role", "tooltip");
		tipBox.setAttribute("data-slot", "tooltip-content");
		tipBox.style.position = "relative";
		tipLabel = document.createElement("div");
		tipBox.appendChild(tipLabel);

		tipArrow = document.createElement("span");
		tipArrow.style.cssText =
			"position:absolute;bottom:0;left:0;transform:translateY(100%);line-height:0;";
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.setAttribute("width", "10");
		svg.setAttribute("height", "5");
		svg.setAttribute("viewBox", "0 0 12 6");
		svg.setAttribute("preserveAspectRatio", "none");
		svg.setAttribute("class", "-mt-px fill-base-background stroke-border-default");
		svg.style.display = "block";
		tipArrowPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
		tipArrowPath.setAttribute("d", "M0 0L6 6L12 0");
		svg.appendChild(tipArrowPath);
		tipArrow.appendChild(svg);
		tipBox.appendChild(tipArrow);

		tipWrap.appendChild(tipBox);
		document.body.appendChild(tipWrap);
		return tipWrap;
	}

	function positionTip() {
		const btn = document.getElementById(BTN_ID);
		if (!btn || !tipWrap) return;
		const r = btn.getBoundingClientRect();
		const w = tipWrap.offsetWidth;
		const h = tipWrap.offsetHeight;
		let x = r.left + r.width / 2 - w / 2;
		let y = r.top - h - 8;
		tipFlipped = y < 8;
		if (tipFlipped) y = r.bottom + 8;
		x = Math.max(8, Math.min(x, window.innerWidth - w - 8));
		tipWrap.style.transform = "translate(" + Math.round(x) + "px," + Math.round(y) + "px)";

		if (tipArrow) {
			const anchorX = r.left + r.width / 2;
			const left = Math.max(6, Math.min(w - 16, Math.round(anchorX - x - 5)));
			tipArrow.style.left = left + "px";
			if (tipFlipped) {
				tipArrow.style.bottom = "auto";
				tipArrow.style.top = "0";
				tipArrow.style.transform = "translateY(-100%)";
				tipArrowPath.setAttribute("d", "M0 6L6 0L12 6");
			} else {
				tipArrow.style.top = "auto";
				tipArrow.style.bottom = "0";
				tipArrow.style.transform = "translateY(100%)";
				tipArrowPath.setAttribute("d", "M0 0L6 6L12 0");
			}
		}
	}

	function showTip() {
		if (!document.getElementById(BTN_ID)) return;
		ensureTip();
		tipLabel.textContent = tipText();
		tipBox.style.color = warn ? WARN_COLOR : "";
		tipWrap.style.display = "block";
		positionTip();
	}

	function hideTip() {
		if (tipShowTimer) {
			clearTimeout(tipShowTimer);
			tipShowTimer = null;
		}
		if (tipWrap && tipWrap.style.display === "block") {
			tipLastHideAt = performance.now();
			tipWrap.style.display = "none";
		}
	}

	function scheduleTip() {
		hideTip();
		// 与官方 reka tooltip 对齐：首次 300ms；300ms 内连续悬停直接显示
		const wait = performance.now() - tipLastHideAt < TIP_SKIP_MS ? 0 : TIP_DELAY_MS;
		tipShowTimer = setTimeout(showTip, wait);
	}

	function applyState() {
		const btn = document.getElementById(BTN_ID);
		if (!btn) return;
		btn.removeAttribute("title");
		if (warn) {
			btn.style.color = WARN_COLOR;
			btn.setAttribute("aria-label", TIP_WARN);
		} else {
			btn.style.color = "";
			btn.setAttribute("aria-label", TIP_NORMAL);
		}
		if (tipWrap && tipWrap.style.display === "block") {
			tipLabel.textContent = tipText();
			tipBox.style.color = warn ? WARN_COLOR : "";
			positionTip();
		}
	}

	function findToolbar() {
		try {
			return document.querySelector(TOOLBAR_SEL);
		} catch (e) {
			return null;
		}
	}

	function buildButton() {
		const bar = findToolbar();
		if (!bar) return false;
		if (document.getElementById(BTN_ID)) return true;

		const btns = Array.from(bar.querySelectorAll("button"));
		const sample =
			btns.find(function (b) {
				return /适应视图|显示小地图/.test(b.getAttribute("aria-label") || "");
			}) || btns[0];
		const btn = document.createElement("button");
		btn.id = BTN_ID;
		btn.type = "button";
		btn.setAttribute("data-variant", "secondary");
		btn.className = sample
			? sample.className
			: "relative inline-flex cursor-pointer items-center justify-center border-none text-base-foreground rounded-lg size-8 bg-transparent p-0";
		btn.style.cssText =
			"flex:0 0 auto;width:32px;height:32px;padding:0;display:flex;align-items:center;justify-content:center;border-radius:8px;";
		btn.setAttribute("aria-label", "刷新画布");
		btn.appendChild(iconSvg());
		btn.addEventListener("mouseenter", scheduleTip);
		btn.addEventListener("mouseleave", hideTip);
		btn.addEventListener("focus", scheduleTip);
		btn.addEventListener("blur", hideTip);
		btn.addEventListener("click", function (ev) {
			ev.preventDefault();
			ev.stopPropagation();
			hideTip();
			try {
				window.location.reload();
			} catch (e) {}
		});

		bar.appendChild(btn);

		applyState();
		return true;
	}

	function keepAttached() {
		if (!getSetting(SET_ENABLED, true)) {
			const old = document.getElementById(BTN_ID);
			if (old) old.remove();
			hideTip();
			return;
		}
		if (!document.getElementById(BTN_ID)) {
			hideTip();
			buildButton();
		}
	}

	function check() {
		if (!getSetting(SET_ENABLED, true)) {
			warn = false;
			applyState();
			return null;
		}
		const mb = heapMB();
		// Chromium 有堆数据时，DOM 数量不参与告警，跳过全 DOM 扫描
		const dom = mb == null ? domCount() : 0;
		if (mb != null) {
			if (!baselineMB) baselineMB = mb;
			if (mb > peakMB) peakMB = mb;
		}
		if (dom > peakDom) peakDom = dom;

		const limitMB = Number(getSetting(SET_MB, 1200)) || 1200;
		const limitDom = Number(getSetting(SET_DOM, 60000)) || 60000;

		warn = (mb != null && mb >= limitMB) || (mb == null && dom >= limitDom);
		applyState();
		return { heapMB: mb, baselineMB: baselineMB, peakMB: peakMB, dom: dom, peakDom: peakDom, warn: warn };
	}

	function start() {
		// 设置项集中在 pt_settings.js 注册（同组：前端内存提示），此处只负责读取与运行。

		check();
		keepAttached();
		if (checkTimer) clearInterval(checkTimer);
		checkTimer = setInterval(check, CHECK_MS);
		if (attachTimer) clearInterval(attachTimer);
		attachTimer = setInterval(keepAttached, 1000);
		window.addEventListener("scroll", hideTip, true);
		window.addEventListener("resize", hideTip);
	}

	if (window.app && app.ui && app.ui.settings) start();
	else {
		let tries = 0;
		const wait = setInterval(function () {
			if (window.app && app.ui && app.ui.settings) {
				clearInterval(wait);
				start();
			} else if (++tries > 200) {
				clearInterval(wait);
			}
		}, 100);
	}

	window.__ptMemGuard = {
		check: check,
		attach: keepAttached,
		forceWarn: function (on) {
			warn = !!on;
			applyState();
		},
		stats: function () {
			return check();
		},
	};
})();
