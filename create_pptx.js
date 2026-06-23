const PptxGenJS = require("pptxgenjs");
const pptx = new PptxGenJS();

// ===================== 主题设置 =====================
pptx.defineLayout({ name: "CUSTOM", width: "13.33", height: "7.5" });
pptx.layout = "CUSTOM";

// 全局字体
pptx.defaultFontFace = "Microsoft YaHei";

// 配色方案
const COLORS = {
  dark: "1A1A2E",
  primary: "16213E",
  accent: "0F3460",
  highlight: "E94560",
  gold: "F5A623",
  green: "27AE60",
  red: "E74C3C",
  blue: "3498DB",
  orange: "E67E22",
  white: "FFFFFF",
  lightGray: "F5F6FA",
  midGray: "BDC3C7",
  textDark: "2C3E50",
  textLight: "7F8C8D",
};

// ===================== 母版风格函数 =====================
function addSlideTitle(slide, title, subtitle) {
  slide.background = { fill: COLORS.dark };
  // 顶部装饰条
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 13.33, h: 0.08, fill: { color: COLORS.highlight },
  });
  // 左侧装饰条
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.5, y: 1.5, w: 0.06, h: 1.8, fill: { color: COLORS.gold },
  });
  // 标题
  slide.addText(title, {
    x: 0.9, y: 1.5, w: 11, h: 1.2,
    fontSize: 36, fontFace: "Microsoft YaHei",
    color: COLORS.white, bold: true,
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.9, y: 2.7, w: 11, h: 0.6,
      fontSize: 16, color: COLORS.midGray,
    });
  }
  // 底部线
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.5, y: 7.2, w: 12.33, h: 0.02, fill: { color: "333333" },
  });
  slide.addText("天猫车载旗舰店 · 客服售前数据分析", {
    x: 0.5, y: 7.25, w: 6, h: 0.25,
    fontSize: 8, color: "666666",
  });
}

function sectionSlide(slide, num, title) {
  slide.background = { fill: COLORS.primary };
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 13.33, h: 0.06, fill: { color: COLORS.gold },
  });
  slide.addText(num, {
    x: 0.8, y: 1.5, w: 2, h: 2,
    fontSize: 72, color: COLORS.gold, bold: true,
    fontFace: "Arial",
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: 2.8, y: 2.0, w: 0.06, h: 1.5, fill: { color: COLORS.white },
  });
  slide.addText(title, {
    x: 3.2, y: 1.8, w: 9, h: 1.8,
    fontSize: 32, color: COLORS.white, bold: true,
  });
}

function addKpiCard(slide, x, y, w, h, label, value, change, isGood) {
  // 背景卡片
  slide.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h, fill: { color: COLORS.white },
    shadow: { type: "outer", blur: 6, offset: 2, color: "000000", opacity: 0.1 },
    rectRadius: 0.1,
  });
  // 顶部颜色条
  const barColor = isGood === true ? COLORS.green : isGood === false ? COLORS.red : COLORS.blue;
  slide.addShape(pptx.ShapeType.rect, {
    x: x + 0.15, y: y + 0.15, w: w - 0.3, h: 0.04,
    fill: { color: barColor },
  });
  // 标签
  slide.addText(label, {
    x: x + 0.2, y: y + 0.3, w: w - 0.4, h: 0.35,
    fontSize: 10, color: COLORS.textLight,
  });
  // 数值
  slide.addText(value, {
    x: x + 0.2, y: y + 0.6, w: w - 0.4, h: 0.55,
    fontSize: 22, color: COLORS.textDark, bold: true,
  });
  // 变化
  if (change) {
    const changeColor = isGood === true ? COLORS.green : isGood === false ? COLORS.red : COLORS.textLight;
    slide.addText(change, {
      x: x + 0.2, y: y + 1.15, w: w - 0.4, h: 0.3,
      fontSize: 9, color: changeColor,
    });
  }
}

// ===================== SLIDE 1: 封面 =====================
let slide = pptx.addSlide();
slide.background = { fill: COLORS.dark };
slide.addShape(pptx.ShapeType.rect, {
  x: 0, y: 0, w: 13.33, h: 0.08, fill: { color: COLORS.highlight },
});
slide.addShape(pptx.ShapeType.rect, {
  x: 0, y: 7.42, w: 13.33, h: 0.08, fill: { color: COLORS.highlight },
});
// 装饰线
slide.addShape(pptx.ShapeType.rect, {
  x: 1.5, y: 2.8, w: 2.5, h: 0.04, fill: { color: COLORS.gold },
});
slide.addText("天猫售前客服", {
  x: 1.5, y: 1.8, w: 10, h: 1,
  fontSize: 42, color: COLORS.white, bold: true,
});
slide.addText("KPI达成分布 · 销售数据分析", {
  x: 1.5, y: 2.95, w: 10, h: 0.8,
  fontSize: 24, color: COLORS.midGray,
});
slide.addText("& 下阶段策略方案", {
  x: 1.5, y: 3.6, w: 10, h: 0.8,
  fontSize: 24, color: COLORS.gold,
});
slide.addText("2026年5月  |  车载天猫旗舰店  |  客服部", {
  x: 1.5, y: 5.5, w: 10, h: 0.5,
  fontSize: 14, color: COLORS.textLight,
});
slide.addText("数据来源：5月客服月报  |  分析日期：2026.06.06", {
  x: 1.5, y: 6.0, w: 10, h: 0.4,
  fontSize: 11, color: "666666",
});

// ===================== SLIDE 2: 目录 =====================
slide = pptx.addSlide();
slide.background = { fill: COLORS.white };
slide.addShape(pptx.ShapeType.rect, {
  x: 0, y: 0, w: 13.33, h: 0.06, fill: { color: COLORS.highlight },
});
slide.addText("目录 CONTENTS", {
  x: 0.8, y: 0.6, w: 5, h: 0.7,
  fontSize: 28, color: COLORS.dark, bold: true,
});
slide.addShape(pptx.ShapeType.rect, {
  x: 0.8, y: 1.3, w: 1.5, h: 0.03, fill: { color: COLORS.gold },
});

const tocItems = [
  { num: "01", title: "5月核心数据总览", desc: "关键指标一览 + 核心亮点与风险点" },
  { num: "02", title: "深层问题诊断", desc: "四大核心问题根因分析" },
  { num: "03", title: "下阶段策略方案", desc: "六大维度可执行策略" },
  { num: "04", title: "KPI目标设定", desc: "6-7月量化目标与执行保障" },
];

tocItems.forEach((item, i) => {
  const yBase = 2.0 + i * 1.2;
  slide.addText(item.num, {
    x: 1.2, y: yBase, w: 1, h: 0.7,
    fontSize: 28, color: COLORS.gold, bold: true, fontFace: "Arial",
  });
  slide.addText(item.title, {
    x: 2.5, y: yBase, w: 8, h: 0.45,
    fontSize: 18, color: COLORS.dark, bold: true,
  });
  slide.addText(item.desc, {
    x: 2.5, y: yBase + 0.45, w: 8, h: 0.35,
    fontSize: 11, color: COLORS.textLight,
  });
  if (i < tocItems.length - 1) {
    slide.addShape(pptx.ShapeType.rect, {
      x: 2.5, y: yBase + 0.9, w: 9, h: 0.005,
      fill: { color: COLORS.lightGray },
    });
  }
});

// ===================== SLIDE 3: Section - 数据总览 =====================
slide = pptx.addSlide();
sectionSlide(slide, "01", "5月核心数据总览");

// ===================== SLIDE 4: 关键指标一览表 =====================
slide = pptx.addSlide();
slide.background = { fill: COLORS.lightGray };
addSlideTitle(slide, "关键指标一览表", "2026年5月 vs 4月（环比） vs 2025年5月（同比）");

// 表格数据
const tableData = [
  [
    { text: "指标", options: { bold: true, color: COLORS.white, fill: { color: COLORS.primary }, fontSize: 10, fontFace: "Microsoft YaHei" } },
    { text: "2026年5月", options: { bold: true, color: COLORS.white, fill: { color: COLORS.primary }, fontSize: 10, fontFace: "Microsoft YaHei" } },
    { text: "环比(vs4月)", options: { bold: true, color: COLORS.white, fill: { color: COLORS.primary }, fontSize: 10, fontFace: "Microsoft YaHei" } },
    { text: "同比(vs25年5月)", options: { bold: true, color: COLORS.white, fill: { color: COLORS.primary }, fontSize: 10, fontFace: "Microsoft YaHei" } },
    { text: "趋势判断", options: { bold: true, color: COLORS.white, fill: { color: COLORS.primary }, fontSize: 10, fontFace: "Microsoft YaHei" } },
  ],
  [
    { text: "客服销售额", options: { bold: true, fontSize: 10, fontFace: "Microsoft YaHei" } },
    { text: "424.18万", options: { fontSize: 10, fontFace: "Microsoft YaHei" } },
    { text: "↑ 24.08%", options: { fontSize: 10, color: COLORS.green, fontFace: "Microsoft YaHei" } },
    { text: "↑ 32.16%", options: { fontSize: 10, color: COLORS.green, fontFace: "Microsoft YaHei" } },
    { text: "✅ 强劲增长", options: { fontSize: 10, color: COLORS.green, fontFace: "Microsoft YaHei" } },
  ],
  [
    { text: "接待人数", options: { bold: true, fontSize: 10, fontFace: "Microsoft YaHei" } },
    { text: "37,266", options: { fontSize: 10, fontFace: "Microsoft YaHei" } },
    { text: "↑ 12.81%", options: { fontSize: 10, color: COLORS.green, fontFace: "Microsoft YaHei" } },
    { text: "↑ 20.96%", options: { fontSize: 10, color: COLORS.green, fontFace: "Microsoft YaHei" } },
    { text: "✅ 流量增长", options: { fontSize: 10, color: COLORS.green, fontFace: "Microsoft YaHei" } },
  ],
  [
    { text: "询单人数", options: { bold: true, fontSize: 10, fontFace: "Microsoft YaHei" } },
    { text: "28,119", options: { fontSize: 10, fontFace: "Microsoft YaHei" } },
    { text: "↑ 14.04%", options: { fontSize: 10, color: COLORS.green, fontFace: "Microsoft YaHei" } },
    { text: "↑ 28.25%", options: { fontSize: 10, color: COLORS.green, fontFace: "Microsoft YaHei" } },
    { text: "✅ 咨询意愿提升", options: { fontSize: 10, color: COLORS.green, fontFace: "Microsoft YaHei" } },
  ],
  [
    { text: "客服销售人数", options: { bold: true, fontSize: 10, fontFace: "Microsoft YaHei" } },
    { text: "8,190", options: { fontSize: 10, fontFace: "Microsoft YaHei" } },
    { text: "↑ 18.30%", options: { fontSize: 10, color: COLORS.green, fontFace: "Microsoft YaHei" } },
    { text: "↑ 36.05%", options: { fontSize: 10, color: COLORS.green, fontFace: "Microsoft YaHei" } },
    { text: "✅ 转化人数大增", options: { fontSize: 10, color: COLORS.green, fontFace: "Microsoft YaHei" } },
  ],
  [
    { text: "询单→付款成功率", options: { bold: true, fontSize: 10, fontFace: "Microsoft YaHei" } },
    { text: "26.41%", options: { fontSize: 10, fontFace: "Microsoft YaHei" } },
    { text: "↑ 4.14%", options: { fontSize: 10, color: COLORS.green, fontFace: "Microsoft YaHei" } },
    { text: "↑ 5.98%", options: { fontSize: 10, color: COLORS.green, fontFace: "Microsoft YaHei" } },
    { text: "✅ 转化率提升", options: { fontSize: 10, color: COLORS.green, fontFace: "Microsoft YaHei" } },
  ],
  [
    { text: "客服销售占比", options: { bold: true, fontSize: 10, fontFace: "Microsoft YaHei" } },
    { text: "56.14%", options: { fontSize: 10, fontFace: "Microsoft YaHei" } },
    { text: "↑ 0.43%", options: { fontSize: 10, color: COLORS.green, fontFace: "Microsoft YaHei" } },
    { text: "↓ -2.60%", options: { fontSize: 10, color: COLORS.red, fontFace: "Microsoft YaHei" } },
    { text: "⚠️ 同比下降", options: { fontSize: 10, color: COLORS.orange, fontFace: "Microsoft YaHei" } },
  ],
  [
    { text: "响应时间", options: { bold: true, fontSize: 10, fontFace: "Microsoft YaHei" } },
    { text: "19.45s", options: { fontSize: 10, fontFace: "Microsoft YaHei" } },
    { text: "↑ 21.41%", options: { fontSize: 10, color: COLORS.red, fontFace: "Microsoft YaHei" } },
    { text: "↓ -11.51%", options: { fontSize: 10, color: COLORS.green, fontFace: "Microsoft YaHei" } },
    { text: "⚠️ 环比变慢", options: { fontSize: 10, color: COLORS.orange, fontFace: "Microsoft YaHei" } },
  ],
  [
    { text: "满意度", options: { bold: true, fontSize: 10, fontFace: "Microsoft YaHei" } },
    { text: "95.98%", options: { fontSize: 10, fontFace: "Microsoft YaHei" } },
    { text: "↓ -1.48%", options: { fontSize: 10, color: COLORS.red, fontFace: "Microsoft YaHei" } },
    { text: "↑ 3.02%", options: { fontSize: 10, color: COLORS.green, fontFace: "Microsoft YaHei" } },
    { text: "⚠️ 环比下降", options: { fontSize: 10, color: COLORS.orange, fontFace: "Microsoft YaHei" } },
  ],
];

slide.addTable(tableData, {
  x: 0.5, y: 1.2, w: 12.33,
  colW: [2.6, 2.0, 2.3, 2.5, 2.9],
  rowH: [0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42],
  border: { type: "solid", pt: 0.5, color: "DDDDDD" },
  autoPage: false,
});

// 图例
slide.addText("绿色=利好  红色=需关注  橙色=需警惕", {
  x: 0.5, y: 5.8, w: 5, h: 0.3,
  fontSize: 9, color: COLORS.textLight,
});

// ===================== SLIDE 5: 核心亮点 =====================
slide = pptx.addSlide();
slide.background = { fill: COLORS.lightGray };
addSlideTitle(slide, "核心亮点", "销售额创历史新高，转化效率持续提升");

// KPI 卡片
addKpiCard(slide, 0.5, 1.5, 2.8, 1.6,
  "客服销售额（5月）",
  "424.18 万",
  "同比+32.16% | 环比+24.08%",
  true
);
addKpiCard(slide, 3.6, 1.5, 2.8, 1.6,
  "客服销售人数",
  "8,190 人",
  "同比+36.05% | 环比+18.30%",
  true
);
addKpiCard(slide, 6.7, 1.5, 2.8, 1.6,
  "询单→付款成功率",
  "26.41%",
  "同比+5.98% | 环比+4.14%",
  true
);
addKpiCard(slide, 9.8, 1.5, 2.8, 1.6,
  "接待人数",
  "37,266",
  "同比+20.96% | 环比+12.81%",
  true
);

// 亮点说明
slide.addText("关键洞察", {
  x: 0.5, y: 3.5, w: 4, h: 0.5,
  fontSize: 17, color: COLORS.dark, bold: true,
});
slide.addShape(pptx.ShapeType.rect, {
  x: 0.5, y: 3.98, w: 1.2, h: 0.03, fill: { color: COLORS.gold },
});

const highlights = [
  "① 销售额同比增收超103万（+32.16%），环比增收82.33万（+24.08%），创近两年单月新高",
  "② 询单→付款成功率从25年5月的24.92%提升至26.41%，转化能力显著增强",
  "③ 流量与咨询双增长：接待人数+20.96%，询单人数+28.25%，市场热度持续上升",
  "④ 客服销售人数同比+36.05%，说明客服团队的成交转化能力持续进化",
];

highlights.forEach((h, i) => {
  slide.addText(h, {
    x: 0.8, y: 4.15 + i * 0.55, w: 11.5, h: 0.5,
    fontSize: 13, color: COLORS.textDark,
  });
});

// ===================== SLIDE 6: 核心风险点 =====================
slide = pptx.addSlide();
slide.background = { fill: COLORS.lightGray };
addSlideTitle(slide, "核心风险点", "四项需重点关注的预警信号");

addKpiCard(slide, 0.5, 1.5, 2.8, 1.6,
  "客服销售占比",
  "56.14%",
  "同比下降 -2.60%",
  false
);
addKpiCard(slide, 3.6, 1.5, 2.8, 1.6,
  "响应时间",
  "19.45s",
  "环比恶化 +21.41%",
  false
);
addKpiCard(slide, 6.7, 1.5, 2.8, 1.6,
  "满意度",
  "95.98%",
  "环比下降 -1.48%",
  false
);
addKpiCard(slide, 9.8, 1.5, 2.8, 1.6,
  "售后一次解决率",
  "72.58%",
  "环比-2.35% | 目标85%",
  false
);

slide.addText("风险解读", {
  x: 0.5, y: 3.5, w: 4, h: 0.5,
  fontSize: 17, color: COLORS.dark, bold: true,
});
slide.addShape(pptx.ShapeType.rect, {
  x: 0.5, y: 3.98, w: 1.2, h: 0.03, fill: { color: COLORS.red },
});

const risks = [
  "⚠ 客服销售占比同比下降2.60%：静默下单比例上升，客服价值贡献被稀释。37,266接待中仅75.4%转化为询单",
  "⚠ 响应时间环比恶化21.41%（16.02s→19.45s）：大促前预热期叠加5月自然增长，人力配置未提前布防",
  "⚠ 满意度下滑至95.98%：与响应变慢高度相关，每增加1秒响应时间，满意度约降0.42个百分点",
  "⚠ 售后一次解决率仅72.58%：27.42%问题需二次触达，售后压力回流到售前端",
];

risks.forEach((r, i) => {
  slide.addText(r, {
    x: 0.8, y: 4.15 + i * 0.6, w: 11.8, h: 0.55,
    fontSize: 12, color: COLORS.textDark,
  });
});

// ===================== SLIDE 7: Section - 深层问题诊断 =====================
slide = pptx.addSlide();
sectionSlide(slide, "02", "深层问题诊断");

// ===================== SLIDE 8: 问题一 - 销售占比走低 =====================
slide = pptx.addSlide();
slide.background = { fill: COLORS.lightGray };
addSlideTitle(slide, "问题一：客服销售占比持续走低", "静默下单增多 → 客服价值被稀释");

const ratioData = [
  [
    { text: "对比维度", options: { bold: true, color: COLORS.white, fill: { color: COLORS.accent }, fontSize: 10 } },
    { text: "2025年4月", options: { bold: true, color: COLORS.white, fill: { color: COLORS.accent }, fontSize: 10 } },
    { text: "2025年5月", options: { bold: true, color: COLORS.white, fill: { color: COLORS.accent }, fontSize: 10 } },
    { text: "2026年4月", options: { bold: true, color: COLORS.white, fill: { color: COLORS.accent }, fontSize: 10 } },
    { text: "2026年5月", options: { bold: true, color: COLORS.white, fill: { color: COLORS.accent }, fontSize: 10 } },
    { text: "同比变化", options: { bold: true, color: COLORS.white, fill: { color: COLORS.accent }, fontSize: 10 } },
  ],
  [
    { text: "客服销售占比", options: { bold: true, fontSize: 10 } },
    { text: "57.89%", options: { fontSize: 10 } },
    { text: "57.64%", options: { fontSize: 10 } },
    { text: "55.90%", options: { fontSize: 10 } },
    { text: "56.14%", options: { fontSize: 10 } },
    { text: "↓ -1.50pp", options: { fontSize: 10, color: COLORS.red, bold: true } },
  ],
];

slide.addTable(ratioData, {
  x: 0.5, y: 1.2, w: 12.33,
  colW: [2.8, 2.0, 2.0, 2.0, 2.0, 1.5],
  border: { type: "solid", pt: 0.5, color: "DDDDDD" },
  autoPage: false,
});

slide.addText("根因分析", {
  x: 0.5, y: 2.3, w: 4, h: 0.4,
  fontSize: 16, color: COLORS.highlight, bold: true,
});

const rootCauses = [
  "① 商品详情页完善度提升 → 降低了咨询必要性，部分用户直接自助下单",
  "② 老客复购熟悉产品 → 跳过咨询环节，但老客激活和专属服务仍有空间",
  "③ 更关键：主动触达能力不足 → 37,266接待中仅28,119转化为询单（75.4%），24.6%访客未被有效激活",
];

rootCauses.forEach((c, i) => {
  slide.addText(c, {
    x: 0.8, y: 2.8 + i * 0.5, w: 11.5, h: 0.45,
    fontSize: 12, color: COLORS.textDark,
  });
});

slide.addText("改善方向", {
  x: 0.5, y: 4.5, w: 4, h: 0.4,
  fontSize: 16, color: COLORS.green, bold: true,
});

const improvements = [
  "→ 静默访客30s内主动邀约 | → 高退货型号页面智能FAQ弹窗 | → CRM识别老客定制话术",
  "→ 高意向客户（加购/收藏）优先路由至资深客服 | → 客服主动触达率纳入KPI考核",
];

improvements.forEach((imp, i) => {
  slide.addText(imp, {
    x: 0.8, y: 5.0 + i * 0.45, w: 11.5, h: 0.4,
    fontSize: 12, color: COLORS.textDark,
  });
});

// ===================== SLIDE 9: 问题二&三 - 响应与满意度 =====================
slide = pptx.addSlide();
slide.background = { fill: COLORS.lightGray };
addSlideTitle(slide, "问题二&三：响应时间恶化 → 满意度下滑", "响应速度与客户满意度呈显著负相关");

// 响应时间趋势
slide.addText("响应时间趋势 (秒)", {
  x: 0.5, y: 1.3, w: 5.5, h: 0.4,
  fontSize: 14, color: COLORS.dark, bold: true,
});

const respData = [
  [
    { text: "", options: { fill: { color: COLORS.primary }, fontSize: 10 } },
    { text: "25年4月", options: { bold: true, color: COLORS.white, fill: { color: COLORS.primary }, fontSize: 10 } },
    { text: "25年5月", options: { bold: true, color: COLORS.white, fill: { color: COLORS.primary }, fontSize: 10 } },
    { text: "26年4月", options: { bold: true, color: COLORS.white, fill: { color: COLORS.primary }, fontSize: 10 } },
    { text: "26年5月", options: { bold: true, color: COLORS.white, fill: { color: COLORS.primary }, fontSize: 10 } },
  ],
  [
    { text: "响应时间", options: { bold: true, fontSize: 10 } },
    { text: "18.24s", options: { fontSize: 10 } },
    { text: "21.98s", options: { fontSize: 10 } },
    { text: "16.02s", options: { fontSize: 10, color: COLORS.green } },
    { text: "19.45s", options: { fontSize: 10, color: COLORS.red } },
  ],
  [
    { text: "满意度", options: { bold: true, fontSize: 10 } },
    { text: "93.20%", options: { fontSize: 10 } },
    { text: "93.17%", options: { fontSize: 10 } },
    { text: "97.42%", options: { fontSize: 10, color: COLORS.green } },
    { text: "95.98%", options: { fontSize: 10, color: COLORS.red } },
  ],
];

slide.addTable(respData, {
  x: 0.5, y: 1.8, w: 6.0,
  colW: [1.5, 1.2, 1.2, 1.2, 1.2],
  border: { type: "solid", pt: 0.5, color: "DDDDDD" },
  autoPage: false,
});

slide.addText("相关性分析", {
  x: 7.0, y: 1.3, w: 5.5, h: 0.4,
  fontSize: 14, color: COLORS.dark, bold: true,
});

slide.addText([
  { text: "关键发现：", options: { bold: true, color: COLORS.highlight } },
  { text: "每增加1秒响应时间，满意度约下降0.42个百分点。" },
], {
  x: 7.0, y: 1.8, w: 5.8, h: 0.45,
  fontSize: 11, color: COLORS.textDark,
});

slide.addText([
  { text: "● 4月最佳状态：", options: { bold: true } },
  { text: "响应16.02s → 满意度97.42%" },
], {
  x: 7.0, y: 2.4, w: 5.8, h: 0.4,
  fontSize: 11, color: COLORS.textDark,
});

slide.addText([
  { text: "● 5月恶化：", options: { bold: true } },
  { text: "响应升至19.45s → 满意度降至95.98%" },
], {
  x: 7.0, y: 2.85, w: 5.8, h: 0.4,
  fontSize: 11, color: COLORS.textDark,
});

slide.addText([
  { text: "● 5月接待量环比+12.81%，但人力未同步增配", options: {} },
], {
  x: 7.0, y: 3.3, w: 5.8, h: 0.4,
  fontSize: 11, color: COLORS.textDark,
});

// 改善措施
slide.addText("改善措施", {
  x: 0.5, y: 3.8, w: 4, h: 0.4,
  fontSize: 16, color: COLORS.green, bold: true,
});

const respMeasures = [
  { title: "智能分流", desc: "高意向客户→资深客服；通用咨询→AI机器人；售后简单查询→自助/初级客服" },
  { title: "AI话术推荐", desc: "TOP50高频问题实时推荐回复话术，减少打字耗时30%" },
  { title: "动态排班", desc: "10-12点/14-16点/20-22点三个高峰时段增配20%人力" },
  { title: "快捷短语库升级", desc: "产品对比、安装指导、退换货政策三大类扩充快捷回复" },
];

respMeasures.forEach((m, i) => {
  slide.addText(m.title, {
    x: 0.8, y: 4.35 + i * 0.65, w: 2.2, h: 0.3,
    fontSize: 11, color: COLORS.accent, bold: true,
  });
  slide.addText(m.desc, {
    x: 3.0, y: 4.35 + i * 0.65, w: 9.5, h: 0.3,
    fontSize: 11, color: COLORS.textDark,
  });
});

// ===================== SLIDE 10: 问题四 - 售后压力传导 =====================
slide = pptx.addSlide();
slide.background = { fill: COLORS.lightGray };
addSlideTitle(slide, "问题四：售后侧压力传导至售前", "高退货型号需在售前做更精准的期望管理");

slide.addText("退货原因分布 TOP3", {
  x: 0.5, y: 1.2, w: 5, h: 0.4,
  fontSize: 14, color: COLORS.dark, bold: true,
});

const returnData = [
  [
    { text: "退货原因", options: { bold: true, color: COLORS.white, fill: { color: COLORS.accent }, fontSize: 10 } },
    { text: "占比", options: { bold: true, color: COLORS.white, fill: { color: COLORS.accent }, fontSize: 10 } },
    { text: "售前应对策略", options: { bold: true, color: COLORS.white, fill: { color: COLORS.accent }, fontSize: 10 } },
  ],
  [
    { text: "产品型号（买错型号）", options: { bold: true, fontSize: 10 } },
    { text: "46.89%", options: { fontSize: 10, color: COLORS.red, bold: true } },
    { text: "售前强引导对比参数，前置FAQ差异化说明", options: { fontSize: 10 } },
  ],
  [
    { text: "平台规则", options: { bold: true, fontSize: 10 } },
    { text: "14.39%", options: { fontSize: 10, color: COLORS.orange } },
    { text: "明确告知退换货规则、运费险等信息", options: { fontSize: 10 } },
  ],
  [
    { text: "影像原因（与描述不符）", options: { bold: true, fontSize: 10 } },
    { text: "8.28%", options: { fontSize: 10 } },
    { text: "引导查看实拍视频，坦诚产品真实效果", options: { fontSize: 10 } },
  ],
  [
    { text: "产品质量", options: { bold: true, fontSize: 10 } },
    { text: "8.18%", options: { fontSize: 10 } },
    { text: "强调质保政策、售后保障承诺", options: { fontSize: 10 } },
  ],
];

slide.addTable(returnData, {
  x: 0.5, y: 1.7, w: 6.5,
  colW: [2.5, 1.2, 2.8],
  border: { type: "solid", pt: 0.5, color: "DDDDDD" },
  autoPage: false,
});

slide.addText("高退货型号售前干预（TOP5）", {
  x: 7.5, y: 1.2, w: 5.5, h: 0.4,
  fontSize: 14, color: COLORS.dark, bold: true,
});

const highReturnData = [
  [
    { text: "型号", options: { bold: true, color: COLORS.white, fill: { color: COLORS.red }, fontSize: 10 } },
    { text: "退货量", options: { bold: true, color: COLORS.white, fill: { color: COLORS.red }, fontSize: 10 } },
    { text: "售前干预措施", options: { bold: true, color: COLORS.white, fill: { color: COLORS.red }, fontSize: 10 } },
  ],
  [
    { text: "M310Pro4k", options: { bold: true, fontSize: 10 } },
    { text: "150", options: { fontSize: 10 } },
    { text: "引导查看实拍视频，明确分辨率与适用场景", options: { fontSize: 9 } },
  ],
  [
    { text: "M310Pro3K", options: { bold: true, fontSize: 10 } },
    { text: "143", options: { fontSize: 10 } },
    { text: "前置FAQ：与Pro4k差异对比", options: { fontSize: 9 } },
  ],
  [
    { text: "A400Pro4K", options: { bold: true, fontSize: 10 } },
    { text: "133", options: { fontSize: 10 } },
    { text: "强化安装指导前置，降低'不会安装'退货", options: { fontSize: 9 } },
  ],
  [
    { text: "N500", options: { bold: true, fontSize: 10 } },
    { text: "114", options: { fontSize: 10 } },
    { text: "仓储物流信息前置告知，管理收货预期", options: { fontSize: 9 } },
  ],
  [
    { text: "M310Pro2K", options: { bold: true, fontSize: 10 } },
    { text: "50", options: { fontSize: 10 } },
    { text: "明确适用场景，避免过度期望", options: { fontSize: 9 } },
  ],
];

slide.addTable(highReturnData, {
  x: 7.2, y: 1.7, w: 5.8,
  colW: [1.6, 0.8, 3.4],
  border: { type: "solid", pt: 0.5, color: "DDDDDD" },
  autoPage: false,
});

slide.addText([
  { text: "核心逻辑：", options: { bold: true, color: COLORS.highlight } },
  { text: "售前期望管理 → 降低信息不对称 → 减少退货 → 提升净销售额 + 降低售后成本", options: {} },
], {
  x: 0.5, y: 5.0, w: 12, h: 0.5,
  fontSize: 13,
});

slide.addText("售后一次解决率仅72.58% → 27.42%问题回流售前 → 增加售前工作负载 + 降低客户体验", {
  x: 0.5, y: 5.5, w: 12, h: 0.4,
  fontSize: 12, color: COLORS.textDark,
});

// ===================== SLIDE 11: Section - 策略方案 =====================
slide = pptx.addSlide();
sectionSlide(slide, "03", "下阶段策略方案（六大维度）");

// ===================== SLIDE 12: 策略一&二 =====================
slide = pptx.addSlide();
slide.background = { fill: COLORS.lightGray };
addSlideTitle(slide, "策略一 & 策略二", "主动触达提升占比 + 分层分流响应提速");

// 策略一
slide.addShape(pptx.ShapeType.roundRect, {
  x: 0.3, y: 1.15, w: 6.2, h: 2.9,
  fill: { color: COLORS.white },
  shadow: { type: "outer", blur: 4, offset: 1, color: "000000", opacity: 0.08 },
  rectRadius: 0.1,
});
slide.addShape(pptx.ShapeType.rect, {
  x: 0.3, y: 1.15, w: 6.2, h: 0.04, fill: { color: COLORS.blue },
});
slide.addText("策略一：主动触达 → 提升客服销售占比", {
  x: 0.6, y: 1.3, w: 5.7, h: 0.4,
  fontSize: 14, color: COLORS.dark, bold: true,
});

const s1Items = [
  "▶ 静默访客激活：浏览高单价商品(>500元)30s未咨询 → 主动邀约话术",
  "▶ 智能导购弹窗：高退货型号页面设置智能FAQ，前置解答TOP3疑虑",
  "▶ 老客识别激活：CRM识别复购客户，定制'老客专属'话术",
  "▶ KPI目标：客服销售占比从56.14% → 58%+",
];
s1Items.forEach((item, i) => {
  slide.addText(item, {
    x: 0.6, y: 1.85 + i * 0.5, w: 5.7, h: 0.45,
    fontSize: 10.5, color: COLORS.textDark,
  });
});

// 策略二
slide.addShape(pptx.ShapeType.roundRect, {
  x: 6.8, y: 1.15, w: 6.2, h: 2.9,
  fill: { color: COLORS.white },
  shadow: { type: "outer", blur: 4, offset: 1, color: "000000", opacity: 0.08 },
  rectRadius: 0.1,
});
slide.addShape(pptx.ShapeType.rect, {
  x: 6.8, y: 1.15, w: 6.2, h: 0.04, fill: { color: COLORS.green },
});
slide.addText("策略二：分层分流 → 响应提速至15s内", {
  x: 7.1, y: 1.3, w: 5.7, h: 0.4,
  fontSize: 14, color: COLORS.dark, bold: true,
});

const s2Items = [
  "▶ 智能分流：高意向→资深客服 | 通用→AI机器人 | 售后→自助",
  "▶ AI话术推荐：TOP50高频问题实时推荐，减少打字耗时30%",
  "▶ 动态排班：三大高峰时段增配20%人力",
  "▶ 快捷回复库升级：产品对比/安装指导/退换货政策",
  "▶ KPI目标：响应时间从19.45s → ≤15s",
];
s2Items.forEach((item, i) => {
  slide.addText(item, {
    x: 7.1, y: 1.85 + i * 0.5, w: 5.7, h: 0.45,
    fontSize: 10.5, color: COLORS.textDark,
  });
});

// 策略三
slide.addShape(pptx.ShapeType.roundRect, {
  x: 0.3, y: 4.3, w: 6.2, h: 2.65,
  fill: { color: COLORS.white },
  shadow: { type: "outer", blur: 4, offset: 1, color: "000000", opacity: 0.08 },
  rectRadius: 0.1,
});
slide.addShape(pptx.ShapeType.rect, {
  x: 0.3, y: 4.3, w: 6.2, h: 0.04, fill: { color: COLORS.gold },
});
slide.addText("策略三：满意度修复 → 精准定位+差评预警", {
  x: 0.6, y: 4.45, w: 5.7, h: 0.4,
  fontSize: 14, color: COLORS.dark, bold: true,
});

const s3Items = [
  "▶ 不满意会话100%复盘：按'响应慢/解答错/态度差/未解决'四类归因",
  "▶ 售后联动改善：一次解决率72.58%→80%，减少客诉回流",
  "▶ 差评预警：负面关键词实时告警，主管30s内介入",
  "▶ KPI目标：满意度从95.98% → 97.5%+",
];
s3Items.forEach((item, i) => {
  slide.addText(item, {
    x: 0.6, y: 5.0 + i * 0.48, w: 5.7, h: 0.45,
    fontSize: 10.5, color: COLORS.textDark,
  });
});

// 策略四
slide.addShape(pptx.ShapeType.roundRect, {
  x: 6.8, y: 4.3, w: 6.2, h: 2.65,
  fill: { color: COLORS.white },
  shadow: { type: "outer", blur: 4, offset: 1, color: "000000", opacity: 0.08 },
  rectRadius: 0.1,
});
slide.addShape(pptx.ShapeType.rect, {
  x: 6.8, y: 4.3, w: 6.2, h: 0.04, fill: { color: COLORS.red },
});
slide.addText("策略四：退款挽留专项", {
  x: 7.1, y: 4.45, w: 5.7, h: 0.4,
  fontSize: 14, color: COLORS.dark, bold: true,
});

const s4Items = [
  "▶ 退款原因五类打标：价格因素/竞品截流/冲动消费/信息不符/等待焦虑",
  "▶ 分级挽留SOP：未发货→承诺48h发货 | 未收货→物流+安抚+补偿",
  "▶ 竞品截流应对：价格敏感客户提供'价保承诺'或'赠品加码'",
  "▶ 发货时效承诺：在商品页强化'急速发货'，降低等待焦虑",
  "▶ KPI目标：挽留成功率≥25%，退款率↓15-20%",
];
s4Items.forEach((item, i) => {
  slide.addText(item, {
    x: 7.1, y: 5.0 + i * 0.48, w: 5.7, h: 0.45,
    fontSize: 10.5, color: COLORS.textDark,
  });
});

// ===================== SLIDE 13: 策略五&六 =====================
slide = pptx.addSlide();
slide.background = { fill: COLORS.lightGray };
addSlideTitle(slide, "策略五 & 策略六", "AI数据驱动 + 高退货型号售前干预");

// 策略五
slide.addShape(pptx.ShapeType.roundRect, {
  x: 0.3, y: 1.15, w: 6.2, h: 3.1,
  fill: { color: COLORS.white },
  shadow: { type: "outer", blur: 4, offset: 1, color: "000000", opacity: 0.08 },
  rectRadius: 0.1,
});
slide.addShape(pptx.ShapeType.rect, {
  x: 0.3, y: 1.15, w: 6.2, h: 0.04, fill: { color: COLORS.accent },
});
slide.addText("策略五：AI赋能 — 从'工具辅助'到'数据驱动'", {
  x: 0.6, y: 1.3, w: 5.7, h: 0.4,
  fontSize: 14, color: COLORS.dark, bold: true,
});

const s5Items = [
  "▶ AI全量质检：替代人工抽检，100%会话自动评分",
  "   （响应速度/专业度/转化能力/服务态度 四维评分）",
  "▶ 分层培训体系：S级→导师带教 | A级→专项提升 | B级→重点辅导",
  "   目标：三个月内A级以上占比≥70%",
  "▶ AI销售辅助：提炼'最佳话术模板'，实时推送给在线客服",
  "   预期：转化率再提升3-5%",
  "▶ 智能排班预测：AI预测流量波峰，提前3天建议排班调整",
];
s5Items.forEach((item, i) => {
  slide.addText(item, {
    x: 0.6, y: 1.85 + i * 0.52, w: 5.7, h: 0.48,
    fontSize: 10.5, color: COLORS.textDark,
  });
});

// 策略六
slide.addShape(pptx.ShapeType.roundRect, {
  x: 6.8, y: 1.15, w: 6.2, h: 3.1,
  fill: { color: COLORS.white },
  shadow: { type: "outer", blur: 4, offset: 1, color: "000000", opacity: 0.08 },
  rectRadius: 0.1,
});
slide.addShape(pptx.ShapeType.rect, {
  x: 6.8, y: 1.15, w: 6.2, h: 0.04, fill: { color: COLORS.orange },
});
slide.addText("策略六：高退货型号售前干预", {
  x: 7.1, y: 1.3, w: 5.7, h: 0.4,
  fontSize: 14, color: COLORS.dark, bold: true,
});

const s6Items = [
  "▶ M310Pro4k（退货150）：引导查看实拍视频，明确分辨率",
  "▶ M310Pro3K（退货143）：前置FAQ — 与Pro4k差异对比",
  "▶ A400Pro4K（退货133）：强化安装指导前置",
  "▶ N500（退货114）：仓储物流信息前置告知",
  "▶ M310Pro2K（退货50）：明确适用场景，避免过度期望",
  "",
  "预期效果：高退货型号退货率下降10-15%",
];
s6Items.forEach((item, i) => {
  slide.addText(item, {
    x: 7.1, y: 1.85 + i * 0.48, w: 5.7, h: 0.45,
    fontSize: 10.5, color: COLORS.textDark,
  });
});

// 底部总结
slide.addShape(pptx.ShapeType.roundRect, {
  x: 0.3, y: 4.5, w: 12.7, h: 1.5,
  fill: { color: COLORS.primary },
  rectRadius: 0.1,
});
slide.addText("策略核心逻辑", {
  x: 0.8, y: 4.7, w: 3, h: 0.4,
  fontSize: 14, color: COLORS.gold, bold: true,
});
slide.addText([
  { text: "把「流量红利」转化为「能力红利」\n", options: { bold: true, fontSize: 16 } },
  { text: "通过AI赋能 × 分层培训 × 主动触达 × 精细化运营，在618大促窗口期实现质的突破\n", options: { fontSize: 12 } },
  { text: "售前期望管理 → 降低信息不对称 → 减少退货 → 提升净销售额 + 降低售后成本", options: { fontSize: 11, color: COLORS.midGray } },
], {
  x: 0.8, y: 5.15, w: 11.8, h: 0.8,
  color: COLORS.white,
});

// ===================== SLIDE 14: Section - KPI目标 =====================
slide = pptx.addSlide();
sectionSlide(slide, "04", "KPI目标设定 & 执行保障");

// ===================== SLIDE 15: KPI目标设定 =====================
slide = pptx.addSlide();
slide.background = { fill: COLORS.lightGray };
addSlideTitle(slide, "KPI目标设定（6-7月）", "量化目标 + 梯度推进 + 终极愿景");

const kpiTargetData = [
  [
    { text: "指标", options: { bold: true, color: COLORS.white, fill: { color: COLORS.primary }, fontSize: 11 } },
    { text: "5月实际", options: { bold: true, color: COLORS.white, fill: { color: COLORS.primary }, fontSize: 11 } },
    { text: "6月目标", options: { bold: true, color: COLORS.white, fill: { color: COLORS.primary }, fontSize: 11 } },
    { text: "7月目标", options: { bold: true, color: COLORS.white, fill: { color: COLORS.primary }, fontSize: 11 } },
    { text: "终极目标", options: { bold: true, color: COLORS.white, fill: { color: COLORS.primary }, fontSize: 11 } },
  ],
  [
    { text: "客服销售额", options: { bold: true, fontSize: 11 } },
    { text: "424.18万", options: { fontSize: 11 } },
    { text: "460万", options: { fontSize: 11, color: COLORS.blue } },
    { text: "500万", options: { fontSize: 11, color: COLORS.blue } },
    { text: "月均500万+", options: { fontSize: 11, color: COLORS.green, bold: true } },
  ],
  [
    { text: "询单→付款成功率", options: { bold: true, fontSize: 11 } },
    { text: "26.41%", options: { fontSize: 11 } },
    { text: "28%", options: { fontSize: 11, color: COLORS.blue } },
    { text: "30%", options: { fontSize: 11, color: COLORS.blue } },
    { text: "30%+", options: { fontSize: 11, color: COLORS.green, bold: true } },
  ],
  [
    { text: "客服销售占比", options: { bold: true, fontSize: 11 } },
    { text: "56.14%", options: { fontSize: 11 } },
    { text: "57.5%", options: { fontSize: 11, color: COLORS.blue } },
    { text: "58.5%", options: { fontSize: 11, color: COLORS.blue } },
    { text: "60%", options: { fontSize: 11, color: COLORS.green, bold: true } },
  ],
  [
    { text: "响应时间", options: { bold: true, fontSize: 11 } },
    { text: "19.45s", options: { fontSize: 11 } },
    { text: "≤16s", options: { fontSize: 11, color: COLORS.blue } },
    { text: "≤14s", options: { fontSize: 11, color: COLORS.blue } },
    { text: "≤12s", options: { fontSize: 11, color: COLORS.green, bold: true } },
  ],
  [
    { text: "满意度", options: { bold: true, fontSize: 11 } },
    { text: "95.98%", options: { fontSize: 11 } },
    { text: "97%", options: { fontSize: 11, color: COLORS.blue } },
    { text: "97.5%", options: { fontSize: 11, color: COLORS.blue } },
    { text: "98%", options: { fontSize: 11, color: COLORS.green, bold: true } },
  ],
  [
    { text: "售后一次解决率", options: { bold: true, fontSize: 11 } },
    { text: "72.58%", options: { fontSize: 11 } },
    { text: "76%", options: { fontSize: 11, color: COLORS.blue } },
    { text: "80%", options: { fontSize: 11, color: COLORS.blue } },
    { text: "85%", options: { fontSize: 11, color: COLORS.green, bold: true } },
  ],
];

slide.addTable(kpiTargetData, {
  x: 0.5, y: 1.2, w: 12.33,
  colW: [2.8, 2.2, 2.2, 2.2, 2.9],
  border: { type: "solid", pt: 0.5, color: "DDDDDD" },
  autoPage: false,
});

// 执行保障
slide.addText("执行保障机制", {
  x: 0.5, y: 4.6, w: 4, h: 0.5,
  fontSize: 17, color: COLORS.dark, bold: true,
});
slide.addShape(pptx.ShapeType.rect, {
  x: 0.5, y: 5.08, w: 1.2, h: 0.03, fill: { color: COLORS.gold },
});

const safeguards = [
  { icon: "📊", title: "周度数据复盘会", desc: "每周一输出《天猫售前周报》，跟踪六大策略执行进度" },
  { icon: "🚨", title: "日报预警机制", desc: "当日响应>20s或满意度<96%，即时告警并启动应急方案" },
  { icon: "🔄", title: "月度策略迭代", desc: "每月根据数据变化复盘策略效果，动态调整优先级" },
  { icon: "🔗", title: "跨部门协同", desc: "与运营、供应链、产品建立月度联动机制" },
];

safeguards.forEach((sg, i) => {
  const xBase = 0.5 + i * 3.1;
  slide.addShape(pptx.ShapeType.roundRect, {
    x: xBase, y: 5.25, w: 2.9, h: 1.5,
    fill: { color: COLORS.white },
    shadow: { type: "outer", blur: 3, offset: 1, color: "000000", opacity: 0.06 },
    rectRadius: 0.08,
  });
  slide.addText(sg.icon + " " + sg.title, {
    x: xBase + 0.2, y: 5.35, w: 2.5, h: 0.35,
    fontSize: 11, color: COLORS.dark, bold: true,
  });
  slide.addText(sg.desc, {
    x: xBase + 0.2, y: 5.75, w: 2.5, h: 0.85,
    fontSize: 9.5, color: COLORS.textLight,
  });
});

// ===================== SLIDE 16: 总结 =====================
slide = pptx.addSlide();
slide.background = { fill: COLORS.dark };
slide.addShape(pptx.ShapeType.rect, {
  x: 0, y: 0, w: 13.33, h: 0.08, fill: { color: COLORS.highlight },
});
slide.addShape(pptx.ShapeType.rect, {
  x: 0, y: 7.42, w: 13.33, h: 0.08, fill: { color: COLORS.highlight },
});

slide.addText("总结与展望", {
  x: 1.0, y: 1.2, w: 11, h: 0.8,
  fontSize: 32, color: COLORS.white, bold: true,
});
slide.addShape(pptx.ShapeType.rect, {
  x: 1.0, y: 2.05, w: 2, h: 0.03, fill: { color: COLORS.gold },
});

slide.addText([
  { text: "5月数据整体向好，销售额和转化率双增是积极信号。", options: {} },
], {
  x: 1.0, y: 2.5, w: 11, h: 0.5,
  fontSize: 16, color: COLORS.midGray,
});

slide.addText([
  { text: "但", options: { color: COLORS.highlight } },
  { text: " 客服销售占比的结构性下降、响应时间的波动、以及售后一次性解决率的短板，", options: {} },
  { text: "是制约后续增长的关键瓶颈。", options: {} },
], {
  x: 1.0, y: 3.1, w: 11, h: 0.5,
  fontSize: 16, color: COLORS.midGray,
});

// 三大核心行动
slide.addShape(pptx.ShapeType.roundRect, {
  x: 1.0, y: 4.0, w: 3.5, h: 2.0,
  fill: { color: "222244" },
  rectRadius: 0.1,
});
slide.addText("01", {
  x: 1.3, y: 4.15, w: 1, h: 0.6,
  fontSize: 32, color: COLORS.gold, bold: true, fontFace: "Arial",
});
slide.addText("转化率攻坚", {
  x: 2.3, y: 4.25, w: 2, h: 0.4,
  fontSize: 14, color: COLORS.white, bold: true,
});
slide.addText("主动触达 + AI赋能\n目标：占比60%\n转化率30%+", {
  x: 1.3, y: 4.8, w: 3, h: 1.0,
  fontSize: 10, color: COLORS.midGray,
});

slide.addShape(pptx.ShapeType.roundRect, {
  x: 4.9, y: 4.0, w: 3.5, h: 2.0,
  fill: { color: "1A3A2A" },
  rectRadius: 0.1,
});
slide.addText("02", {
  x: 5.2, y: 4.15, w: 1, h: 0.6,
  fontSize: 32, color: COLORS.green, bold: true, fontFace: "Arial",
});
slide.addText("服务体验升级", {
  x: 6.2, y: 4.25, w: 2, h: 0.4,
  fontSize: 14, color: COLORS.white, bold: true,
});
slide.addText("响应≤12s\n满意度98%\n售后一次解决85%", {
  x: 5.2, y: 4.8, w: 3, h: 1.0,
  fontSize: 10, color: COLORS.midGray,
});

slide.addShape(pptx.ShapeType.roundRect, {
  x: 8.8, y: 4.0, w: 3.5, h: 2.0,
  fill: { color: "2A1A1A" },
  rectRadius: 0.1,
});
slide.addText("03", {
  x: 9.1, y: 4.15, w: 1, h: 0.6,
  fontSize: 32, color: COLORS.red, bold: true, fontFace: "Arial",
});
slide.addText("精细化运营", {
  x: 10.0, y: 4.25, w: 2, h: 0.4,
  fontSize: 14, color: COLORS.white, bold: true,
});
slide.addText("退款挽留+退货干预\n退款率↓20%\n退货率↓15%", {
  x: 9.1, y: 4.8, w: 3, h: 1.0,
  fontSize: 10, color: COLORS.midGray,
});

slide.addText("THANKS", {
  x: 0, y: 6.5, w: 13.33, h: 0.5,
  fontSize: 14, color: "555555", align: "center",
  fontFace: "Arial",
});

// ===================== 保存文件 =====================
const desktopPath = "C:/Users/Administrator/Desktop/天猫售前KPI分析及策略方案.pptx";
pptx.writeFile({ fileName: desktopPath })
  .then(() => console.log("PPTX saved to: " + desktopPath))
  .catch(err => console.error("Error:", err));
