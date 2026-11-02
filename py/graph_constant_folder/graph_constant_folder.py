import os
import time
import json
import logging
import re
import hashlib
import inspect
import asyncio
from typing import Any, Dict, Tuple, Optional, Set, List

_LOG_PREFIX = "[GraphConstantFolder]"
_NOT_FOLDABLE = object()

def _log_info(msg: str) -> None:
	if not globals().get("_LOG", True):
		return
	logging.info(f"{_LOG_PREFIX} {msg}")

def _log_alert(msg: str) -> None:
	# 仅用于出错或功能没能启用，不受日志开关影响
	logging.warning(f"{_LOG_PREFIX} {msg}")

def _log_debug(msg: str) -> None:
	if _DEBUG or _VERBOSE:
		logging.info(f"{_LOG_PREFIX} {msg}")

def _log_verbose(msg: str) -> None:
	if _VERBOSE:
		logging.info(f"{_LOG_PREFIX} {msg}")

def _load_local_config() -> Dict[str, Any]:
	path = os.path.join(os.path.dirname(__file__), "graph_constant_folder_config.json")
	if not os.path.isfile(path):
		return {}

	try:
		with open(path, "r", encoding="utf-8") as f:
			cfg = json.load(f)
		return (cfg if isinstance(cfg, dict) else {})
	except Exception as e:
		_log_alert(f"failed to read config file '{path}': {e}")
		return {}

def _truthy_str(v: str) -> bool:
	return v.strip() in ("1", "true", "True", "yes", "YES", "on", "ON")

def _falsy_str(v: str) -> bool:
	return v.strip() in ("0", "false", "False", "no", "NO", "off", "OFF", "")

def _cfg_flag(cfg: Dict[str, Any], cfg_key: str, default: bool) -> bool:
	if cfg_key in cfg:
		v = cfg.get(cfg_key)
		if isinstance(v, bool):
			return v
		if isinstance(v, (int, float)):
			return bool(v)
		if isinstance(v, str):
			if _falsy_str(v):
				return False
			if _truthy_str(v):
				return True
			return True

	return default

_CFG = _load_local_config()

# 只读同目录下的 graph_constant_folder_config.json，不读环境变量
_ENABLED = _cfg_flag(_CFG, "ENABLED", default=True)
_DEBUG = _cfg_flag(_CFG, "DEBUG", default=False)
_VERBOSE = _cfg_flag(_CFG, "VERBOSE", default=False)
_PRUNE = _cfg_flag(_CFG, "PRUNE", default=False)
_BUS_FOLD = _cfg_flag(_CFG, "BUS_FOLD", default=False)
_LOG = _cfg_flag(_CFG, "LOG", default=True)
_FAST_CACHE = _cfg_flag(_CFG, "FAST_CACHE", default=False)

_FAST_CACHE_INSTALLED = False
_FAST_CACHE_DISABLED = False
_CACHING = None
_FAST_CACHE_AUTOCHECK = _cfg_flag(_CFG, "FAST_CACHE_AUTOCHECK", default=True)
_FAST_CACHE_FORCE = _cfg_flag(_CFG, "FAST_CACHE_FORCE", default=False)
_FAST_CACHE_EXPECTED_FINGERPRINT = "b23380b4f2d1f1b32506df92ae15ed072f7b42b173069346affc08de3d37a1e3"
_REQUIRE_MARKER = _cfg_flag(_CFG, "REQUIRE_MARKER", default=_cfg_flag(_CFG, "FAST_CACHE_REQUIRE_MARKER", default=True))
_FAST_CACHE_MARKER_CLASS = "wcx_Apply_GraphConstantFolderFastCache"
_PRUNE_PROTECT_CLASSES = {_FAST_CACHE_MARKER_CLASS}
_PT_PRUNE_PROTECT = _CFG.get("PRUNE_PROTECT", None)
if isinstance(_PT_PRUNE_PROTECT, list):
	_PRUNE_PROTECT_CLASSES.update(str(x) for x in _PT_PRUNE_PROTECT if x)

# --- constant resolution -----------------------------------------------------

_DEFAULT_CONST_CLASS_RE = r"(?i)(?:primitive|constant|literal|bool\s*primitive|int\s*primitive|float\s*primitive)"
_CONST_CLASS_TYPES = _CFG.get("CONST_CLASS_TYPES", None)
_CONST_CLASS_RE = re.compile(_CONST_CLASS_TYPES if isinstance(_CONST_CLASS_TYPES, str) and _CONST_CLASS_TYPES else _DEFAULT_CONST_CLASS_RE)
_GENERIC_SWITCH_CLASS_RE = re.compile(r"(?i)(switch|index|select|condition|route|branch|choice)")
_RETURN_TYPES_CACHE: Dict[str, bool] = {}
_ANY_COMPARE_OPS = {
	"a == b": "==",
	"a != b": "!=",
	"a > b": ">",
	"a >= b": ">=",
	"a < b": "<",
	"a <= b": "<=",
}

try:
	from comfy_execution.graph_utils import is_link as _is_link
except Exception:
	def _is_link(v: Any) -> bool:
		return isinstance(v, list) and len(v) == 2 and isinstance(v[1], int)

def _coerce_bool(v: Any) -> Optional[bool]:
	if isinstance(v, bool):
		return v
	if isinstance(v, int) and not isinstance(v, bool):
		if v in (0, 1):
			return bool(v)
		return None
	if isinstance(v, float):
		if v == 0.0:
			return False
		if v == 1.0:
			return True
		return None
	if isinstance(v, str):
		s = v.strip().lower()
		if s in ("true", "yes", "on", "1"):
			return True
		if s in ("false", "no", "off", "0", ""):
			return False
	return None

def _coerce_int(v: Any) -> Optional[int]:
	if isinstance(v, bool):
		return None
	if isinstance(v, int):
		return v
	if isinstance(v, float) and v.is_integer():
		return int(v)
	if isinstance(v, str):
		s = v.strip()
		if re.fullmatch(r"[+-]?\d+", s):
			try:
				return int(s)
			except Exception:
				return None
	return None

def _coerce_str(v: Any) -> Optional[str]:
	if isinstance(v, str):
		return v
	return None

def _canonical_class_type(class_type: str) -> str:
	return class_type.split(" | ", 1)[0]

def _strip_enum_comment(line: str) -> str:
	quote_char = None
	escaped = False
	i = 0
	while i < len(line):
		ch = line[i]
		next_ch = line[i + 1] if i + 1 < len(line) else ""
		if quote_char is not None:
			if escaped:
				escaped = False
			elif ch == "\\":
				escaped = True
			elif ch == quote_char:
				quote_char = None
			i += 1
			continue

		if ch in ("\"", "'"):
			quote_char = ch
			i += 1
			continue
		if ch == "#":
			return line[:i]
		if ch == "/" and next_ch == "/":
			return line[:i]
		i += 1
	return line

def _read_enum_name(line: str) -> Tuple[Optional[str], str]:
	line = line.strip()
	if not line:
		return (None, "")
	if line[0] not in ("\"", "'"):
		if "=" in line:
			name, rest = line.split("=", 1)
			return (name.strip(), f"={rest.strip()}")
		return (line.strip(), "")

	quote_char = line[0]
	escaped = False
	chars = []
	for i in range(1, len(line)):
		ch = line[i]
		if escaped:
			if ch == "n":
				chars.append("\n")
			elif ch == "t":
				chars.append("\t")
			else:
				chars.append(ch)
			escaped = False
		elif ch == "\\":
			escaped = True
		elif ch == quote_char:
			return ("".join(chars), line[i + 1:].strip())
		else:
			chars.append(ch)
	return (None, "")

def _parse_enum_choice_value(enum_definition: str, choice: str, start: int = 0) -> Optional[int]:
	next_value = start
	for raw_line in enum_definition.splitlines():
		line = _strip_enum_comment(raw_line).strip().rstrip(",;").strip()
		if not line:
			continue

		name, rest = _read_enum_name(line)
		if name is None:
			return None

		if rest:
			if not rest.startswith("="):
				return None
			raw_value = rest[1:].strip().rstrip(",;").strip()
			try:
				next_value = int(raw_value, 0)
			except Exception:
				return None

		value = next_value
		if name == choice:
			return value
		next_value += 1

	return None

def _compare_int_values(op: str, a: int, b: int) -> Optional[bool]:
	normalized_op = op.strip().lower()
	if normalized_op in ("eq", "==", "="):
		return a == b
	if normalized_op in ("ne", "neq", "!=", "<>"):
		return a != b
	if normalized_op in ("gt", ">"):
		return a > b
	if normalized_op in ("gte", "ge", ">="):
		return a >= b
	if normalized_op in ("lt", "<"):
		return a < b
	if normalized_op in ("lte", "le", "<="):
		return a <= b
	return None

def _get_inputs(node: Dict[str, Any]) -> Dict[str, Any]:
	inp = node.get("inputs", None)
	return inp if isinstance(inp, dict) else {}

def _resolve_constant(prompt: Dict[str, Any], value: Any, want: str, cache: Dict[Tuple[str, int, str], Any], depth: int = 12) -> Any:
	# direct literal
	if want == "bool":
		b = _coerce_bool(value)
		if b is not None:
			return b
	elif want == "int":
		i = _coerce_int(value)
		if i is not None:
			return i
	elif want == "str":
		s = _coerce_str(value)
		if s is not None:
			return s
	else:
		return None

	if depth <= 0 or not _is_link(value):
		return None

	src_id = str(value[0])
	out_idx = int(value[1])
	key = (src_id, out_idx, want)
	if key in cache:
		return cache[key]

	node = prompt.get(src_id, None)
	if not isinstance(node, dict):
		cache[key] = None
		return None

	class_type = str(node.get("class_type", ""))
	canonical_class_type = _canonical_class_type(class_type)
	inputs = _get_inputs(node)

	# Reroute-like pass-through
	if "reroute" in class_type.lower():
		link_in = None
		for v in inputs.values():
			if _is_link(v):
				link_in = v
				break
		if link_in is not None:
			res = _resolve_constant(prompt, link_in, want, cache, depth - 1)
			cache[key] = res
			return res

	# Constant-like sources: class name matches AND no linked inputs
	if _CONST_CLASS_RE.search(class_type) and not any(_is_link(v) for v in inputs.values()):
		candidates = []
		for k in (
			"value", "bool", "boolean", "boolean_value", "state", "enabled", "enable",
			"switch", "toggle", "flag", "index", "int", "number", "string", "text"
		):
			if k in inputs:
				candidates.append(inputs.get(k))

		if not candidates and len(inputs) == 1:
			candidates.append(next(iter(inputs.values())))

		for c in candidates:
			if want == "bool":
				res = _coerce_bool(c)
				if res is not None:
					cache[key] = res
					return res
			elif want == "int":
				res = _coerce_int(c)
				if res is not None:
					cache[key] = res
					return res
			elif want == "str":
				res = _coerce_str(c)
				if res is not None:
					cache[key] = res
					return res

	if want == "int" and canonical_class_type in ("EnumCombo", "EnumComboAdvanced") and out_idx == 0:
		choice = _resolve_constant(prompt, inputs.get("choice", None), "str", cache, depth - 1)
		enum_definition = _resolve_constant(prompt, inputs.get("enum_definition", None), "str", cache, depth - 1)
		start = 0
		if canonical_class_type == "EnumComboAdvanced":
			raw_start = _resolve_constant(prompt, inputs.get("start", 0), "int", cache, depth - 1)
			if isinstance(raw_start, int):
				start = raw_start

		if isinstance(choice, str) and isinstance(enum_definition, str):
			res = _parse_enum_choice_value(enum_definition, choice, start)
			if res is not None:
				cache[key] = res
				return res

	# CustomCombo：slot 0 输出选项文本，slot 1 输出选项序号（INT）
	if canonical_class_type == "CustomCombo":
		if want == "int" and out_idx == 1:
			res = _coerce_int(inputs.get("index", None))
			if res is not None:
				cache[key] = res
				return res
		if want == "str" and out_idx == 0:
			res = _coerce_str(inputs.get("choice", None))
			if res is not None:
				cache[key] = res
				return res

	# 本项目 IntPassthrough：单输入直通
	if canonical_class_type == "wcx_IntPassthrough" and want == "int":
		link_in = inputs.get("int", None)
		if _is_link(link_in):
			res = _resolve_constant(prompt, link_in, want, cache, depth - 1)
			if res is not None:
				cache[key] = res
				return res

	# ComfySwitchNode：switch 为常量时按分支取值
	if canonical_class_type == "ComfySwitchNode" and want in ("int", "str", "bool"):
		sw = _resolve_constant(prompt, inputs.get("switch", None), "bool", cache, depth - 1)
		if isinstance(sw, bool):
			branch_key = "on_true" if sw else "on_false"
			res = _resolve_constant(prompt, inputs.get(branch_key, None), want, cache, depth - 1)
			if res is not None:
				cache[key] = res
				return res

	# 本地纯函数：布尔取反 / 布尔直通
	if canonical_class_type == "wcx_BooleanNot" and want == "bool":
		res = _resolve_constant(prompt, inputs.get("布尔值", None), "bool", cache, depth - 1)
		if isinstance(res, bool):
			cache[key] = not res
			return not res

	if canonical_class_type == "wcx_BoolPassthrough" and want == "bool":
		res = _resolve_constant(prompt, inputs.get("boolean", None), "bool", cache, depth - 1)
		if isinstance(res, bool):
			cache[key] = res
			return res

	# 本地比较节点
	if canonical_class_type == "wcx_AnyCompare" and want == "bool":
		op = _resolve_constant(prompt, inputs.get("comparison", "a == b"), "str", cache, depth - 1)
		a = _resolve_constant(prompt, inputs.get("a", None), "int", cache, depth - 1)
		b = _resolve_constant(prompt, inputs.get("b", None), "int", cache, depth - 1)
		if isinstance(op, str) and isinstance(a, int) and isinstance(b, int):
			res = _compare_int_values(_ANY_COMPARE_OPS.get(op, op), a, b)
			if res is not None:
				cache[key] = res
				return res

	# 本地类型转换：只处理明确等价的情况
	if canonical_class_type == "wcx_AnyConvert":
		output_type = _resolve_constant(prompt, inputs.get("output_type", None), "str", cache, depth - 1)
		if output_type == "boolean" and want == "bool":
			res = _resolve_constant(prompt, inputs.get("any", None), "bool", cache, depth - 1)
			if isinstance(res, bool):
				cache[key] = res
				return res
		if output_type == "int" and want == "int":
			res = _resolve_constant(prompt, inputs.get("any", None), "int", cache, depth - 1)
			if isinstance(res, int) and not isinstance(res, bool):
				cache[key] = res
				return res
		if output_type == "string" and want == "str":
			res = _resolve_constant(prompt, inputs.get("any", None), "str", cache, depth - 1)
			if isinstance(res, str):
				cache[key] = res
				return res

	# BusOut -> BusIn 的定点解析，避免总线遮断常量链
	if canonical_class_type == "wcx_BusOut":
		bus = inputs.get("总线束", None)
		if _is_link(bus):
			src = prompt.get(str(bus[0]), None)
			if isinstance(src, dict) and _canonical_class_type(str(src.get("class_type", ""))) in ("wcx_BusIn", "WCXBusIn"):
				src_inputs = _get_inputs(src)
				res = _resolve_constant(prompt, _bus_input_links(src_inputs).get(int(out_idx), None), want, cache, depth - 1)
				if res is not None:
					cache[key] = res
					return res

	if want == "bool" and canonical_class_type == "CM_IntBinaryCondition" and out_idx == 0:
		op = _resolve_constant(prompt, inputs.get("op", None), "str", cache, depth - 1)
		a = _resolve_constant(prompt, inputs.get("a", None), "int", cache, depth - 1)
		b = _resolve_constant(prompt, inputs.get("b", None), "int", cache, depth - 1)
		if isinstance(op, str) and isinstance(a, int) and isinstance(b, int):
			res = _compare_int_values(op, a, b)
			if res is not None:
				cache[key] = res
				return res

	cache[key] = None
	return None

# --- folding rules -----------------------------------------------------------

def _try_fold_bool_switch(prompt: Dict[str, Any], node_inputs: Dict[str, Any], cache: Dict[Tuple[str, int, str], Any], decision_key: str, false_key: str, true_key: str) -> Any:
	switch_raw = node_inputs.get(decision_key, None)
	switch = _resolve_constant(prompt, switch_raw, "bool", cache)
	if not isinstance(switch, bool):
		return _NOT_FOLDABLE

	if false_key not in node_inputs or true_key not in node_inputs:
		return _NOT_FOLDABLE

	return (node_inputs.get(true_key) if switch else node_inputs.get(false_key))

def _try_fold_index_switch(prompt: Dict[str, Any], node_inputs: Dict[str, Any], cache: Dict[Tuple[str, int, str], Any], decision_key: str, value_prefix: str) -> Any:
	index_raw = node_inputs.get(decision_key, None)
	index = _resolve_constant(prompt, index_raw, "int", cache)
	if not isinstance(index, int):
		return _NOT_FOLDABLE

	# 兼容 value0 / value_0 两种命名
	for key in (f"{value_prefix}_{index}", f"{value_prefix}{index}"):
		if key in node_inputs:
			return node_inputs.get(key)

	return _NOT_FOLDABLE

def _try_fold_fallback_switch(prompt: Dict[str, Any], node_inputs: Dict[str, Any], cache: Dict[Tuple[str, int, str], Any]) -> Any:
	index_raw = node_inputs.get("index", None)
	index = _resolve_constant(prompt, index_raw, "int", cache)
	if not isinstance(index, int):
		return _NOT_FOLDABLE

	for key in (f"values.value{index}", f"value{index}"):
		if key in node_inputs:
			return node_inputs.get(key)

	if "default" in node_inputs:
		return node_inputs.get("default")

	return _NOT_FOLDABLE

def _try_fold_lazy_conditional(prompt: Dict[str, Any], node_inputs: Dict[str, Any], cache: Dict[Tuple[str, int, str], Any]) -> Any:
	cond_idxs = []
	for k in node_inputs.keys():
		m = re.fullmatch(r"condition(\d+)", str(k))
		if m:
			cond_idxs.append(int(m.group(1)))

	if not cond_idxs:
		return _NOT_FOLDABLE

	for i in sorted(cond_idxs):
		cond_key = f"condition{i}"
		cond_val_raw = node_inputs.get(cond_key, None)
		cond_val = _resolve_constant(prompt, cond_val_raw, "bool", cache)
		if not isinstance(cond_val, bool):
			return _NOT_FOLDABLE

		if cond_val:
			val_key = f"value{i}"
			if val_key not in node_inputs:
				return _NOT_FOLDABLE
			return node_inputs.get(val_key)

	if "else" in node_inputs:
		return node_inputs.get("else")

	return _NOT_FOLDABLE

def _has_keys(d: Dict[str, Any], keys: List[str]) -> bool:
	for k in keys:
		if k not in d:
			return False
	return True

def _is_bool_switch_like(inputs: Dict[str, Any], class_type: str) -> bool:
	if not _GENERIC_SWITCH_CLASS_RE.search(class_type or ""):
		return False
	if _has_keys(inputs, ["switch", "on_true", "on_false"]):
		return True
	if _has_keys(inputs, ["condition", "if_true", "if_false"]):
		return True
	return False

_INDEX_MIN_CACHE: Dict[str, Optional[int]] = {}

def _index_min_for_class(class_type: str) -> Optional[int]:
	# 取该类 index 输入的最小值；读不到返回 None，按原逻辑继续折叠
	if class_type in _INDEX_MIN_CACHE:
		return _INDEX_MIN_CACHE[class_type]
	value: Optional[int] = None
	try:
		import nodes as comfy_nodes
		mappings = getattr(comfy_nodes, "NODE_CLASS_MAPPINGS", None) or {}
		class_def = mappings.get(class_type, None)
		make_inputs = getattr(class_def, "INPUT_TYPES", None)
		if callable(make_inputs):
			spec = make_inputs() or {}
			for section in ("required", "optional"):
				fields = spec.get(section, None) or {}
				if "index" in fields:
					meta = fields.get("index", None)
					if isinstance(meta, (list, tuple)) and len(meta) > 1 and isinstance(meta[1], dict):
						mn = meta[1].get("min", None)
						if isinstance(mn, (int, float)) and not isinstance(mn, bool):
							value = int(mn)
					break
	except Exception:
		value = None
	_INDEX_MIN_CACHE[class_type] = value
	return value

def _is_index_switch_like(inputs: Dict[str, Any], class_type: str) -> bool:
	if not _GENERIC_SWITCH_CLASS_RE.search(class_type or ""):
		return False
	if "index" in inputs:
		if "value0" in inputs and "value1" in inputs:
			return True
		# 本项目 AnyIndex 家族的端口命名是 value_0 / value_1 ...
		if "value_0" in inputs and "value_1" in inputs:
			return True
	return False

def _class_single_output(class_type: str) -> bool:
	if class_type in _RETURN_TYPES_CACHE:
		return _RETURN_TYPES_CACHE[class_type]
	value = False
	try:
		import nodes as comfy_nodes
		class_def = (getattr(comfy_nodes, "NODE_CLASS_MAPPINGS", None) or {}).get(class_type, None)
		return_types = getattr(class_def, "RETURN_TYPES", None)
		value = isinstance(return_types, (list, tuple)) and len(return_types) == 1
	except Exception:
		value = False
	_RETURN_TYPES_CACHE[class_type] = value
	return value


def _constant_fold_switches(prompt: Dict[str, Any], skip_ids: Optional[Set[str]] = None) -> Tuple[Dict[str, Any], int, int, List[str]]:
	# Returns (replacements, fold_count, candidates, not_foldable_messages)
	replacements: Dict[str, Any] = {}
	fold_count = 0
	candidates = 0
	cache: Dict[Tuple[str, int, str], Any] = {}
	not_foldable: List[str] = []
	skip_ids = skip_ids if skip_ids is not None else set()

	for node_id, node in prompt.items():
		if str(node_id) in skip_ids:
			continue
		if not isinstance(node, dict):
			continue

		class_type = str(node.get("class_type", ""))
		canonical_class_type = _canonical_class_type(class_type)
		inputs = _get_inputs(node)

		kind = None

		# Known lazy nodes
		if canonical_class_type in ("LazySwitch", "LazyIndexSwitch", "LazyConditional"):
			kind = canonical_class_type
		elif canonical_class_type == "LazySwitchKJ":
			kind = "LazySwitch"
		elif canonical_class_type == "wcx_LinkSwitch":
			kind = "LinkGate"
		elif canonical_class_type in ("SparknightLazyFallbackSwitch", "SparknightLazyFallbackSwitchStatic"):
			kind = "LazyFallbackSwitch"

		# Switch-like nodes (non-lazy)
		elif _is_bool_switch_like(inputs, canonical_class_type):
			kind = "BoolSwitchLike"
		elif _is_index_switch_like(inputs, canonical_class_type):
			kind = "IndexSwitchLike"

		if kind is None:
			continue

		if not _class_single_output(canonical_class_type):
			if _VERBOSE:
				not_foldable.append(f"skip: {class_type} #{node_id} (not a single-output node)")
			continue

		candidates += 1
		replacement = _NOT_FOLDABLE

		if kind in ("LazySwitch", "BoolSwitchLike"):
			if _has_keys(inputs, ["switch", "on_true", "on_false"]):
				replacement = _try_fold_bool_switch(prompt, inputs, cache, "switch", "on_false", "on_true")
			elif _has_keys(inputs, ["condition", "if_true", "if_false"]):
				replacement = _try_fold_bool_switch(prompt, inputs, cache, "condition", "if_false", "if_true")

			if replacement is _NOT_FOLDABLE and _VERBOSE:
				not_foldable.append(f"not foldable: {class_type} #{node_id} (decision input not constant)")

		elif kind == "LinkGate":
			# wcx_LinkSwitch：单输入闸门。开关为常量时：True 直通，False 输出 None
			_decision = _resolve_constant(prompt, inputs.get("开关", None), "bool", cache)
			if isinstance(_decision, bool):
				replacement = inputs.get("输入", None) if _decision else None
			if replacement is _NOT_FOLDABLE and _VERBOSE:
				not_foldable.append(f"not foldable: {class_type} #{node_id} (开关 is not a constant)")

		elif kind in ("LazyIndexSwitch", "IndexSwitchLike"):
			index_min = _index_min_for_class(canonical_class_type)
			if index_min is not None and index_min != 0:
				if _VERBOSE:
					not_foldable.append(f"skip: {class_type} #{node_id} (index min is {index_min}, not 0-based)")
			else:
				replacement = _try_fold_index_switch(prompt, inputs, cache, "index", "value")
				if replacement is _NOT_FOLDABLE and _VERBOSE:
					not_foldable.append(f"not foldable: {class_type} #{node_id} (decision input not constant or missing valueN)")

		elif kind == "LazyFallbackSwitch":
			replacement = _try_fold_fallback_switch(prompt, inputs, cache)
			if replacement is _NOT_FOLDABLE and _VERBOSE:
				not_foldable.append(f"not foldable: {class_type} #{node_id} (decision input not constant or fallback missing)")

		elif kind == "LazyConditional":
			replacement = _try_fold_lazy_conditional(prompt, inputs, cache)
			if replacement is _NOT_FOLDABLE and _VERBOSE:
				not_foldable.append(f"not foldable: {class_type} #{node_id} (conditions not constant)")

		if replacement is _NOT_FOLDABLE:
			continue

		replacements[str(node_id)] = replacement
		fold_count += 1

	return (replacements, fold_count, candidates, not_foldable)

def _resolve_replacement_chain(replacements: Dict[str, Any], value: Any) -> Any:
	seen: Set[str] = set()
	v = value
	while _is_link(v):
		src = str(v[0])
		if src in seen or src not in replacements:
			break
		seen.add(src)
		v = replacements[src]
	return v

def _rewrite_value(value: Any, replacements: Dict[str, Any]) -> Tuple[Any, bool]:
	if _is_link(value):
		src_id = str(value[0])
		out_idx = value[1]
		if out_idx == 0 and src_id in replacements:
			new_v = _resolve_replacement_chain(replacements, replacements[src_id])
			if new_v != value:
				return (new_v, True)
		return (value, False)

	if isinstance(value, list):
		changed_any = False
		new_list = []
		for v in value:
			new_v, changed = _rewrite_value(v, replacements)
			new_list.append(new_v)
			changed_any = changed_any or changed
		return (new_list if changed_any else value, changed_any)

	if isinstance(value, dict):
		changed_any = False
		new_dict = {}
		for k, v in value.items():
			new_v, changed = _rewrite_value(v, replacements)
			new_dict[k] = new_v
			changed_any = changed_any or changed
		return (new_dict if changed_any else value, changed_any)

	return (value, False)

def _apply_replacements(prompt: Dict[str, Any], replacements: Dict[str, Any]) -> Set[str]:
	changed_nodes: Set[str] = set()
	for node_id, node in prompt.items():
		if not isinstance(node, dict):
			continue
		inputs = node.get("inputs", None)
		if not isinstance(inputs, dict):
			continue
		new_inputs, changed = _rewrite_value(inputs, replacements)
		if changed:
			node["inputs"] = new_inputs
			changed_nodes.add(str(node_id))
	return changed_nodes

def _walk_upstream(prompt: Dict[str, Any], start_nodes: Set[str]) -> Set[str]:
	reachable: Set[str] = set()
	stack = list(start_nodes)
	while stack:
		nid = str(stack.pop())
		if nid in reachable:
			continue
		reachable.add(nid)
		node = prompt.get(nid, None)
		if not isinstance(node, dict):
			continue
		inputs = node.get("inputs", None)
		if not isinstance(inputs, dict):
			continue

		def push_link(v: Any) -> None:
			if _is_link(v):
				stack.append(str(v[0]))
			elif isinstance(v, list):
				for vv in v:
					if _is_link(vv):
						stack.append(str(vv[0]))
			elif isinstance(v, dict):
				for vv in v.values():
					if _is_link(vv):
						stack.append(str(vv[0]))

		for v in inputs.values():
			push_link(v)

	return reachable

def _collect_outputs(prompt: Dict[str, Any], prefer_targets: Optional[Set[str]] = None) -> Set[str]:
	if prefer_targets:
		return set(str(x) for x in prefer_targets)

	try:
		import nodes as comfy_nodes
	except Exception:
		return set()

	outputs: Set[str] = set()
	for node_id, node in prompt.items():
		class_type = node.get("class_type", None)
		if not class_type:
			continue
		class_def = comfy_nodes.NODE_CLASS_MAPPINGS.get(class_type, None)
		if class_def is None:
			continue
		if getattr(class_def, "OUTPUT_NODE", False) is True:
			outputs.add(str(node_id))
	return outputs

def _extract_partial_targets(json_data: Dict[str, Any]) -> Optional[Set[str]]:
	for k in ("partial_execution_targets", "partial_execution_list", "partial_execution_nodes", "partial_execution"):
		v = json_data.get(k, None)
		if isinstance(v, list) and v:
			try:
				return set(str(x) for x in v)
			except Exception:
				continue
	return None

def _first_unknown_class(prompt: Dict[str, Any]) -> Optional[str]:
	try:
		import nodes as comfy_nodes
	except Exception:
		return "__import_nodes_failed__"
	mappings = getattr(comfy_nodes, "NODE_CLASS_MAPPINGS", None) or {}
	for node in prompt.values():
		if not isinstance(node, dict):
			continue
		class_type = node.get("class_type", None)
		if class_type and class_type not in mappings:
			return str(class_type)
	return None


def _first_loop_boundary(prompt: Dict[str, Any]) -> Optional[Tuple[str, str]]:
	try:
		import nodes as comfy_nodes
	except Exception:
		return None
	mappings = getattr(comfy_nodes, "NODE_CLASS_MAPPINGS", None) or {}
	for node in prompt.values():
		if not isinstance(node, dict):
			continue
		class_type = node.get("class_type", None)
		class_def = mappings.get(class_type, None)
		if class_def is None:
			continue
		try:
			schema = class_def.GET_SCHEMA() if hasattr(class_def, "GET_SCHEMA") else None
			boundary = getattr(schema, "loop_boundary", None)
		except Exception:
			boundary = None
		if boundary in ("start", "end"):
			return (str(class_type), str(boundary))
	return None


def _prune_unreachable(prompt: Dict[str, Any], start_nodes: Set[str]) -> Tuple[Dict[str, Any], int]:
	reachable = _walk_upstream(prompt, start_nodes)
	# 标记节点永远保留，否则剪枝后快路径看不到 opt-in
	for nid, node in prompt.items():
		if isinstance(node, dict) and node.get("class_type") in _PRUNE_PROTECT_CLASSES:
			reachable.add(str(nid))
	removed = 0
	new_prompt: Dict[str, Any] = {}
	for node_id, node in prompt.items():
		sid = str(node_id)
		if sid in reachable:
			new_prompt[sid] = node
		else:
			removed += 1
	return (new_prompt, removed)

def _digest(value: Any) -> str:
	# 稳定地表示一个值，用于生成缓存子签名
	try:
		return hashlib.sha1(repr(value).encode("utf-8", "backslashreplace")).hexdigest()
	except Exception:
		return hashlib.sha1(str(value).encode("utf-8", "backslashreplace")).hexdigest()


async def _fast_node_signature(self, dynprompt, node_id, memo, stack):
	# 递归计算每个节点的签名，祖先只算一次；子节点直接引用祖先摘要。
	key = str(node_id)
	if key in memo:
		return memo[key]
	if key in stack:
		return _digest(("cycle", key))
	stack.add(key)
	try:
		if not dynprompt.has_node(node_id):
			result = _digest(("missing", key))
			memo[key] = result
			return result

		node = dynprompt.get_node(node_id)
		class_type = node["class_type"]
		class_def = _CACHING.nodes.NODE_CLASS_MAPPINGS[class_type]

		payload = [class_type, await self.is_changed_cache.get(node_id)]
		include_id = (
			self.include_node_id_in_input()
			or (hasattr(class_def, "NOT_IDEMPOTENT") and class_def.NOT_IDEMPOTENT)
			or _CACHING.include_unique_id_in_input(class_type)
		)
		if include_id:
			payload.append(key)

		inputs = node.get("inputs", None)
		if not isinstance(inputs, dict):
			inputs = {}
		for input_key in sorted(inputs.keys()):
			value = inputs[input_key]
			if _CACHING.is_link(value):
				child = await _fast_node_signature(self, dynprompt, value[0], memo, stack)
				payload.append((input_key, "LINK", child, value[1]))
			else:
				payload.append((input_key, "VALUE", _CACHING.to_hashable(value)))

		result = _digest(payload)
		memo[key] = result
		return result
	finally:
		stack.discard(key)


def _fast_cache_fingerprint(cls) -> Optional[str]:
	try:
		names = (
			"get_node_signature",
			"get_immediate_node_signature",
			"get_ordered_ancestry",
			"get_ordered_ancestry_internal",
		)
		parts = []
		for name in names:
			fn = getattr(cls, name, None)
			if fn is None:
				return None
			parts.append(inspect.getsource(fn))
		return hashlib.sha256("\n".join(parts).encode("utf-8")).hexdigest()
	except Exception:
		return None


def _log_fast_cache_disabled(reason: str, detail: str = "") -> None:
	lines = [
		"",
		"============================================================",
		"缓存加速未启用（这不是错误，工作流仍会正常运行）",
		"------------------------------------------------------------",
		"影响：",
		"  - 只是点击“运行”后的初始化可能重新变慢；",
		"  - 工作流节点、参数、输出结果都不会受影响。",
		"原因：",
		f"  {reason}",
	]
	if detail:
		lines.extend(["详情：", f"  {detail}"])
	lines.extend([
		"为什么会这样：",
		"  ComfyUI 更新后，内部计算“缓存签名”的方式可能变了；",
		"  旧的加速逻辑不能再保证缓存判断正确，所以已自动退回官方原逻辑。",
		"你现在不需要做任何事。",
		"如果想恢复加速：",
		"  1. 等插件后续适配；或",
		"  2. 把 ComfyUI 的 comfy_execution\\caching.py 发给插件作者；",
		"  3. 确认新版兼容后，可在 graph_constant_folder_config.json 里设",
		"     \"FAST_CACHE_FORCE\": 1 强制启用（有风险，不建议长期使用）。",
		"============================================================",
	])
	_log_alert("\n".join(lines))


def _fast_cache_self_test(cls, original) -> Tuple[bool, str]:
	global _CACHING
	if _CACHING is None:
		try:
			from comfy_execution import caching
			_CACHING = caching
		except Exception as e:
			return False, f"cannot import caching: {e}"
	try:
		asyncio.get_running_loop()
		return True, "self-test skipped: an event loop is already running"
	except RuntimeError:
		pass

	async def run_test():
		caching = _CACHING

		class Dummy:
			NOT_IDEMPOTENT = False

			@classmethod
			def INPUT_TYPES(cls):
				return {"required": {}, "optional": {}, "hidden": {}}

		for name in (
			"PT_FAST_TEST_A", "PT_FAST_TEST_B", "PT_FAST_TEST_C",
			"PT_FAST_TEST_D", "PT_FAST_TEST_E", "PT_FAST_TEST_F",
		):
			caching.nodes.NODE_CLASS_MAPPINGS.setdefault(name, Dummy)

		class FakePrompt:
			def __init__(self, data):
				self.data = data

			def has_node(self, node_id):
				return str(node_id) in self.data

			def get_node(self, node_id):
				return self.data[str(node_id)]

		class FakeIsChanged:
			async def get(self, node_id):
				return 0

		def make(extra):
			return {
				"1": {"class_type": "PT_FAST_TEST_A", "inputs": {"x": 1 + extra}},
				"2": {"class_type": "PT_FAST_TEST_B", "inputs": {"a": ["1", 0]}},
				"3": {"class_type": "PT_FAST_TEST_C", "inputs": {"b": ["2", 0]}},
				"4": {"class_type": "PT_FAST_TEST_D", "inputs": {"d": ["1", 0]}},
				"5": {"class_type": "PT_FAST_TEST_E", "inputs": {"c": ["3", 0], "e": ["4", 0]}},
				"6": {"class_type": "PT_FAST_TEST_F", "inputs": {"z": 1}},
			}

		async def keys(data):
			cs = cls(FakePrompt(data), list(data.keys()), FakeIsChanged())
			await cs.add_keys(list(data.keys()))
			return cs.keys

		async def fast_method(self, dynprompt, node_id):
			return await _fast_node_signature(self, dynprompt, node_id, {}, set())

		# 原逻辑
		cls.get_node_signature = original
		old_base = await keys(make(0))
		old_changed = await keys(make(1))
		old_set = {k for k in old_base if old_base[k] != old_changed[k]}

		# 快路径
		cls.get_node_signature = fast_method
		fast_base = await keys(make(0))
		fast_base_2 = await keys(make(0))
		fast_changed = await keys(make(1))
		cls.get_node_signature = original

		fast_set = {k for k in fast_base if fast_base[k] != fast_changed[k]}
		if any(fast_base[k] != fast_base_2[k] for k in fast_base):
			return False, "同一张图连续计算，快路径签名不稳定"
		if old_set != fast_set:
			return False, f"变化传播不一致：原逻辑={sorted(old_set)}，快路径={sorted(fast_set)}"
		return True, ""

	try:
		return asyncio.run(run_test())
	except RuntimeError as e:
		return True, f"self-test skipped: {e}"
	except Exception as e:
		return False, f"self-test error: {e}"


def _marker_enabled(node) -> bool:
	"""标记节点的“启用”开关；旧工作流没有该字段时视为启用。"""
	inputs = node.get("inputs") or {}
	flag = inputs.get("开关", True)
	if flag is False or flag == 0:
		return False
	if isinstance(flag, str) and flag.strip().lower() in ("false", "0", "off"):
		return False
	return True


def _prompt_dict_has_marker(prompt) -> bool:
	if not isinstance(prompt, dict):
		return False
	for node in prompt.values():
		if isinstance(node, dict) and node.get("class_type") == _FAST_CACHE_MARKER_CLASS:
			if _marker_enabled(node):
				return True
	return False


def _prompt_has_marker(dynprompt) -> bool:
	try:
		if hasattr(dynprompt, "get_original_prompt"):
			prompt = dynprompt.get_original_prompt()
		else:
			prompt = getattr(dynprompt, "prompt", None)
	except Exception:
		return False
	return _prompt_dict_has_marker(prompt)


def _install_fast_cache() -> bool:
	global _FAST_CACHE_INSTALLED, _FAST_CACHE_DISABLED, _CACHING
	if _FAST_CACHE_INSTALLED:
		return True
	try:
		from comfy_execution import caching
	except Exception as e:
		_log_fast_cache_disabled("无法导入 ComfyUI 的缓存模块", str(e))
		return False
	_CACHING = caching
	cls = getattr(caching, "CacheKeySetInputSignature", None)
	if cls is None or not hasattr(cls, "get_node_signature"):
		_log_fast_cache_disabled(
			"当前 ComfyUI 找不到 CacheKeySetInputSignature.get_node_signature",
			"可能是 ComfyUI 版本过旧，或缓存实现已被重写。",
		)
		return False
	if getattr(cls, "_pt_fast_signature_installed", False):
		_FAST_CACHE_INSTALLED = True
		return True

	if _FAST_CACHE_AUTOCHECK and not _FAST_CACHE_FORCE:
		fp = _fast_cache_fingerprint(cls)
		if fp is None:
			_log_fast_cache_disabled(
				"无法读取 ComfyUI 缓存签名实现的源码，无法确认兼容性",
				"已自动退回官方原逻辑。",
			)
			return False
		if fp != _FAST_CACHE_EXPECTED_FINGERPRINT:
			_log_fast_cache_disabled(
				"ComfyUI 的缓存签名实现与当前适配版本不一致",
				f"期望指纹: {_FAST_CACHE_EXPECTED_FINGERPRINT[:12]}...\n  实际指纹: {fp[:12]}...",
			)
			return False
		ok, detail = _fast_cache_self_test(cls, cls.get_node_signature)
		if not ok:
			_log_fast_cache_disabled("缓存签名自检未通过", detail)
			return False

	original = cls.get_node_signature

	async def fast_get_node_signature(self, dynprompt, node_id):
		global _FAST_CACHE_DISABLED
		if _FAST_CACHE_DISABLED:
			return await original(self, dynprompt, node_id)
		try:
			if _REQUIRE_MARKER:
				opt_in = getattr(self, "_pt_fast_cache_opt_in", None)
				if opt_in is None:
					opt_in = _prompt_has_marker(dynprompt)
					setattr(self, "_pt_fast_cache_opt_in", opt_in)
				if not opt_in:
					return await original(self, dynprompt, node_id)
			memo = getattr(self, "_pt_fast_signature_memo", None)
			if memo is None:
				memo = {}
				setattr(self, "_pt_fast_signature_memo", memo)
			return await _fast_node_signature(self, dynprompt, node_id, memo, set())
		except Exception as e:
			_FAST_CACHE_DISABLED = True
			_log_fast_cache_disabled("缓存加速在运行中出错，已自动关闭", str(e))
			return await original(self, dynprompt, node_id)

	cls.get_node_signature = fast_get_node_signature
	cls._pt_fast_signature_installed = True
	_FAST_CACHE_INSTALLED = True
	_log_info("fast cache signature installed (each node signed once)")
	return True


def _log_bus_report(prompt) -> None:
	# 只读诊断：BusIn/BusOut 的连线与下游引用，用来判断能否做 bus 折叠。不修改任何数据。
	if not isinstance(prompt, dict) or not prompt:
		return

	bus_in = {}
	bus_out = {}
	for nid, node in prompt.items():
		if not isinstance(node, dict):
			continue
		ct = node.get("class_type", None)
		if ct == "wcx_BusIn":
			bus_in[str(nid)] = node
		elif ct == "wcx_BusOut":
			bus_out[str(nid)] = node

	if not bus_in and not bus_out:
		return

	# 统计"谁引用了 BusOut 的第几个输出"
	consumers = {}
	for nid, node in prompt.items():
		if not isinstance(node, dict):
			continue
		inputs = node.get("inputs", None)
		if not isinstance(inputs, dict):
			continue
		for key, v in inputs.items():
			if not _is_link(v):
				continue
			src = str(v[0])
			if src in bus_out:
				consumers.setdefault((src, int(v[1])), []).append(f"{nid}.{key}")

	prefixed = any(":" in str(k) for k in prompt.keys())
	_log_info(f"bus-report: BusIn={len(bus_in)} BusOut={len(bus_out)} prefixed_ids={int(prefixed)}")

	for oid in sorted(bus_out.keys()):
		onode = bus_out[oid]
		inputs = onode.get("inputs", None) or {}
		link = None
		for v in inputs.values():
			if _is_link(v):
				link = v
			break
		used = sorted({slot for (o, slot) in consumers.keys() if o == oid})
		used_ch = list(used)                       # 端口名 value_0 起，槽位号即端口号
		_log_info(f"  BusOut {oid}: link={link} used_slots={used} used_channels={used_ch}")
		if link is None:
			_log_info(f"  BusOut {oid}: 没有连接总线束 -> 跳过")
			continue
		src_id = str(link[0])
		inode = bus_in.get(src_id, None)
		if inode is None:
			ct = prompt.get(src_id, None)
			ct = ct.get("class_type", None) if isinstance(ct, dict) else None
			_log_info(f"  BusOut {oid}: 上游 {src_id} 不是 BusIn (class={ct}) -> 跳过")
			continue
		iinputs = inode.get("inputs", None) or {}
		connected = _bus_input_links(iinputs)
		_log_info(f"  BusIn {src_id}: 已接 value={sorted(connected.keys())}")
		missing = [c for c in used_ch if c not in connected]
		if missing:
			_log_info(f"  -> 不可折叠：被使用但未接线的通道 {missing}")
		elif used_ch:
			srcs = [connected[c] for c in used_ch]
			_log_info(f"  -> 可折叠：输出{used_ch} 可直连到 {srcs}")
		else:
			_log_info("  -> 没有任何输出被使用")


def _link_slots_for(value, target_id: str) -> List[int]:
	# 返回 value 里所有指向 target_id 的槽位号（支持嵌套 list / dict）
	slots: List[int] = []

	def walk(v):
		if _is_link(v):
			if str(v[0]) == target_id:
				slots.append(int(v[1]))
			return
		if isinstance(v, list):
			for item in v:
				walk(item)
		elif isinstance(v, dict):
			for item in v.values():
				walk(item)

	walk(value)
	return slots


def _rewrite_links_to(value, target_id: str, slot_map: Dict[int, Any]):
	# 把指向 target_id 的 link 换成 slot_map 里的源 link；返回 (新值, 是否改变)
	if _is_link(value):
		if str(value[0]) == target_id:
			src = slot_map.get(int(value[1]), None)
			if src is not None:
				return list(src), True
		return value, False
	if isinstance(value, list):
		changed = False
		out = []
		for item in value:
			nv, ch = _rewrite_links_to(item, target_id, slot_map)
			out.append(nv)
			if ch:
				changed = True
		return (out if changed else value), changed
	if isinstance(value, dict):
		changed = False
		out = {}
		for k, item in value.items():
			nv, ch = _rewrite_links_to(item, target_id, slot_map)
			out[k] = nv
			if ch:
				changed = True
		return (out if changed else value), changed
	return value, False


def _bus_slot_of_key(key: str):
	# 从端口名推回槽位号（0 起）。兼容 value_N（0 起）与旧版 输入_N（1 起）。
	key = str(key or "")
	try:
		if key.startswith("value_"):
			return int(key.split("_")[-1])
		if key.startswith("输入_"):
			return int(key.split("_")[-1]) - 1
	except Exception:
		return None
	return None


def _bus_input_links(iinputs) -> Dict[int, Any]:
	# BusIn 的 槽位 -> 连线，兼容新旧端口名；value_N 优先
	out: Dict[int, Any] = {}
	if not isinstance(iinputs, dict):
		return out
	keys = sorted(iinputs.keys(), key=lambda k: (0 if str(k).startswith("value_") else 1, str(k)))
	for k in keys:
		slot = _bus_slot_of_key(k)
		if slot is None or slot < 0 or slot in out:
			continue
		v = iinputs.get(k, None)
		if _is_link(v):
			out[slot] = v
	return out

def _bus_refs_to(prompt: Dict[str, Any], target_id: str, exclude=()) -> List[str]:
	# 返回 prompt 里所有引用了 target_id 的节点 id
	refs: List[str] = []
	for nid, node in prompt.items():
		if str(nid) in exclude or not isinstance(node, dict):
			continue
		ninputs = node.get("inputs", None)
		if not isinstance(ninputs, dict):
			continue
		if _link_slots_for(ninputs, target_id):
			refs.append(str(nid))
	return refs


# 恒等直通节点：输入原样输出，可以安全穿过
_BUS_PASS_RE = re.compile(
	r"(?i)^wcx_(any|image|mask|latent|clip|model|vae|conditioning|text|int|float|bool|audio)(passthrough|rerouter)$"
)


def _resolve_bus_in(prompt: Dict[str, Any], oid: str):
	# 从 BusOut 的总线束输入出发，穿过恒等直通节点，找到真正的 BusIn
	# 返回 (BusIn id 或 None, 经过的直通节点列表, 失败原因或 None)
	onode = prompt.get(oid, None)
	if not isinstance(onode, dict):
		return None, [], f"{oid} 不在 prompt 中"
	inputs = onode.get("inputs", None) or {}
	link = None
	for v in inputs.values():
		if _is_link(v):
			link = v
		break
	if link is None:
		return None, [], None

	path: List[str] = []
	cur = link
	for _hop in range(8):
		nid = str(cur[0])
		node = prompt.get(nid, None)
		if not isinstance(node, dict):
			return None, path, f"总线束上游 {nid} 在 prompt 中不存在"
		ct = node.get("class_type", None)
		if ct == "wcx_BusIn":
			return nid, path, None
		if not (ct and _BUS_PASS_RE.match(str(ct))):
			return None, path, f"总线束上游 {nid} 是 {ct}，不是 BusIn"
		ninputs = node.get("inputs", None) or {}
		links = [v for v in ninputs.values() if _is_link(v)]
		if len(links) != 1:
			return None, path, f"直通节点 {nid} ({ct}) 有 {len(links)} 条输入连线，无法确定上游"
		path.append(nid)
		cur = links[0]
	return None, path, "直通链超过 8 层"


def _fold_bus(prompt: Dict[str, Any]):
	# BusIn -> BusOut 折叠成直连；返回 (折叠对数, 跳过说明列表)
	folded = 0
	skipped: List[str] = []
	if not isinstance(prompt, dict) or not prompt:
		return folded, skipped

	for _pass in range(8):
		bus_in_ids = {str(k) for k, v in prompt.items() if isinstance(v, dict) and v.get("class_type") == "wcx_BusIn"}
		bus_out_ids = [str(k) for k, v in prompt.items() if isinstance(v, dict) and v.get("class_type") == "wcx_BusOut"]
		if not bus_out_ids:
			break

		did = False
		for oid in bus_out_ids:
			if oid not in prompt:
				continue
			iid, via, reason = _resolve_bus_in(prompt, oid)
			if reason:
				skipped.append(f"{oid}: {reason}")
				continue
			if iid is None:
				continue
			if iid not in bus_in_ids:
				continue
			inode = prompt.get(iid, None)
			if not isinstance(inode, dict):
				continue
			iinputs = inode.get("inputs", None) or {}

			# 收集所有引用（含不可达节点，否则删掉 bus 会留下悬空引用）
			slot_refs: Dict[int, List[str]] = {}
			for nid, node in prompt.items():
				if str(nid) in (oid, iid) or str(nid) in via or not isinstance(node, dict):
					continue
				ninputs = node.get("inputs", None)
				if not isinstance(ninputs, dict):
					continue
				for _key, v in ninputs.items():
					for slot in _link_slots_for(v, oid):
						slot_refs.setdefault(slot, []).append(str(nid))

			slot_map: Dict[int, Any] = {}
			missing: List[int] = []
			_links = _bus_input_links(iinputs)
			for slot in sorted(slot_refs.keys()):
				src = _links.get(slot, None)
				if _is_link(src):
					slot_map[slot] = src
				else:
					missing.append(slot)
			if missing:
				skipped.append(f"{oid} <- {iid}: 被引用的通道 {missing} 未接线")
				continue

			for nid, node in prompt.items():
				if str(nid) in (oid, iid) or str(nid) in via or not isinstance(node, dict):
					continue
				ninputs = node.get("inputs", None)
				if not isinstance(ninputs, dict):
					continue
				nv, changed = _rewrite_links_to(ninputs, oid, slot_map)
				if changed:
					node["inputs"] = nv

			# 改写之后再算可达性：只有能走到输出节点的通道才真的会执行
			reachable: Set[str] = set()
			try:
				_outs = _collect_outputs(prompt)
				if _outs:
					reachable = _walk_upstream(prompt, _outs)
			except Exception:
				reachable = set()

			kept = sorted(slot_map.keys())
			live: List[int] = []
			dead: List[int] = []
			for _ch in kept:
				_cids = slot_refs.get(_ch, [])
				if (not reachable) or any(c in reachable for c in _cids):
					live.append(_ch)
				else:
					dead.append(_ch)

			unreferenced: List[Any] = []
			for _slot, _v in _links.items():
				if _slot not in kept:
					unreferenced.append((_slot, _v))
			unreferenced.sort(key=lambda item: item[0])

			head = f"bus fold: {iid} -> {oid} 直连"
			if via:
				head += f"（经直通 {via}）"
			parts = [head]
			if live:
				parts.append(f"会执行通道 {live}")
			if dead:
				_srcs = {c: _links.get(c, None) for c in dead}
				_txt = ", ".join(f"value_{c}<-{_srcs[c]}" for c in dead)
				parts.append(f"引用但下游不可达(不执行) {_txt}")
			if unreferenced:
				_txt2 = ", ".join(f"value_{c}<-{s}" for c, s in unreferenced)
				parts.append(f"无引用(不执行) {_txt2}")
			_log_info("；".join(parts))

			prompt.pop(oid, None)
			# 一个 BusIn 可能被多个 BusOut 共用：确认没人再引用它才删除
			if not _bus_refs_to(prompt, iid):
				prompt.pop(iid, None)
			folded += 1
			did = True

		if not did:
			break

	if skipped:
		skipped = sorted(set(skipped))
	return folded, skipped

def _fold_prompt(json_data: Dict[str, Any]) -> Dict[str, Any]:
	if not _ENABLED:
		return json_data

	prompt = json_data.get("prompt", None)
	if not isinstance(prompt, dict) or not prompt:
		return json_data

	t0 = time.perf_counter()

	total_fold_count = 0
	candidates = 0
	not_foldable: List[str] = []
	changed_nodes: Set[str] = set()
	folded_ids: Set[str] = set()

	for pass_idx in range(16):
		replacements, fold_count, pass_candidates, pass_not_foldable = _constant_fold_switches(prompt, folded_ids)
		if pass_idx == 0:
			candidates = pass_candidates

		if fold_count == 0:
			not_foldable = pass_not_foldable
			break

		changed_nodes.update(_apply_replacements(prompt, replacements))
		folded_ids.update(replacements.keys())
		total_fold_count += fold_count

	if _BUS_FOLD:
		bus_folded, bus_skipped = _fold_bus(prompt)
		if bus_folded:
			total_fold_count += bus_folded
		for _msg in bus_skipped:
			_log_info(f"bus skip: {_msg}")

	if _VERBOSE:
		for msg in not_foldable:
			_log_verbose(msg)

	if _DEBUG or _VERBOSE:
		_log_debug(f"on_prompt: nodes={len(prompt)}, switch_candidates={candidates}, foldable={total_fold_count}, prune={int(_PRUNE)}, verbose={int(_VERBOSE)}")

	if total_fold_count == 0:
		return json_data

	removed = 0
	if _PRUNE:
		unknown_class = _first_unknown_class(prompt)
		loop_boundary = _first_loop_boundary(prompt)
		if unknown_class:
			_log_alert(f"prune skipped: unknown class_type '{unknown_class}' (registry incomplete)")
		elif loop_boundary:
			_log_alert(f"prune skipped: official loop boundary '{loop_boundary[0]}' ({loop_boundary[1]})")
		else:
			targets = _extract_partial_targets(json_data)
			start_nodes = _collect_outputs(prompt, targets)
			if not start_nodes:
				_log_alert("prune skipped: no output nodes found")
			else:
				new_prompt, removed = _prune_unreachable(prompt, start_nodes)
				json_data["prompt"] = new_prompt

	dt_ms = (time.perf_counter() - t0) * 1000.0
	if _DEBUG or _VERBOSE:
		_log_debug(f"rewrote nodes={len(changed_nodes)}, pruned={removed}, dt_ms={dt_ms:.2f}")

	return json_data

def _handler(json_data: Dict[str, Any]) -> Dict[str, Any]:
	if not _ENABLED:
		return json_data
	if _LOG:
		_log_bus_report(json_data.get("prompt", None) if isinstance(json_data, dict) else None)
	if _REQUIRE_MARKER:
		prompt = json_data.get("prompt", None) if isinstance(json_data, dict) else None
		if not _prompt_dict_has_marker(prompt):
			return json_data
	try:
		return _fold_prompt(json_data)
	except Exception as e:
		_log_alert(f"on_prompt failed, prompt left unchanged: {e}")
		return json_data

_installed = False
_HANDLER_MARKER = "_graph_constant_folder_handler"

def _is_existing_handler(handler: Any) -> bool:
	if getattr(handler, _HANDLER_MARKER, False):
		return True
	if getattr(handler, "__name__", "") != "_handler":
		return False
	module_name = str(getattr(handler, "__module__", ""))
	return "graph_constant_folder" in module_name

def install() -> None:
	global _installed
	if _installed:
		return
	_installed = True

	if not _ENABLED:
		_log_info("disabled (set GRAPH_CONSTANT_FOLDER_ENABLED=0 or GCF_ENABLED=0)")
		return

	try:
		from server import PromptServer
	except Exception as e:
		_log_alert(f"could not import PromptServer: {e}")
		return

	inst = getattr(PromptServer, "instance", None)
	if inst is None:
		_log_alert("PromptServer.instance is None; handler not installed")
		return

	if not hasattr(inst, "add_on_prompt_handler"):
		_log_alert("ComfyUI server missing add_on_prompt_handler; update ComfyUI")
		return

	if hasattr(inst, "on_prompt_handlers"):
		inst.on_prompt_handlers = [
			h for h in inst.on_prompt_handlers
			if not _is_existing_handler(h)
		]

	setattr(_handler, _HANDLER_MARKER, True)
	inst.add_on_prompt_handler(_handler)
	if _FAST_CACHE:
		_install_fast_cache()
	_log_info("installed on_prompt handler (constant-fold: lazy switches + switch-like nodes)")
