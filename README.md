# ComfyUI-Practical-Tools

<p align="center">
  <strong>Practical tools for real-world ComfyUI workflows.</strong>
</p>

<p align="center">
  A collection of practical nodes and frontend extensions designed to make
  ComfyUI workflows easier to build, manage and use.
</p>

<p align="center">

[![GitHub Stars](https://img.shields.io/github/stars/wenchengxiang/ComfyUI-Practical-Tools?style=flat-square)](https://github.com/wenchengxiang/ComfyUI-Practical-Tools)
[![GitHub Release](https://img.shields.io/github/v/release/wenchengxiang/ComfyUI-Practical-Tools?style=flat-square)](https://github.com/wenchengxiang/ComfyUI-Practical-Tools/releases)
[![License](https://img.shields.io/github/license/wenchengxiang/ComfyUI-Practical-Tools?style=flat-square)](https://github.com/wenchengxiang/ComfyUI-Practical-Tools/blob/main/LICENSE)

</p>

<p align="center">

**[Installation](#installation)** ·
**[Features](#features)** ·
**[Nodes](#nodes)** ·
**[Frontend](#frontend-extensions)** ·
**[FAQ](#faq)**

</p>

---

## What is Practical-Tools?

**ComfyUI-Practical-Tools** is a collection of practical utilities for ComfyUI.

It focuses on problems that frequently appear when building real-world workflows:

* Workflow data routing
* `ANY` type handling
* Loops and batch processing
* Image and mask manipulation
* Prompt and string utilities
* Model and conditioning utilities
* Workflow organization
* Frontend usability
* Large workflow performance

The goal is simple:

> **Make complicated ComfyUI workflows easier to build, connect and use.**

Practical-Tools is designed to work alongside ComfyUI's existing nodes rather than replace them.

---

# Features

## 🔀 Workflow Tools

Utilities for connecting and controlling complex workflows.

* Any Compare
* Any Convert
* Any Index
* Any Length
* Any Switch
* Any Passthrough
* Any Rerouter
* Link Switch
* Bus In / Bus Out
* Create List
* Random Integer
* Random Path

These nodes are especially useful when a workflow contains many branches, dynamic values or long-distance connections.

---

## 🔁 Loop System

A set of nodes for repeated workflow execution and iterative processing.

* While Loop
* For Loop
* Loop Step
* Batch Accumulate

Typical use cases:

* Repeated processing
* Batch operations
* Iterative workflows
* Conditional loops
* Repeated sampling
* Accumulating loop results

---

## 🖼️ Image Tools

A collection of image utilities for batch processing and workflow construction.

Includes:

* Image Batch
* Image Batch To List
* Image List To Batch
* Image Batch Interleave
* Image Batch Interleave Split
* Image Grid Table
* Image Blend
* Image Blend Mask Center
* Image Crop and Uncrop
* Image Pad
* Image Tile
* Image Untile
* Image Transform Rotate
* Reverse Image Batch
* Folder Image Load
* Load Image Batch From Dir
* Text Image
* Blockify Mask

---

## 🎭 Mask Tools

Common mask operations for image-processing workflows.

Includes:

* Mask Batch
* Mask Batch To List
* Mask Batch Replace Empty
* Mask Blur
* Mask Brightness
* Mask Fill Holes
* Mask From Batch
* Mask Grow
* Repeat Mask Batch
* Is Mask Black

---

## 📝 String & Prompt

Utilities for handling prompts and text inside workflows.

* Prompt Replace
* Text Line To List
* String To Combo
* Any To End

Useful for dynamic prompts, list generation and batch text processing.

---

## 🧠 Model & AI Utilities

Additional tools for model-related workflows.

* Lying Sampler
* Lora Load With Trigger
* Krea2 Cond Rebalance
* RTX Super Resolution
* Max Resolution Filter
* Upscale Model Selector
* ModelScope API

---

## 🎵 Audio & Video

Basic audio and video utilities.

### Audio

* Audio Pass
* Audio Duration

### Video

* Folder Video Concat

---

# Installation

## ComfyUI Manager

Open **ComfyUI Manager** and search for:

```text
Practical-Tools
```

Install the extension and restart ComfyUI.

---

## Git

Open a terminal in your ComfyUI `custom_nodes` directory:

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/wenchengxiang/ComfyUI-Practical-Tools.git
```

Then restart ComfyUI.

---

## Manual Installation

Download the repository as ZIP and extract it into:

```text
ComfyUI/
└── custom_nodes/
    └── ComfyUI-Practical-Tools/
```

Restart ComfyUI after installation.

---

## Dependencies

If additional Python dependencies are required:

```bash
pip install -r requirements.txt
```

It is recommended to run the command using the Python environment belonging to your ComfyUI installation.

---

# Frontend Extensions

Practical-Tools is not only a collection of Python nodes.

It also provides several frontend extensions that improve the ComfyUI workspace itself.

---

## ▶ Runtime Indicator

**Runtime Indicator** displays the currently executing node directly in the ComfyUI interface.

Features include:

* Current node display
* Execution progress
* Click to locate the running node
* Subgraph node tracking
* Cross-workflow tracking
* Execution waiting room

### Running Waiting Room

When working with large workflows, rendering the entire node graph during execution can create unnecessary browser workload.

The **Running Waiting Room** provides a dedicated empty workspace where you can wait while the workflow is running.

Click the cup icon to enter or leave the waiting room.

The waiting room is created automatically the first time it is used.

Configuration:

```text
js/run_indicator_waiting_room_config.js
```

The configuration can control:

* Text
* Font size
* Font
* Text color
* Alignment
* Background
* Border radius
* Padding
* Line spacing

---

## 📌 Pin Icon

Replaces the default ComfyUI pin icon with a more subtle indicator.

This reduces visual clutter when many nodes or groups are pinned.

File:

```text
js/pin_icon.js
```

---

## 📝 Text Label

Adds editable text directly to the ComfyUI canvas.

Useful for:

* Workflow titles
* Section labels
* Notes
* Parameter descriptions
* Workflow organization

File:

```text
js/Text_Label.js
```

---

## 🎨 Dark Better Theme

An enhanced dark theme for ComfyUI.

The theme focuses on:

* Node colors
* Title colors
* Contrast
* Visual hierarchy
* Long-session readability

Files:

```text
js/dark_better_theme.js
js/themes/dark-better.json
```

---

## 🖌️ Photopea

Integrates Photopea directly into ComfyUI.

This allows images from a workflow to be edited using Photopea without leaving the ComfyUI environment.

Useful for:

* Image editing
* Mask preparation
* Layer editing
* Quick corrections
* Preparing workflow assets

File:

```text
js/photopea.js
```

---

## 🔖 Bookmark

Provides bookmark-based navigation for large workflows.

Bookmarks make it easier to jump between important nodes or workflow areas without manually searching through the canvas.

File:

```text
js/Book_mark.js
```

---

## ⚡ UI Performance Tweaks

Frontend optimizations aimed at large ComfyUI workflows.

The extension reduces unnecessary canvas/UI work during interaction and workflow execution.

File:

```text
js/ui_perf_tweaks.js
```

---

# Nodes

Practical-Tools nodes are organized into several functional categories.

| Category                 | Description                                        |
| ------------------------ | -------------------------------------------------- |
| **Logic**                | Conditions, comparisons, switches and loop control |
| **Utils**                | General-purpose utilities                          |
| **Passthrough**          | Data routing and passthrough                       |
| **String**               | Prompt and text utilities                          |
| **Image**                | Image processing and batch operations              |
| **Mask**                 | Mask processing                                    |
| **Audio**                | Audio utilities                                    |
| **Video**                | Video utilities                                    |
| **Conditioning & Model** | Model and conditioning utilities                   |
| **API**                  | External API utilities                             |

---

<details>
<summary><strong>Logic & Loop</strong></summary>

| Node             | Description                          |
| ---------------- | ------------------------------------ |
| While Loop Start | Starts a while-style workflow loop   |
| While Loop End   | Ends a while-style workflow loop     |
| For Loop Start   | Starts a for-style workflow loop     |
| For Loop End     | Ends a for-style workflow loop       |
| Loop Step        | Controls loop index and continuation |
| Batch Accumulate | Accumulates loop results             |

</details>

<details>
<summary><strong>Any & Utils</strong></summary>

| Node                   | Description                                 |
| ---------------------- | ------------------------------------------- |
| Any Compare            | Compare arbitrary values                    |
| Any Convert            | Convert arbitrary values                    |
| Any Index              | Index into lists or batches                 |
| Any Index Simple       | Simplified index access                     |
| Any Index Strong       | Strongly typed index access                 |
| Any Length             | Get the length of lists, batches or strings |
| Any Switch             | Switch between arbitrary values             |
| Any Switch Simple      | Simplified Any switch                       |
| Any Switch Strong      | Strongly typed Any switch                   |
| Any Passthrough        | Pass arbitrary data through                 |
| Any Rerouter           | Reroute arbitrary data                      |
| Boolean Not            | Invert a boolean value                      |
| Create List            | Create an arbitrary-type list               |
| Index Anything         | Generic index access                        |
| Link Switch            | Switch workflow connections                 |
| Math                   | Mathematical expression evaluation          |
| Math Dual              | Evaluate two mathematical expressions       |
| Random Integer         | Generate a random integer                   |
| Random Path            | Select a random path                        |
| String To Combo        | Convert string data into a combo            |
| Upscale Model Selector | Select an upscale model                     |

</details>

<details>
<summary><strong>Passthrough & Bus</strong></summary>

| Node                  | Description                     |
| --------------------- | ------------------------------- |
| Any Passthrough       | Generic passthrough             |
| Any Rerouter          | Generic rerouting               |
| Audio Pass            | Audio passthrough               |
| Cond Pair Passthrough | Conditioning passthrough        |
| Bus In                | Pack multiple values into a bus |
| Bus Out               | Unpack values from a bus        |

</details>

<details>
<summary><strong>String & Prompt</strong></summary>

| Node              | Description                        |
| ----------------- | ---------------------------------- |
| Any To End        | Append text to the end of a string |
| Prompt Replace    | Replace text inside prompts        |
| Text Line To List | Convert lines of text into a list  |

</details>

<details>
<summary><strong>Image</strong></summary>

| Node                         | Description                           |
| ---------------------------- | ------------------------------------- |
| Folder Image Load            | Load images from a folder             |
| Image Batch                  | Combine images into a batch           |
| Image Batch Count XYZ        | Analyze batch image values            |
| Image Batch Interleave       | Interleave two image batches          |
| Image Batch Interleave Split | Split an interleaved batch            |
| Image Batch To List          | Convert image batch to list           |
| Image List To Batch          | Convert image list to batch           |
| Image Blend                  | Blend images with mask output         |
| Image Blend Mask Center      | Blend using mask-centered processing  |
| Image Crop and Uncrop        | Crop and restore images               |
| Image Grid Table             | Create an image grid                  |
| Image Pad                    | Add image padding                     |
| Image Tile                   | Split an image into overlapping tiles |
| Image Untile                 | Reconstruct tiled images              |
| Image Transform Rotate       | Rotate and transform images           |
| Load Image Batch From Dir    | Load image batches from directories   |
| Reverse Image Batch          | Reverse image batch order             |
| Text Image                   | Render text as an image               |
| Blockify Mask                | Convert masks into blocks             |

</details>

<details>
<summary><strong>Mask</strong></summary>

| Node                     | Description                |
| ------------------------ | -------------------------- |
| Mask Batch               | Combine masks into a batch |
| Mask Batch To List       | Convert mask batch to list |
| Mask Batch Replace Empty | Replace empty masks        |
| Mask Blur                | Blur masks                 |
| Mask Brightness          | Adjust mask brightness     |
| Mask Fill Holes          | Fill holes in masks        |
| Mask From Batch          | Extract masks from a batch |
| Mask Grow                | Grow or shrink masks       |
| Is Mask Black            | Detect fully black masks   |
| Repeat Mask Batch        | Repeat a mask batch        |

</details>

<details>
<summary><strong>Audio & Video</strong></summary>

| Node                | Description                      |
| ------------------- | -------------------------------- |
| Audio Duration      | Get audio duration               |
| Folder Video Concat | Concatenate videos from a folder |

</details>

<details>
<summary><strong>Conditioning & Model</strong></summary>

| Node                   | Description                        |
| ---------------------- | ---------------------------------- |
| Krea2 Cond Rebalance   | Rebalance Krea2 conditioning       |
| Lora Load With Trigger | Load LoRA and expose trigger words |
| Lying Sampler          | Custom sampler                     |
| RTX Super Resolution   | RTX-based super resolution         |
| Max Resolution Filter  | Filter by maximum resolution       |

</details>

<details>
<summary><strong>API</strong></summary>

| Node           | Description         |
| -------------- | ------------------- |
| ModelScope API | Call ModelScope API |

</details>

---

# Bus

`Bus In` and `Bus Out` provide a convenient way to group multiple workflow values.

Conceptually:

```text
Image ─────┐
Mask ──────┤
Model ─────┤
Prompt ────┤
            ↓
          Bus In
            ↓
        Workflow
            ↓
          Bus Out
       ┌────┼────┐
       ↓    ↓    ↓
     Image Mask Model
```

This can make large workflows easier to read by reducing long-distance connections.

---

# Any Nodes

The `Any` node family is designed for workflows where the data type is not known in advance or may change dynamically.

Examples:

```text
Any Compare
Any Convert
Any Index
Any Length
Any Switch
Any Passthrough
Any Rerouter
```

These are useful for:

* Dynamic values
* Lists
* Batches
* Conditional branches
* Dynamic indexing
* Generic data routing

---

# Math

The `Math` node supports mathematical expressions and common utility functions.

Examples include:

```text
+
-
*
/
%
floor
ceil
round
abs
min
max
sqrt
sin
cos
gcd
lcm
```

This can be useful for:

* Resolution calculations
* Frame calculations
* Batch counts
* Loop conditions
* Dynamic indexes
* Parameter calculations

---

# Project Structure

```text
ComfyUI-Practical-Tools/
│
├── .github/
│   └── workflows/
│
├── fonts/
│
├── js/
│   ├── run_indicator.js
│   ├── pin_icon.js
│   ├── Text_Label.js
│   ├── photopea.js
│   ├── Book_mark.js
│   ├── ui_perf_tweaks.js
│   └── ...
│
├── py/
│   └── ...
│
├── __init__.py
├── pyproject.toml
├── requirements.txt
├── LICENSE
└── README.md
```

Python nodes are organized under `py/`.

Frontend extensions are organized under `js/`.

---

# FAQ

### Nodes are not showing

Check that the plugin is installed under:

```text
ComfyUI/custom_nodes/ComfyUI-Practical-Tools/
```

Then restart ComfyUI and check the startup console for import errors.

---

### Frontend extensions are not showing

Try a hard refresh:

```text
Ctrl + F5
```

If the problem persists, check the browser console for JavaScript errors.

---

### How do I use the Running Waiting Room?

While a workflow is running, click the cup icon in the Runtime Indicator.

The first use automatically creates the waiting room.

Click the cup icon again to return to the workflow.

---

### How do I use the loop nodes?

A basic While Loop workflow is:

```text
While Loop Start
        ↓
    Loop Body
        ↓
While Loop End
```

For a For Loop:

```text
For Loop Start
        ↓
    Loop Body
        ↓
    Loop Step
        ↓
For Loop End
```

The exact connections depend on the workflow and the values being processed.

---

# Contributing

Issues and pull requests are welcome.

Typical workflow:

```bash
git checkout -b feature/your-feature
```

Make your changes, commit them, push the branch and open a Pull Request.

When adding new functionality:

* Keep each Python feature in an appropriate module
* Put frontend extensions under `js/`
* Avoid unnecessary dependencies
* Follow the existing node naming and category conventions
* Keep compatibility with normal ComfyUI workflows whenever possible

---

# License

ComfyUI-Practical-Tools is licensed under the **GNU General Public License v3.0**.

See [LICENSE](LICENSE) for the full license text.

---

# Acknowledgements

* [ComfyUI](https://github.com/comfyanonymous/ComfyUI)
* Photopea
* The ComfyUI community
* All contributors and users

---

<p align="center">
  If Practical-Tools is useful to you, consider giving the project a ⭐
</p>
