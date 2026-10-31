// hide_partner_node_login_reminder.js — 检测当前工作流有没有触发节点，决定是否隐藏合作伙伴节点登录提醒
//
// 原理：每 1 秒检测一次当前工作流里有没有 "wcx_Apply_Hide_Partner_Login_Reminder" 节点，
//       如果有，就把本来就是 api_node 的节点的 api_node 属性改成 false；
//       如果没有，就把它们恢复成 true。普通节点不动。

(function () {
  "use strict";

  const TRIGGER_NODE_TYPE = "wcx_Apply_Hide_Partner_Login_Reminder";
  let piniaState = null;
  // 保存本来就是 api_node 的节点列表
  let realApiNodeNames = null;

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
      if (node.type === TRIGGER_NODE_TYPE) {
        return true;
      }
    }
    return false;
  }

  function patchNodeDefs() {
    const state = findPinia();
    if (!state) return;

    const nodeDefs = state.nodeDef.nodeDefsByName;
    const shouldHide = hasTriggerNode();

    // 找出所有本来就是 api_node 的节点（如果还没找到，就一直找，直到找到至少一个）
    if (realApiNodeNames === null || realApiNodeNames.length === 0) {
      realApiNodeNames = [];
      for (const name in nodeDefs) {
        if (nodeDefs[name].api_node === true) {
          realApiNodeNames.push(name);
        }
      }
    }

    // 只改那些本来就是 api_node 的节点，普通节点不动
    for (const name of realApiNodeNames) {
      if (nodeDefs[name]) {
        nodeDefs[name].api_node = shouldHide ? false : true;
      }
    }
  }

  function start() {
    patchNodeDefs();
    // 每 1 秒检测一次
    setInterval(patchNodeDefs, 1000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
