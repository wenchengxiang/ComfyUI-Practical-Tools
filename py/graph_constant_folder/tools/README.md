# GraphConstantFolder 配套脚本

这里的脚本只用于**验证和测量**内联版折叠功能，不是节点，不参与 ComfyUI 加载。
`py/` 是递归自动 exec 的，所以 `__init__.py` 的 `_skip_dirs` 里加了 `'tools'` ——
**不要把这个目录移出 `graph_constant_folder`，也不要把 `'tools'` 从 `_skip_dirs` 里删掉。**

## 运行前提

- 用 ComfyUI 自己的解释器：
  `F:\Comfy-Desktop\ComfyUI-Installs\Comfy Native\ComfyUI\.venv\Scripts\python.exe`
- 大部分脚本要求服务在跑：`http://127.0.0.1:8189`
- 下面标 **会提交** 的两个脚本会真的往队列里塞 prompt（用完自行 `/interrupt`），
  别在工作流正在跑的时候执行。

## 脚本清单

| 脚本 | 作用 | 需要服务 | 会提交 |
| --- | --- | --- | --- |
| `gcf_audit_v2.py` | 折叠决策审计：连线改写合法、剪枝后无悬空、输出节点没被删 | 否（读 prompt 文件） | 否 |
| `gcf_audit.py` | 同上的 v1，顺序有问题（剪枝后才校验改写），留作对照 | 否 | 否 |
| `gcf_semantics_check.py` | 语义对照：折叠后的连线是否等于节点自身运行时返回的值；重放 139 条决策 | 否 | 否 |
| `check_shared_source.py` | 验证「未被选中的 value_N 源，若还被别的活节点消费，会不会被误删」：合成用例 + 真实图统计 | 是（读 object_info） | 否 |
| `gcf_prune_live_check.py` | 用**运行中的注册表**核对剪枝：输出节点集合与官方一致、一个不少 | 是 | 否 |
| `scan_index_switch_classes.py` | 扫注册表里哪些类符合「端口名」折叠规则，并打印每类 index 的 min/default | 是 | 否 |
| `scan_loop_boundary.py` | 查是否存在 `loop_boundary` 节点（剪枝边界要考虑的那类） | 否 | 否 |
| `verify_index_min.py` | 验证 index-min 闸门：1 基跳过、0 基照折、真实 prompt 折叠数不变 | 否 | 否 |
| `measure_signature_cost.py` | 量化「提交后缓存判定」成本：节点数、祖先展开、签名行、输入项（原始 vs 折叠后） | 是 | 否 |
| `bench_signature.py` | 离线单独跑一遍 `CacheKeySetInputSignature`，作为纯 CPU 基准 | 是（取最近历史） | 否 |
| `measure_http_init.py` | **绕开前端**直接 POST 折叠后的 prompt，量 `execution_start → execution_cached` | 是 | **是**（读完自动 interrupt） |
| `probe_history.py` | 读最近 6 条历史，打印 `nodes_in_prompt` 和各阶段时间戳差 | 是 | 否 |
| `probe_fold_alive.py` | 折叠存活探针：往未选中的 `value_1` 塞非法节点，看是否被剪掉；顺带查版本与类 | 是 | **是**（很小的探针 prompt） |
| `probe_backend.py` | `/system_stats` + `/queue` 健康探测 | 是 | 否 |
| `check_backend.py` | 列 `object_info` 里关键类是否存在（`wcx_AnyIndexSimple` / `ComfySwitchNode` / `CustomCombo` …） | 是 | 否 |
| `check_queue.py` | `/queue` 与 `/history` 的排队/历史条数 | 是 | 否 |
| `summarize_pyspy.py` | 把 `py-spy record -f raw` 的输出聚合成叶子帧/栈占比 | 否（读文件） | 否 |
| `diff_upstream.py` | 与上游 `ComfyUI-GraphConstantFolder` 比行数、相似度，量化分叉程度 | 否 | 否 |

## 典型流程

1. `gcf_audit_v2.py` → 2. `gcf_semantics_check.py` → 3. `check_shared_source.py`
→ 4. `gcf_prune_live_check.py`（折叠/剪枝是否还正确）
→ 5. `measure_signature_cost.py` → 6. `bench_signature.py` → 7. `measure_http_init.py`
（成本与耗时分段）
→ 8. `probe_fold_alive.py`（改完规则确认还生效）

## 硬编码路径（换机器/换目录要改）

- ComfyUI 根：`F:\Comfy-Desktop\ComfyUI-Installs\Comfy Native\ComfyUI`
- 折叠模块：`…\custom_nodes\ComfyUI-Practical-Tools\py\graph_constant_folder\graph_constant_folder.py`
- 上游对照：`E:\29748\下载\ComfyUI-GraphConstantFolder-main\graph_constant_folder.py`（`diff_upstream.py`）
- `%TEMP%` 下的输入快照，可能被系统清理：
  - `folded_prompt.json` —— 折叠后 1354 节点的 prompt（`measure_http_init.py` 用）
  - `hist_prompt.json` —— 折叠前 2410 节点的真实提交（`gcf_audit*.py` 用）
  - `pyspy_raw.txt` —— py-spy raw 采样（`summarize_pyspy.py` 用）

丢了就用 `probe_history.py` 的思路从 `/history` 重新导出一份。
