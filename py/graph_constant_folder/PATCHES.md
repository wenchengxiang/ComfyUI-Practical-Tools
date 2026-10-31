# 本地改动清单（相对上游 ComfyUI-GraphConstantFolder）

> 这份文件只记录"我们改了什么、为什么、怎么回退"，防止以后跟进上游时把补丁弄丢。
> 修改代码前请先更新本文件；升上游版本时按下面的流程走。

## 基线

| 项 | 值 |
|---|---|
| 上游项目 | SparknightLLC / ComfyUI-GraphConstantFolder |
| 上游版本 | **0.0.3**（`pyproject.toml`） |
| 上游文件 | `graph_constant_folder.py`，726 行 / 21,090 B |
| 本地文件 | `graph_constant_folder.py`，804 行 |
| 文本相似度 | 0.911（新增 107 行、改写 29 行、17 处差异） |

## 7 处本地改动

| # | 位置（当前行号） | 改了什么 | 为什么 | 回退方式 |
|---|---|---|---|---|
| 1 | `_resolve_constant` :327-339 | 新增 `CustomCombo` 解析：`want=int` 时读自身 `index`，`want=str` 时读 `choice` | 我们的 `AnyIndex.index` 常由 `CustomCombo` 提供，不解析就折不动 | 删掉该 `if` 块 |
| 2 | `_resolve_constant` :341-347 | 新增 `wcx_IntPassthrough` 直通 | 整数在总线上过一道透传节点，不认就断链 | 删掉该 `if` 块 |
| 3 | `_resolve_constant` :349-357 | 新增 `ComfySwitchNode` 解析：`switch` 为常量时按 `on_true/on_false` 继续向下解析 | 官方 If/Else 开关也参与选择决策 | 删掉该 `if` 块 |
| 4 | `_is_index_switch_like` :482-489 | 端口识别追加 `value_0/value_1`（下划线命名） | 上游只认 `value0/value1`；我们 `AnyIndex` 家族用的是 `value_0` | 删掉 `value_0/value_1` 判断 |
| 5 | `_try_fold_index_switch` :385-… | 取值先试 `value_{index}`，再退回 `value{index}` | 兼容两种命名 | 恢复上游单一取值方式 |
| 6 | `_index_min_for_class` :456-479 + `_constant_fold_switches` 索引分支 | 折叠前读该类的 `INPUT_TYPES().index.min`，**能读到且≠0 → 跳过**（读不到按原逻辑折） | 防止未来装了"1 基"的索引开关被按 0 基接错分支 | 删除函数与该分支判断 |
| 7 | `_cfg_flag` :47 起（替换上游 `_get_flag`）、`_log_info` :11、`_log_alert` :16、`_fold_prompt` :699 + 薄壳 `_handler` :751 | ① 去掉全部环境变量读取，只认 `graph_constant_folder_config.json`；② 普通日志受 `LOG` 开关控制，**报错始终走 `logging.warning`**；③ 折叠主体改名 `_fold_prompt`，`_handler` 变成 try/except 薄壳，异常时返回原图照常执行 | 本机部署只有一种形态，环境变量只会带来"被人误设就静默失效"的风险；过滤失败必须可见、且不能拖垮整个提交 | 恢复上游 `_get_flag` 与原始 `_handler`；`_log_info` 去掉 `_LOG` 闸门 |

## 配置文件

`graph_constant_folder_config.json`：

```json
{"ENABLED":1,"DEBUG":0,"VERBOSE":0,"PRUNE":1,"LOG":0}
```

- 代码还支持键 `CONST_CLASS_TYPES`（自定义"常量节点类"名单），**目前未写入配置**，缺省走代码内置正则。
- 环境变量已全部移除（模块内 `os.environ` 出现次数应为 0）。

## 验收脚本（改完必须跑）

| 脚本 | 作用 | 通过标准 |
|---|---|---|
| `tools\gcf_semantics_check.py` | 节点运行时语义 + 真实 prompt 决策重放 | 一致 = 全部决策，不一致 = 0 |
| `tools\gcf_audit_v2.py` | 剪枝前改写正确性 + 剪枝后悬空/输出校验 | 全部 0 问题 |
| `tools\verify_index_min.py` | 1 基开关跳过、0 基照折 | 合成用例 OK，真实折叠数不变 |
| `tools\gcf_prune_live_check.py` | 用运行中的注册表复核剪枝 | 输出节点 100% 保留、闭包一致、悬空 0 |

脚本与说明都在 `py\graph_constant_folder\tools\`（`README.md` 列了全部 18 个脚本的用途与是否提交 prompt）。
这个目录已被 `__init__.py` 的 `_skip_dirs` 排除，不会被当节点加载。

运行方式（必须用 ComfyUI 自带解释器）：

```
F:\Comfy-Desktop\ComfyUI-Installs\Comfy Native\ComfyUI\.venv\Scripts\python.exe <脚本>
```

## 跟进上游的流程

1. 下载新版上游，`diff` 它的 `graph_constant_folder.py` 与"我们引入时的 0.0.3 原版"；
2. 逐条核对上表 7 处补丁是否仍需保留（例如上游若已支持 `value_0`，删我们的 #4/#5）；
3. 只在新上游上重放仍然需要的补丁，不要整文件覆盖；
4. 跑上表 4 个脚本，全部通过再替换；
5. 更新本文件的"基线"表格与行号。

## 已知残留（有意不做）

- **循环边界不纳入剪枝根**：这条只影响**官方** `StartLoop`/`EndLoop`（`comfy_extras/nodes_loop.py`）——官方 End 与 Start 之间没有数据边，剪枝只认 `OUTPUT_NODE` 做根，特定结构下会把 `StartLoop` 剪掉而留下 `EndLoop`，提交即报错（见 `tools\gcf_loop_check.py` 用例 B）。
  本插件自己的 `wcx_WhileLoopStart/End`、`wcx_ForLoopStart/End` **不受影响**：`End.flow` 是 `rawLink`，直接指 `[start_id, 0]`，这条边本身就把 Start 挂在输出链上；While / For / 嵌套 While 三组用例实测 Start/End 均成对保留。当前所有工作流官方循环节点为 0，故无实际影响。
- **不折官方 `BranchNode`（autogrow 开关）**：它的选择器是插槽名字符串（`branch` + `branch_names`），端口是 `autogrow.branchN`，与 `index/value_N` 不同构。需要时再加。

## 排查提示（踩过的坑）

- **不要用离线精简注册表算剪枝数**：直接 `import nodes` 只有内置类，认不出自有输出节点（`wcx_AnyConvert`、`wcx_FreeMemory`、`wcx_LoraLoadWithTrigger` 等），会多删节点。真实运行时该工作流是 **2410 → 1354**（删 1056），不是 1220。
- **热重载不监视本子目录**：改这里任何文件都要重启后端才生效。
- **注入 `py` 的自动发现会扫到子目录**：`_skip_dirs` 里绝不能加 `graph_constant_folder`（加了折叠会静默失效）；反过来，`tools` 必须留在 `_skip_dirs` 里，否则那 18 个脚本会在每次启动被 exec，其中 `measure_http_init.py`、`probe_fold_alive.py` 还会真的提交 prompt。
