# =====================================================================
# 完美修正版：独立提取并扩展的数学计算节点 (SimpleMath & SimpleMathDual)
# 彻底解决 SimpleMathDual 丢失变量 d 的问题，完美兼容，无任何打印信息
# =====================================================================

import math

class AnyType(str):
    """A special type that compares equal to any other type."""
    def __ne__(self, __value: object) -> bool:
        return False

    def __eq__(self, __value: object) -> bool:
        return True

    def __str__(self):
        return "*"

any_type = AnyType("*")

class SimpleMath:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "optional": {
                "a": (any_type, { "default": 0.0 }),
                "b": (any_type, { "default": 0.0 }),
                "c": (any_type, { "default": 0.0 }),
            },
            "required": {
                "value": ("STRING", { "multiline": False, "default": "" }),
            },
        }

    RETURN_TYPES = ("INT", "FLOAT", )
    FUNCTION = "execute"
    CATEGORY = "WCXnodes/utils"

    def execute(self, value, a = 0.0, b = 0.0, c = 0.0, d = 0.0):
        import ast
        import operator as op

        if hasattr(a, 'shape'):
            a = list(a.shape)
        if hasattr(b, 'shape'):
            b = list(b.shape)
        if hasattr(c, 'shape'):
            c = list(c.shape)
        if hasattr(d, 'shape'):
            d = list(d.shape)

        if isinstance(a, str):
            a = float(a)
        if isinstance(b, str):
            b = float(b)
        if isinstance(c, str):
            c = float(c)
        if isinstance(d, str):
            d = float(d)
        
        operators = {
            ast.Add: op.add,
            ast.Sub: op.sub,
            ast.Mult: op.mul,
            ast.Div: op.truediv,
            ast.FloorDiv: op.floordiv,
            ast.Pow: op.pow,
            ast.USub: op.neg,
            ast.Mod: op.mod,
            ast.Eq: op.eq,
            ast.NotEq: op.ne,
            ast.Lt: op.lt,
            ast.LtE: op.le,
            ast.Gt: op.gt,
            ast.GtE: op.ge,
            ast.And: lambda x, y: x and y,
            ast.Or: lambda x, y: x or y,
            ast.Not: op.not_
        }

        # 1. 严格限制只能接收【1个参数】的函数（安全过滤）
        single_arg_funcs = {
            'abs': abs, 'ceil': math.ceil, 'floor': math.floor, 'trunc': math.trunc,
            'sqrt': math.sqrt, 'isqrt': math.isqrt, 'exp': math.exp,
            'sin': math.sin, 'cos': math.cos, 'tan': math.tan,
            'asin': math.asin, 'acos': math.acos, 'atan': math.atan,
            'sinh': math.sinh, 'cosh': math.cosh, 'tanh': math.tanh,
            'degrees': math.degrees, 'radians': math.radians,
            'log2': math.log2, 'log10': math.log10, 'factorial': math.factorial
        }

        # 2. 严格接收【2个参数】的函数
        double_arg_funcs = {
            'atan2': math.atan2, 'fmod': math.fmod, 'copysign': math.copysign,
            'pow': math.pow, 'gcd': math.gcd, 'lcm': getattr(math, 'lcm', None)
        }
        double_arg_funcs = {k: v for k, v in double_arg_funcs.items() if v is not None}

        # 3. 接收【可变数量参数】的内建函数
        var_arg_funcs = {
            'min': min, 'max': max, 'round': round, 'sum': sum, 'len': len, 'log': math.log
        }

        def eval_(node):
            if isinstance(node, ast.Num): # number
                return node.n
            elif isinstance(node, ast.Name): # variable / constant
                if node.id == "a":
                    return a
                if node.id == "b":
                    return b
                if node.id == "c":
                    return c
                if node.id == "d":
                    return d  # 恢复对变量 d 的取值支持
                if node.id == "pi":
                    return math.pi
                if node.id == "tau":
                    return getattr(math, 'tau', math.pi * 2)
                if node.id == "e":
                    return math.e
                if node.id == "inf":
                    return math.inf
                if node.id == "nan":
                    return math.nan
            elif isinstance(node, ast.BinOp): # <left> <operator> <right>
                try:
                    return operators[type(node.op)](eval_(node.left), eval_(node.right))
                except (ZeroDivisionError, ValueError, OverflowError):
                    return 0.0
            elif isinstance(node, ast.UnaryOp): # <operator> <operand> e.g., -1
                return operators[type(node.op)](eval_(node.operand))
            elif isinstance(node, ast.Compare):  # comparison operators
                left = eval_(node.left)
                for op_item, comparator in zip(node.ops, node.comparators):
                    if not operators[type(op_item)](left, eval_(comparator)):
                        return 0
                return 1
            elif isinstance(node, ast.BoolOp):  # boolean operators (And, Or)
                values = [eval_(val) for val in node.values]
                return operators[type(node.op)](*values)
            elif isinstance(node, ast.Call): # custom function
                func_id = node.func.id
                args = [eval_(arg) for arg in node.args]
                
                try:
                    if func_id in single_arg_funcs:
                        val = args[0] if len(args) > 0 else 0.0
                        if func_id == 'factorial':
                            val = max(0, int(val))
                        return single_arg_funcs[func_id](val)
                        
                    elif func_id in double_arg_funcs:
                        val1 = args[0] if len(args) > 0 else 0.0
                        val2 = args[1] if len(args) > 1 else 0.0
                        return double_arg_funcs[func_id](val1, val2)
                        
                    elif func_id in var_arg_funcs:
                        if not args:
                            return 0.0
                        if func_id == 'log' and len(args) > 2:
                            args = args[:2]
                        return var_arg_funcs[func_id](*args)
                except (ValueError, ZeroDivisionError, OverflowError):
                    return 0.0
                return 0.0
            elif isinstance(node, ast.Subscript): # indexing or slicing
                val = eval_(node.value)
                if isinstance(node.slice, ast.Constant):
                    return val[node.slice.value]
                else:
                    return 0
            else:
                return 0

        # 解析与安全兜底
        try:
            result = eval_(ast.parse(value, mode='eval').body)
        except Exception:
            result = 0.0

        if not isinstance(result, (int, float)) or math.isnan(result) or math.isinf(result):
            result = 0.0
        
        return (round(result), float(result), )


class SimpleMathDual:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "optional": {
                "a": (any_type, { "default": 0.0 }),
                "b": (any_type, { "default": 0.0 }),
                "c": (any_type, { "default": 0.0 }),
                "d": (any_type, { "default": 0.0 }),
            },
            "required": {
                "value_1": ("STRING", { "multiline": False, "default": "" }),
                "value_2": ("STRING", { "multiline": False, "default": "" }),
            },
        }
    
    RETURN_TYPES = ("INT", "FLOAT", "INT", "FLOAT", )
    RETURN_NAMES = ("int_1", "float_1", "int_2", "float_2" )
    FUNCTION = "execute"
    CATEGORY = "WCXnodes/utils"

    def execute(self, value_1, value_2, a = 0.0, b = 0.0, c = 0.0, d = 0.0):
        # 💡 核心修复：显式将 a, b, c, d 通过关键字参数全部透传给底层解析器实例
        math_parser = SimpleMath()
        res_1 = math_parser.execute(value=value_1, a=a, b=b, c=c, d=d)
        res_2 = math_parser.execute(value=value_2, a=a, b=b, c=c, d=d)
        return res_1 + res_2


# =====================================================================
# 注册映射字典
# =====================================================================
NODE_CLASS_MAPPINGS = {
    "wcx_SimpleMath": SimpleMath,
    "wcx_SimpleMathDual": SimpleMathDual
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_SimpleMath": "Simple Math",
    "wcx_SimpleMathDual": "Simple Math Dual"
}