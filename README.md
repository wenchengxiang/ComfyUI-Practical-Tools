To enhance the usability of ComfyUI, optimizations and integrations have been implemented for several commonly used nodes.
# ComfyUI-Practical-Tools

> 一套面向 ComfyUI 实战工作流的实用工具集，涵盖逻辑控制、图像处理、遮罩操作、批量处理、循环、音频视频、前端体验增强等 80+ 节点与扩展。

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![ComfyUI](https://img.shields.io/badge/ComfyUI-≥0.2.0-green.svg)](https://github.com/comfyanonymous/ComfyUI)
[![Python](https://img.shields.io/badge/python-3.10+-yellow.svg)](https://www.python.org/)

---

## 目录

- [功能亮点](#功能亮点)
- [安装方法](#安装方法)
- [节点大全](#节点大全)
  - [逻辑控制 Logic](#逻辑控制-logic)
  - [工具 Utils](#工具-utils)
  - [透传 Passthrough](#透传-passthrough)
  - [字符串 String](#字符串-string)
  - [图像处理 Image](#图像处理-image)
  - [遮罩处理 Mask](#遮罩处理-mask)
  - [音频 Audio](#音频-audio)
  - [视频 Video](#视频-video)
  - [条件与模型 Conditioning & Model](#条件与模型-conditioning--model)
  - [其他节点](#其他节点)
- [前端扩展](#前端扩展)
  - [实时运行节点指示器](#实时运行节点指示器)
  - [固定图标优化](#固定图标优化)
  - [文字标签节点](#文字标签节点)
  - [深色主题增强](#深色主题增强)
  - [Photopea 集成](#photopea-集成)
  - [书签](#书签)
  - [UI 性能优化](#ui-性能优化)
- [配置说明](#配置说明)
- [常见问题](#常见问题)
- [更新日志](#更新日志)
- [贡献指南](#贡献指南)
- [许可证](#许可证)

---

## 功能亮点

- **强大的循环系统**：While 循环、For 循环、循环步进、批量累加，支持任意类型透传。
- **实时运行节点指示器**：顶部工具栏显示当前正在执行的节点名称与进度，支持点击跳转定位、跨工作流追踪、运行等待区（大工作流渲染加速）。
- **丰富的图像处理**：批量交错、网格拼贴、切片/还原、填充、旋转、混合、裁剪/还原、目录批量加载等。
- **完整的遮罩工具链**：模糊、膨胀、填洞、批量转换、空值替换、黑色检测等。
- **Any 系列通用节点**：支持任意类型的比较、转换、索引、长度、开关、透传，大幅减少连线复杂度。
- **WD14 打标**：内置 SmilingWolf WD14 系列模型支持，自动识别模型，缺模型时给出下载地址。
- **前端体验增强**：固定图标简化、深色主题优化、Photopea 在线编辑、文字标签、UI 性能调优。
- **素材自动部署**：插件 `assets/` 目录下的素材会在启动时自动复制到 ComfyUI `input/` 文件夹。

---

## 安装方法

### 方法一：Git 克隆（推荐）

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/wenchengxiang/ComfyUI-Practical-Tools.git
```

### 方法二：手动下载

1. 下载仓库 ZIP 包
2. 解压到 `ComfyUI/custom_nodes/Practical-Tools/`
3. 重启 ComfyUI

### 方法三：ComfyUI Manager

在 ComfyUI Manager 中搜索 `Practical-Tools` 并安装。

### 依赖安装

```bash
pip install -r requirements.txt
```

主要依赖：`numpy`, `Pillow`, `onnxruntime`（WD14 Tagger 使用）。

---

## 节点大全

### 逻辑控制 Logic

| 节点名称 | 功能说明 | 输出 |
|---|---|---|
| **While Loop Start** | While 循环起始，支持最多 5 路任意类型透传 | flow, value0~4 |
| **While Loop End** | While 循环结束，汇总循环结果 | value0~4 |
| **For Loop Start** | For 循环起始，带索引输出 | flow, index, value1~4 |
| **For Loop End** | For 循环结束 | value1~4 |
| **Loop Step** | 循环步进，返回下一索引与是否继续 | next_index, continue |
| **Batch Accumulate** | 批量循环累加器，累积任意类型输出 | accumulated |

### 工具 Utils

| 节点名称 | 功能说明 | 输出 |
|---|---|---|
| **Any Compare** | 任意类型比较（==, !=, >, <, >=, <=） | boolean |
| **Any Convert** | 任意类型转换 | out |
| **Any Index** | 从列表/批次中按索引取值（完整功能版） | value |
| **Any Index Simple** | 简化版索引取值 | value |
| **Any Index Strong** | 强类型索引取值 | value |
| **Any Length** | 获取列表/批次/字符串长度 | length |
| **Any Switch** | 任意类型开关（完整功能版） | * |
| **Any Switch Simple** | 简化版任意类型开关 | * |
| **Any Switch Strong** | 强类型任意类型开关 | * |
| **Boolean Not** | 布尔取反 | 取反结果 |
| **Create List** | 创建任意类型列表 | list |
| **Index Anything** | 通用索引取值 | out |
| **Link Switch** | 连线开关 | 输出 |
| **Math** | 数学表达式计算（支持 gcd/lcm/sin/cos/sqrt/min/max 等 40+ 函数） | INT, FLOAT |
| **Math Dual** | 双路数学表达式同时计算 | int_1, float_1, int_2, float_2 |
| **Random Integer** | 随机整数生成 | INT |
| **Random Path** | 随机路径选择 | STRING |
| **String To Combo** | 字符串转下拉选项 | * |
| **Upscale Model Selector** | 超分模型选择器 | model_name |

### 透传 Passthrough

| 节点名称 | 功能说明 | 输出 |
|---|---|---|
| **Any Passthrough** | 任意类型透传 | any_output |
| **Any Rerouter** | 任意类型重路由 | any_value |
| **Audio Pass** | 音频透传 | audio |
| **Cond Pair Passthrough** | 条件对透传 | conditioning, conditioning |
| **Bus In** | 总线输入（最多 25 路打包） | 总线束 |
| **Bus Out** | 总线输出（解包 25 路） | 输出_1~25 |

### 字符串 String

| 节点名称 | 功能说明 | 输出 |
|---|---|---|
| **Any To End** | 字符串末尾追加 | string |
| **Prompt Replace** | 提示词替换 | prompt |
| **Text Line To List** | 文本按行转列表 | list |

### 图像处理 Image

| 节点名称 | 功能说明 | 输出 |
|---|---|---|
| **Folder Image Load** | 从文件夹批量加载图片 | images |
| **Image Batch** | 图片合并为批次 | image |
| **Image Batch Count XYZ** | 批次黑白计数（X黑/Y白/Z黑） | x_black, y_white, z_black |
| **Image Batch Interleave** | 两批次图片交错合并 | IMAGE |
| **Image Batch Interleave Split** | 交错批次拆分 | image_batch_list |
| **Image Batch To List** | 批次转图片列表 | 图像 |
| **Image List To Batch** | 图片列表转批次 | 图像 |
| **Image Blend** | 图片混合（带遮罩输出） | image, mask |
| **Image Blend Mask Center** | 遮罩中心图片混合 | IMAGE |
| **Image Crop and Uncrop** | 裁剪与还原（成对使用） | IMAGE |
| **Image Grid Table** | 图片网格表格拼接 | 输出 |
| **Image Pad** | 图片填充/补边 | image |
| **Image Tile** | 图片切片（带重叠） | 切片批次, 切片宽高, 重叠量 |
| **Image Untile** | 切片还原为大图 | 图像 |
| **Image Transform Rotate** | 图片变换旋转 | IMAGE |
| **Load Image Batch From Dir** | 从目录批量加载图片（带遮罩与数量） | IMAGE, MASK, INT |
| **Reverse Image Batch** | 批次图片顺序反转 | IMAGE |
| **Text Image** | 文字转图片（支持自定义字体、字号、颜色） | IMAGE |
| **Blockify Mask** | 遮罩块化处理 | mask |

### 遮罩处理 Mask

| 节点名称 | 功能说明 | 输出 |
|---|---|---|
| **Mask Batch** | 遮罩合并为批次 | masks |
| **Mask Batch To List** | 遮罩批次转列表 | 遮罩 |
| **Mask Batch Replace Empty** | 批次中空遮罩替换 | MASK |
| **Mask Blur** | 遮罩模糊 | mask |
| **Mask Brightness** | 遮罩亮度调整 | MASK |
| **Mask Fill Holes** | 遮罩填洞 | MASK |
| **Mask From Batch** | 从批次提取遮罩 | MASK |
| **Mask Grow** | 遮罩膨胀/收缩 | MASK |
| **Is Mask Black** | 检测遮罩是否全黑 | boolean |
| **Repeat Mask Batch** | 重复遮罩批次 | MASK |

### 音频 Audio

| 节点名称 | 功能说明 | 输出 |
|---|---|---|
| **Audio Duration** | 获取音频时长（毫秒） | duration_ms |

### 视频 Video

| 节点名称 | 功能说明 | 输出 |
|---|---|---|
| **Folder Video Concat** | 文件夹内视频拼接 | video |

### 条件与模型 Conditioning & Model

| 节点名称 | 功能说明 | 输出 |
|---|---|---|
| **Krea2 Cond Rebalance** | Krea2 条件重平衡 | conditioning |
| **Lora Load With Trigger** | 加载 LoRA 并输出触发词 | lora_name, strength, trigger_words |
| **Lying Sampler** | 自定义采样器 | 采样输出 |
| **RTX Super Resolution** | RTX 超分辨率 | IMAGE |
| **Max Resolution Filter** | 最大分辨率过滤 | 过滤结果 |
| **WD14 Tagger** | WD14 图像打标（SmilingWolf 系列模型） | tags |

### 其他节点

| 节点名称 | 分类 | 功能说明 |
|---|---|---|
| **ModelScope API** | API | 调用 ModelScope API |
| **Prompt Replace** | String | 提示词批量替换 |

---

## 前端扩展

### 实时运行节点指示器

**文件**：`js/run_indicator.js`（约 98KB，核心扩展）

在 ComfyUI 顶部工具栏添加"实时运行节点"槽位，实时显示当前正在执行的节点名称与整体进度。

**核心功能：**

- **实时节点显示**：运行时显示当前执行节点名（支持子图内节点显示为 `子图名(节点名)` 格式）。
- **进度条**：槽位本身即进度槽，蓝色进度条随执行推进。
- **初始化提示**：运行初始化阶段槽位内描边闪烁，初始化完成后出现进度条。
- **点击跳转**：运行时点击槽位可跳转到当前执行节点位置并选中（子图内节点先进入子图再定位）。
- **跨工作流追踪**：在工作流 A 运行时切换到工作流 B，仍能正确显示节点名并点击跳回 A 定位。
- **运行等待区**：点击茶杯图标进入/退出"运行等待区"子图，大工作流运行时在空白等待区等待可显著加快画布渲染。
- **等待区自动创建**：首次点击茶杯时自动创建"运行等待区"子图（含说明文字标签），放置在真实节点包围盒右侧远处，不干扰主工作区。
- **官方"适应全部"兼容**：等待区节点不会被官方"适应全部节点"功能纳入取景范围。
- **跨工作流状态正确**：茶杯蓝框状态跟随当前工作流，切换工作流时正确显示/隐藏。

**配置文件**：`js/run_indicator_waiting_room_config.js`

可自定义等待区内两行说明文字的内容、字号、字体、颜色、对齐、背景色、圆角、内边距、行间距等。

### 固定图标优化

**文件**：`js/pin_icon.js`

将 ComfyUI 中固定节点/分组时的 📌 图标替换为简约的 `ᴘ` 字符，减少视觉干扰。同时作用于普通节点标题和分组标题。

### 文字标签节点

**文件**：`js/Text_Label.js`

在画布上添加可自由编辑的文字标签，支持自定义文字内容、字号、颜色、背景等，用于工作流注释与分区说明。

### 深色主题增强

**文件**：`js/dark_better_theme.js` + `js/themes/dark-better.json`

优化 ComfyUI 深色主题的配色与对比度，提升长时间使用的视觉舒适度。

### Photopea 集成

**文件**：`js/photopea.js`

在 ComfyUI 中集成 Photopea 在线图像编辑器，可直接编辑工作流中的图片。

### 书签

**文件**：`js/Book_mark.js`

为工作流节点/区域添加书签，方便在大型工作流中快速跳转定位。

### UI 性能优化

**文件**：`js/ui_perf_tweaks.js`

针对大型工作流的 UI 渲染性能进行调优，减少卡顿。

---

## 配置说明

### 运行等待区配置

编辑 `js/run_indicator_waiting_room_config.js`，可自定义：

```javascript
window.PT_WAITING_ROOM_CONFIG = {
  line1: {
    text: "大型工作流运行期间，请在此处等待可加快渲染。",
    fontSize: 42,
    fontColor: "#ffffff",
    fontFamily: "Arial",
    fontWeight: "normal",
    textAlign: "center",
    backgroundColor: "transparent",
    borderRadius: 0,
    padding: 0,
  },
  line2: {
    text: "提醒：点击茶杯图标返回工作流节点区",
    fontSize: 18,
    // ... 同上字段
  },
  lineGap: 15,  // 两行间距（像素）
};
```

### WD14 Tagger 模型放置

模型目录：`ComfyUI/models/wd14/onnx/`

支持三种放置方式（任选其一）：

1. **直接放入（最简单）**：将下载的 `model.onnx` 和 `selected_tags.csv` 直接放入目录。
2. **扁平同名**：`模型名.onnx` + `模型名.csv` 直接放入目录。
3. **子文件夹**：建子文件夹 `模型名/`，放入 `model.onnx` + `selected_tags.csv`。

缺模型时运行会在后台打印下载地址。默认模型：`wd-v1-4-moat-tagger-v2`。

### 素材自动部署

将图片/音频/视频/遮罩素材放入插件 `assets/` 目录，ComfyUI 启动时会自动复制到 `input/` 文件夹（已存在的不覆盖，删除后重启自动补回）。

---

## 常见问题

### Q: 安装后节点不显示？

A: 检查是否正确解压到 `ComfyUI/custom_nodes/Practical-Tools/`，重启 ComfyUI，查看控制台是否有报错。

### Q: WD14 Tagger 报错找不到模型？

A: 参考上方"WD14 Tagger 模型放置"章节，将模型放入 `ComfyUI/models/wd14/onnx/` 目录。报错时后台会打印具体下载地址。

### Q: 实时运行节点指示器不显示？

A: 确保 `js/run_indicator.js` 文件存在，刷新页面（Ctrl+F5 强制刷新）。该扩展在顶部工具栏队列按钮右侧显示。

### Q: 运行等待区怎么用？

A: 大工作流运行时，点击指示器左侧的茶杯图标进入等待区（空白子图），可显著加快画布渲染；再次点击茶杯返回工作流节点区。首次点击会自动创建等待区。

### Q: 循环节点怎么用？

A: While 循环：`While Loop Start` → 循环体 → `While Loop End`，通过条件控制循环次数。For 循环：`For Loop Start` → 循环体 → `For Loop End`，通过 `Loop Step` 控制步进。

### Q: 支持 ComfyUI 1.x 吗？

A: 支持。所有节点与前端扩展均兼容 ComfyUI 0.2.x 与 1.x 版本。

---

## 更新日志

### v1.0.0

- 初始版本发布
- 80+ Python 节点
- 8 个前端扩展
- 实时运行节点指示器（含运行等待区）
- WD14 Tagger 支持
- 循环系统
- Any 系列通用节点

---

## 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

### 代码规范

- Python 节点放在 `py/` 目录，一个文件一个功能模块
- 前端扩展放在 `js/` 目录
- 节点分类统一使用 `Practical-Tools/xxx` 格式
- 中文注释优先，方便国内用户阅读

---

## 许可证

本项目采用 MIT 许可证 — 详见 [LICENSE](LICENSE) 文件。

---

## 致谢

- [ComfyUI](https://github.com/comfyanonymous/ComfyUI) — 强大的节点式 AI 绘画工具
- [SmilingWolf](https://huggingface.co/SmilingWolf) — WD14 打标模型
- 所有贡献者与用户

---

**如果这个插件对你有帮助，欢迎给个 Star ⭐**
