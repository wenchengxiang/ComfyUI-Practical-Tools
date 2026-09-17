import { app } from "../../scripts/app.js";

/**
 * =====================================================================
 * Dark (Better) 主题 —— 通过 ComfyUI 官方调色板系统自动导入并启用
 * =====================================================================
 *
 * 官方 ColorPalette（色彩主题）系统：
 *   - 设置 → 外观 → 色彩主题 下拉可选主题
 *   - 自定义主题存在后端设置 `Comfy.CustomColorPalettes`（对象映射 {id: palette}）
 *   - 激活主题存在 `Comfy.ColorPalette`
 *
 * 本扩展每次加载时自动做（幂等，不重复导入）：
 *   1. fetch 本地主题文件 ./themes/dark-better.json
 *   2. GET /settings 检查后端是否已有 "Dark (Better)"
 *      - 没有 → 导入
 *      - 有但 `_fileVersion` 落后于本地文件 → 覆盖导入（用于你以后更新
 *        主题文件后，刷新页面即可自动升级，不需要手动删旧主题）
 *   3. 首次安装（从未激活过）且当前是默认主题（dark/空）→ 自动激活一次
 *   4. 激活过后写入 `pt-theme-activated` 标记，之后切到任何主题
 *      （包括 Dark (Default)）都不再干预 —— 尊重手动选择
 *   5. 首次激活后提示刷新一次页面（前端 store 才能读到新主题）
 *
 * 更新主题文件后想强制生效：刷新页面即可（js 检测到 _fileVersion 变化
 * 会重新导入）。想移除：禁用/删除本插件文件即可。
 * =====================================================================
 */

const THEME_URL = new URL("./themes/dark-better.json", import.meta.url).href;
const THEME_ID = "Dark (Better)";
const RELOAD_FLAG = "pt-theme-reloaded";
const ACTIVATED_FLAG = "pt-theme-activated";

async function ensureOfficialTheme() {
  try {
    const themeRes = await fetch(THEME_URL);
    if (!themeRes.ok) throw new Error(`主题文件 HTTP ${themeRes.status}`);
    const theme = await themeRes.json();

    const settingsRes = await fetch("/settings");
    if (!settingsRes.ok) throw new Error(`settings HTTP ${settingsRes.status}`);
    const settings = await settingsRes.json();

    const palettes = settings["Comfy.CustomColorPalettes"] || {};
    const current = settings["Comfy.ColorPalette"];

    // 是否需要导入/覆盖：后端没有，或本地文件版本号更新
    const existing = palettes[THEME_ID];
    const needsImport =
      !existing || existing["_fileVersion"] !== theme["_fileVersion"];

    // 仅首次安装（从未激活过）且当前是默认主题（dark/空）时自动激活一次；
    // 一旦激活过（写了 ACTIVATED_FLAG），之后不再干预任何手动切换
    const firstRun = !localStorage.getItem(ACTIVATED_FLAG);
    const shouldActivate = firstRun && (!current || current === "dark");

    if (needsImport || shouldActivate) {
      const body = { "Comfy.CustomColorPalettes": palettes };
      if (needsImport) body["Comfy.CustomColorPalettes"][THEME_ID] = theme;
      if (shouldActivate) body["Comfy.ColorPalette"] = THEME_ID;
      const postRes = await fetch("/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!postRes.ok) throw new Error(`POST settings HTTP ${postRes.status}`);
      console.log(
        `[Practical-Tools] Dark (Better) 已通过官方调色板系统${needsImport ? (existing ? "升级覆盖" : "导入") : "激活"}`
      );
      if (shouldActivate) {
        localStorage.setItem(ACTIVATED_FLAG, "1");
        // 首次激活且画布无未保存修改 → 刷新一次让前端设置 store 加载新主题
        if (!localStorage.getItem(RELOAD_FLAG)) {
          localStorage.setItem(RELOAD_FLAG, "1");
          const dirty = app?.ui?.graphHasChanged;
          if (!dirty) {
            setTimeout(() => location.reload(), 300);
          } else {
            console.log("[Practical-Tools] 画布有未保存修改，请手动刷新页面后主题生效");
          }
        }
      }
    } else {
      console.log("[Practical-Tools] Dark (Better) 已是最新，无需处理");
    }
  } catch (err) {
    console.warn("[Practical-Tools] Dark (Better) 官方导入失败:", err);
  }
}

app.registerExtension({
  name: "Practical-Tools.DarkBetterTheme",
  async setup() {
    await ensureOfficialTheme();
  },
});
