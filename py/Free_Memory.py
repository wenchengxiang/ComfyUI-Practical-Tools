"""
Free Memory —— 释放显存与内存缓存节点
功能：
  1. 调用 torch.cuda.empty_cache() 释放 GPU 显存缓存
  2. 调用 gc.collect() 回收 Python 对象（间接释放系统内存和被引用的显存）
  3. 可选卸载 ComfyUI 模型缓存（释放模型占用的显存和系统内存）
  4. 显示释放前后的 GPU 显存和系统内存使用情况

适用场景：多模型切换后、长时间运行显存/内存碎片化、循环中显存累积、OOM 前清理。

注意：
  - empty_cache() 只是把缓存还给 CUDA，不会降低进程虚拟内存
  - 如果张量仍被引用则不会释放
  - 卸载模型后，后续使用该模型需要重新加载，会变慢
"""

import gc
import sys
import torch


def _get_system_memory():
    """获取系统内存使用情况，返回 (已用GB, 总GB) 或 None"""
    try:
        import psutil
        mem = psutil.virtual_memory()
        return (mem.used / (1024 ** 3), mem.total / (1024 ** 3))
    except Exception:
        return None


def _get_process_memory():
    """获取当前进程内存使用，返回 GB 或 None"""
    try:
        import psutil
        proc = psutil.Process()
        return proc.memory_info().rss / (1024 ** 3)
    except Exception:
        return None


class wcx_FreeMemory:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "执行垃圾回收": ("BOOLEAN", {"default": True}),
                "卸载模型缓存": ("BOOLEAN", {"default": False, "tooltip": "卸载 ComfyUI 未使用的模型，释放更多显存和内存，但后续使用需重新加载"}),
                "多轮GC": ("BOOLEAN", {"default": False, "tooltip": "执行3轮 gc.collect()，更彻底回收但稍慢"}),
            },
            "optional": {
                "passthrough": ("*", {}),
            },
        }

    FUNCTION = "execute"
    CATEGORY = "Practical-Tools/utils"

    RETURN_TYPES = ("*",)
    RETURN_NAMES = ("passthrough",)
    OUTPUT_NODE = True

    def execute(self, 执行垃圾回收=True, 卸载模型缓存=False, 多轮GC=False, passthrough=None):
        result = {
            "ui": {
                "text": []
            },
            "result": (passthrough,)
        }

        lines = []
        lines.append("=== 内存释放 ===")

        # ===== 系统内存（释放前） =====
        sys_mem_before = _get_system_memory()
        proc_mem_before = _get_process_memory()

        if sys_mem_before:
            lines.append(f"系统内存: {sys_mem_before[0]:.2f} / {sys_mem_before[1]:.2f} GB")
        if proc_mem_before:
            lines.append(f"进程内存: {proc_mem_before:.2f} GB")

        # ===== GPU 显存（释放前） =====
        has_cuda = torch.cuda.is_available()
        if has_cuda:
            device = torch.cuda.current_device()
            device_name = torch.cuda.get_device_name(device)
            total_mem = torch.cuda.get_device_properties(device).total_memory / (1024 ** 3)
            allocated_before = torch.cuda.memory_allocated(device) / (1024 ** 3)
            reserved_before = torch.cuda.memory_reserved(device) / (1024 ** 3)

            lines.append(f"GPU: {device_name}")
            lines.append(f"总显存: {total_mem:.2f} GB")
            lines.append(f"已分配: {allocated_before:.3f} GB")
            lines.append(f"缓存中: {reserved_before:.3f} GB")
        else:
            lines.append("GPU: 未检测到 CUDA")

        lines.append("")
        lines.append("--- 执行释放 ---")

        # ===== 1. 卸载 ComfyUI 模型缓存 =====
        if 卸载模型缓存:
            try:
                import comfy.model_management as mm
                if hasattr(mm, 'unload_all_models'):
                    mm.unload_all_models()
                    lines.append("✓ unload_all_models() 已执行")
                elif hasattr(mm, 'cleanup_models'):
                    mm.cleanup_models(force_unload=True)
                    lines.append("✓ cleanup_models(force_unload=True) 已执行")
                else:
                    lines.append("⚠ 未找到模型卸载函数")
            except Exception as e:
                lines.append(f"⚠ 模型卸载失败: {e}")

        # ===== 2. 垃圾回收 =====
        if 执行垃圾回收:
            if 多轮GC:
                for i in range(3):
                    gc.collect()
                lines.append("✓ gc.collect() x3 已执行")
            else:
                gc.collect()
                lines.append("✓ gc.collect() 已执行")

        # ===== 3. 释放 CUDA 缓存 =====
        if has_cuda:
            torch.cuda.empty_cache()
            torch.cuda.synchronize(device)
            lines.append("✓ torch.cuda.empty_cache() 已执行")

            # ===== GPU 显存（释放后） =====
            allocated_after = torch.cuda.memory_allocated(device) / (1024 ** 3)
            reserved_after = torch.cuda.memory_reserved(device) / (1024 ** 3)
            freed_reserved = reserved_before - reserved_after
            freed_allocated = allocated_before - allocated_after

            lines.append("")
            lines.append("--- GPU 释放结果 ---")
            lines.append(f"缓存释放: {freed_reserved:.3f} GB")
            lines.append(f"分配释放: {freed_allocated:.3f} GB")
            lines.append(f"释放后缓存: {reserved_after:.3f} GB")
            lines.append(f"释放后分配: {allocated_after:.3f} GB")

        # ===== 系统内存（释放后） =====
        sys_mem_after = _get_system_memory()
        proc_mem_after = _get_process_memory()

        lines.append("")
        lines.append("--- 系统内存释放结果 ---")
        if sys_mem_before and sys_mem_after:
            freed_sys = sys_mem_before[0] - sys_mem_after[0]
            lines.append(f"系统内存释放: {freed_sys:.3f} GB")
            lines.append(f"释放后系统使用: {sys_mem_after[0]:.2f} / {sys_mem_after[1]:.2f} GB")
        if proc_mem_before and proc_mem_after:
            freed_proc = proc_mem_before - proc_mem_after
            lines.append(f"进程内存释放: {freed_proc:.3f} GB")
            lines.append(f"释放后进程使用: {proc_mem_after:.2f} GB")

        if not sys_mem_before and not proc_mem_before:
            lines.append("⚠ 未安装 psutil，无法统计系统内存（pip install psutil）")

        result["ui"]["text"].append("\n".join(lines))
        return result


# ==========================================
# 注册与显示名称
# ==========================================
NODE_CLASS_MAPPINGS = {
    "wcx_FreeMemory": wcx_FreeMemory
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_FreeMemory": "Free Memory"
}
