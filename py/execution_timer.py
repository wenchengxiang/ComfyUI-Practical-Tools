"""
Execution Timer —— 纯节点执行时间统计
监听 ComfyUI 执行事件，统计从第一个节点开始执行到执行完成的时间，
排除工作流分析、缓存检查、ExecutionList 构建等准备时间。
输出: [INFO] Node executed in X seconds
"""

import time
import server

GREEN = '\033[32m'
RESET = '\033[0m'


def _get_state():
    """获取共享状态（存在 server.instance 上，防止模块多次加载导致状态隔离）"""
    instance = server.PromptServer.instance
    if not hasattr(instance, '_pt_exec_timer_state'):
        instance._pt_exec_timer_state = {
            'first_node_start': {},
            'output_prompts': set(),
            'original_send_sync': None,
        }
    return instance._pt_exec_timer_state


def _patched_send_sync(event, data, sid=None):
    state = _get_state()
    try:
        if event == "executing":
            prompt_id = data.get("prompt_id")
            node_id = data.get("node")
            if node_id is not None:
                # 某个节点开始执行，记录第一个节点的起始时间
                if prompt_id and prompt_id not in state['first_node_start']:
                    state['first_node_start'][prompt_id] = time.perf_counter()
            else:
                # node_id 为 None 表示执行结束（main.py 中只发送一次）
                if (prompt_id and prompt_id in state['first_node_start']
                        and prompt_id not in state['output_prompts']):
                    elapsed = time.perf_counter() - state['first_node_start'][prompt_id]
                    state['output_prompts'].add(prompt_id)
                    del state['first_node_start'][prompt_id]
                    if elapsed > 600:
                        formatted = time.strftime("%H:%M:%S", time.gmtime(elapsed))
                        print(f"{GREEN}[INFO] Node executed in {formatted}{RESET}")
                    else:
                        print(f"{GREEN}[INFO] Node executed in {elapsed:.2f} seconds{RESET}")
    except Exception:
        pass
    return state['original_send_sync'](event, data, sid)


def _install_hook():
    try:
        instance = server.PromptServer.instance
        state = _get_state()
        if state['original_send_sync'] is not None:
            return  # 已安装
        state['original_send_sync'] = instance.send_sync
        instance.send_sync = _patched_send_sync
    except Exception:
        pass


_install_hook()
