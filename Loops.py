# wcx_Loops.py — 增量式循环节点（For / While Loop）
from comfy_execution.graph_utils import GraphBuilder, is_link

try:
    from comfy_execution.graph import ExecutionBlocker
except Exception:
    ExecutionBlocker = None

try:
    from nodes import NODE_CLASS_MAPPINGS as ALL_NODE_CLASS_MAPPINGS
except Exception:
    ALL_NODE_CLASS_MAPPINGS = {}

# 携带值数量（与 EasyUse 一致，可传 20 个值，含 index）
MAX_FLOW_NUM = 20


class AlwaysEqualProxy(str):
    """任意类型通配（pythongosssss 技巧）：与任何类型相等。"""
    def __eq__(self, _):
        return True

    def __ne__(self, _):
        return False


any_type = AlwaysEqualProxy("*")
WFLOW = "WFLOW_CONTROL"  # 循环控制流类型（仅 Start/End 之间匹配）


def _bypass_values(kwargs):
    """读 initial_value0..N（缺省 None）。"""
    return tuple(kwargs.get("initial_value%d" % i) for i in range(MAX_FLOW_NUM))


class wcx_WhileLoopStart:
    """While 循环起始：condition 为真则放行循环体，为假则整体阻断。"""

    @classmethod
    def INPUT_TYPES(cls):
        inputs = {
            "required": {
                "condition": ("BOOLEAN", {"default": True}),
            },
            "optional": {},
        }
        for i in range(MAX_FLOW_NUM):
            inputs["optional"]["initial_value%d" % i] = (any_type,)
        return inputs

    RETURN_TYPES = (WFLOW,) + (any_type,) * MAX_FLOW_NUM
    RETURN_NAMES = ("flow",) + tuple("value%d" % i for i in range(MAX_FLOW_NUM))
    FUNCTION = "while_loop_open"
    CATEGORY = "Practical-Tools/Logic"

    def while_loop_open(self, condition, **kwargs):
        values = _bypass_values(kwargs)
        if condition:
            return ("stub",) + values
        # 条件不满足：所有携带值阻断，循环体被跳过
        blockers = tuple(ExecutionBlocker(None) for _ in range(MAX_FLOW_NUM))
        return ("stub",) + blockers


class wcx_WhileLoopEnd:
    """While 循环结束：condition 为假则收尾返回；为真则增量展开下一轮循环体。"""

    @classmethod
    def INPUT_TYPES(cls):
        inputs = {
            "required": {
                "flow": (WFLOW, {"rawLink": True}),
                "condition": ("BOOLEAN", {}),
            },
            "optional": {},
            "hidden": {
                "dynprompt": "DYNPROMPT",
                "unique_id": "UNIQUE_ID",
            },
        }
        for i in range(MAX_FLOW_NUM):
            inputs["optional"]["initial_value%d" % i] = (any_type,)
        return inputs

    RETURN_TYPES = (any_type,) * MAX_FLOW_NUM
    RETURN_NAMES = tuple("value%d" % i for i in range(MAX_FLOW_NUM))
    FUNCTION = "while_loop_close"
    CATEGORY = "Practical-Tools/Logic"

    # ---- 增量展开辅助 ----

    def _explore_dependencies(self, node_id, dynprompt, upstream, parent_ids):
        """从 End 反向收集上游依赖，构建依赖表；跳过其他循环端点。"""
        node_info = dynprompt.get_node(node_id)
        if "inputs" not in node_info:
            return
        for _k, v in node_info["inputs"].items():
            if not is_link(v):
                continue
            parent_id = v[0]
            display_id = dynprompt.get_display_node_id(parent_id)
            display_node = dynprompt.get_node(display_id)
            class_type = display_node["class_type"]
            if class_type not in ("wcx_ForLoopEnd", "wcx_WhileLoopEnd"):
                parent_ids.append(display_id)
            if parent_id not in upstream:
                upstream[parent_id] = []
                self._explore_dependencies(parent_id, dynprompt, upstream, parent_ids)
            upstream[parent_id].append(node_id)

    def _explore_output_nodes(self, dynprompt, upstream, output_nodes, parent_ids):
        """把循环体内 OUTPUT_NODE 的真实画布 id 补进依赖链（子图场景）。"""
        for parent_id in upstream:
            display_id = dynprompt.get_display_node_id(parent_id)
            for output_id in output_nodes:
                source_id = output_nodes[output_id][0]
                if (
                    source_id in parent_ids
                    and display_id == source_id
                    and output_id not in upstream[parent_id]
                ):
                    if "." in parent_id:
                        arr = parent_id.split(".")
                        arr[-1] = output_id
                        upstream[parent_id].append(".".join(arr))
                    else:
                        upstream[parent_id].append(output_id)

    def _collect_contained(self, node_id, upstream, contained):
        """收集 open -> close 之间的全部循环体节点。"""
        if node_id not in upstream:
            return
        for child_id in upstream[node_id]:
            if child_id not in contained:
                contained[child_id] = True
                self._collect_contained(child_id, upstream, contained)

    # ---- 主逻辑 ----

    def while_loop_close(self, flow, condition, dynprompt=None, unique_id=None, **kwargs):
        if not condition:
            # 循环结束：返回当前携带值
            return _bypass_values(kwargs)

        # 继续下一轮：复制一轮循环体
        this_node = dynprompt.get_node(unique_id)
        open_node = flow[0]
        upstream = {}
        parent_ids = []
        self._explore_dependencies(unique_id, dynprompt, upstream, parent_ids)
        parent_ids = list(set(parent_ids))

        # 定位循环体内 OUTPUT_NODE 节点（输出正确性）
        prompts = dynprompt.get_original_prompt()
        output_nodes = {}
        for node_id, node in prompts.items():
            if "inputs" not in node:
                continue
            class_def = ALL_NODE_CLASS_MAPPINGS.get(node["class_type"])
            if class_def is not None and getattr(class_def, "OUTPUT_NODE", False):
                for _k, v in node["inputs"].items():
                    if is_link(v):
                        output_nodes[node_id] = v

        graph = GraphBuilder()
        self._explore_output_nodes(dynprompt, upstream, output_nodes, parent_ids)
        contained = {}
        self._collect_contained(open_node, upstream, contained)
        contained[unique_id] = True
        contained[open_node] = True

        # 建一轮拷贝；End 自身复制为 "Recurse"（下一轮的 End）
        for node_id in contained:
            original = dynprompt.get_node(node_id)
            node = graph.node(
                original["class_type"],
                "Recurse" if node_id == unique_id else node_id,
            )
            node.set_override_display_id(node_id)
        # 重连拷贝的内部边
        for node_id in contained:
            original = dynprompt.get_node(node_id)
            node = graph.lookup_node("Recurse" if node_id == unique_id else node_id)
            for k, v in original["inputs"].items():
                if is_link(v) and v[0] in contained:
                    node.set_input(k, graph.lookup_node(v[0]).out(v[1]))
                else:
                    node.set_input(k, v)

        # 新一轮的携带值 = 本 End 收到的值
        new_open = graph.lookup_node(open_node)
        for i in range(MAX_FLOW_NUM):
            new_open.set_input("initial_value%d" % i, kwargs.get("initial_value%d" % i))

        my_clone = graph.lookup_node("Recurse")
        result = tuple(my_clone.out(i) for i in range(MAX_FLOW_NUM))
        return {"result": result, "expand": graph.finalize()}


class wcx_ForLoopStart:
    """For 循环起始：total 次迭代。展开出 While 循环骨架 + 携带值。"""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "total": ("INT", {"default": 1, "min": 1, "max": 100000, "step": 1}),
            },
            "optional": {
                "initial_value%d" % i: (any_type,) for i in range(1, MAX_FLOW_NUM)
            },
            "hidden": {
                "initial_value0": (any_type,),
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = (WFLOW, "INT") + (any_type,) * (MAX_FLOW_NUM - 1)
    RETURN_NAMES = ("flow", "index") + tuple(
        "value%d" % i for i in range(1, MAX_FLOW_NUM)
    )
    FUNCTION = "for_loop_start"
    CATEGORY = "Practical-Tools/Logic"

    def for_loop_start(self, total, prompt=None, extra_pnginfo=None, unique_id=None, **kwargs):
        graph = GraphBuilder()
        start_index = kwargs.get("initial_value0", 0)
        initial_values = {
            "initial_value%d" % num: kwargs.get("initial_value%d" % num)
            for num in range(1, MAX_FLOW_NUM)
        }
        # 展开出 While 骨架：condition=total（非零即真），首轮 index=start_index
        graph.node(
            "wcx_WhileLoopStart",
            condition=total,
            initial_value0=start_index,
            **initial_values,
        )
        outputs = [
            kwargs.get("initial_value%d" % num) for num in range(1, MAX_FLOW_NUM)
        ]
        return {
            "result": ("stub", start_index) + tuple(outputs),
            "expand": graph.finalize(),
        }


class wcx_LoopStep:
    """For 循环内部计数：next_index = index + step；continue = next_index < total。"""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "index": ("INT", {}),
                "total": ("INT", {}),
            },
            "optional": {
                "step": ("INT", {"default": 1, "min": 1, "max": 100000, "step": 1}),
            },
        }

    RETURN_TYPES = ("INT", "BOOLEAN")
    RETURN_NAMES = ("next_index", "continue")
    FUNCTION = "step"
    CATEGORY = "Practical-Tools/Logic"

    def step(self, index, total, step=1):
        try:
            ni = int(index) + int(step)
            keep = ni < int(total)
        except (TypeError, ValueError):
            return (index, False)
        return (ni, keep)


class wcx_ForLoopEnd:
    """For 循环结束：每轮结束时计算 index+1，条件满足则展开下一轮。"""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "flow": (WFLOW, {"rawLink": True}),
            },
            "optional": {
                "initial_value%d" % i: (any_type, {"rawLink": True})
                for i in range(1, MAX_FLOW_NUM)
            },
            "hidden": {
                "dynprompt": "DYNPROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = (any_type,) * (MAX_FLOW_NUM - 1)
    RETURN_NAMES = tuple("value%d" % i for i in range(1, MAX_FLOW_NUM))
    FUNCTION = "for_loop_end"
    CATEGORY = "Practical-Tools/Logic"

    def for_loop_end(self, flow, dynprompt=None, extra_pnginfo=None, unique_id=None, **kwargs):
        graph = GraphBuilder()
        while_open = flow[0]
        try:
            start_node = dynprompt.get_node(while_open)
        except Exception:
            start_node = {}

        if start_node.get("class_type") == "wcx_ForLoopStart":
            total = start_node["inputs"]["total"]
        else:
            # 连错/极端情况：直接透传当前值，结束循环
            return tuple(kwargs.get("initial_value%d" % i) for i in range(1, MAX_FLOW_NUM))

        # 下一轮 index = index+1（index 是 ForLoopStart 的 socket 1）
        step = graph.node(
            "wcx_LoopStep",
            index=[while_open, 1],
            total=total,
            step=1,
        )
        next_index = step.out(0)
        keep_going = step.out(1)
        values = {
            "initial_value%d" % num: kwargs.get("initial_value%d" % num)
            for num in range(1, MAX_FLOW_NUM)
        }
        while_close = graph.node(
            "wcx_WhileLoopEnd",
            flow=flow,
            condition=keep_going,
            initial_value0=next_index,
            **values,
        )
        result = tuple(while_close.out(i) for i in range(1, MAX_FLOW_NUM))
        return {"result": result, "expand": graph.finalize()}


NODE_CLASS_MAPPINGS = {
    "wcx_ForLoopStart": wcx_ForLoopStart,
    "wcx_ForLoopEnd": wcx_ForLoopEnd,
    "wcx_WhileLoopStart": wcx_WhileLoopStart,
    "wcx_WhileLoopEnd": wcx_WhileLoopEnd,
    "wcx_LoopStep": wcx_LoopStep,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_ForLoopStart": "For Loop Start",
    "wcx_ForLoopEnd": "For Loop End",
    "wcx_WhileLoopStart": "While Loop Start",
    "wcx_WhileLoopEnd": "While Loop End",
    "wcx_LoopStep": "Loop Step",
}
