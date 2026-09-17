import { app } from "../../scripts/app.js";

/**
 * =====================================================================
 * Dark (Better) 主题 —— 通过 ComfyUI 官方调色板系统自动导入并启用
 * =====================================================================
 *
 * v4（根治浏览器缓存覆盖，替代 v3）：
 *   - v3 缺陷：fetch 主题文件与 /settings 走默认缓存策略；多浏览器场景
 *     下，缓存了旧版 js/主题的浏览器打开页面时，会用缓存旧版覆盖写回
 *     后端，导致主题被降级为旧背景（Edge 新背景、Chrome 旧背景）。
 *   - v4 修复：所有 fetch 加 { cache: "no-store" }，强制每次从插件
 *     文件读取最新主题，杜绝缓存旧版写回后端。
 *
 * 官方 ColorPalette（色彩主题）系统：
 *   - 设置 → 外观 → 色彩主题 下拉可选主题
 *   - 自定义主题存在后端设置 `Comfy.CustomColorPalettes`（对象映射 {id: palette}）
 *   - 激活主题存在 `Comfy.ColorPalette`
 *
 * 本扩展每次加载时自动做（幂等，不重复导入）：
 *   1. fetch 本地主题文件 ./themes/dark-better.json（no-store）
 *   2. GET /settings 检查后端是否已有 "Dark (Better)"
 *      - 没有 → 导入
 *      - 有但 `_fileVersion` 与本地文件不同 → 覆盖导入（用于更新主题
 *        文件后刷新页面自动升级）
 *   3. 首次安装（从未激活过）→ 自动激活一次（无论当前主题是什么）
 *   4. 激活过后写入 `pt-theme-activated` 标记，之后切到任何主题
 *      （包括 Dark (Default)）都不再干预 —— 尊重手动选择
 *   5. 导入或激活后，画布无未保存修改 → 自动刷新页面
 *
 * 更新主题文件后想强制生效：刷新页面即可（js 检测到 _fileVersion 变化
 * 会重新导入）。想移除：禁用/删除本插件文件即可。
 * =====================================================================
 */

const THEME_URL = new URL("./themes/dark-better.json", import.meta.url).href;
const THEME_ID = "Dark (Better)";
const ACTIVATED_FLAG = "pt-theme-activated";

async function ensureOfficialTheme() {
  try {
    const themeRes = await fetch(THEME_URL, { cache: "no-store" });
    if (!themeRes.ok) throw new Error(`主题文件 HTTP ${themeRes.status}`);
    const theme = await themeRes.json();

    const settingsRes = await fetch("/settings", { cache: "no-store" });
    if (!settingsRes.ok) throw new Error(`settings HTTP ${settingsRes.status}`);
    const settings = await settingsRes.json();

    const palettes = settings["Comfy.CustomColorPalettes"] || {};
    const current = settings["Comfy.ColorPalette"];

    // 是否需要导入/覆盖：后端没有，或本地文件版本号与后端不同
    const existing = palettes[THEME_ID];
    const needsImport =
      !existing || existing["_fileVersion"] !== theme["_fileVersion"];

    // 首次安装（从未激活过）无条件自动激活一次；
    // 或后端尚不存在该主题时（手动删过/全新环境）导入并激活。
    // 一旦激活过（写了 ACTIVATED_FLAG），之后不再干预任何手动切换。
    const firstRun = !localStorage.getItem(ACTIVATED_FLAG);
    const noExisting = !existing;
    const shouldActivate = firstRun || noExisting;

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
      }
      // 导入或激活后，画布无未保存修改 → 自动刷新一次让新主题生效
      const dirty = app?.ui?.graphHasChanged;
      if (!dirty) {
        setTimeout(() => location.reload(), 300);
      } else {
        console.log("[Practical-Tools] 画布有未保存修改，请手动刷新页面后主题生效");
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
