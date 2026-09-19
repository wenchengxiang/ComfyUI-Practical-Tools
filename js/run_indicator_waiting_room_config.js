// =====================================================================
// 运行等待区配置文件
// =====================================================================
// 修改本文件后，刷新 ComfyUI 页面生效。
// 新建的等待区会用此配置；已存在的等待区在每次点茶杯进入时自动更新。
//
// 颜色格式：
//   #RRGGBB       不透明色，如 #ffffff（白）、#333333（深灰）
//   #RRGGBBAA     带透明度，AA 从 00（全透明）到 FF（不透明）
//                  如 #FFFFFF80 = 半透明白，#000000CC = 80% 不透明黑
//   "transparent" 完全透明（无背景）
//
// 字段说明：
//   text            文字内容
//   fontSize        字号（px）
//   lineHeight      行高倍数（1=字号，1.5=字号×1.5，多行文字间距）
//   fontColor       文字颜色（#RRGGBB 或 #RRGGBBAA）
//   fontFamily      字体（如 "Arial"、"Microsoft YaHei"、"sans-serif"）
//   fontWeight      字重："normal" / "bold"
//   textAlign       对齐："left" / "center" / "right"
//   backgroundColor 背景色（"transparent" = 无背景）
//   borderRadius    背景圆角（px，0 = 直角）
//   padding         内边距（px，文字与背景边缘的距离）
// =====================================================================

window.PT_WAITING_ROOM_CONFIG = {
    // 第一行（大字）
    line1: {
        text: "  大型工作流运行期间 在此处等待可加快渲染  ",
        fontSize: 42,
        lineHeight: 1.0,
        fontColor: "#ffffff",
        fontFamily: "SimHei",
        fontWeight: "bold",
        textAlign: "center",
        backgroundColor: "#00000050",
        borderRadius: 30,
        padding: 30
    },
    // 第二行（小字）
    line2: {
        text: "  提醒：点击 茶杯图标 返回工作流节点区  ",
        fontSize: 18,
        lineHeight: 1.0,
        fontColor: "#ffffff50",
        fontFamily: "SimHei",
        fontWeight: "normal",
        textAlign: "center",
        backgroundColor: "#00000050",
        borderRadius: 15,
        padding: 15
    }
};
