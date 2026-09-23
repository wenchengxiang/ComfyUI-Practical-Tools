// run_indicator.js — Practical-Tools 右上角运行指示条（v78）
//
// v78（v77 基础上新增"运行等待区"茶杯图标）：
//   * 工作流节点多时运行画面卡——节点移出视口后 canvas 只渲染可见区域，变快。
//   * 在指示条槽位左边加简约线条茶杯图标按钮：
//     - 点一下：找当前 graph 中标题为"运行等待区"的子图节点，
//       canvas.openSubgraph() 切进去（画布只剩说明文字节点，渲染流畅）；
//       同时记录进入前的 graph 引用 + 视图 pan/zoom。
//     - 再点：切回原 graph + 恢复 pan/zoom。
//   * 找不到"运行等待区"节点时图标置灰，hover 提示如何创建。
//   * 等待区子图内部由用户放一个 Text Label 节点写说明（双击编辑）。
//
// v77（v76 基础上历史上限 50 -> 100，用户建议）：
//   * promptHistory 按工作流 hash 去重后数量 = 工作流标签数，50 已够用；
//     按用户建议放宽到 100 兜底。
//
// v76（v75 基础上跨工作流前缀与跳转归属修复）：
//
// v76（v75 基础上跨工作流前缀与跳转归属修复）：
//   * 问题1：跨工作流时子图前缀丢失——子图前缀主要来自 tryNodeName（用当前
//     graph 实时查路径），切走后 graph 是别的、查不到任务工作流节点；v72 的
//     subgraphNames 前缀只在"完整路径 key 命中"时走，子图 key 在 prompt 中查不到 full。
//   * 修复1：nodeName 找到 key 所属的提交记录（findRec），用该记录缓存的
//     subgraphNames 拼"子图名(节点名)"；顶层 id 命中（r2）时同样拼前缀。
//   * 问题2：跨工作流点击跳转错乱——跳转目标用 runWorkflowHash（最新提交），
//     A 在跑时提交 B，点槽位切到 B 而非 A。
//   * 修复2：executing 到达时记录 activeWorkflowHash = 当前节点所属提交的工作流
//     hash；点击跳转切回 activeWorkflowHash（无则回退 runWorkflowHash）。
//
// v75（v74 基础上移除历史数量上限）：
//
// v75（v74 基础上移除历史数量上限）：
//   * v74 设 3 个上限系拍脑袋防内存，但 promptHistory 按工作流 hash 去重，
//     数量 = 不同工作流标签数，内存可忽略；改为 50 上限兜底极端场景。
//
// v74（v73 基础上多工作流 prompt 历史缓存）：
//
// v74（v73 基础上多工作流 prompt 历史缓存）：
//   * 问题：连续提交 A、B、C 后，若队列中旧工作流仍在执行，executing key 在
//     最新 promptData（只存一份）查不到 -> 显示数字。
//   * 修复：promptHistory 按工作流 hash 保存最近 3 次提交的 prompt 对象；
//     nodeName 兜底按 最新->最旧 遍历查找，无论哪个工作流在执行都能解析节点名。
//
// v73（v72 基础上连续提交支持）：
//
// v73（v72 基础上连续提交支持）：
//   * 问题：runWorkflowHash / runTopGraph 仅在为空时记录（if 保护），
//     连续提交两个不同工作流时，第二次提交不会更新它们——跳转仍指向第一个工作流。
//   * 修复：提交拦截（queuePrompt / fetch）中无条件更新 runWorkflowHash / runTopGraph
//     为最新提交；同一提交内 queuePrompt 与 fetch 会先后触发，值相同，无冲突。
//
// v72（v71 基础上补子图名前缀）：
//
// v72（v71 基础上补子图名前缀）：
//   * 问题：跨工作流时子图路径节点（119977:133796）兜底只显示 "Wait For Next Loop"，
//     丢失子图名。promptData（提交的 output）只含执行节点，不含子图容器（119977 查不到）。
//   * 方案：提交瞬间（queuePrompt/fetch 拦截处，此时 app.graph 还是任务工作流）
//     扫描 graph 缓存子图容器 id -> title（subgraphNames），切 B 后 nodeName 兜底
//     用 subgraphNames[first] 拼前缀，输出 "子图名(节点名)"（与 node1.0/2.0 画布内显示一致）。
//
// v71（v70 基础上 nodeName 兜底三级查找）：
//
// v71（v70 基础上 nodeName 兜底三级查找）：
//   * 真实验证：跨工作流时顶层节点已能显示节点名（116693->"视频预览"、
//     133774->"切换"、107531->"图像预览"），但子图路径 key（130847:130842）
//     仍显示数字——因为 promptData 里子图节点可能以完整路径 key 或执行节点
//     id 存在，而此前只查 first（容器 id）。
//   * 兜底顺序：完整路径 key -> 顶层 id -> 执行节点 id（最后一段）-> 画布类型。
//
// v70（v69 基础上两个显示稳定性防御）：
//
// v70（v69 基础上两个显示稳定性防御）：
//   * execution_start 若异常地在 executing 之后到达（2.0 子图/循环多触发），
//     不再无条件把 label 覆盖回"运行初始化…"——有进行中节点时保持节点名。
//   * executing 的 show 输入兜底 try/catch：任何解析异常都回退原始 key，
//     保证 label 一定更新，不会卡在初始化文本。
//
// v69（v68 基础上参考 rgthree 的 prompt_service.js 修正节点名解析）：
//
// v69（v68 基础上参考 rgthree 的 prompt_service.js 修正节点名解析）：
//   * rgthree 的 getNodeLabel 优先从提交的 prompt 数据解析：
//     promptApi[nodeId]?._meta?.title || class_type —— prompt 是提交时快照，
//     切换工作流后仍可用，所以 rgthree 跨工作流显示节点名不失效。
//   * 我此前 promptData 提取错误：ComfyUI 2.0 queuePrompt(num, {output,...})
//     的节点对象在 a.output，不是 a；fetch 拦截同理（parsed.prompt 才是）。
//     导致 promptData 存成了 {output:{...}} 外壳，class_type 兜底查不到。
//   * 本版修复：
//     - promptData = a.prompt || a.output || a（queuePrompt）；
//       parsed.prompt || parsed.output || parsed（fetch）。
//     - nodeName 兜底 1：promptData[first]._meta.title（真实节点名）优先，
//       其次 class_type（类型）——与 rgthree 一致。
//
// v68（v67 基础上修复跨工作流显示数字）：
//
// v68（v67 基础上修复跨工作流显示数字）：
//   * v67 已验证：跨工作流"点击跳转"（hash 切回 + 轮询等待 + 子图定位）真实生效。
//   * 本版修复显示层：parseTotal 只识别 {output:...} 结构，prompt 对象没有 output
//     导致 promptData 从未记录 -> nodeName 的 class_type 兜底失效 -> 切 B 后显示数字。
//     - fetch 拦截：请求体有节点对象（含 class_type）即记录 promptData，不再依赖
//       parseTotal 成功；totalNodes 仍只在 parseTotal 成功时更新。
//     - queuePrompt 拦截：同上，识别含 class_type 的 prompt 参数记录 promptData。
//     - executing 缓存：结果若是纯数字（解析失败）则不保留，后续重新解析——
//       切回任务工作流后能恢复显示真实节点名。
//
// v67（v66 基础上适配"切换工作流复用同一 graph 对象"）：
//
// v67（v66 基础上适配"切换工作流复用同一 graph 对象"）：
//   * 实测：ComfyUI 2.0 切换工作流标签时复用同一个 app.graph 对象（清空后
//     填充新工作流内容）。因此存 graph 对象引用（runTopGraph）在切换后
//     指向的内容已变成新工作流，解析/跳转全部失效。
//   * 修复：
//     - 提交运行时记录 runWorkflowHash = location.hash（工作流 id，稳定标识）；
//     - executing 时把 key -> 节点名缓存到 keyTitleCache（在任务工作流中
//       解析，切走前已缓存的仍显示节点名，新节点回退 class_type）；
//     - 点击跳转：若 location.hash 不是任务工作流，先 location.hash 切回，
//       轮询等待目标节点在 graph 中出现（大工作流加载慢），再定位。
//
// v66（v65 基础上修复 runTopGraph 作用域 bug）：
//   * v65 把 runTopGraph 声明在 setup() 闭包内，而 jumpToRunNode 是函数层
//     函数，访问 runTopGraph 触发 ReferenceError，被 try/catch 吞掉导致
//     点击跳转完全失效（实测 offset 不变）。
//   * 修复：runTopGraph 提升为函数层 let（setup 内使用同一变量，删除闭包
//     内声明，避免遮蔽）。
//
// v65（v64 基础上修复 DOM 重建导致 key 丢失）：
//   * 切子图 / 切工作流时顶部栏重渲染，#pt-run-indicator 被重建，dataset.ptKey
//     丢失；executing 在节点间隙（如采样中）不刷新，空窗内点击跳转失效。
//   * 修复：executing 时同步写 window.__pt_ri_key，document 委托点击时用
//     window.__pt_ri_key 兜底（dataset 优先），reset 时清空。
//
// v64（v62 基础上修复跨工作流切换）：
//   * 问题：在工作流 A 点击运行后切换到工作流 B，运行任务（executing 事件）
//     仍指向 A 的节点，但节点名解析 / 点击跳转用的是当前 app.graph（已变成
//     B 的顶层），导致显示全为数字、点击失效。
//   * 修复：提交运行时（queuePrompt / fetch / execution_start）记录
//     runTopGraph = 任务所属工作流顶层 graph；executing 显示名用
//     nodeName(key, runTopGraph) 解析；点击跳转先 setGraph(runTopGraph)
//     切回任务工作流视图，再在其上解析并定位节点。
//   * 若任务与当前工作流相同，runTopGraph === app.graph，行为与之前一致。
//
// v62（v61 基础上改 JS 驱动闪烁）：
//   * v61 用 CSS animation 实现闪烁，实测被前端全局样式覆盖
//     （.disable-animations * { animation-duration: 0.001ms }，指示条所在
//     顶栏容器命中该规则），computed animation-duration = 1e-06s，动画
//     瞬间播完，视觉上"不闪烁"。
//   * 改为 setInterval 直接改 box-shadow 透明度（sin 波 alpha 0.15~1，
//     100ms/步），完全绕开 CSS 动画级联，任何全局样式下都能闪烁。
//
// v61（v60 基础上加初始化内描边闪烁）：
//   * 点击运行（queuePrompt）或 execution_start 后，槽位显示"内描边 + 闪烁"
//     （蓝色 = 进度条蓝 = 运行按钮蓝，inset box-shadow + rgba 透明度闪烁）。
//   * 第一个 executing（节点开始执行）→ 描边消失，紧接着蓝色进度条出现。
//   * 中断 / 出错 / 完成 → 描边立即清除。
//   * 颜色跟随运行按钮实时同步（2s 轮询），闪烁描边用 --pt-init-blue-rgb 变量。
//
// v60（v59 基础上加抗覆盖）：
//   * v59 一步式实测：大子图首次进入时（页面加载后首次 graph 切换）ComfyUI
//     会播放一次 bbox 适配动画，把 offset 覆盖回子图整体视图（实测点击后
//     立即居中、2s 后被覆盖）；再次进入同一子图不再适配。为避免偶发覆盖，
//     新增 centerNodeAndSelect：立即居中后以 120ms interval 持续纠正，
//     offset 连续 5 次（600ms）未被外部改动即视为适配结束、提前选中，
//     3s 超时兜底。无适配时约 0.7s 完成，有适配时等动画结束后保持。
//
// v59（v58 基础上改为一步式自动进子图）：
//   * 实测（多组采样）：ComfyUI 2.0 的 canvas.openSubgraph / setGraph 切换
//     graph 均不播放 bbox 适配动画（v52 时代"适配动画覆盖 offset"结论是公式
//     错误下的误判）。因此去掉 interval 抗覆盖，改为一步式：
//     - 普通顶层节点：setGraph 回顶层（如需要）→ 直接居中 + 选中
//     - 子图内节点：setGraph 直接切到目标子图 → 直接居中内部节点 + 选中
//   * 多层嵌套 a:b:c 同理：切到 b.subgraph 后居中 c。
//   * 官方坐标验证：进子图后立即定位，2 秒后 offset 无覆盖，精确居中。
//
// v58（v57 基础上修正兼容判断）：
//   * v57 用"是否存在 convertOffsetToCanvas"区分新旧坐标映射，但 LiteGraph
//     1.x 的 DragAndScale 也有该方法（公式不同：1.x = pos*scale+offset，
//     2.x = (pos+offset)*scale），node1.0 上会误走新公式导致定位错乱。
//   * v58 改为行为探测 detectNewMapping()：用 convertOffsetToCanvas 对
//     一个测试点算结果，与新旧两种公式的预测对比（误差小的胜出），
//     dNew 实测可为 0 而 dOld 巨大，判定可靠；结果缓存避免重复计算。
//
// v57（v56 基础上修复，关键）：
//   * 修复"定位后画面空白/定位不上"的真正根因：ComfyUI 2.0 的屏幕坐标映射
//     不是 LiteGraph 1.x 的 screen = pos*scale + offset，而是
//     screen = (pos + offset) * scale（官方 ds.convertOffsetToCanvas 验证）。
//     v53~v56 用旧公式设 offset，数学上"居中"（用错误公式回读自洽）但实际
//     渲染全在画布外，用户看到"画面里什么也没有"。v57 改为
//     offset = [w/2/scale - cx, h/2/scale - cy]（cx/cy = 节点中心），
//     并按是否存在 convertOffsetToCanvas 自动兼容新旧坐标映射。
//
// v56（v55 基础上修复）：
//   * 修复"点击无反应"：ComfyUI 顶部栏运行中会重渲染，指示条 DOM 可能被
//     重建，原来绑在 pill 上的 click 监听器随之丢失（实测 testHits 触发但
//     jumpToRunNode 不执行）。改为 document 级事件委托（closest 匹配
//     #pt-run-indicator），不依赖 DOM 存活；用全局标志防止重复绑定。
//
// v55（v54 基础上修复）：
//   * 修复"当前视图不在 key 链上"时的错乱：在无关子图里点击（或子图里
//     点击普通节点）时，画布坐标系与目标节点坐标系不一致，直接设 offset
//     会跳到错误区域（实测：结束画板子图里点 117403 的 key 画面错乱）。
//     新增 jumpToTopNode：先 setGraph 回顶层，再带抗覆盖 interval 定位
//     容器节点（顶层 bbox 适配动画期间持续设置 offset，结束后选中）。
//
// v53（v52 基础上按用户要求）：
//   * 点击跳转改为"两步式"：子图内节点（key 形如 "容器id:子节点id"）
//     不再自动进入子图。顶层视图点击 → 只定位到子图容器节点（不进入），
//     用户手动进入子图后视图已稳定，再点一次 → 直接精确居中到内部节点。
//     多层嵌套 "a:b:c" 同理：在顶层定位 a，进 a 后定位 b，进 b 后定位 c。
//   * 好处：绕开 v52 自动进子图时画布 bbox 适配动画（数秒、分阶段）覆盖
//     offset 的问题；用户手动进入后无适配动画，一次 centerNodeOffset 即可。
//
// v52（v51 基础上按用户要求）：
//   * 点击指示条跳转升级：子图内节点（key 形如 "容器id:子节点id"）不再只
//     跳到子图容器，而是通过 canvas.openSubgraph 进入对应子图视图后定位到
//     内部节点；支持多层嵌套 "a:b:c"。openSubgraph 若被 subgraph-opening
//     事件取消，用 setGraph 兜底；失败降级为定位到顶层容器。
//   * 实测 centerOnNode 对子图内节点无效（不居中），进入子图后用
//     centerNodeOffset 直接设置 ds.offset 定位（已验证有效）。
//
// v51（v50 基础上修正）：
//   * PrimeReact tooltip 的样式是 hover 时组件内联赋值的，静态复用 class
//     拿不到（实测拿到 bg rgb(63,63,70)/16px/无描边 的其它全局样式）。
//   * 改为 text/arrow 内联硬编码实测值：text = bg rgb(23,23,24)、
//     border 1.25px solid rgb(73,74,80)、radius 6px、12px/400/12px、
//     padding 4px 8px；arrow = border-bottom 3.75px rgb(63,63,70)，
//     与"0 个活动任务"提示逐项一致。
//
// v50（v49 基础上按用户要求）：
//   * tooltip 改用 PrimeReact p-tooltip 结构（.p-tooltip-bottom +
//     .p-tooltip-arrow + .p-tooltip-text）。
//
// v49（v48 基础上按用户要求）：
//   * 增加 hover 效果：悬停指示条时背景高亮（同"0 个活动任务"按钮
//     rgb(49,50,53)）+ 下方 tooltip 提示"点击跳转实时运行节点处"。
//     实现：外层 .pt-wrap 容器承载 tooltip，避免被 pill 的 overflow 裁剪。
//
// v48（v47 基础上按用户要求）：
//   * 空闲时 pill 恢复 pointer-events:none（不拦截鼠标穿透），
//     运行时 executing() 置 auto 才可点击跳转。
//
// v47（v46 基础上按用户要求）：
//   * 新增：点击指示条跳转到当前运行节点（画布居中定位）。
//     运行中显示节点名时 pill 可点（cursor:pointer + title 提示），
//     空闲时点击无动作。
//
// v46（v45 基础上）：
//   * label 行高对齐"0 个活动任务"（动态读取，回退 20px），glyph 视觉中心
//     与两侧文字一致（实测两侧 line-height=20px 时中心差 0.00）。
//
// v45（v44 基础上）：
//   * 修正视觉偏上：移除 pill 的 line-height 下传，label 用 line-height:normal，
//     由 flex align-items:center 精确垂直居中文字。
//
// v44（v43 基础上）：
//   * 文字字重也动态读取"0 个活动任务"（回退 400），与右侧任务文字完全一致。
//
// v43（v42 基础上按用户要求）：
//   * 文字字号改为与右侧"0 个活动任务"一致（动态读取，回退 12px）。
//
// v42（v41 基础上按用户要求）：
//   * 去掉文字层 text-shadow（进度条覆盖文字时不再有阴影）。
//
// 功能：画布右上角常驻指示条：整体执行进度 + 采样进度 + 当前节点名。
//
// v41（修复：节点显示卡住，与 rgthree 不同步）：
//   * 原因：v40 监听 socket 原始消息并取 d.node（real node id），在子图/
//     循环中 real id 稳定 -> 节点切换检测不到 -> 显示卡住；
//     而 rgthree 监听 app.api 的 "executing" CustomEvent（不同数据源），
//     能跟随节点切换。
//   * 修复：executing 改用 app.api.addEventListener("executing")，与 rgthree
//     完全同源；detail 兼容数字/对象/display_node 路径。
//   * progress / execution_cached 仍走 socket（事件源无或不可靠）。
//
// v40：出错红=红X按钮色；中断不变色。
// v39：修复蓝色与运行按钮不一致（定时同步按钮蓝）。
// v38：状态色降饱和。
// v37：移除模型加载提示。
// v36：完成补拉/出错变色/类型兜底/rAF节流。
// v35：槽位背景色与右侧槽位一致。
// v32：整个 pill 即进度槽（无小轨道，文字覆盖进度条）。
// v29：严格对齐 rgthree 计数（cached 逐节点切换计数 + real node id 去重）。
// v20 起：红X右侧；蓝色同运行按钮；双条重叠；单调钳制不回退。

import { app } from "../../scripts/app.js";

const INDICATOR_ID = "pt-run-indicator";

// 状态色（v38 降饱和；v40 出错红改为动态读取红X，此处为兜底）
const COLOR_STEP = "#c4ac4e";    // 采样进度（柔和金）
const COLOR_ERROR_FALLBACK = "#b85c5f"; // 出错红兜底（优先红X按钮色）
// v108：按节点类型区分进度条颜色（全部低饱和度，与柔和金同档次）
const STEP_COLORS = {
    sampler: "#c49a9a",   // 采样器节点 — 柔和暗红（与SAMPLER统一，区别于clip暗黄）
    image: "#7a9ec4",     // IMAGE — 柔和蓝
    mask: "#8fb88a",      // MASK — 柔和绿
    model: "#a89ac4",     // MODEL — 柔和紫
    conditioning: "#c49a7a", // CONDITIONING — 柔和橙
    latent: "#c48a9a",    // LATENT — 柔和粉
    clip: "#c4b84e",      // CLIP — 柔和暗黄
    vae: "#b87a7a",       // VAE — 柔和暗红
    controlnet: "#8ab8a8",// CONTROL_NET — 柔和青绿
    clip_vision: "#9ab8b8", // CLIP_VISION — 柔和浅蓝
    clip_vision_output: "#a88a6a", // CLIP_VISION_OUTPUT — 柔和棕
    style_model: "#a8c49a", // STYLE_MODEL — 柔和浅绿
    sampler_type: "#c49a9a", // SAMPLER数据类型 — 柔和暗红（官方SAMPLER色相）
    sigmas: "#a8c4a8",    // SIGMAS — 柔和浅绿
    guider: "#8ac4c4",    // GUIDER — 柔和青
    noise: "#9a9a9a",     // NOISE — 柔和灰
    taesd: "#c49a9a",     // TAESD — 柔和暗红（与SAMPLER统一）
    control_flow: "#9ab8b8", // 控制流/循环 — 柔和青
    default: "#9a9a9a"    // 其他 — 柔和灰
};
// v108：判断节点是否已知有真实进度（这些节点不启动模拟进度，避免虚假进度）
function hasRealProgressType(classType) {
    const t = String(classType || "").toLowerCase();
    if (!t) return false;
    // 采样器、自回归文本编码器、部分VAE/音频节点等已知会发progress事件
    return /sampler|ksampler|sampling|diffusion|ace15|llama|qwen|yue|t5.*encode|seedvr|sheetsage|minimax.*music|audio.*generate|music.*generate/.test(t);
}
// 根据节点class_type判断进度条颜色
function stepColorForType(classType) {
    const t = String(classType || "").toLowerCase();
    if (!t) return STEP_COLORS.default;
    // v123：按数据类型关键词匹配，更具体的关键词优先
    if (/sampler|ksampler|sampling|diffusion/.test(t)) return STEP_COLORS.sampler; // 采样器节点=暗红
    if (/loop|for|while|if|switch|control_flow/.test(t)) return STEP_COLORS.control_flow; // 控制流/循环=青
    if (/clip_vision_output/.test(t)) return STEP_COLORS.clip_vision_output;
    if (/clip_vision/.test(t)) return STEP_COLORS.clip_vision;
    if (/style_model/.test(t)) return STEP_COLORS.style_model;
    if (/controlnet|control_net/.test(t)) return STEP_COLORS.controlnet;
    if (/image/.test(t)) return STEP_COLORS.image;
    if (/mask/.test(t)) return STEP_COLORS.mask;
    if (/model|unet/.test(t)) return STEP_COLORS.model;
    if (/conditioning/.test(t)) return STEP_COLORS.conditioning;
    if (/latent/.test(t)) return STEP_COLORS.latent;
    if (/clip/.test(t)) return STEP_COLORS.clip;
    if (/vae/.test(t)) return STEP_COLORS.vae;
    if (/sigmas/.test(t)) return STEP_COLORS.sigmas;
    if (/guider/.test(t)) return STEP_COLORS.guider;
    if (/noise/.test(t)) return STEP_COLORS.noise;
    if (/taesd/.test(t)) return STEP_COLORS.taesd;
    return STEP_COLORS.default;
}

// v123：取节点第一个输入连接点的 ComfyUI 官方颜色（类型名正则匹配不到时的兜底）
function stepColorForFirstConnection(node) {
    if (!node) return null;
    const colorMap = (app.canvas && app.canvas.default_connection_color_byType) || {};
    // 优先取第一个输入连接点
    const inputs = node.inputs || [];
    for (let i = 0; i < inputs.length; i++) {
        const t = inputs[i].type;
        if (t && t !== '*' && colorMap[t]) return colorMap[t];
    }
    // 没有有效输入时取第一个输出连接点
    const outputs = node.outputs || [];
    for (let i = 0; i < outputs.length; i++) {
        const t = outputs[i].type;
        if (t && t !== '*' && colorMap[t]) return colorMap[t];
    }
    return null;
}

let promptData = null;   // 最近一次提交的 prompt 对象（class_type 兜底查）
let subgraphNames = {};  // v72：提交瞬间扫描任务工作流 graph 缓存的子图容器 id -> title
const promptHistory = []; // v74：最近提交的 prompt 对象（按工作流 hash 去重）
let activeWorkflowHash = ""; // v76：当前执行节点所属提交的工作流 hash（跨工作流跳转目标）
function rememberPrompt(hash, pd, sg) {
    if (!pd || typeof pd !== "object") return;
    const idx = promptHistory.findIndex(h => h.hash === hash);
    if (idx >= 0) promptHistory.splice(idx, 1);
    // v76：记录该提交工作流的子图容器名映射（跨工作流前缀 + 跳转）
    promptHistory.unshift({ hash: hash, prompt: pd, subgraphNames: sg || {} });
    if (promptHistory.length > 100) promptHistory.pop(); // v77：上限 100（用户建议）
}
// v76：查找包含某 key（完整路径或顶层 id）的提交记录
const findRec = (k) => {
    const ks = String(k);
    const first = ks.split(":")[0];
    for (const rec of promptHistory) {
        if (!rec || !rec.prompt) continue;
        if (rec.prompt[ks] || rec.prompt[first]) return rec;
    }
    return null;
};

// 找"运行"按钮（优先文字"运行"，其次 aria/标题含"运行"）
function findRunButton() {
    const btns = [...document.querySelectorAll("button")];
    return btns.find(b => (b.innerText || "").trim() === "运行")
        || btns.find(b => ((b.getAttribute("aria-label") || "") + (b.title || "")).includes("运行"));
}

// 找"取消当前任务"（红X）按钮
function findCancelButton() {
    return [...document.querySelectorAll("button")].find(b =>
        (b.getAttribute("aria-label") || "").includes("取消当前任务")
    );
}

// 读取"运行"按钮背景色（找不到时回退蓝色）——整体进度条与之保持一致
function runButtonColor() {
    const run = findRunButton();
    if (run) {
        const c = getComputedStyle(run).backgroundColor;
        if (c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent") return c;
        const svg = run.querySelector("svg");
        if (svg) {
            const s = getComputedStyle(svg.querySelector("*") || svg).fill || getComputedStyle(svg.querySelector("*") || svg).stroke;
            if (s && s !== "none" && s !== "rgba(0, 0, 0, 0)") return s;
        }
    }
    return "#1e6bff";
}

// 读取"取消当前任务"（红X）按钮颜色——出错进度条与之保持一致
function cancelButtonColor() {
    const cancelBtn = findCancelButton();
    if (cancelBtn) {
        const c = getComputedStyle(cancelBtn).backgroundColor;
        if (c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent") return c;
        const svg = cancelBtn.querySelector("svg");
        if (svg) {
            const s = getComputedStyle(svg.querySelector("*") || svg).fill || getComputedStyle(svg.querySelector("*") || svg).stroke;
            if (s && s !== "none" && s !== "rgba(0, 0, 0, 0)") return s;
        }
    }
    return COLOR_ERROR_FALLBACK;
}

// 读取"运行"按钮高度（找不到时回退 32）
function runButtonHeight() {
    const run = findRunButton();
    if (!run) return 32;
    const h = run.getBoundingClientRect().height;
    return h > 0 ? Math.round(h) : 32;
}

// 找"0 个活动任务"文字元素（最内层匹配）
function findTaskCountEl() {
    const hits = [...document.querySelectorAll("span, div, a, button")]
        .filter(el => {
            const t = (el.textContent || "").trim();
            return /个活动任务/.test(t) && t.length < 40;
        });
    let best = null, bestLen = Infinity;
    for (const el of hits) {
        const t = (el.textContent || "").trim();
        if (t.length < bestLen) { bestLen = t.length; best = el; }
    }
    return best;
}

// 读取"0 个活动任务"字号（找不到时回退 12px）——与右侧任务文字一致
function taskCountFontSize() {
    const best = findTaskCountEl();
    if (best) {
        const fs = getComputedStyle(best).fontSize;
        if (fs && fs !== "0px" && fs !== "0") return fs;
    }
    return "12px";
}

// 读取"0 个活动任务"字重（找不到时回退 400）——与右侧任务文字一致
function taskCountFontWeight() {
    const best = findTaskCountEl();
    if (best) {
        const fw = getComputedStyle(best).fontWeight;
        if (fw && fw !== "0") return fw;
    }
    return "400";
}

// 读取"0 个活动任务"行高（找不到时回退 20px）——与右侧任务文字一致
function taskCountLineHeight() {
    const best = findTaskCountEl();
    if (best) {
        const lh = getComputedStyle(best).lineHeight;
        if (lh && lh !== "normal" && lh !== "0px") return lh;
    }
    return "20px";
}

// 读取 pill 右侧槽位背景色（右侧兄弟元素中第一个有实际背景的）
function neighborColor(el) {
    let sib = el.nextElementSibling;
    while (sib) {
        const c = getComputedStyle(sib).backgroundColor;
        if (c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent") return c;
        sib = sib.nextElementSibling;
    }
    return null;
}

function mountToToolbar() {
    try {
        // 优先锚点："取消当前任务"（红X）-> pill 插到它右侧
        const cancelBtn = findCancelButton();
        const runBtn = findRunButton();
        const anchor = cancelBtn || runBtn || [...document.querySelectorAll("button")].find(b =>
            (b.innerText || "").includes("管理扩展功能")
        );
        if (!anchor || !anchor.parentElement) return false;
        const parent = anchor.parentElement;
        if (parent.querySelector("#" + INDICATOR_ID)) {
            try { updateCupBtnState(); } catch (e) {}
            return true;
        }
        const pillH = runButtonHeight();
        const fontSize = taskCountFontSize();
        const fontWeight = taskCountFontWeight();
        const lineHeight = taskCountLineHeight();
        const blue = runButtonColor();
        // 外层 wrap：承载 hover 高亮 + tooltip（pill 的 overflow 不裁剪外部提示）
        const wrap = document.createElement("div");
        wrap.className = "pt-wrap";
        wrap.style.cssText = `
            position: relative;
            display: flex;
            align-items: center;
            margin-right: 8px;
            margin-left: 8px;
            height: ${pillH}px;
        `;
        // v78：茶杯图标按钮（运行等待区切换）
        const cupBtn = document.createElement("div");
        cupBtn.id = "pt-cup-btn";
        cupBtn.style.cssText = `
            position: relative;
            box-sizing: border-box;
            height: ${pillH}px;
            width: 36px;
            background: rgba(128,128,128,.3);
            border-radius: 8px;
            display: flex; align-items: center; justify-content: center;
            cursor: pointer;
            user-select: none;
            pointer-events: auto;
            color: rgba(255,255,255,0.45); /* 茶杯图标：无等待区时稍暗 */
            flex-shrink: 0;
        `;
        cupBtn.innerHTML = `<svg id="pt-cup-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h11v7a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V9z"/><path d="M15 10h2.5a2.5 2.5 0 0 1 0 5H15"/><path d="M7 4c0 1 1 1 1 2M10 4c0 1 1 1 1 2"/></svg>`;
        cupBtn.title = "";
        cupBtn.tabIndex = 0; /* 可聚焦：鼠标点击也触发 :focus 蓝边（Chrome/Edge 一致） */
        // 茶杯外层：承载独立 tooltip + hover 高亮
        const cupWrap = document.createElement("div");
        cupWrap.className = "pt-cup-wrap";
        cupWrap.style.cssText = `
            position: relative;
            height: ${pillH}px;
            display: flex; align-items: center;
            flex-shrink: 0;
        `;
        cupWrap.appendChild(cupBtn);
        // 茶杯 tooltip：复用 PrimeReact p-tooltip 结构/class
        const cupTip = document.createElement("div");
        cupTip.className = "pt-cup-tip p-tooltip p-component p-tooltip-bottom";
        cupTip.style.cssText = `
            position: absolute; top: calc(100% + 6px); left: 50%; transform: translateX(-50%);
            white-space: nowrap; max-width: none; z-index: 9999; pointer-events: none;
            opacity: 0; visibility: hidden;
        `;
        const cupTipArrow = document.createElement("div");
        cupTipArrow.className = "p-tooltip-arrow";
        cupTipArrow.style.cssText = `
            display: block; position: absolute;
            top: -3.75px; left: 50%; margin-left: -4px;
            border-left: 3.75px solid transparent;
            border-right: 3.75px solid transparent;
            border-bottom: 3.75px solid rgb(63, 63, 70);
        `;
        const cupTipText = document.createElement("div");
        cupTipText.className = "p-tooltip-text";
        cupTipText.style.cssText = `
            display: block; white-space: nowrap;
            background: rgb(23, 23, 24); color: rgb(255, 255, 255);
            border: 1.25px solid rgb(73, 74, 80); border-radius: 6px;
            font-size: 12px; font-weight: 400; line-height: 12px;
            padding: 4px 8px;
        `;
        cupTipText.textContent = "点击进入运行等待区，再次点击退出";
        cupTip.appendChild(cupTipArrow);
        cupTip.appendChild(cupTipText);
        cupWrap.appendChild(cupTip);

        const pill = document.createElement("div");
        pill.id = INDICATOR_ID;
        pill.style.cssText = `
            position: relative;
            box-sizing: border-box;
            height: ${pillH}px;              /* 与两侧按钮同高 */
            width: 240px;                    /* 固定宽度 */
            background: rgba(128,128,128,.3);/* 轨道底色（挂载后取右侧槽位色） */
            border-radius: 8px;
            overflow: hidden;
            font-size: ${fontSize};          /* 与右侧任务文字一致 */
            font-weight: ${fontWeight};
            white-space: nowrap;
            pointer-events: none;  /* 空闲不可点；运行时 executing() 置 auto */
            cursor: default;
            user-select: none;
            color: var(--text-secondary-foreground, #ffffff);
        `;
        // 蓝色整体进度条（铺满 pill，颜色 = 运行按钮蓝）
        const totalBar = document.createElement("div");
        totalBar.id = "pt-total-bar";
        totalBar.style.cssText = `
            position: absolute; left:0; top:0; bottom:0;
            width:0%; background:${blue};
            transition: width .15s linear;

        `;
        pill.appendChild(totalBar);
        // 柔和金采样条（铺满 pill，覆盖在蓝色上）
        const stepBar = document.createElement("div");
        stepBar.id = "pt-step-bar";
        stepBar.style.cssText = `
            position: absolute; left:0; top:0; bottom:0;
            width:0%; background:${COLOR_STEP};

            display: none;
        `;
        pill.appendChild(stepBar);
        // 文字层（覆盖在进度条上方）
        const labelEl = document.createElement("div");
        labelEl.id = "pt-run-label";
        labelEl.style.cssText = `
            position: absolute; left:0; top:0; right:0; bottom:0;
            display:flex; align-items:center; justify-content:center;
            line-height: ${lineHeight};
            overflow:hidden; text-overflow:ellipsis;
            padding: 0 8px;
            z-index: 2;
        `;
        labelEl.textContent = "实时运行节点";
        pill.appendChild(labelEl);
        // tooltip：完全复用 PrimeReact p-tooltip 结构/class（背景、描边、圆角、文字全部一致）
        const tip = document.createElement("div");
        tip.className = "pt-tip p-tooltip p-component p-tooltip-bottom";
        tip.style.cssText = `
            position: absolute; top: calc(100% + 6px); left: 50%; transform: translateX(-50%);
            display: none; white-space: nowrap; max-width: none; z-index: 9999; pointer-events: none;
        `;
        const tipArrow = document.createElement("div");
        tipArrow.className = "p-tooltip-arrow";
        tipArrow.style.cssText = `
            display: block; position: absolute;
            top: -3.75px; left: 50%; margin-left: -4px;
            border-left: 3.75px solid transparent;
            border-right: 3.75px solid transparent;
            border-bottom: 3.75px solid rgb(63, 63, 70);
        `;
        const tipText = document.createElement("div");
        tipText.className = "p-tooltip-text";
        tipText.style.cssText = `
            display: block; white-space: nowrap;
            background: rgb(23, 23, 24); color: rgb(255, 255, 255);
            border: 1.25px solid rgb(73, 74, 80); border-radius: 6px;
            font-size: 12px; font-weight: 400; line-height: 12px;
            padding: 4px 8px;
        `;
        tipText.textContent = "点击跳转实时运行节点处";
        tip.appendChild(tipArrow);
        tip.appendChild(tipText);
        wrap.appendChild(cupWrap);
        wrap.appendChild(pill);
        wrap.appendChild(tip);
        // 取消当前任务（红X）-> 插到它右侧；其它锚点 -> 插到左边
        if (anchor === cancelBtn) {
            anchor.after(wrap);
        } else {
            anchor.parentElement.insertBefore(wrap, anchor);
        }
        // 槽位背景色与右侧槽位一致（wrap 的右侧兄弟）
        const nc = neighborColor(wrap);
        if (nc) { pill.style.background = nc; cupBtn.style.background = nc; }
        // 点击指示条 -> 跳转到当前运行节点。
        // 用 document 级事件委托：ComfyUI 顶部栏运行中会重渲染，指示条 DOM
        // 可能被重建导致直接绑定的监听器丢失（实测点击无反应），委托到
        // document 后无论 DOM 重建多少次都有效；全局标志防重复绑定。
        if (!window.__pt_ri_docBound) {
            window.__pt_ri_docBound = true;
            document.addEventListener("click", (e) => {
                const t = e.target;
                if (!t || !t.closest) return;
                if (t.closest("#pt-cup-btn")) { e.stopPropagation(); toggleWaitingRoom(); return; }
                if (!t.closest("#pt-run-indicator")) return;
                const pillEl = document.getElementById("pt-run-indicator");
                const dk = (pillEl && pillEl.dataset) ? pillEl.dataset.ptKey : null;
                const wk = window.__pt_ri_key || null;
                const key = dk || wk; // v65：DOM 重建丢 dataset 时用 window 级持久 key
                if (!key) return;
                e.stopPropagation();
                jumpToRunNode(key);
            });
        }
        try { updateCupBtnState(); } catch (e) {}
        return true;
    } catch (e) {
        return false;
    }
}

function centerNode(canvas, node) {
    if (!canvas || !node) return false;
    if (typeof canvas.centerOnNode === "function") {
        canvas.centerOnNode(node);
        return true;
    }
    if (canvas.ds) {
        const w = canvas.canvas ? canvas.canvas.width : window.innerWidth;
        const h = canvas.canvas ? canvas.canvas.height : window.innerHeight;
        const cx = node.pos[0] + (node.size ? node.size[0] / 2 : 0);
        const cy = node.pos[1] + (node.size ? node.size[1] / 2 : 0);
        const s = canvas.ds.scale || 1;
        if (typeof canvas.ds.convertOffsetToCanvas === "function") {
            // ComfyUI 2.0：screen = (pos + offset) * scale → offset = 目标中心/scale - pos
            canvas.ds.offset = [w / 2 / s - cx, h / 2 / s - cy];
        } else {
            // ComfyUI 1.x：screen = pos * scale + offset
            canvas.ds.offset = [-cx * s + w / 2, -cy * s + h / 2];
        }
        if (typeof canvas.setDirty === "function") canvas.setDirty(true, true);
        return true;
    }
    return false;
}

// 直接设置 ds.offset 居中（对子图内节点有效；centerOnNode 对子图节点无效）
// 行为探测坐标映射：ComfyUI 2.0（LiteGraph 2.x）为 screen = (pos + offset) * scale，
// 1.x 为 screen = pos * scale + offset。用 convertOffsetToCanvas 对测试点算结果，
// 与两种公式预测对比，误差小的胜出（实测 2.0 上 dNew=0、dOld 巨大）。
let runTopGraph = null;
let waitingRoomReturn = null; // v78：进入等待室前的 {graph, offset, scale}
// v82：对当前所在等待区子图做一次"两行水平对齐 + 整体居中(scale=1)"，返回中心 key（尺寸未就绪返回 null）
function recenterWaitingRoom() {
    try {
        const canvas = app.canvas;
        if (!canvas || !canvas.ds || !canvas.graph) return null;
        const g = canvas.graph, ds = canvas.ds;
        const labels = (g._nodes || []).filter(n => n && n.type === "Text Label");
        if (!labels.length) return null;
        const t1 = labels[0], t2 = labels[1] || labels[0];
        const W = canvas.canvas.clientWidth, H = canvas.canvas.clientHeight;
        if (t1 && t2 && t1.size && t2.size && t1.size[0] > 0 && t2.size[0] > 0) {
            t2.pos[0] = t1.pos[0] + t1.size[0] / 2 - t2.size[0] / 2;
            // v109：垂直排列——第二行顶部 = 第一行底部 + 15px（根据第一行实际高度，避免字号/padding/背景变大后重叠）
            t2.pos[1] = t1.pos[1] + t1.size[1] + 15;
            const cx = t1.pos[0] + t1.size[0] / 2;
            const cy = t1.pos[1] + (t1.size[1] + 15 + t2.size[1]) / 2;
            ds.scale = 1.0;
            ds.offset = [W / 2 - cx, H / 2 - cy];
            if (typeof canvas.setDirty === "function") canvas.setDirty(true, true);
            return Math.round(cx) + ":" + Math.round(cy);
        }
        ds.scale = 1.0;
        ds.offset = [W / 2 - 562, H / 2 - 210];
        if (typeof canvas.setDirty === "function") canvas.setDirty(true, true);
        return null;
    } catch (e) { return null; }
}
// v82：网页缩放/窗口尺寸变化时，若正在等待区则延迟重新对齐居中（解决非100%网页缩放小字偏左）
let __roomResizeBound = false, __roomResizeTimer = null;
function ensureRoomResizeListener() {
    if (__roomResizeBound) return;
    __roomResizeBound = true;
    window.addEventListener("resize", () => {
        try {
            const canvas = app.canvas;
            if (!inWaitingRoom()) return; // v83：跟随当前 graph 判断，跨工作流正确
            if (__roomResizeTimer) clearTimeout(__roomResizeTimer);
            __roomResizeTimer = setTimeout(() => recenterWaitingRoom(), 150);
        } catch (e) {}
    });
}
let runWorkflowHash = ""; // 运行任务所属工作流 id（location.hash，切换后 graph 对象被复用，靠 hash 切回）
let keyTitleCache = {};   // key -> 节点名缓存（切走前解析，切走后新节点回退 class_type）
let PT_USE_NEW_MAPPING = null;
function detectNewMapping() {
    try {
        const cv = app && app.canvas, ds = cv && cv.ds;
        if (!ds || typeof ds.convertOffsetToCanvas !== "function") return false; // 无 API → 1.x 旧公式
        const sc = ds.scale || 1;
        const off = ds.offset || [0, 0];
        const p = ds.convertOffsetToCanvas([0, 1]);
        const dOld = Math.abs(p[0] - off[0]) + Math.abs(p[1] - (1 * sc + off[1]));
        const dNew = Math.abs(p[0] - off[0] * sc) + Math.abs(p[1] - (1 + off[1]) * sc);
        return dNew <= dOld;
    } catch (err) { return false; }
}
function centerNodeOffset(canvas, node) {
    if (!canvas || !node || !canvas.ds) return;
    try {
        const w = canvas.canvas ? canvas.canvas.width : window.innerWidth;
        const h = canvas.canvas ? canvas.canvas.height : window.innerHeight;
        const cx = node.pos[0] + (node.size ? node.size[0] / 2 : 0);
        const cy = node.pos[1] + (node.size ? node.size[1] / 2 : 0);
        const s = canvas.ds.scale || 1;
        if (PT_USE_NEW_MAPPING === null) PT_USE_NEW_MAPPING = detectNewMapping();
        if (PT_USE_NEW_MAPPING) {
            // ComfyUI 2.0：screen = (pos + offset) * scale → offset = 目标中心/scale - pos
            canvas.ds.offset = [w / 2 / s - cx, h / 2 / s - cy];
        } else {
            // ComfyUI 1.x：screen = pos * scale + offset
            canvas.ds.offset = [-cx * s + w / 2, -cy * s + h / 2];
        }
        if (typeof canvas.setDirty === "function") canvas.setDirty(true, true);
    } catch (err) { /* ignore */ }
}

// 居中定位 + 抗适配覆盖 + 稳定后选中：立即 centerNodeOffset 后以 120ms
// interval 持续纠正，offset 连续 5 次（600ms）未被外部改动（适配动画改写）
// 即提前结束并选中，3s 超时兜底。无适配时约 0.7s 完成。
function centerNodeAndSelect(canvas, node) {
    if (!canvas || !node) return;
    try {
        // v87：定位时若当前缩放过小（如被 fit 到远处节点的 0.0x 视图，居中也看不清），
        // 仅在 <0.5 时放大到 1.0；不主动缩小用户放大的视图。
        if (canvas.ds && (canvas.ds.scale || 1) < 0.5) canvas.ds.scale = 1.0;
        centerNodeOffset(canvas, node);
        let last = null, stable = 0, done = false;
        const finish = () => {
            if (done) return;
            done = true;
            clearInterval(iv);
            selectNodeSafe(canvas, node);
        };
        // v103：用户主动按下鼠标（拖拽画布/缩放）时立即停止抗覆盖，
        // 避免手动操作被 interval 强制重新居中。ComfyUI 内部动画仍在前几帧被抗覆盖。
        const stopOnUser = () => { finish(); document.removeEventListener("pointerdown", stopOnUser, true); };
        document.addEventListener("pointerdown", stopOnUser, true);
        const iv = setInterval(() => {
            if (done) return;
            const cur = canvas.ds.offset.slice();
            if (last && Math.abs(cur[0] - last[0]) < 0.5 && Math.abs(cur[1] - last[1]) < 0.5) {
                stable++;
                if (stable >= 5) { finish(); document.removeEventListener("pointerdown", stopOnUser, true); return; }
            } else {
                stable = 0;
                centerNodeOffset(canvas, node);
            }
            last = cur;
        }, 120);
        setTimeout(() => { finish(); document.removeEventListener("pointerdown", stopOnUser, true); }, 3000);
    } catch (err) { /* ignore */ }
}

// 将节点设为选中状态：节点重叠时靠选中描边区分。
// v87：ComfyUI 2.0 新版 canvas.selectNode 为空操作，须用 selectNodes([node])
// 才真正置选中（flags.selected + selectedItems 集合 + 白色描边）；
// 旧版（node1.0）回退 selectNode，再不行手动置 flags（LiteGraph 兼容）。
function selectNodeSafe(canvas, node) {
    if (!canvas || !node) return;
    try {
        if (typeof canvas.selectNodes === "function") {
            try {
                if (typeof canvas.deselectAllNodes === "function") canvas.deselectAllNodes();
                else if (typeof canvas.deselectAll === "function") canvas.deselectAll();
            } catch (e) {}
            canvas.selectNodes([node]);
            if (node.flags && node.flags.selected) return;
        }
        if (typeof canvas.selectNode === "function") {
            canvas.selectNode(node);
            if (node.flags && node.flags.selected) return;
        }
    } catch (err) { /* 落到手动兜底 */ }
    try {
        node.flags = node.flags || {};
        node.flags.selected = true;
        canvas.selected_nodes = canvas.selected_nodes || {};
        canvas.selected_nodes[node.id] = node;
        if (canvas.selectedItems instanceof Set) canvas.selectedItems.add(node); // 2.0 选中集合
        if (typeof canvas.setDirty === "function") canvas.setDirty(true, true);
    } catch (err) { /* ignore */ }
}

// 从任意视图回到指定工作流顶层并定位顶层节点：setGraph 切图无 bbox 适配
// 动画（v59 实测），切图后直接居中 + 选中。topGraph 缺省时用 app.graph。
function jumpToTopNode(canvas, topNode, topGraph) {
    if (!canvas || !topNode) return;
    try {
        const g = topGraph || app.graph;
        if (canvas.graph !== g && typeof canvas.setGraph === "function") {
            canvas.setGraph(g);
        }
        centerNodeAndSelect(canvas, topNode);
    } catch (err) { /* ignore */ }
}

function findInGraph(graph, id) {
    if (!graph) return null;
    const gid = String(id);
    if (graph._nodes_by_id && graph._nodes_by_id[gid]) return graph._nodes_by_id[gid];
    if (graph._nodes_by_id && graph._nodes_by_id[Number(id)] !== undefined) return graph._nodes_by_id[Number(id)];
    if (graph._nodes) return graph._nodes.find(n => String(n.id) === gid) || null;
    if (graph.nodes) return graph.nodes.find(n => String(n.id) === gid) || null;
    return null;
}

// v88：两步式子图定位（恢复 v53 语义，修正 v87 误做的"自动进入"）。
// 每次点击只在"当前所在层"定位，绝不自动进入子图：
//   - 在顶层点子图内节点：只居中+选中该子图容器节点（不进入），引导手动进入；
//   - 手动进入子图后再点：目标就在本层则居中+选中内部节点；还嵌一层则定位本层入口容器；
//   - 停在无关子图：先回顶层再定位顶层容器。
// 不自动 openSubgraph 的原因：自动进入触发 bbox 适配动画覆盖定位（v52 教训），
// 手动进入后视图稳定，一次居中即准。
function jumpInGraph(parts, topNode, runGraph) {
    try {
        const canvas = app.canvas || (app.graph && app.graph.canvas);
        if (!canvas || !topNode) return;
        if (parts.length === 1) { jumpToTopNode(canvas, topNode, runGraph); return; }
        // 容器链：layerNodes[i]=第 i 层节点（0=顶层容器），layerGraphs[i]=其所在 graph
        const layerNodes = [topNode];
        const layerGraphs = [runGraph];
        let g = topNode.subgraph;
        for (let i = 1; i < parts.length; i++) {
            const nxt = findInGraph(g, parts[i]);
            if (!nxt) break;
            layerNodes.push(nxt);
            layerGraphs.push(g);
            g = nxt.subgraph ? nxt.subgraph : g;
            if (!nxt.subgraph) break;
        }
        // 当前视图位于第几层（canvas.graph 与哪一层 graph 相等）
        let depth = -1;
        for (let i = 0; i < layerGraphs.length; i++) {
            if (layerGraphs[i] === canvas.graph) { depth = i; break; }
        }
        if (depth < 0) {
            // 停在无关子图：先回顶层
            if (canvas.graph !== runGraph && typeof canvas.setGraph === "function") canvas.setGraph(runGraph);
            depth = 0;
        }
        if (depth >= layerNodes.length - 1) {
            // 已到目标节点所在层：居中 + 选中内部节点
            centerNodeAndSelect(canvas, layerNodes[layerNodes.length - 1]);
        } else {
            // 中间层：定位当前层入口容器（在当前视图坐标系内），不自动进入
            centerNodeAndSelect(canvas, layerNodes[depth]);
        }
    } catch (err) { /* ignore */ }
}

// 点击跳转（一步式，v59）：普通顶层节点回顶层居中；子图内节点（key 含 ":"）
// 自动 setGraph 进入最终节点所在子图并精确居中内部节点。实测 setGraph 切换
// graph 无 bbox 适配动画，故无需 interval 抗覆盖。多层嵌套 "a:b:c" 同理：
// 切到 b.subgraph 后居中 c。
// v67：跨工作流——切换工作流复用同一 app.graph 对象（内容被替换），无法靠
// graph 引用切回；改用 location.hash 切回任务工作流，轮询等待目标节点在
// graph 中出现（大工作流加载慢），再在加载完成后的 graph 上定位。
function jumpToRunNode(key) {
    try {
        const parts = String(key).split(":");
        if (!parts.length || !parts[0]) return;
        const canvas = app.canvas || (app.graph && app.graph.canvas);
        if (!canvas) return;
        // 跨工作流：当前 hash 不是任务工作流 -> 切回 + 轮询等加载
        // v76：目标 = 当前执行节点所属提交的工作流（activeWorkflowHash），
        //       而非"最新提交"（A 在跑时提交 B，点槽位应回 A）
        const targetHash = activeWorkflowHash || runWorkflowHash;
        if (targetHash && location.hash !== targetHash) {
            location.hash = targetHash;
            const waitId = parts[0];
            const t0 = Date.now();
            const iv = setInterval(() => {
                if (Date.now() - t0 > 20000) { clearInterval(iv); return; }
                const topNode = findNode(waitId, app.graph);
                if (!topNode) return; // 还在加载，继续等
                clearInterval(iv);
                jumpInGraph(parts, topNode, app.graph);
            }, 400);
            return;
        }
        // 同工作流：v87 两步式——不强制回顶层，jumpInGraph 按当前所在层级每次只深入一层
        const runGraph = runTopGraph || app.graph;
        const topNode = findNode(parts[0], runGraph);
        if (!topNode) return;
        jumpInGraph(parts, topNode, runGraph);
    } catch (err) { /* ignore */ }
}

// v78：找当前 graph 中标题为"运行等待区"的子图节点
// v104：读取等待区配置（run_indicator_waiting_room_config.js），缺失字段用默认值兜底
function getRoomConfig() {
    const cfg = (typeof window !== "undefined" && window.PT_WAITING_ROOM_CONFIG) || {};
    const def = {
        line1: { text: "大型工作流运行期间，请在此处等待可加快渲染。", fontSize: 42, lineHeight: 1, fontColor: "#ffffff", fontFamily: "Arial", fontWeight: "normal", textAlign: "center", backgroundColor: "transparent", borderRadius: 0, padding: 0 },
        line2: { text: "提醒：点击茶杯图标返回工作流节点区", fontSize: 18, lineHeight: 1, fontColor: "#ffffff", fontFamily: "Arial", fontWeight: "normal", textAlign: "center", backgroundColor: "transparent", borderRadius: 0, padding: 0 }
    };
    function merge(d, u) {
        const o = {};
        for (const k in d) o[k] = (u && u[k] !== undefined) ? u[k] : d[k];
        return o;
    }
    return { line1: merge(def.line1, cfg.line1), line2: merge(def.line2, cfg.line2) };
}

// v104：将配置应用到 TextLabel 节点
function applyTextLabelConfig(node, cfg) {
    if (!node || !cfg) return;
    node.title = cfg.text;
    node.properties = node.properties || {};
    node.properties["fontSize"] = cfg.fontSize;
    node.properties["lineHeight"] = cfg.lineHeight;
    node.properties["fontColor"] = cfg.fontColor;
    node.properties["fontFamily"] = cfg.fontFamily;
    node.properties["fontWeight"] = cfg.fontWeight;
    node.properties["textAlign"] = cfg.textAlign;
    node.properties["backgroundColor"] = cfg.backgroundColor;
    node.properties["borderRadius"] = cfg.borderRadius;
    node.properties["padding"] = cfg.padding;
}

function findWaitingRoomNode() {
    try {
        const g = app.graph;
        if (!g || !g._nodes) return null;
        for (const n of g._nodes) {
            if (n.subgraph && Array.isArray(n.subgraph.nodes) &&
                n.title && n.title.trim() === "运行等待区") {
                return n;
            }
        }
    } catch (e) { /* ignore */ }
    return null;
}

// v90：等待区外层子图放置坐标。只扫一个"最右边界 maxRight"，放到其右侧 GAP(20000)、y 固定 0；
// 间距足够激进，任何真实工作流都不会与之重叠，正常取景也看不到。空工作流回退 [GAP,0]。
// selfNode 为刚打包出的等待区子图，需排除。
function waitingRoomAnchorPos(g, selfNode) {
    try {
        const GAP = 20000;
        let maxRight = -Infinity;
        for (const n of (g._nodes || [])) {
            if (!n || n === selfNode || !n.pos) continue;
            if (n.subgraph && (n.title || "").trim() === "运行等待区") continue;
            const w = (n.size && n.size[0]) || 200;
            if (n.pos[0] + w > maxRight) maxRight = n.pos[0] + w;
        }
        if (!isFinite(maxRight)) return [GAP, 0];
        return [Math.round(maxRight + GAP), 0];
    } catch (e) { return [20000, 0]; }
}

// v78：找不到时自动创建"运行等待区"子图（临时 Note 节点打包 -> 删临时节点 -> 加 Text Label）
function autoCreateWaitingRoom() {
    try {
        const g = app.graph;
        if (!g) return null;
        // 1. 临时节点（ComfyUI 原生 Note，一定存在）
        const tmp = LiteGraph.createNode("Note");
        tmp.pos = [0, 0];
        g.add(tmp);
        // v90：convertToSubgraph 会把"当前选中节点"一并打包，先清空选择并只选中 tmp，
        // 避免吞掉用户工作流里原本选中的节点（数据安全）。
        try {
            const cv = app.canvas;
            if (cv.deselectAllNodes) cv.deselectAllNodes();
            else if (cv.deselectAll) cv.deselectAll();
            if (cv.selectNodes) cv.selectNodes([tmp]);
            else if (cv.selectNode) cv.selectNode(tmp);
            else { tmp.flags = tmp.flags || {}; tmp.flags.selected = true; }
        } catch (e) {}
        // 2. 转子图（官方 API）
        const ret = g.convertToSubgraph(new Set([tmp]));
        const subNode = ret && ret.node;
        if (!subNode || !subNode.subgraph) return null;
        // 3. 改标题
        subNode.title = "运行等待区";
        // 4. 清理（删临时 Note / 改 name / 加 Text Label / 移角落）由 toggleWaitingRoom
        //    在 openSubgraph 切进子图后执行——那时 afterChange 已结束，操作才生效
        subNode.pos = waitingRoomAnchorPos(g, subNode); // v89：动态放到真实节点包围盒外，避免重叠
        return subNode;
    } catch (e) {
        console.warn("[Practical-Tools] 自动创建运行等待区失败:", e);
        return null;
    }
}

// v90：让官方"适应全部节点"（无选中时的 fitViewToSelectionAnimated）自动排除运行等待区，
// 否则等待区在 +20000 外会把取景缩到极小。有选区时保持官方行为；1.x 无此方法则不介入。
function hookFitAllExcludeRoom() {
    try {
        const c = app.canvas;
        if (!c || c.__ptFitHooked) return;
        if (typeof c.fitViewToSelectionAnimated !== "function") return;
        const orig = c.fitViewToSelectionAnimated;
        c.fitViewToSelectionAnimated = function (e) {
            try {
                const selCount = (this.selectedItems && this.selectedItems.size) ||
                    (this.selected_nodes ? Object.keys(this.selected_nodes).length : 0) || 0;
                if (selCount === 0 && this.positionableItems && this.ds &&
                    typeof this.ds.animateToBounds === "function") {
                    const items = Array.from(this.positionableItems).filter(it => {
                        return !(it && it.subgraph && (it.title || "").trim() === "运行等待区");
                    });
                    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9, any = false;
                    for (const n of items) {
                        if (!n || !n.pos) continue;
                        any = true;
                        const w = (n.size && n.size[0]) || 200, h = (n.size && n.size[1]) || 100;
                        if (n.pos[0] < minX) minX = n.pos[0];
                        if (n.pos[1] < minY) minY = n.pos[1];
                        if (n.pos[0] + w > maxX) maxX = n.pos[0] + w;
                        if (n.pos[1] + h > maxY) maxY = n.pos[1] + h;
                    }
                    if (any) {
                        const pad = 100;
                        const b = [minX - pad, minY - pad,
                                   Math.max(1, (maxX - minX) + pad * 2),
                                   Math.max(1, (maxY - minY) + pad * 2)];
                        this.ds.animateToBounds(b, () => { try { this.setDirty(true, true); } catch (_) {} },
                            (e && typeof e === "object") ? e : {});
                        return;
                    }
                }
            } catch (err) {}
            return orig.call(this, e);
        };
        c.__ptFitHooked = true;
    } catch (e) {}
}

// v110：打开/加载工作流时 ComfyUI 内部直接调 ds.fitToBounds（无动画），
// 绕过了 v90 的 canvas.fitViewToSelectionAnimated hook，导致等待区把取景拉远。
// 此处 hook ds.fitToBounds：当 bounds 包含远处区域（等待区在 +20000）且当前
// graph 有等待区节点时，重新计算排除等待区后的 bounds。正常 fit selection 不受影响。
function hookDsFitToBoundsExcludeRoom() {
    try {
        const ds = app.canvas && app.canvas.ds;
        if (!ds || ds.__ptFitBoundsHooked) return;
        if (typeof ds.fitToBounds !== "function") return;
        const orig = ds.fitToBounds.bind(ds);
        ds.fitToBounds = function (e, opts) {
            try {
                const g = app.canvas && app.canvas.graph;
                if (g && e && Array.isArray(e) && e.length >= 4) {
                    const hasRoom = (g._nodes || []).some(function (n) {
                        return n && n.subgraph && (n.title || "").trim() === "运行等待区";
                    });
                    if (hasRoom) {
                        var boundsRight = e[0] + e[2];
                        var boundsBottom = e[1] + e[3];
                        // 等待区在包围盒右侧 +20000，正常节点 bounds 不会超过 5000
                        if (boundsRight > 5000 || boundsBottom > 5000) {
                            var items = (g._nodes || []).filter(function (n) {
                                return n && n.pos && !(n.subgraph && (n.title || "").trim() === "运行等待区");
                            });
                            if (items.length > 0) {
                                var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
                                for (var i = 0; i < items.length; i++) {
                                    var n = items[i];
                                    var w = (n.size && n.size[0]) || 200;
                                    var h = (n.size && n.size[1]) || 100;
                                    if (n.pos[0] < minX) minX = n.pos[0];
                                    if (n.pos[1] < minY) minY = n.pos[1];
                                    if (n.pos[0] + w > maxX) maxX = n.pos[0] + w;
                                    if (n.pos[1] + h > maxY) maxY = n.pos[1] + h;
                                }
                                var pad = 100;
                                e = [minX - pad, minY - pad,
                                    Math.max(1, (maxX - minX) + pad * 2),
                                    Math.max(1, (maxY - minY) + pad * 2)];
                            }
                        }
                    }
                }
            } catch (err) {}
            return orig(e, opts);
        };
        ds.__ptFitBoundsHooked = true;
    } catch (e) {}
}

// v107：合并 dropzone_enlarge —— 扩大顶部工具栏拖回停靠命中区域（200px→600px 居中）
// 原独立文件 dropzone_enlarge.js 已合并入此，删除原文件不影响其他功能。
function initDropzoneEnlarge() {
    const enlarge = () => {
        const dzs = document.querySelectorAll('div[class*="border-dashed"][class*="border-blue-500"]');
        dzs.forEach((dz) => {
            if (dz.dataset.ptEnlarged) return;
            dz.dataset.ptEnlarged = "1";
            const props = {
                position: "fixed", top: "48px", left: "50%",
                transform: "translateX(-50%)", width: "1100px",
                height: "56px", "max-width": "none", "z-index": "2000",
            };
            for (const [k, v] of Object.entries(props)) {
                dz.style.setProperty(k, v, "important");
            }
        });
    };
    const mo = new MutationObserver(() => enlarge());
    mo.observe(document.body, { childList: true, subtree: true });
    enlarge();


}

// v101：工作流 tab 点击捕获——点击切换工作流前，若当前在等待区，先拉回顶层并恢复视图，
// 使 ComfyUI 保存的当前工作流状态为顶层，切回时直接恢复顶层，从源头消除等待区视觉残留。
function bindWorkflowTabClick() {
    if (window.__PT_BOUND_TAB_CLICK__) return;
    window.__PT_BOUND_TAB_CLICK__ = true;
    document.addEventListener("click", function (e) {
        try {
            const tab = e.target && e.target.closest && e.target.closest("button.p-togglebutton");
            if (!tab) return;
            const canvas = app.canvas;
            if (!canvas || !inWaitingRoom()) return;
            const sg = canvas.graph;
            const hv = sg && sg.__ptHomeView;
            if (canvas.graph !== app.graph && typeof canvas.setGraph === "function") {
                canvas.setGraph(app.graph);
            }
            try {
                const wr = (typeof findWaitingRoomNode === "function") ? findWaitingRoomNode() : null;
                const ds = canvas.ds;
                if (wr && ds) {
                    const phv = wr.properties && wr.properties.pt_home_view;
                    const useHV = phv || hv;
                    if (useHV && useHV.offset && typeof useHV.scale === "number") {
                        ds.offset = useHV.offset.slice();
                        ds.scale = useHV.scale;
                    }
                }
            } catch (e2) {}
        } catch (e) {}
    }, true);
}

// v98：切换工作流后，轮询检查恢复的视图——若是等待区子图则拉回顶层并恢复进入前布局；普通子图/顶层不干预。
// 判据：hash 变化 与 顶层节点集合签名变化 在 800ms 窗口内同时发生 = 真正切换工作流标签。
function bindWorkflowSwitchForceTop() {
    try {
        function topSig() {
            try {
                return (app.graph && app.graph._nodes || [])
                    .filter(function (n) { return !(n && n.subgraph && (n.title || "").trim() === "运行等待区"); })
                    .map(function (n) { return String(n.id); }).sort().join(",");
            } catch (e) { return ""; }
        }
        function isRoomGraph(g) {
            return !!(g && (g.__ptWR === true || (g.name && String(g.name).trim() === "运行等待区")));
        }
        function restoreHomeView() {
            // 优先用持久化在等待区节点 properties.pt_home_view 里的进入前视图（跨工作流切换后仍保留），
            // 没有则用排除等待区的取景兜底。
            try {
                const wr = (typeof findWaitingRoomNode === "function") ? findWaitingRoomNode() : null;
                const ds = app.canvas && app.canvas.ds;
                if (!ds || !wr) return;
                const hv = wr.properties && wr.properties.pt_home_view;
                if (hv && hv.offset && typeof hv.scale === "number") {
                    ds.offset = hv.offset.slice();
                    ds.scale = hv.scale;
                } else if (typeof fitHomeExcludingRoom === "function") {
                    fitHomeExcludingRoom(app.graph);
                }
            } catch (e) {}
        }
        let lastHash = location.hash;
        let lastSig = topSig();
        let hashChangedAt = 0;
        let sigChangedAt = 0;
        let checkUntil = 0;   // 切换后检查窗口
        let restored = false; // 本次切换是否已恢复视图
        setInterval(function () {
            try {
                const h = location.hash;
                const s = topSig();
                const hashNow = (h !== lastHash);
                const sigNow = (s !== lastSig);
                if (hashNow) hashChangedAt = Date.now();
                if (sigNow) sigChangedAt = Date.now();
                if ((hashNow && Date.now() - sigChangedAt < 800) ||
                    (sigNow && Date.now() - hashChangedAt < 800)) {
                    checkUntil = Date.now() + 1500;
                    restored = false;
                }
                lastHash = h;
                lastSig = s;
                if (Date.now() <= checkUntil) {
                    const canvas = app.canvas;
                    if (isRoomGraph(canvas.graph)) {
                        if (canvas.graph !== app.graph && typeof canvas.setGraph === "function") {
                            canvas.setGraph(app.graph);
                        }
                        if (!restored) {
                            restored = true;
                            setTimeout(restoreHomeView, 40);
                            setTimeout(restoreHomeView, 180);
                        }
                    } else if (!restored) {
                        // v115：持久化工作流恢复可能直接设置 ds.offset/scale（不经过 fitToBounds），
                        // 导致视图包含等待区（远处+20000）而缩到极小。此处检测并修复。
                        try {
                            const g = app.graph;
                            const ds = canvas && canvas.ds;
                            if (g && ds) {
                                const hasRoom = (g._nodes || []).some(function (n) {
                                    return n && n.subgraph && (n.title || "").trim() === "运行等待区";
                                });
                                if (hasRoom) {
                                    // 计算当前视图可见的世界坐标范围
                                    const cw = (canvas.canvas && canvas.canvas.clientWidth) || window.innerWidth;
                                    const ch = (canvas.canvas && canvas.canvas.clientHeight) || window.innerHeight;
                                    const visRight = (-ds.offset[0] + cw) / ds.scale;
                                    const visBottom = (-ds.offset[1] + ch) / ds.scale;
                                    // 等待区在+20000外，正常节点可见范围不会超过5000
                                    if (visRight > 5000 || visBottom > 5000) {
                                        restored = true;
                                        setTimeout(function () { fitHomeExcludingRoom(g); }, 40);
                                        setTimeout(function () { fitHomeExcludingRoom(g); }, 180);
                                    }
                                }
                            }
                        } catch (e) {}
                    }
                }
            } catch (e) {}
        }, 30);
    } catch (e) {}
}

// v86：监听官方 subgraph-opening（setGraph 之前触发，detail.closingGraph=进入前父图、
// detail.subgraph=将进入的子图，此时 canvas.ds 仍是父图视图）。任何途径进入等待区
// （点茶杯 / 刷新恢复 / 跨工作流切换）都会由 ComfyUI 官方给出准确父图，彻底避免串台。
function bindSubgraphOpen() {
    if (window.__PT_BOUND_OPEN__) return;
    window.__PT_BOUND_OPEN__ = true;
    const handler = (ev) => {
        try {
            const d = ev.detail || {};
            const sg = d.subgraph;
            if (!sg) return;
            const isRoom = sg.__ptWR === true
                || (sg.name && String(sg.name).trim() === "运行等待区")
                || (d.fromNode && String(d.fromNode.title || "").trim() === "运行等待区");
            if (!isRoom) return;
            sg.__ptWR = true;
            const home = d.closingGraph || (d.fromNode && d.fromNode.graph) || app.graph;
            if (home) sg.__ptHomeGraph = home;
            const ds = app.canvas && app.canvas.ds;
            if (ds) {
                const hv = { offset: ds.offset.slice(), scale: (ds.scale || 1) };
                sg.__ptHomeView = hv;
                // 持久化到等待区节点 properties（跨工作流切换后对象重建仍保留，供 restoreHomeView 恢复原布局）
                try {
                    let roomNode = d.fromNode;
                    if (!roomNode || String(roomNode.title || "").trim() !== "运行等待区") {
                        roomNode = (home && home._nodes || []).find(function (n) {
                            return n && n.subgraph && String(n.title || "").trim() === "运行等待区";
                        });
                    }
                    if (roomNode) {
                        if (!roomNode.properties) roomNode.properties = {};
                        roomNode.properties.pt_home_view = hv;
                    }
                } catch (e) {}
            }
        } catch (e) {}
    };
    try { app.canvas.canvas.addEventListener("subgraph-opening", handler); } catch (e) {}
    try { if (app.canvas.addEventListener) app.canvas.addEventListener("subgraph-opening", handler); } catch (e) {}
}

// v83：当前是否处于某个"运行等待区"子图内（跟随当前 canvas.graph，跨工作流切换天然正确）
function inWaitingRoom() {
    try {
        const g = app.canvas && app.canvas.graph;
        return !!(g && (g.__ptWR === true || (g.name && String(g.name).trim() === "运行等待区")));
    } catch (e) { return false; }
}
// v83：等待区子图 -> 它所属的工作流主图（优先运行时标记；刷新后按外层 SubgraphNode 反查）
function homeGraphOfRoom(sg) {
    try {
        if (!sg) return null;
        if (sg.__ptHomeGraph) return sg.__ptHomeGraph;
        const top = (app.workflowManager && app.workflowManager.activeWorkflow && app.workflowManager.activeWorkflow.graph) || app.graph;
        if (top && top._nodes) {
            const node = top._nodes.find(n => n && n.subgraph === sg);
            if (node && node.graph) return node.graph;
        }
        return (top && top !== sg) ? top : null;
    } catch (e) { return null; }
}
// v84：无进入前视图记录时（如刷新后第一次返回），把主图取景到"除等待区外的真实节点"，
// 避免落到对准远处[3000,3000]等待区节点的极小 fit；主图为空则回到原点 100%。
function fitHomeExcludingRoom(home) {
    try {
        const canvas = app.canvas, ds = canvas && canvas.ds;
        if (!ds || !home) return;
        const cw = (canvas.canvas && canvas.canvas.clientWidth) || window.innerWidth;
        const ch = (canvas.canvas && canvas.canvas.clientHeight) || window.innerHeight;
        const real = (home._nodes || []).filter(n => n && n.pos &&
            !(n.subgraph && (n.title || "").trim() === "运行等待区"));
        if (!real.length) { ds.scale = 1; ds.offset = [150, 150]; return; }
        let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
        for (const n of real) {
            const w = (n.size && n.size[0]) || 200, h = (n.size && n.size[1]) || 100;
            if (n.pos[0] < minX) minX = n.pos[0];
            if (n.pos[1] < minY) minY = n.pos[1];
            if (n.pos[0] + w > maxX) maxX = n.pos[0] + w;
            if (n.pos[1] + h > maxY) maxY = n.pos[1] + h;
        }
        const bw = Math.max(1, maxX - minX), bh = Math.max(1, maxY - minY), pad = 100;
        let s = Math.min(cw / (bw + pad * 2), ch / (bh + pad * 2));
        s = Math.max(0.2, Math.min(s, 1.25));
        const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
        ds.scale = s;
        ds.offset = [cw / 2 - cx * s, ch / 2 - cy * s];
    } catch (e) {}
}

// v78：茶杯按钮状态（找到=亮，在等待室=蓝色内描边）
function updateCupBtnState() {
    try {
        const btn = document.getElementById("pt-cup-btn");
        if (!btn) return;
        const inRoom = inWaitingRoom(); // v83：跟随当前 graph，跨工作流正确
        let found = inRoom;
        if (!inRoom) { try { found = !!findWaitingRoomNode(); } catch (e) {} }
        // v116：只改变茶杯图标颜色，按钮背景保持不变
        const icon = document.getElementById("pt-cup-icon");
        if (icon) icon.style.color = found ? "rgba(255,255,255,1)" : "rgba(255,255,255,0.45)";
        if (inRoom) {
            // v136：按钮悬停时跳过颜色同步，避免:hover高亮色污染茶杯边框
            const runBtn = findRunButton();
            if (!runBtn || !runBtn.matches(':hover')) {
                btn.style.boxShadow = "inset 0 0 0 2px " + (runButtonColor() || "#4f9cff");
            }
        } else {
            btn.style.boxShadow = "none";
        }
    } catch (e) { /* ignore */ }
}
function toggleWaitingRoom() {
    try {
        const canvas = app.canvas;
        if (!canvas) return;
        // v83：当前就在某个等待区 -> 返回它所属工作流主图（状态跟随当前 graph，跨工作流正确）
        if (inWaitingRoom()) {
            document.body.classList.remove("pt-in-waiting-room");
            const sg = canvas.graph;
            const home = homeGraphOfRoom(sg);
            const hv = sg && sg.__ptHomeView;
            if (home && home !== canvas.graph && typeof canvas.setGraph === "function") {
                canvas.setGraph(home);
            }
            if (hv && canvas.ds) {
                canvas.ds.offset = hv.offset.slice();
                canvas.ds.scale = hv.scale;
            } else {
                fitHomeExcludingRoom(home); // v84：刷新后无记录时取景到真实节点
            }
            if (typeof canvas.setDirty === "function") canvas.setDirty(true, true);
            updateCupBtnState();
            document.body.classList.remove("pt-in-waiting-room");
            return;
        }
        // 进入等待区：立即更新UI（不等setTimeout清理过程）
        document.body.classList.add("pt-in-waiting-room");
        // 找等待区节点；找不到则自动创建（v78）
        let wr = findWaitingRoomNode();
        if (!wr) {
            wr = autoCreateWaitingRoom();
            if (!wr) return; // 创建失败
        }
        // v83：记录"家"工作流主图与进入前视图（写入等待区子图，随该工作流独立，互不串扰）
        const __homeGraph = canvas.graph;
        const __homeView = canvas.ds ? { offset: canvas.ds.offset.slice(), scale: (canvas.ds.scale || 1) } : null;
        // v78：先延迟清理（删临时 Note / 隐藏连接点 / 放两行 Text Label），
        //      清理完再切进——用户看不到删 Note 的过程
        setTimeout(() => {
            try {
                const sg = wr.subgraph;
                if (!sg) return;
                // v83：归属标记（刷新后 name 仍可识别；home 引用丢失则按外层节点反查）
                try { sg.__ptWR = true; sg.__ptHomeGraph = __homeGraph; if (__homeView) sg.__ptHomeView = __homeView; } catch (e) {}
                try { sg.name = "运行等待区"; } catch (e) {}
                // 删临时 Note
                const tmpInSg = sg._nodes.find(n => n && (n.type === "Note" || n.comfyClass === "Note"));
                if (tmpInSg) { try { sg.remove(tmpInSg); } catch (e) {} }
                // 移远子图的输入/输出连接点（存在 sg.inputNode / sg.outputNode，不在 _nodes 里）
                try {
                    if (sg.inputNode) { sg.inputNode.pos = [-999999, -999999]; }
                    if (sg.outputNode) { sg.outputNode.pos = [-999999, -999999]; }
                } catch (e) {}
                // 兼容：_nodes 里的连接点也移远
                for (const n of (sg._nodes || [])) {
                    if (n && (n.type === "SubgraphInput" || n.type === "SubgraphOutput" ||
                              (n.comfyClass && /SubgraphInput|SubgraphOutput/.test(n.comfyClass)))) {
                        try { n.pos = [-999999, -999999]; } catch (e) {}
                    }
                }
                // v104：放两行 Text Label——没有则按配置创建，已有则按配置更新（方案 B）
                const roomCfg = getRoomConfig();
                const existingLabels = (sg._nodes || []).filter(n => n && n.type === "Text Label");
                if (existingLabels.length === 0) {
                    try {
                        const tl1 = LiteGraph.createNode("Text Label");
                        applyTextLabelConfig(tl1, roomCfg.line1);
                        tl1.pos = [100, 180];
                        sg.add(tl1);
                        const tl2 = LiteGraph.createNode("Text Label");
                        applyTextLabelConfig(tl2, roomCfg.line2);
                        tl2.pos = [100, 240];
                        sg.add(tl2);
                        // 立即计算尺寸并对齐两行中心，保证切进子图首帧定位就准、不再二次跳位
                        try {
                            if (typeof tl1.computeSize === "function") tl1.computeSize();
                            if (typeof tl2.computeSize === "function") tl2.computeSize();
                            if (tl1.size && tl1.size[0] > 0) tl2.pos[0] = tl1.pos[0] + tl1.size[0] / 2 - (tl2.size ? tl2.size[0] / 2 : 0);
                        } catch (e) {}
                    } catch (e) { /* Text Label 未注册则跳过 */ }
                } else {
                    // v104 方案 B：已存在则按 y 坐标排序（上=line1，下=line2）并更新配置
                    try {
                        existingLabels.sort((a, b) => (a.pos && a.pos[1] || 0) - (b.pos && b.pos[1] || 0));
                        if (existingLabels[0]) applyTextLabelConfig(existingLabels[0], roomCfg.line1);
                        if (existingLabels[1]) applyTextLabelConfig(existingLabels[1], roomCfg.line2);
                    } catch (e) {}
                }
            } catch (e) {}
            // 清理完再切进
            try {
                if (typeof canvas.openSubgraph === "function") {
                    canvas.openSubgraph(wr.subgraph, wr);
                    document.body.classList.add("pt-in-waiting-room");
                    // v82：进入后用 rAF 持续"对齐+居中"，直到两行中心连续稳定；覆盖非100%网页缩放下
                    // canvas 按 DPR 重设、文字真实尺寸晚到导致过早锁定、小字停在左侧的问题。
                    ensureRoomResizeListener();
                    let __stable = 0, __lastKey = null;
                    const __t0 = performance.now();
                    const __inRoom = () => inWaitingRoom(); // v83：跟随当前 graph
                    const __tick = () => {
                        try {
                            if (!__inRoom()) return; // 已退出等待区
                            const key = recenterWaitingRoom();
                            if (key !== null && key === __lastKey) __stable++; else { __stable = 0; __lastKey = key; }
                            const elapsed = performance.now() - __t0;
                            if ((__stable >= 8 && elapsed > 350) || elapsed > 1500) return; // 稳定或到上限即停
                            requestAnimationFrame(__tick);
                        } catch (e) {}
                    };
                    requestAnimationFrame(__tick);
                    // 晚到尺寸终检（DPR/字体重设后再校正一次）
                    setTimeout(() => { try { if (__inRoom()) recenterWaitingRoom(); } catch (e) {} }, 600);
                    setTimeout(() => { try { if (__inRoom()) recenterWaitingRoom(); } catch (e) {} }, 1100);
                } else if (typeof canvas.setGraph === "function") {
                    canvas.setGraph(wr.subgraph);
                }
                if (typeof canvas.setDirty === "function") canvas.setDirty(true, true);
            } catch (e) {}
            updateCupBtnState();
        }, 200);
    } catch (e) { /* ignore */ }
}

function findNode(id, graph) {
    const g = graph || (app && app.graph);
    if (!g) return null;
    try {
        const n = g.getNodeById(Number(id));
        if (n) return n;
    } catch (e) { /* ignore */ }
    if (g && g._nodes) {
        return g._nodes.find(n => String(n.id) === String(id)) || null;
    }
    return null;
}

function nodeTitle(n, fallback) {
    if (!n) return fallback;
    if (n.title && n.title.trim()) return n.title.trim();
    if (n.constructor && n.constructor.title) return n.constructor.title;
    if (n.type) return String(n.type);
    return fallback;
}

function findSubNode(parentNode, id) {
    const sub = parentNode && parentNode.subgraph;
    if (!sub || !Array.isArray(sub.nodes)) return null;
    return sub.nodes.find(n => String(n.id) === String(id)) || null;
}

function formatNames(names) {
    if (names.length <= 1) return names[0] || "";
    let s = names[names.length - 1];
    for (let i = names.length - 2; i >= 0; i--) {
        s = names[i] + "(" + s + ")";
    }
    return s;
}

function buildSubgraphNames(g) {
    const names = {};
    if (!g || !g._nodes) return names;
    for (const n of g._nodes) {
        if (n.subgraph && Array.isArray(n.subgraph.nodes)) {
            names[String(n.id)] = nodeTitle(n, String(n.id));
            for (const sub of n.subgraph.nodes) {
                if (sub.subgraph && Array.isArray(sub.subgraph.nodes)) {
                    names[String(sub.id)] = nodeTitle(sub, String(sub.id));
                }
            }
        }
    }
    return names;
}

function tryNodeName(id, graph) {
    const parts = String(id).split(":");
    if (parts.length === 0) return null;
    let cur = findNode(parts[0], graph);
    if (!cur) return null;
    const names = [nodeTitle(cur, parts[0])];
    for (let i = 1; i < parts.length; i++) {
        const nxt = findSubNode(cur, parts[i]);
        if (!nxt) break;
        names.push(nodeTitle(nxt, parts[i]));
        cur = nxt;
    }
    return formatNames(names);
}

function nodeName(id, graph) {
    const name = tryNodeName(id, graph);
    if (name !== null) return name;
    // 兜底 1：从最近提交的 prompt 查节点名（_meta.title 优先，其次 class_type）——rgthree 同款
    // v71：三级查找——完整路径 key -> 顶层 id -> 执行节点 id（最后一段）
    const full = String(id);
    const parts = full.split(":");
    const first = parts[0];
    const last = parts[parts.length - 1];
    // v76：找到所属提交记录——跨工作流时 graph 已切走、tryNodeName 失败，
    //       用该提交记录缓存的 subgraphNames 拼"子图名(节点名)"前缀。
    const rec = findRec(full) || findRec(first);
    const sg = (rec && rec.subgraphNames) || subgraphNames;
    const tryPromptKey = (k) => {
        // v74：多工作流历史（最新->最旧），任一个匹配即可解析
        for (const rec of promptHistory) {
            const p = rec && rec.prompt;
            if (p && p[k]) {
                const metaTitle = p[k]._meta && p[k]._meta.title;
                if (metaTitle) return String(metaTitle);
                if (p[k].class_type) return String(p[k].class_type);
            }
        }
        // 兜底：最新单份 promptData（历史为空时）
        if (promptData && promptData[k]) {
            const metaTitle = promptData[k]._meta && promptData[k]._meta.title;
            if (metaTitle) return String(metaTitle);
            if (promptData[k].class_type) return String(promptData[k].class_type);
        }
        return null;
    };
    const r1 = tryPromptKey(full);
    if (r1 !== null) {
        // v72：子图路径拼容器前缀（子图名(节点名)）
        if (parts.length > 1 && sg[first]) {
            return String(sg[first]) + "(" + r1 + ")";
        }
        return r1;
    }
    const r2 = tryPromptKey(first);
    if (r2 !== null) {
        // v76：顶层 id 命中时同样拼前缀（此前仅 r1 拼，子图路径 key 在 prompt 中查不到 full）
        if (parts.length > 1 && sg[first]) {
            return String(sg[first]) + "(" + r2 + ")";
        }
        return r2;
    }
    if (parts.length > 1) {
        const r3 = tryPromptKey(last);
        if (r3 !== null) return r3;
    }
    // 兜底 2：画布节点类型
    const n = findNode(first, graph);
    if (n) {
        if (n.constructor && n.constructor.title) return String(n.constructor.title);
        if (n.type) return String(n.type);
    }
    return String(id);
}

app.registerExtension({
    name: "Practical-Tools.RunIndicator",
    async setup() {
        // 设置开关：未启用则直接退出
        try {
            const enabled = app.ui.settings.getSettingValue("PracticalTools.EnableRunIndicator", true);
            if (enabled === false) return;
        } catch (e) { /* 默认启用 */ }

        initDropzoneEnlarge(); // v107：扩大顶部工具栏拖回停靠命中区域
        bindSubgraphOpen(); // v86：进入等待区时由官方事件记录准确父图/父视图
        hookFitAllExcludeRoom(); // v90：官方"适应全部"排除等待区
        hookDsFitToBoundsExcludeRoom(); // v110：加载工作流时 ds.fitToBounds 也排除等待区
        bindWorkflowTabClick(); // v101：点击工作流 tab 前先拉回顶层，从源头消除等待区视觉残留
        bindWorkflowSwitchForceTop(); // v91：切换工作流后强制目标显示节点区
        // v120：重启/刷新后自动加载工作流是初始加载，不触发"切换"检测，
        // 导致 v115 的视图修复不执行。此处主动做一次初始视图检查。
        (function initialViewCheck() {
            function check() {
                try {
                    const canvas = app.canvas;
                    const g = app.graph;
                    const ds = canvas && canvas.ds;
                    if (!g || !ds) return;
                    const hasRoom = (g._nodes || []).some(function (n) {
                        return n && n.subgraph && (n.title || "").trim() === "运行等待区";
                    });
                    if (!hasRoom) return;
                    const cw = (canvas.canvas && canvas.canvas.clientWidth) || window.innerWidth;
                    const ch = (canvas.canvas && canvas.canvas.clientHeight) || window.innerHeight;
                    const visRight = (-ds.offset[0] + cw) / ds.scale;
                    const visBottom = (-ds.offset[1] + ch) / ds.scale;
                    if (visRight > 5000 || visBottom > 5000) {
                        if (typeof fitHomeExcludingRoom === "function") {
                            fitHomeExcludingRoom(g);
                        }
                    }
                } catch (e) {}
            }
            setTimeout(check, 500);
            setTimeout(check, 1200);
            setTimeout(check, 2000);
        })();
        // 注入 hover 样式：wrap hover -> tooltip 显示 + pill 高亮（同活动任务按钮 hover 色）
        if (!document.getElementById("pt-ri-style")) {
            const st = document.createElement("style");
            st.id = "pt-ri-style";
            st.textContent = `
                /* 两个 tooltip 统一：display 常驻（覆盖全局 .p-tooltip:none），opacity/visibility 控制；
                   hover 延时 350ms 淡入（实测 PrimeReact 活动任务 tooltip 约 369ms），移出立即淡出 */
                .pt-tip, .pt-cup-tip { display: block !important; opacity: 0; visibility: hidden; transition: opacity .12s ease, visibility 0s linear .12s !important; }
                .pt-wrap:hover:not(:has(.pt-cup-wrap:hover)) .pt-tip { opacity: 1 !important; visibility: visible !important; transition: opacity .12s ease .35s, visibility 0s linear .35s !important; }
                .pt-cup-wrap:hover .pt-cup-tip { opacity: 1 !important; visibility: visible !important; transition: opacity .12s ease .35s, visibility 0s linear .35s !important; }
                /* hover 高亮（同活动任务 hover 色）；hover 茶杯时不连带高亮指示条 */
                .pt-wrap:hover:not(:has(.pt-cup-wrap:hover)) #pt-run-indicator { background: rgb(49, 50, 53) !important; }
                .pt-cup-wrap:hover #pt-cup-btn { background: rgb(49, 50, 53) !important; opacity: 1 !important; }
                /* 点击茶杯后只保留 ComfyUI 自动的 inset 蓝环，清掉我额外加的外层 outline，避免两层 */
                #pt-cup-btn:focus { outline: none !important; }
                /* 运行初始化：内描边（闪烁由 JS setInterval 直接驱动 box-shadow
                   透明度，绕开前端全局 .disable-animations 对 CSS 动画的覆盖） */
                #pt-run-indicator.pt-init {
                    box-shadow: inset 0 0 0 2px rgba(var(--pt-init-blue-rgb, 79, 156, 255), 1);
                }
                /* 进入等待区时隐藏当前工作流标签的蓝色指示线和文字高亮，暗示用户不在普通工作流中 */
                body.pt-in-waiting-room .p-togglebutton.p-togglebutton-checked {
                    border-bottom-color: transparent !important;
                    color: rgb(161, 161, 170) !important;
                }
                body.pt-in-waiting-room .p-togglebutton.p-togglebutton-checked span {
                    color: rgb(161, 161, 170) !important;
                }
                /* 进入等待区时隐藏面包屑导航 + 返回按钮，保留应用按钮和图形下拉菜单 */
                body.pt-in-waiting-room .subgraph-breadcrumb nav.p-breadcrumb,
                body.pt-in-waiting-room .subgraph-breadcrumb .back-button {
                    display: none !important;
                }
            `;
            document.head.appendChild(st);
        }
        // 修复：PrimeReact 激活标签蓝色指示线可能显示为白色（页面加载/切换标签时），持续监听修复
        window.__ptFixTabBlueLine = function () {
            try {
                if (document.body.classList.contains("pt-in-waiting-room")) return; // 等待区由 CSS 控制隐藏
                // 只清除非激活标签的内联蓝色样式（不碰激活标签，避免竞态导致白色）
                document.querySelectorAll(".p-togglebutton:not(.p-togglebutton-checked)").forEach(function (tab) {
                    if (tab.style.borderBottom && tab.style.borderBottom.indexOf("96, 165, 250") !== -1) {
                        tab.style.borderBottom = "";
                    }
                });
                // 再给激活标签设置蓝色
                const tabs = document.querySelectorAll(".p-togglebutton.p-togglebutton-checked");
                tabs.forEach(function (tab) {
                    const cs = window.getComputedStyle(tab);
                    if (cs.borderBottomColor === "rgb(255, 255, 255)") {
                        tab.style.borderBottom = "1px solid rgb(96, 165, 250)";
                    }
                });
            } catch (e) { /* ignore */ }
        };
        // 监听 body 变化（标签容器可能还没渲染，用 body 兜底）
        new MutationObserver(window.__ptFixTabBlueLine).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
        // 初始多次检查（覆盖 PrimeReact 初始化的不同时间点）
        [300, 600, 1000, 1500, 2000].forEach(function (t) { setTimeout(window.__ptFixTabBlueLine, t); });
        setInterval(window.__ptFixTabBlueLine, 300); // 高频兜底轮询
        // 全局拦截已激活工作流标签的点击：阻止 PrimeReact 重复点击取消激活（toggle off）的 bug
        document.addEventListener("click", function (e) {
            try {
                // 排除关闭按钮点击（关闭按钮在标签内部，事件会冒泡到标签）
                if (e.target.closest('[aria-label="关闭"]')) return;
                const tab = e.target.closest(".p-togglebutton");
                if (!tab) return;
                if (!tab.classList.contains("p-togglebutton-checked")) return; // 只拦截已激活标签
                // 阻止 PrimeReact 的 toggle 行为，避免重复点击已激活标签导致蓝线消失
                e.preventDefault();
                e.stopPropagation();
                // 如果在等待区中，额外执行退出等待区（回到顶层工作流）
                if (document.body.classList.contains("pt-in-waiting-room")) {
                    if (app.canvas && app.canvas.graph !== app.graph && typeof app.canvas.setGraph === "function") {
                        app.canvas.setGraph(app.graph);
                    }
                }
            } catch (err) { /* ignore */ }
        }, true);
        // 进入等待区时隐藏当前工作流标签蓝色指示线（body class 切换，CSS 负责隐藏）
        let _wasInRoom = false;
        setInterval(function () {
            try {
                const inRoom = typeof inWaitingRoom === "function" ? inWaitingRoom() : false;
                if (inRoom !== _wasInRoom) {
                    _wasInRoom = inRoom;
                    document.body.classList.toggle("pt-in-waiting-room", inRoom);
                    // 退出等待区时立即修复一次蓝线（避免在等待区中切换标签后退出，蓝线残留白色）
                    if (!inRoom && typeof window.__ptFixTabBlueLine === "function") {
                        setTimeout(window.__ptFixTabBlueLine, 50);
                        setTimeout(window.__ptFixTabBlueLine, 200);
                    }
                }
            } catch (e) { /* ignore */ }
        }, 200);
        // 积极挂载：立即尝试 + MutationObserver 持续监听（锚点出现立即挂载，插槽被移除立即重挂）
        mountToToolbar();
        const _mountObserver = new MutationObserver(function () {
            try {
                if (!document.getElementById("pt-run-indicator")) {
                    mountToToolbar();
                }
            } catch (e) { /* ignore */ }
        });
        _mountObserver.observe(document.body, { childList: true, subtree: true });
        setInterval(mountToToolbar, 5000); // 低频兜底（极端情况）
        setInterval(() => { try { updateCupBtnState(); } catch (e) {} }, 500); // v83：跨工作流即时刷新茶杯蓝框

        const $ = (id) => document.getElementById(id);
        const label = () => $("pt-run-label");
        const totalBar = () => $("pt-total-bar");
        const stepBar = () => $("pt-step-bar");

        // v123：根据节点ID查找节点类型，支持子图内节点（格式：子图ID:节点ID）
        function findNodeTypeById(id) {
            if (!id) return null;
            const graphs = [runTopGraph, app.graph].filter(g => g && g._nodes_by_id);
            const sid = String(id);
            // v127：优先用 execution_start 时的快照，防止切换工作流后 graph 被原地修改
            // v135：快照查找也尝试循环复制key("3.xxx")和子图key("3:xxx")的原始key
            if (nodeTypeSnapshot) {
                if (nodeTypeSnapshot[sid]) return nodeTypeSnapshot[sid];
                const dotKey = sid.includes('.') ? sid.split('.')[0] : null;
                if (dotKey && nodeTypeSnapshot[dotKey]) return nodeTypeSnapshot[dotKey];
                const colonKey = sid.includes(':') ? sid.split(':')[0] : null;
                if (colonKey && nodeTypeSnapshot[colonKey]) return nodeTypeSnapshot[colonKey];
            }
            for (const g of graphs) {
                // 1. 主图直接查找
                if (g._nodes_by_id[sid]) return g._nodes_by_id[sid].type || null;
                // 2. 子图格式 "子图ID:节点ID"
                const colonIdx = sid.indexOf(':');
                if (colonIdx >= 0) {
                    const groupId = sid.substring(0, colonIdx);
                    const innerId = sid.substring(colonIdx + 1);
                    const groupNode = g._nodes_by_id[groupId];
                    if (groupNode && groupNode.subgraph && groupNode.subgraph._nodes_by_id) {
                        const innerNode = groupNode.subgraph._nodes_by_id[innerId];
                        if (innerNode && innerNode.type) return innerNode.type;
                    }
                }
                // 3. 遍历所有子图查找（循环体内节点的 executing 只有子图内ID，没有子图前缀）
                for (const nid in g._nodes_by_id) {
                    const n = g._nodes_by_id[nid];
                    if (n && n.subgraph && n.subgraph._nodes_by_id && n.subgraph._nodes_by_id[sid]) {
                        return n.subgraph._nodes_by_id[sid].type || null;
                    }
                }
            }
                        // v128：兜底用 promptData 的 class_type（切换工作流后 graph 被污染时用）
            try {
                const rec = findRec(sid);
                const pd = (rec && rec.prompt) || promptData;
                if (pd && typeof pd === 'object') {
                    const candidates = [sid, sid.split(':')[0], sid.split('.')[0]];
                    for (const ck of candidates) {
                        const pk = pd[ck];
                        if (pk && pk.class_type) return pk.class_type;
                    }
                }
            } catch (e) {}
return null;
        }

        // v123：根据节点ID查找节点对象（支持子图内节点），用于连接点组合判断颜色
        function findNodeById(id) {
            if (!id) return null;
            const graphs = [runTopGraph, app.graph].filter(g => g && g._nodes_by_id);
            const sid = String(id);
            for (const g of graphs) {
                if (g._nodes_by_id[sid]) return g._nodes_by_id[sid];
                const colonIdx = sid.indexOf(':');
                if (colonIdx >= 0) {
                    const groupId = sid.substring(0, colonIdx);
                    const innerId = sid.substring(colonIdx + 1);
                    const groupNode = g._nodes_by_id[groupId];
                    if (groupNode && groupNode.subgraph && groupNode.subgraph._nodes_by_id) {
                        const innerNode = groupNode.subgraph._nodes_by_id[innerId];
                        if (innerNode) return innerNode;
                    }
                }
                // 遍历所有子图查找（循环体内节点的 executing 只有子图内ID）
                for (const nid in g._nodes_by_id) {
                    const n = g._nodes_by_id[nid];
                    if (n && n.subgraph && n.subgraph._nodes_by_id && n.subgraph._nodes_by_id[sid]) {
                        return n.subgraph._nodes_by_id[sid];
                    }
                }
            }
            return null;
        }

        let errorTimer = null;
        let successTimer = null;
        let totalNodes = 0;      // 全图节点数（prompt.output）
        let doneCount = 0;       // executing 切换计数（rgthree 同款）
        let currentKey = null;   // 节点显示去抖
        // v122：运行次数统计
        let submitCount = 0;     // 提交的工作流数量（多工作流时忽略循环，只看提交数）
        let currentSubmitIndex = 0; // 当前执行到第几个工作流
        let nodeExecCount = {};  // 每个节点的执行次数（单工作流循环时用）
        let maxNodeExecCount = 0; // 最大节点执行次数
        let currentLoopTotal = 0; // v123：当前工作流的循环总数（0=非循环）
        let currentLoopIteration = 0; // v126：当前循环迭代次数，通过ForLoopStart执行跟踪
        let lastLoopStartKey = null; // v126：上一次循环开始节点key，用于去重
        let lastLoopStartTime = 0; // v126：上一次循环开始节点执行时间戳
        let isOfficialLoopWorkflow = false; // v131：标记当前是否为官方循环（StartLoop），v130兜底只对官方循环生效
        let nodeTypeSnapshot = {}; // v127：execution_start时的节点id→type快照，防止切换工作流后graph被原地修改导致类型查找错误
        let currentShownText = ""; // 当前显示的纯节点名（不含计数，供提交时动态更新）
        let inQueuePrompt = false; // 是否在 queuePrompt 调用中（避免 fetch 重复计数）
        // v137：虚拟总进度计时（三段式：0-10s到50%，10-20s到80%，20s后极慢到99%）
        let virtualProgressStartTime = 0;
        let loopVirtualStartTime = 0; // 当前循环迭代内的虚拟进度计时

        // v122：通过 /queue API 查询实际队列数量，更新 submitCount（只增不减）
        // 轮询多次，确保新提交的工作流已经入队后再更新显示
        // v122：更新计数显示（从当前label文本提取纯节点名，不依赖currentShownText）
        function updateCountDisplay() {
            try {
                const labelEl = document.getElementById('pt-run-label');
                if (!labelEl) return;
                const currentText = labelEl.textContent || '';
                if (!currentText || currentText === '实时运行节点' || currentText === '运行初始化…' || currentText === '完成') return;
                // 提取纯节点名（去掉计数前缀，支持 "X/Y • "、"X/Y/Z • " 两种格式）
                const pureName = currentText.replace(/^\d+(\/\d+){1,2}\s*[•·]\s*/, '');
                if (pureName) {
                    if (currentLoopTotal > 1 && submitCount > 1) {
                        // 循环工作流 + 多提交：新格式 总数/序号/循环数，提取第三个数字作为循环数
                        const parts = currentText.match(/^(\d+)\/(\d+)\/(\d+)/);
                        const loopNum = parts ? parts[3] : '1';
                        show(submitCount + "/" + Math.max(1, currentSubmitIndex) + "/" + loopNum + " • " + pureName, "left");
                    } else if (currentLoopTotal > 1 && submitCount <= 1) {
                        // 循环工作流 + 单提交：新格式 循环总数/循环数，提取第二个数字作为循环数
                        const parts = currentText.match(/^(\d+)\/(\d+)/);
                        const loopNum = parts ? parts[2] : '1';
                        show(currentLoopTotal + "/" + loopNum + " • " + pureName, "left");
                    } else if (submitCount > 1) {
                        // 非循环 + 多提交：新格式 总数/序号
                        show(submitCount + "/" + Math.max(1, currentSubmitIndex) + " • " + pureName, "left");
                    }
                }
            } catch (e) {}
        }

        function updateSubmitCountFromQueue() {
            let checks = 0;
            const doCheck = function() {
                try {
                    fetch("/queue").then(function(r) { return r.json(); }).then(function(q) {
                        try {
                            const running = (q && q.queue_running && q.queue_running.length) || 0;
                            const pending = (q && q.queue_pending && q.queue_pending.length) || 0;
                            const total = running + pending;
                            if (total > submitCount) submitCount = total;
                            // 反推当前序号
                            if (submitCount > 0 && total > 0) {
                                currentSubmitIndex = submitCount - total + 1;
                            }
                            // 动态更新显示
                            updateCountDisplay();
                        } catch (e) {}
                    }).catch(function() {});
                } catch (e) {}
                checks++;
                if (checks < 4) setTimeout(doCheck, 400);
            };
            doCheck();
        }

        let lastPct = 0;         // 单调钳制
        let blueColor = runButtonColor();
        let errorColor = cancelButtonColor();
        // v108：模拟进度（无真实进度事件的节点）
        let simProgressIv = null;
        let simProgressTimeout = null; // 延迟启动模拟的timeout（有真实进度的节点不启动模拟）
        let simProgressPct = 0;
        let hasRealProgress = false; // 当前节点是否收到过真实进度事件

        // ---- 定时同步颜色（挂载时按钮可能未渲染，之后补同步） ----
        setInterval(() => {
            const pill = document.getElementById(INDICATOR_ID);
            if (!pill) return;
            const runBtn = findRunButton();
            // v136：按钮悬停时跳过同步，避免:hover高亮色污染进度条
            if (runBtn && !runBtn.matches(':hover')) {
                const c = runButtonColor();
                const tb = document.getElementById("pt-total-bar");
                if (tb && !document.getElementById("pt-run-label")?.textContent.startsWith("执行出错")) {
                    if (tb.style.background !== c) {
                        tb.style.background = c;
                    }
                }
                blueColor = c;
                if (pill.classList.contains("pt-init")) {
                    pill.style.setProperty("--pt-init-blue-rgb", hexToRgb(c));
                }
            }
            if (findCancelButton()) {
                errorColor = cancelButtonColor();
            }
        }, 2000);
        // v137：定期更新虚拟总进度（基于时间，需要定时刷新）
        setInterval(() => {
            if (virtualProgressStartTime > 0) {
                updateTotal();
            }
        }, 500);

        // ---- rAF 渲染节流：合并进度条宽度写入 ----
        let pendingTotal = null;
        let pendingStep = null;
        let rafId = null;
        const flushBars = () => {
            rafId = null;
            if (pendingTotal != null) {
                const b = totalBar();
                if (b) b.style.width = pendingTotal + "%";
                pendingTotal = null;
            }
            if (pendingStep != null) {
                const b = stepBar();
                if (b) b.style.width = pendingStep + "%";
                pendingStep = null;
            }
        };
        const scheduleBars = () => {
            if (rafId == null) rafId = requestAnimationFrame(flushBars);
        };
        const setTotal = (p) => {
            pendingTotal = Math.max(0, Math.min(100, Math.round(p)));
            scheduleBars();
        };
        const setStep = (p) => {
            pendingStep = Math.max(0, Math.min(100, Math.round(p)));
            scheduleBars();
        };
        let currentStepColor = null; // 缓存当前进度条颜色
        const setStepColor = (color) => {
            const bar = stepBar();
            if (!bar) return;
            // 把目标颜色转成 rgb 格式
            let targetRgb = color;
            try {
                const r = parseInt(color.slice(1, 3), 16);
                const g = parseInt(color.slice(3, 5), 16);
                const b = parseInt(color.slice(5, 7), 16);
                targetRgb = 'rgb(' + r + ', ' + g + ', ' + b + ')';
            } catch (e) {}
            // 正则解析当前元素背景色，兼容 rgb(r,g,b) 和 rgba(r,g,b,a) 格式
            const currentBg = bar.style.backgroundColor || '';
            const m = currentBg.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
            const currentRgb = m ? ('rgb(' + m[1] + ', ' + m[2] + ', ' + m[3] + ')') : '';
            // 只有当 DOM 实际颜色与目标不同时才更新（同时更新缓存）
            if (currentRgb !== targetRgb) {
                currentStepColor = color;
                bar.style.backgroundColor = targetRgb;
            }
        };
        // v108：启动模拟进度（无真实进度事件的节点）
        const startSimProgress = () => {
            stopSimProgress();
            simProgressPct = 0;
            hasRealProgress = false;
            showStep(true);
            setStep(0);
            // 0-1.5秒：从0快速增长到60%
            // 1.5秒后：持续缓慢增长，渐近到90%但永远不到，直到节点完成
            const fastDuration = 1500;
            const fastTarget = 60;
            const slowTarget = 90; // 渐近上限，永远不到
            const startTime = performance.now();
            simProgressIv = setInterval(() => {
                try {
                    if (hasRealProgress) { stopSimProgress(); return; }
                    const elapsed = performance.now() - startTime;
                    let pct;
                    if (elapsed < fastDuration) {
                        // 快速阶段：0 -> 60%
                        pct = (elapsed / fastDuration) * fastTarget;
                    } else {
                        // 缓慢阶段：60% -> 渐近90%（用指数衰减曲线，越来越慢）
                        const slowElapsed = elapsed - fastDuration;
                        const slowRange = slowTarget - fastTarget;
                        // 每5秒推进剩余距离的一半，渐近到90%
                        const halfLife = 5000;
                        pct = fastTarget + slowRange * (1 - Math.pow(0.5, slowElapsed / halfLife));
                    }
                    simProgressPct = pct;
                    setStep(pct);
                } catch (e) { stopSimProgress(); }
            }, 50);
        };
        // v108：停止模拟进度（同时取消延迟启动）
        const stopSimProgress = () => {
            if (simProgressTimeout) { clearTimeout(simProgressTimeout); simProgressTimeout = null; }
            if (simProgressIv) { clearInterval(simProgressIv); simProgressIv = null; }
        };
        // v108：启动模拟进度（已知有真实进度的节点不启动，避免虚假进度）
        const scheduleSimProgress = (classType) => {
            stopSimProgress();
            simProgressPct = 0;
            hasRealProgress = false;
            // 已知有真实进度的节点：完全不启动模拟，直接等待真实进度事件
            if (hasRealProgressType(classType)) return;
            // 其他节点：延迟150ms启动模拟（避免极快节点闪烁）
            simProgressTimeout = setTimeout(() => {
                simProgressTimeout = null;
                if (hasRealProgress) return; // 已收到真实进度，不启动模拟
                startSimProgress();
            }, 150);
        };
        const showStep = (on) => {
            if (!on) currentStepColor = null;
            const bar = stepBar();
            if (bar) bar.style.display = on ? "block" : "none";
        };
        const setBarColor = (color) => {
            const bar = totalBar();
            if (bar) bar.style.background = color;
        };
        const show = (text, align) => {
            const el = label();
            if (el) {
                el.textContent = text;
                el.style.justifyContent = align === "center" ? "center" : "flex-start";
            }
        };
        // hex 颜色转 "r,g,b"（供 rgba(var) 闪烁描边用），失败回退进度条蓝
        const hexToRgb = (hex) => {
            const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
            if (!m) return "79,156,255";
            const n = parseInt(m[1], 16);
            return ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255);
        };
        // 运行初始化：槽位内描边闪烁开/关（JS 驱动，绕开 CSS 动画级联覆盖）
        let initBlinkIv = null;
        const setInit = (on) => {
            const pill = $("pt-run-indicator");
            if (!pill) return;
            if (on) {
                // v108：初始化阶段隐藏进度条，避免显示上一次运行的残留颜色
                showStep(false);
                stopSimProgress();
                pill.style.setProperty("--pt-init-blue-rgb", hexToRgb(blueColor));
                pill.classList.add("pt-init");
                if (initBlinkIv) clearInterval(initBlinkIv);
                let phase = 0;
                initBlinkIv = setInterval(() => {
                    const el = $("pt-run-indicator");
                    if (!el || !el.classList.contains("pt-init")) {
                        clearInterval(initBlinkIv);
                        initBlinkIv = null;
                        return;
                    }
                    const rgb = hexToRgb(blueColor);
                    // v102：不改变透明度，0.5s 间隔闪烁（显示/隐藏交替）
                    if (el.style.boxShadow && el.style.boxShadow !== "none") {
                        el.style.boxShadow = "none";
                    } else {
                        el.style.boxShadow = "inset 0 0 0 2px rgba(" + rgb + ", 1)";
                    }
                }, 800); // v121：闪烁间隔从500ms调慢到800ms
            } else {
                pill.classList.remove("pt-init");
                if (initBlinkIv) { clearInterval(initBlinkIv); initBlinkIv = null; }
                pill.style.boxShadow = "";
            }
        };
        const reset = () => {
            // v116：连续运行多个工作流时，前一个 execution_success 后 1.5s 调用 reset，
            // 但下一个工作流可能已在运行（currentKey !== null），此时不应重置，
            // 否则会把正在运行的节点名覆盖为"实时运行节点"。
            if (currentKey !== null) return;
            lastPct = 0;
            stopSimProgress(); // v108：停止模拟进度
            runTopGraph = null;
            nodeTypeSnapshot = {};

            runWorkflowHash = "";
            keyTitleCache = {};
            // v123：重置节点执行次数（submitCount 不在此重置，避免多工作流间隔>1.5s被误清）
            nodeExecCount = {};
            maxNodeExecCount = 0;
            pendingTotal = null;
            pendingStep = null;
            if (rafId != null) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
            const tb = totalBar();
            if (tb) {
                tb.style.width = "0%";
                tb.style.background = blueColor;
            }
            const sb = stepBar();
            if (sb) sb.style.width = "0%";
            const pill = $("pt-run-indicator");
            if (pill) {
                pill.dataset.ptKey = "";
            window.__pt_ri_key = null;
                pill.style.pointerEvents = "none";
                pill.style.cursor = "default";
                pill.title = "";
            }
            setInit(false);
            show("实时运行节点", "center");
            showStep(false);
        };
        // v137：三段式虚拟进度计算函数
        const calcVirtualPct = (startTime) => {
            if (!startTime) return 0;
            const elapsed = (Date.now() - startTime) / 1000;
            if (elapsed <= 10) return Math.min(50, elapsed * 5);              // 0-10s: 0%->50%
            if (elapsed <= 30) return Math.min(75, 50 + (elapsed - 10) * 1.25); // 10-30s: 50%->75%
            return Math.min(99, 75 + (elapsed - 30) * 0.08);                  // 30s+: 75%->99%
        };

        const updateTotal = () => {
            if (currentLoopTotal > 1) {
                const innerVirtual = calcVirtualPct(loopVirtualStartTime) / 100;
                const loopPct = Math.min(100, ((currentLoopIteration - 1) + innerVirtual) / currentLoopTotal * 100);
                if (loopPct > lastPct) lastPct = loopPct;
                setTotal(lastPct);
                return;
            }
            const vPct = calcVirtualPct(virtualProgressStartTime);
            if (vPct > lastPct) lastPct = vPct;
            setTotal(lastPct);
        };

        // 识别 prompt 里的总节点数（rgthree 同款：prompt.output 全图）
        const parseTotal = (obj) => {
            if (!obj || typeof obj !== "object") return null;
            if (obj.output && typeof obj.output === "object") {
                const n = Object.keys(obj.output).length;
                if (n > 0) return n;
            }
            return null;
        };

        // ---- 数据源 1：api.queuePrompt(num, prompt, ...) ----
        const api = app.api;
        if (api.queuePrompt && !api.__pt_ri_qp) {
            api.__pt_ri_qp = true;
            const orig = api.queuePrompt;
            api.queuePrompt = async function (...args) {
                // v122：在调用原函数前设置标志位和计数，确保 orig 内部调用 fetch 时不会重复计数
                inQueuePrompt = true;
                submitCount++;
                // v122：实时更新计数显示
                updateCountDisplay();
                const res = await orig.apply(this, args);
                inQueuePrompt = false;
                // v102：提交时不再 setInit(true)——排队中的工作流不应闪烁，
                // 只在 execution_start（实际开始执行）时才进入初始化闪烁状态。
                // v73：连续提交不同工作流时无条件更新为最新（不再 if 保护）
                runTopGraph = app.graph;          // 提交瞬间的任务工作流
                runWorkflowHash = location.hash;  // 任务工作流 id（location.hash）
                try {
                    for (const a of args) {
                        const n = parseTotal(a);
                        if (n !== null) {
                            totalNodes = n;
                            doneCount = 0;
                            currentKey = null;
                            // v69：2.0 的 queuePrompt(num, {output:{...}}) 节点对象在 a.output
                            promptData = (a && a.prompt) || (a && a.output) || a || null;
                            // v72：提交瞬间扫描任务工作流 graph 缓存子图容器名
                            try { subgraphNames = buildSubgraphNames(app.graph); } catch (e) {}
                            // v74：记录到多工作流历史（按 hash 去重）
                            try { rememberPrompt(runWorkflowHash, promptData, subgraphNames); } catch (e) {}
                            break;
                        }
                        // 无 output 时：若 a 是 prompt 节点对象（含 class_type），仍记录 promptData
                        const pd = (a && a.prompt) || (a && a.output) || a;
                        if (pd && typeof pd === "object") {
                            const vals = Object.values(pd);
                            if (vals.some(function (v) { return v && v.class_type; })) {
                                promptData = pd;
                                break;
                            }
                        }
                    }
                } catch (e) { /* ignore */ }
                return res;
            };
        }

        // ---- 数据源 1b：fetch 拦截 POST /prompt（双保险） ----
        if (!window.__pt_ri_fetch) {
            window.__pt_ri_fetch = true;
            const origFetch = window.fetch;
            window.fetch = async function (...args) {
                try {
                    const url = typeof args[0] === "string" ? args[0] : (args[0] && args[0].url) || "";
                    const opts = args[1] || {};
                    if (url.includes("/prompt")) {
                        const parsed = typeof opts.body === "string" ? JSON.parse(opts.body) : null;
                        const pd = (parsed && parsed.prompt) || (parsed && parsed.output) || parsed || null;
                        // promptData：请求体有节点对象（含 class_type）即记录，供 class_type 兜底
                        if (pd && typeof pd === "object") {
                            const vals = Object.values(pd);
                            if (vals.some(function (v) { return v && v.class_type; })) {
                                promptData = pd;
                                // v73：连续提交不同工作流时无条件更新为最新
                                runTopGraph = app.graph;
                                runWorkflowHash = location.hash;
                                // v123：移除 fetch 中的计数，避免 inQueuePrompt 时序问题导致重复计数
                                // 批量提交由 execution_start 中的 /queue 轮询补全 submitCount
                                // v72：提交瞬间扫描任务工作流 graph 缓存子图容器名
                                try { subgraphNames = buildSubgraphNames(app.graph); } catch (e) {}
                                // v74：记录到多工作流历史（按 hash 去重）
                                try { rememberPrompt(runWorkflowHash, pd, subgraphNames); } catch (e) {}
                            }
                        }
                        const n = parseTotal(pd);
                        if (n !== null) {
                            totalNodes = n;
                            doneCount = 0;
                            currentKey = null;
                        }
                    }
                } catch (e) { /* ignore */ }
                return origFetch.apply(this, args);
            };
        }

        // ---- 数据源 2：v41 改用 app.api "executing" 事件（与 rgthree 同源） ----
        // ComfyUI 前端收到 WS executing 后会 dispatch CustomEvent("executing")，
        // detail 兼容：数字节点id / {node, display_node} / display_node 路径。
        const executing = (nodeId) => {
            if (nodeId === null || nodeId === undefined) {
                currentKey = null;
                return;
            }
            const key = String(nodeId);
            // 从循环复制的key中提取原始节点key（第一个.前面的部分，如 "5.1234567890" -> "5"）
            let displayNode = key;
            if (key.includes('.')) {
                displayNode = key.split('.')[0];
            }
            if (currentKey !== null && currentKey !== key) {
                doneCount++;
                updateTotal();
            }
            currentKey = key;
            // v76：记录当前执行节点所属提交的工作流 hash（跨工作流跳转切回正确工作流）
            try {
                const recNow = findRec(key);
                activeWorkflowHash = (recNow && recNow.hash) ? recNow.hash : runWorkflowHash;
            } catch (e) { activeWorkflowHash = runWorkflowHash; }
            setInit(false);
            // v137：第一个节点开始执行时启动虚拟进度计时（初始化阶段不计入）
            if (!virtualProgressStartTime) virtualProgressStartTime = Date.now();
            if (!loopVirtualStartTime) loopVirtualStartTime = Date.now();
            // v126：检测ForLoopStart执行，跟踪当前循环迭代次数
            try {
                const ctForLoop = findNodeTypeById(key) || '';

                if (/ForLoopStart|StartLoop/i.test(ctForLoop)) {


                    // v126：首次遇到循环开始节点时，从其widgets读取循环总数（不依赖execution_start的预测，避免切换工作流残留）
                    if (currentLoopTotal === 0) {
                        try {
                            const loopNodeObj = findNodeById(key) || findNodeById(displayNode);
                            if (loopNodeObj && loopNodeObj.widgets) {
                                for (const lw of loopNodeObj.widgets) {
                                    if (lw.name === 'total' || lw.name === 'loops' || lw.name === 'loop_count' || lw.name === 'count' || lw.name === 'mode.num_iterations') {
                                        if (lw.value > 0) { currentLoopTotal = parseInt(lw.value); break; }
                                    }
                                }
                            }
                        } catch(e) {}
                    }
                    const isOfficialLoop = /^StartLoop$/i.test(ctForLoop);
                    if (isOfficialLoop) {
                        isOfficialLoopWorkflow = true;
                        // v132：官方循环 StartLoop 每次循环触发2次且循环复制后key不同，去重不可靠
                        // 完全依赖 v130 maxNodeExecCount 兜底推断循环迭代次数，这里不递增
                    } else {
                        currentLoopIteration++;
                        loopVirtualStartTime = Date.now(); // v137：新循环迭代开始，重置循环内虚拟进度计时
                        doneCount = 0;
                    }
                }

 // v126：新循环开始时重置节点计数
            } catch (e) {}
            // v130：用最大节点执行次数兜底推断循环迭代次数（仅官方循环 StartLoop 可能不触发时）
            try {
            } catch(e) {}
            if (isOfficialLoopWorkflow && currentLoopTotal > 0 && maxNodeExecCount > currentLoopIteration) {
                currentLoopIteration = Math.min(currentLoopTotal, maxNodeExecCount);
                loopVirtualStartTime = Date.now(); // v137：官方循环新迭代开始，重置循环内虚拟进度计时
                doneCount = 0; // v134：新循环开始时重置内部进度，避免上一循环doneCount残留导致进度跳变
            }
            showStep(true); // v122：executing时直接显示进度条，避免隐藏再显示的闪烁
            setStep(0); // v126：节点切换时重置进度为0，已知真实进度节点立即显示空进度条等待真实进度
            // v108：根据当前节点类型设置进度条颜色（只用class_type，没有就灰色）
            try {
                // v122：优先用当前画布节点的type（最准确，避免循环复制时prompt中key与class_type不匹配）
                let ctForColor = findNodeTypeById(key) || findNodeTypeById(displayNode);
                // 画布中找不到时（如动态复制的节点），回退到prompt数据的class_type
                if (!ctForColor) {
                    try {
                        const recForColor = findRec(key);
                        const pForColor = (recForColor && recForColor.prompt) || promptData;
                        if (pForColor) {
                            const pk = pForColor[key] || pForColor[displayNode] || pForColor[key.split(":")[0]];
                            if (pk && pk.class_type) ctForColor = pk.class_type;
                        }
                    } catch (e) {}
                }
                // v123：先按类型名判断，匹配不到默认色时用连接点组合判断（子图内UUID节点）
                let stepColorVal = stepColorForType(ctForColor);
                if (stepColorVal === STEP_COLORS.default) {
                    const nodeObjForColor = findNodeById(key) || findNodeById(displayNode);
                    const connColorVal = stepColorForFirstConnection(nodeObjForColor);
                    if (connColorVal) stepColorVal = connColorVal;
                }
                setStepColor(stepColorVal);
                // v108：把class_type传给模拟进度判断，有真实进度的节点不启动模拟
                scheduleSimProgress(ctForColor);
            } catch (e) {
                setStepColor(STEP_COLORS.default);
                scheduleSimProgress(null);
            }
            // v67：在任务工作流中解析并缓存节点名；切走后新节点回退 class_type
            // v68：纯数字（解析失败）不缓存，切回任务工作流后能重新解析出真实节点名
            if (!(key in keyTitleCache) || /^[\d:]+$/.test(keyTitleCache[key])) {
                keyTitleCache[key] = nodeName(key, runTopGraph || app.graph);
            }
            // v122：统计当前节点的执行次数（单工作流循环时用）
            nodeExecCount[key] = (nodeExecCount[key] || 0) + 1;
            // v132：循环控制节点(StartLoop/EndLoop/ForLoopStart/ForLoopEnd)每次触发多次，不计入maxNodeExecCount，避免v130兜底错误
            try {
                const ctForCount = findNodeTypeById(key) || '';
                const isLoopControlNode = /^(StartLoop|EndLoop|ForLoopStart|ForLoopEnd)$/i.test(ctForCount);
                const maxBefore = maxNodeExecCount;
                if (!isLoopControlNode && nodeExecCount[key] > maxNodeExecCount) {
                    maxNodeExecCount = nodeExecCount[key];
                }
            } catch(e) {
                if (nodeExecCount[key] > maxNodeExecCount) maxNodeExecCount = nodeExecCount[key];
            }
            // v70：show 输入兜底，任何解析异常回退原始 key，保证 label 一定更新
            let shownText = keyTitleCache[key] || "";
            if (!shownText) {
                try { shownText = nodeName(key, runTopGraph || app.graph); }
                catch (e) { shownText = String(key); }
            }
            // v122：保存纯节点名（不含计数），供后续提交新工作流时动态更新显示
            currentShownText = shownText;
            // v123：计数显示
            // 循环工作流（currentLoopTotal > 0）+ 单提交："循环总数/循环数 • 节点名"
            // 循环工作流 + 多提交："总数/当前序号/循环数 • 节点名"
            // 非循环 + 多提交："总数/当前序号 • 节点名"
            // 单提交 + 非循环：只显示节点名
            // v126：防止上一次运行残留的currentSubmitIndex导致先显示2/x再跳回1/x
            if (submitCount > 0 && currentSubmitIndex > submitCount) currentSubmitIndex = 1;
            if (currentLoopTotal > 1) { // v137：循环次数>1才显示循环计数，=1时和非循环一样
                // v126：循环体外节点（只执行一次）显示循环总数/循环总数，循环体内节点显示实际次数
                const loopNum = Math.min(currentLoopTotal, currentLoopIteration > 0 ? currentLoopIteration : (nodeExecCount[key] || 1));
                if (submitCount > 1) {
                    const submitIdx = Math.max(1, currentSubmitIndex);
                    shownText = submitCount + "/" + submitIdx + "/" + loopNum + " • " + shownText;
                } else {
                    shownText = currentLoopTotal + "/" + loopNum + " • " + shownText;
                }
            } else if (submitCount > 1) {
                shownText = submitCount + "/" + Math.max(1, currentSubmitIndex) + " • " + shownText;
            }
            show(shownText, "left");
            const pill = $("pt-run-indicator");
            if (pill) {
                pill.dataset.ptKey = key;
                window.__pt_ri_key = key;
                pill.style.pointerEvents = "auto";
                pill.style.cursor = "pointer";
                pill.title = "点击跳转到该节点";
            }
        };

        const onExecutingEvent = (e) => {
            let d = e.detail;
            if (d && typeof d === "object" && !Array.isArray(d)) {
                d = (d.node !== undefined && d.node !== null) ? d.node : d.display_node;
            }
            executing(d);
        };
        api.addEventListener("executing", onExecutingEvent);

        // 初始化恢复：刷新后主动查询队列状态，若有正在执行的节点则立即显示（避免运行栏先空后填）
        setTimeout(function () {
            fetch("/queue").then(function (r) { return r.json(); }).then(function (q) {
                try {
                    if (q && q.queue_running && q.queue_running.length > 0) {
                        const running = q.queue_running[0];
                        let nodeId = null;
                        if (running && running[1] && typeof running[1] === "object") {
                            nodeId = running[1].node;
                        } else if (running && running[1] !== undefined) {
                            nodeId = running[1];
                        }
                        if (nodeId !== null && nodeId !== undefined) {
                            executing(nodeId);
                        }
                    }
                } catch (e) { /* ignore */ }
            }).catch(function () { /* ignore */ });
        }, 300);

        // progress / execution_cached 仍走 socket（事件源无或不可靠）
        let hookedSocket = null;
        const hookSocket = () => {
            const ws = window.app && window.app.api ? window.app.api.socket : null;
            if (!ws || ws === hookedSocket) return;
            hookedSocket = ws;
            ws.addEventListener("message", (ev) => {
                try {
                    const data = JSON.parse(ev.data);
                    if (!data || !data.type) return;
                    if (data.type === "progress") {
                        const d = data.data || {};
                        hasRealProgress = true; // 标记收到真实进度，停止模拟
                        stopSimProgress();
                        showStep(true);
                        setStep(d.max ? (d.value / d.max) * 100 : 0);
                    } else if (data.type === "progress_state") {
                        // v108：新版ComfyUI进度事件，包含所有节点的进度状态
                        const d = data.data || {};
                        const nodes = d.nodes || {};
                        // 找到当前正在运行的节点（state=running）
                        let runningNode = null;
                        for (const nid in nodes) {
                            if (nodes[nid] && nodes[nid].state === "running") {
                                runningNode = nodes[nid];
                                break;
                            }
                        }
                        // v123：控制流节点（ForLoopEnd/LoopEnd等）频繁发进度事件，若非当前节点则忽略，避免覆盖当前节点颜色
                        // 其他节点（包括子图内节点）正常处理，不限制必须等于currentKey
                        const runningId = String(runningNode ? (runningNode.display_node_id || runningNode.node_id || '') : '');
                        const runningCt = findNodeTypeById(runningId) || '';
                        if (!runningCt) {
                            try {
                                const recR = findRec(runningId);
                                const pR = (recR && recR.prompt) || promptData;
                                if (pR) {
                                    const pkR = pR[runningId] || pR[String(runningId).split(':').pop()];
                                    if (pkR && pkR.class_type) runningCt = pkR.class_type;
                                }
                            } catch (e) {}
                        }
                        const isControlFlowEnd = /ForLoopEnd|LoopEnd|EndLoop/i.test(runningCt);
                        const isCurrentNode = (runningId === String(currentKey || '')) ||
                            (currentKey && runningId.split(":").pop() === String(currentKey).split(":").pop());
                        if (runningNode && runningNode.max > 0 && isCurrentNode) {
                            hasRealProgress = true; // 标记收到真实进度，停止模拟
                            stopSimProgress();
                            showStep(true);
                            setStep((runningNode.value / runningNode.max) * 100);
                            // v123：progress_state 只更新进度值，不设置颜色（颜色只在 executing 节点切换时设置一次，避免频繁重绘闪烁）
                        }
                    } else if (data.type === "execution_cached") {
                        const d = data.data || {};
                        const nodes = Array.isArray(d.nodes) ? d.nodes : [];
                        for (const cached of nodes) {
                            executing(cached);
                        }
                    }
                } catch (e) { /* ignore malformed */ }
            }, true);
        };
        hookSocket();
        setInterval(hookSocket, 1500);

        // ---- 状态事件 ----
        api.addEventListener("execution_start", () => {
            doneCount = 0;
// v122：重置节点执行次数统计（单工作流循环）
            nodeExecCount = {};
            currentLoopIteration = 0; // v126：重置循环迭代次数
            isOfficialLoopWorkflow = false; // v131：重置官方循环标记
            // v137：重置虚拟进度计时
            virtualProgressStartTime = 0; // v137：初始化阶段不计时，第一个executing时才开始
            loopVirtualStartTime = 0;
            // v127：构建节点 id→type 快照，防止切换工作流后 graph 被原地修改导致类型查找错误
            nodeTypeSnapshot = {};
            // v135：优先从 promptData 构建快照（当前执行的工作流数据，不受切换工作流影响）
            try {
                if (promptData && typeof promptData === 'object') {
                    for (const pid in promptData) {
                        const pnode = promptData[pid];
                        if (pnode && pnode.class_type) nodeTypeSnapshot[String(pid)] = pnode.class_type;
                    }
                }
            } catch (e) {}
            try {
                const snapGraph = runTopGraph || (app && app.graph);
                if (snapGraph && snapGraph._nodes) {
                    for (const n of snapGraph._nodes) {
                        if (n && n.id != null && n.type) {
                            const sid = String(n.id); if (!nodeTypeSnapshot[sid]) nodeTypeSnapshot[sid] = n.type; // v135：不覆盖promptData
                        }
                        // 子图内节点也保存（循环体内节点 executing 只有子图内ID）
                        if (n && n.subgraph && n.subgraph._nodes) {
                            for (const sn of n.subgraph._nodes) {
                                if (sn && sn.id != null && sn.type) {
                                    const sid2 = String(sn.id); if (!nodeTypeSnapshot[sid2]) nodeTypeSnapshot[sid2] = sn.type; // v135：不覆盖promptData
                                }
                            }
                        }
                    }
                }
            } catch (e) {}
            maxNodeExecCount = 0;
            // v123：检测当前工作流是否循环，读取循环总数
            currentLoopTotal = 0;
            try {
                // 优先从 promptData 检测，兜底从画布节点检测
                let detectSource = null;
                if (promptData && typeof promptData === 'object' && Object.keys(promptData).length > 0) {
                    detectSource = 'prompt';
                } else if (runTopGraph && runTopGraph._nodes) {
                    detectSource = 'canvas';
                }
                if (detectSource === 'prompt') {
                    for (const k in promptData) {
                        const node = promptData[k];
                        if (node && node.class_type && /ForLoopStart|LoopStart|StartLoop/i.test(node.class_type)) {
                            const inputs = node.inputs || {};
                            const loops = inputs.total || inputs.loops || inputs.loop_count || inputs.count || inputs['mode.num_iterations'] || 0;
                            if (loops > 0) currentLoopTotal = parseInt(loops);
                            // v131：检测到官方循环 StartLoop 时标记
                            if (/StartLoop|LoopStart/i.test(node.class_type) && !/ForLoopStart/i.test(node.class_type)) {
                                isOfficialLoopWorkflow = true;
                            }
                            break;
                        }
                    }
                } else if (detectSource === 'canvas') {
                    for (const n of runTopGraph._nodes) {
                        if (n && n.type && /ForLoopStart|LoopStart|StartLoop/i.test(n.type)) {
                            let loops = 0;
                            if (n.widgets) {
                                for (const w of n.widgets) {
                                    if (w.name === 'total' || w.name === 'loops' || w.name === 'loop_count' || w.name === 'count' || w.name === 'mode.num_iterations') {
                                        loops = w.value;
                                        break;
                                    }
                                }
                            }
                            if (loops > 0) currentLoopTotal = parseInt(loops);
                            // v131：检测到官方循环 StartLoop 时标记
                            if (/StartLoop|LoopStart/i.test(n.type) && !/ForLoopStart/i.test(n.type)) {
                                isOfficialLoopWorkflow = true;
                            }
                            break;
                        }
                    }
                }
            } catch (e) {}


            // v133：不重置为1，根据submitCount推断序号——同一批下一个工作流递增，新一批重置为1
            // 避免轮询延迟导致第二个工作流前几个节点显示错误序号
            if (submitCount > 0 && currentSubmitIndex < submitCount) {
                currentSubmitIndex++;
            } else {
                currentSubmitIndex = 1;
            }
            // v122：查询实际队列数量，反推当前工作流序号
            // 总提交数 submitCount 取队列历史最大值；当前序号 = 总提交数 - 队列剩余 + 1
            // 批量提交时部分工作流可能延迟入队，轮询6次（间隔800ms）取最大值
            try {
                let qChecks = 0;
                const checkQueue = function() {
                    fetch("/queue").then(function(r) { return r.json(); }).then(function(q) {
                        try {
                            const running = (q && q.queue_running && q.queue_running.length) || 0;
                            const pending = (q && q.queue_pending && q.queue_pending.length) || 0;
                            const total = running + pending;
                            // v123：移除"新一批开始"重置逻辑——reset() 已在队列为空 1.5s 后重置 submitCount
                            // 此处只增不减，避免多工作流执行中（运行中提交新工作流）被错误清零
                            if (total > submitCount) submitCount = total;
                            // 反推当前序号：总提交数 - 队列剩余 + 1
                            if (submitCount > 0 && total > 0) {
                                currentSubmitIndex = submitCount - total + 1;
                            }
                            // 动态更新显示
                            updateCountDisplay();
                        } catch (e) {}
                    }).catch(function() {});
                    qChecks++;
                    if (qChecks < 6) setTimeout(checkQueue, 800);
                };
                checkQueue();
            } catch (e) {}
            // v70：记录进入前的进行中节点（异常乱序时不覆盖其显示）
            const hadKey = currentKey;
            currentKey = null;
            if (!runTopGraph) runTopGraph = app.graph;
            lastPct = 0;
            pendingTotal = null;
            pendingStep = null;
            setInit(true);
            if (hadKey === null) {
                show("运行初始化…", "left");
            }
            setTotal(0);
            setStep(0);
            showStep(false);
        });

        api.addEventListener("execution_success", () => {
            stopSimProgress(); // v108：停止模拟进度
            currentKey = null; // v121：确保reset能执行，避免"完成"一直显示
            // v137：提交完成，停止虚拟进度计时，总进度直接到100%
            virtualProgressStartTime = 0;
            loopVirtualStartTime = 0;
            lastPct = 100;
            pendingTotal = 100;
            scheduleBars();
            showStep(false);
            clearTimeout(successTimer);
            clearTimeout(errorTimer);
            // v123：查询队列——多工作流（队列非空）时不显示"完成"，直接切下一个；
            // 只有全部跑完（队列为空）才显示"完成"1.5秒，避免长短不一
            try {
                fetch('/queue').then(function(r) { return r.json(); }).then(function(q) {
                    const running = (q && q.queue_running && q.queue_running.length) || 0;
                    const pending = (q && q.queue_pending && q.queue_pending.length) || 0;
                    if (running + pending === 0) {
                        // 全部跑完，显示"完成"
                        show("完成", "center");
                        submitCount = 0;
                        currentSubmitIndex = 0;
                        successTimer = setTimeout(reset, 1500);
                    } else {
                        // 还有下一个工作流，不显示"完成"，直接重置准备切换
                    }
                }).catch(function() {
                    // 查询失败时兜底显示"完成"
                    show("完成", "center");
                    successTimer = setTimeout(reset, 1500);
                });
            } catch (e) {
                show("完成", "center");
                successTimer = setTimeout(reset, 1500);
            }
        });

        // 中断（手动取消）不改变进度条颜色——只显示"已中断"后复位
        api.addEventListener("execution_interrupted", () => {
            stopSimProgress(); // v108：停止模拟进度
            setInit(false);
            show("已中断", "left");
            clearTimeout(successTimer);
            clearTimeout(errorTimer);
            errorTimer = setTimeout(reset, 1500);
        });

        // 出错 -> 红X按钮同款红 + "执行出错"
        api.addEventListener("execution_error", () => {
            stopSimProgress(); // v121：报错后停止模拟进度
            currentKey = null; // v121：确保reset能执行
            setInit(false);
            setBarColor(errorColor);
            show("执行出错", "left");
            clearTimeout(successTimer);
            clearTimeout(errorTimer);
            errorTimer = setTimeout(reset, 3000);
        });
    }
});

