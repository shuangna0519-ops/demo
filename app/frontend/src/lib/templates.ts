import calculatorHtml from '@/templates/calculator.html?raw';
import clockHtml from '@/templates/clock.html?raw';
import defaultHtml from '@/templates/default.html?raw';
import game2048Html from '@/templates/game2048.html?raw';
import snakeHtml from '@/templates/snake.html?raw';
import sudokuHtml from '@/templates/sudoku.html?raw';
import todoHtml from '@/templates/todo.html?raw';
import weatherHtml from '@/templates/weather.html?raw';
import type { GenerationRecord } from '@/lib/agent';

export type TemplateName =
  | 'sudoku'
  | 'snake'
  | 'game2048'
  | 'todo'
  | 'weather'
  | 'clock'
  | 'calculator'
  | 'default';

/** 模板中文名，用于界面徽标展示 */
export const TEMPLATE_LABELS: Record<TemplateName, string> = {
  sudoku: '数独',
  snake: '贪吃蛇',
  game2048: '2048',
  todo: '待办清单',
  weather: '天气卡片',
  clock: '时钟',
  calculator: '计算器',
  default: '通用模板',
};

/** 模板所属分类，决定徽标配色与历史列表分类列 */
export const TEMPLATE_CATEGORIES: Record<TemplateName, string> = {
  sudoku: '小游戏',
  snake: '小游戏',
  game2048: '小游戏',
  todo: '效率工具',
  weather: '数据展示',
  clock: '效率工具',
  calculator: '效率工具',
  default: '其他',
};

/** 模板内容摘要，展示在预览面板标题下方 */
export const TEMPLATE_SUMMARIES: Record<TemplateName, string> = {
  sudoku: '可玩的数独：三档难度、候选高亮、错误即时标红、计时与错误计数、一键重开。',
  snake: '可玩的贪吃蛇：键盘方向键 / WASD / 屏幕方向键 / 触屏滑动控制，实时计分与最高分记录。',
  game2048: '可玩的 2048：方向键或滑动合并方块，实时计分、最高分记录与胜负判定。',
  todo: '待办清单：新增、勾选完成、删除任务，并统计剩余待办数量。',
  weather: '天气卡片：展示城市天气概览与多日趋势的静态示例。',
  clock: '时钟：实时走时的数字时钟与日期显示。',
  calculator: '计算器：支持四则运算与连续计算的按键式计算器。',
  default: '通用占位模板，用于展示未命中具体模板时的基础页面结构。',
};

/**
 * 关键词 -> 模板映射，按优先级从上到下匹配。
 * 小游戏类关键词优先，避免「数独小游戏」等描述被工具类关键词抢先命中。
 */
const TEMPLATE_MATCHERS: Array<{ name: Exclude<TemplateName, 'default'>; keywords: string[] }> = [
  { name: 'sudoku', keywords: ['数独', 'sudoku', '九宫格', '宫格填数'] },
  { name: 'snake', keywords: ['贪吃蛇', 'snake', '小蛇', '吃豆蛇'] },
  { name: 'game2048', keywords: ['2048', '数字合并', '合并数字', '方块合并'] },
  { name: 'todo', keywords: ['待办', 'todo', '任务', '清单', '提醒', '日程'] },
  { name: 'weather', keywords: ['天气', 'weather', '气温', '温度', '降雨', '预报'] },
  { name: 'clock', keywords: ['时钟', 'clock', '时间', '钟表', '计时', '秒表'] },
  { name: 'calculator', keywords: ['计算器', 'calculator', '计算', '算数', 'math', '数学'] },
];

const TEMPLATE_HTML: Record<TemplateName, string> = {
  sudoku: sudokuHtml,
  snake: snakeHtml,
  game2048: game2048Html,
  todo: todoHtml,
  weather: weatherHtml,
  clock: clockHtml,
  calculator: calculatorHtml,
  default: defaultHtml,
};

/** 关键词匹配模板，未命中时回退到通用模板 */
export function matchTemplate(description: string): TemplateName {
  const text = description.toLowerCase();
  for (const { name, keywords } of TEMPLATE_MATCHERS) {
    if (keywords.some((keyword) => text.includes(keyword.toLowerCase()))) {
      return name;
    }
  }
  return 'default';
}

/** 取出模板 HTML 源码，用于 iframe 即时预览 */
export function getTemplateHtml(name: TemplateName): string {
  return TEMPLATE_HTML[name] ?? TEMPLATE_HTML.default;
}

/** 把内置模板结果包装成与智能体结果同构的生成记录，便于共用预览与历史流程 */
export function createBuiltinRecord(description: string, name: TemplateName): GenerationRecord {
  return {
    id: null,
    description,
    appTitle: `${TEMPLATE_LABELS[name]}（内置模板）`,
    category: TEMPLATE_CATEGORIES[name],
    planSummary: TEMPLATE_SUMMARIES[name],
    html: getTemplateHtml(name),
    model: '内置模板',
    version: 1,
    kind: 'builtin',
    templateName: name,
  };
}

/** 判断模板名是否属于内置模板 */
export function isTemplateName(value?: string | null): value is TemplateName {
  return Boolean(value) && Object.prototype.hasOwnProperty.call(TEMPLATE_HTML, value as string);
}

/**
 * 从历史记录还原内置模板结果。
 * 新记录自带 html_code；早期无代码的记录按 template_name 重新取模板源码。
 */
export function restoreBuiltinRecord(item: {
  description: string;
  template_name?: string | null;
  app_title?: string | null;
  category?: string | null;
  html_code?: string | null;
  plan_summary?: string | null;
  version?: number | null;
}): GenerationRecord | null {
  const name = isTemplateName(item.template_name) ? item.template_name : matchTemplate(item.description);
  const html = (item.html_code ?? '').trim() || getTemplateHtml(name);
  if (!html) return null;
  return {
    id: null,
    description: item.description,
    appTitle: item.app_title || `${TEMPLATE_LABELS[name]}（内置模板）`,
    category: item.category || TEMPLATE_CATEGORIES[name],
    planSummary: item.plan_summary || TEMPLATE_SUMMARIES[name],
    html,
    model: '内置模板',
    version: item.version ?? 1,
    kind: 'builtin',
    templateName: name,
  };
}

/** 界面上展示的关键词提示 */
export const KEYWORD_HINTS = TEMPLATE_MATCHERS.map((item) => ({
  name: item.name,
  label: TEMPLATE_LABELS[item.name],
  keywords: item.keywords.slice(0, 2),
}));

/** 内置可玩模板的快捷入口（免 AI 额度，点击即可生成并试玩） */
export const BUILTIN_SHORTCUTS: Array<{ name: TemplateName; prompt: string }> = [
  { name: 'sudoku', prompt: '数独小游戏' },
  { name: 'snake', prompt: '贪吃蛇小游戏' },
  { name: 'game2048', prompt: '2048 小游戏' },
  { name: 'todo', prompt: '一个待办清单' },
  { name: 'clock', prompt: '一个时钟' },
  { name: 'calculator', prompt: '计算器' },
];

/** 示例描述，点击即可填入输入框（内置模板模式下同样可用） */
export const EXAMPLE_PROMPTS = BUILTIN_SHORTCUTS.map((item) => item.prompt);
