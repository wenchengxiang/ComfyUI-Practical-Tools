// hide_partner_node_login_reminder.js — 检测当前工作流有没有触发节点，决定是否隐藏合作伙伴节点登录提醒
//
// 原理：把"本来就是 api_node"的节点定义的 api_node 改成 false，ComfyUI 就不会认为图里有
//       合作伙伴节点，登录提醒自然不出现；没有触发节点时恢复成 true。普通节点不动。
//
// v2（本次）：
//   * 主要判定改到 beforeConfigureGraph —— 该钩子在 rootGraph.configure 之前、并且能拿到
//     工作流 JSON，因此在提醒渲染之前就把 flag 改好，不再"先出现再消失"。
//   * flag 变化后主动派发 graphChanged，让依赖它的 computed（usePartnerNodesInGraph）立即重算；
//     以前只改数据不通知，必须等下一次真实 graphChanged 事件才生效，那才是延迟的来源。
//   * 保留 1 秒轮询作为兜底：编辑过程中手动增删触发节点时仍然要跟着变。

(function () {
  "use strict";

  const TRIGGER_NODE_TYPE = "wcx_Apply_Hide_Partner_Login_Reminder";
  let piniaState = null;
  let realApiNodeNames = null; // 保存本来就是 api_node 的节点名，只动这些

  function findPinia() {
    if (piniaState) return piniaState;
    const all = document.querySelectorAll("*");
    for (const el of all) {
      if (!el.__vue_app__) continue;
      const provides = el.__vue_app__._context.provides;
      const symKeys = Object.getOwnPropertySymbols(provides);
      for (const sym of symKeys) {
        const v = provides[sym];
        if (v && v.state && v.state.value && v.state.value.nodeDef) {
          piniaState = v.state.value;
          return piniaState;
        }
      }
    }
    return null;
  }

  function collectNodesDeep(graph, out, seen) {
    out = out || [];
    seen = seen || new Set();
    if (!graph || seen.has(graph)) return out;
    seen.add(graph);
    const nodes = graph._nodes || graph.nodes || [];
    if (!Array.isArray(nodes)) return out;
    for (const node of nodes) {
      if (!node) continue;
      out.push(node);
      if (node.subgraph) collectNodesDeep(node.subgraph, out, seen);
    }
    return out;
  }

  function hasTriggerNode() {
    if (!window.app || !window.app.graph) return false;
    const nodes = collectNodesDeep(window.app.graph);
    for (const node of nodes) {
      if (node.type === TRIGGER_NODE_TYPE) return true;
    }
    return false;
  }

  // 在 configure 之前，从工作流 JSON 判断有没有触发节点（含子图定义）
  function workflowHasTrigger(graphData) {
    if (!graphData) return false;
    const seen = new Set();

    function scanList(list) {
      if (!Array.isArray(list)) return false;
      for (const n of list) {
        if (!n) continue;
        if (n.type === TRIGGER_NODE_TYPE) {
          // 节点上的“启用”开关是第一个 widget；旧工作流没有该值 -> 启用
          const raw = n.widgets_values;
          const on = !Array.isArray(raw) || raw.length === 0
            ? true
            : !(raw[0] === false || raw[0] === 0 || raw[0] === "false");
          if (on) return true;
        }
        if (n.subgraph) {
          if (seen.has(n.subgraph)) continue;
          seen.add(n.subgraph);
          const inner = n.subgraph.nodes || n.subgraph;
          if (scanList(inner)) return true;
        }
      }
      return false;
    }

    if (scanList(graphData.nodes)) return true;
    const subs = graphData.definitions && graphData.definitions.subgraphs;
    if (Array.isArray(subs)) {
      for (const s of subs) {
        if (!s) continue;
        if (scanList(s.nodes)) return true;
      }
    }
    return false;
  }

  // 通知 ComfyUI 图变了，让 usePartnerNodesInGraph 的 computed 立刻重算
  function notifyGraphChanged() {
    try {
      const api =
        (window.comfyAPI && window.comfyAPI.api && window.comfyAPI.api.api) ||
        (window.app && window.app.api);
      if (api && typeof api.dispatchEvent === "function") {
        api.dispatchEvent(new CustomEvent("graphChanged"));
      }
    } catch (e) { /* ignore */ }
  }

  // 返回是否真的改了值
  function applyFlag(shouldHide) {
    const state = findPinia();
    if (!state) return false;
    const nodeDefs = state.nodeDef && state.nodeDef.nodeDefsByName;
    if (!nodeDefs) return false;

    // 第一次记录"原始就是 api_node"的节点名；此时还没改过任何值
    if (realApiNodeNames === null) {
      const names = [];
      for (const name in nodeDefs) {
        if (nodeDefs[name] && nodeDefs[name].api_node === true) names.push(name);
      }
      if (names.length === 0) return false; // 节点定义还没就绪，等下一次
      realApiNodeNames = names;
    }

    let changed = false;
    const want = !shouldHide;
    for (const name of realApiNodeNames) {
      const def = nodeDefs[name];
      if (!def) continue;
      if (def.api_node !== want) {
        def.api_node = want;
        changed = true;
      }
    }
    return changed;
  }

  function refresh(forcedShouldHide) {
    try {
      const shouldHide = forcedShouldHide === undefined ? hasTriggerNode() : forcedShouldHide;
      if (applyFlag(shouldHide)) notifyGraphChanged();
    } catch (e) { /* ignore */ }
  }

  // 1) 加载工作流：在 configure 之前就按 JSON 判定，提醒不会先冒出来
  try {
    const ext = window.app || (window.comfyAPI && window.comfyAPI.app && window.comfyAPI.app.app);
    if (ext && typeof ext.registerExtension === "function") {
      ext.registerExtension({
        name: "Practical-Tools.HidePartnerLoginReminder",
        beforeConfigureGraph(graphData) {
          refresh(workflowHasTrigger(graphData));
        },
        afterConfigureGraph() {
          refresh(); // 兜底：以实际图为准
        }
      });
    }
  } catch (e) { /* ignore */ }

  // 2) 编辑期间手动增删触发节点也要跟着变
  setInterval(function () { refresh(); }, 1000);

  // 3) 启动先跑一次
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { refresh(); });
  } else {
    refresh();
  }
})();
