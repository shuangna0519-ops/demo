import { client } from '@/lib/api';

/** 生成来源：agent 为智能体生成，builtin 为历史遗留的内置模板记录 */
export type GenerationKind = 'agent' | 'builtin';

/** 智能体生成接口的响应体 */
export type AgentGenerateResponse = {
  app_title: string;
  category: string;
  plan_summary: string;
  html_code: string;
  model: string;
  version: number;
  record_id: number | null;
};

/** generation_history 表中的一行记录 */
export type HistoryItem = {
  id: number;
  description: string;
  template_name?: string | null;
  app_title?: string | null;
  category?: string | null;
  kind?: string | null;
  html_code?: string | null;
  plan_summary?: string | null;
  model?: string | null;
  version?: number | null;
  instruction?: string | null;
  created_at?: string | null;
};

/** 当前正在预览的生成结果（统一智能体结果与内置模板结果） */
export type GenerationRecord = {
  id: number | null;
  description: string;
  appTitle: string;
  category: string;
  planSummary: string;
  html: string;
  model: string;
  version: number;
  kind: GenerationKind;
  templateName?: string | null;
};

type HistoryEntity = {
  query: (args?: Record<string, unknown>) => Promise<{ data?: { items?: HistoryItem[] } }>;
  create: (args: { data: Record<string, unknown> }) => Promise<{ data?: HistoryItem }>;
  delete: (args: { id: number }) => Promise<unknown>;
};

export const historyEntity = (client.entities as unknown as Record<string, HistoryEntity>)
  .generation_history;

/** 示例描述：覆盖小游戏与常见工具，点击即可填入输入框 */
export const APP_EXAMPLES = [
  '数独小游戏',
  '贪吃蛇小游戏',
  '2048 小游戏',
  '一个待办清单',
  '番茄钟计时器',
  '天气卡片',
];

/** 分类徽标配色 */
export const CATEGORY_TONES: Record<string, string> = {
  小游戏: 'bg-primary/10 text-primary',
  效率工具: 'bg-secondary text-secondary-foreground',
  数据展示: 'bg-accent text-accent-foreground',
  内容生成: 'bg-muted text-muted-foreground',
  其他: 'bg-muted text-muted-foreground',
};

/** 生成过程中的阶段提示，让长耗时等待有明确预期 */
export const GENERATION_STAGES = [
  '正在理解需求并规划应用结构…',
  '正在生成界面与交互逻辑…',
  '正在补全游戏规则与校验逻辑…',
  '正在校验代码完整性…',
];

export const PREVIEW_PLACEHOLDER_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: #f3f7f6; min-height: 100vh; display: flex; align-items: center; justify-content: center; color: #4d5f5b; }
  .box { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 32px; text-align: center; }
  .icon { font-size: 40px; }
  .title { font-size: 15px; font-weight: 600; }
  .sub { font-size: 13px; color: #8b9a96; max-width: 320px; line-height: 1.6; }
</style>
</head>
<body>
<div class="box">
  <div class="icon">🧩</div>
  <div class="title">描述你想要的任何应用或小游戏</div>
  <div class="sub">例如「数独小游戏」「贪吃蛇」「待办清单」，智能体会生成真实可运行的代码并在这里直接预览。</div>
</div>
</body>
</html>`;

/** Cloud & AI Wallet 充值入口（AI 额度不足时引导用户前往充值） */
export const WALLET_TOPUP_URL = 'https://atoms.dev/dashboard?settings=cloudAiBalance';

/** 判断错误是否由 AI 钱包额度不足引起 */
export function isBalanceError(message: string): boolean {
  const text = (message || '').toLowerCase();
  return text.includes('额度不足') || text.includes('insufficient_ai_balance');
}

/** 可选生成模型（由后端 `/api/v1/agent/models` 提供） */
export type AgentModelInfo = {
  id: string;
  label: string;
  note: string;
};

export type AgentModelListResponse = {
  models: AgentModelInfo[];
  default: string;
};

/** 内置兜底模型目录：接口不可用时仍可让用户选择 */
export const FALLBACK_MODELS: AgentModelInfo[] = [
  { id: 'claude-opus-4.6', label: 'Claude Opus 4.6', note: '代码能力最强，推荐' },
  { id: 'claude-opus-5', label: 'Claude Opus 5', note: '代码与多模态均衡' },
  { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol', note: '结构化输出稳定' },
  { id: 'gpt-5.4', label: 'GPT-5.4', note: '通用能力强' },
  { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', note: '高质量、性价比好' },
  { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', note: '响应最快' },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', note: '长上下文' },
];

/** 拉取可选模型列表；失败时回退到内置目录，保证选择器始终可用 */
export async function fetchAgentModels(): Promise<{
  models: AgentModelInfo[];
  defaultModel: string;
}> {
  try {
    const response = (await client.apiCall.invoke({
      url: '/api/v1/agent/models',
      method: 'GET',
    })) as { data: AgentModelListResponse };
    const models = response?.data?.models ?? [];
    if (models.length > 0) {
      return { models, defaultModel: response.data.default || models[0].id };
    }
  } catch {
    // 忽略：回退到内置目录，不阻塞主流程
  }
  return { models: FALLBACK_MODELS, defaultModel: FALLBACK_MODELS[0].id };
}

/** 把模型标识转换成展示名称 */
export function modelLabel(id: string, models: AgentModelInfo[] = FALLBACK_MODELS): string {
  return models.find((item) => item.id === id)?.label ?? id;
}

/** 统一错误提示文案 */
export function getErrorMessage(error: unknown): string {
  const candidate = error as {
    data?: { detail?: string };
    response?: { data?: { detail?: string } };
    message?: string;
  };
  return (
    candidate?.data?.detail ||
    candidate?.response?.data?.detail ||
    candidate?.message ||
    '操作失败，请稍后重试'
  );
}

/** 格式化生成时间 */
export function formatTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (num: number) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** iframe 重新挂载用的签名，避免相同代码重复刷新 */
export function htmlSignature(html: string): string {
  let hash = 0;
  for (let index = 0; index < html.length; index += 1) {
    hash = (hash * 31 + html.charCodeAt(index)) % 2147483647;
  }
  return `${html.length}-${hash}`;
}

/** 生成安全的下载文件名 */
export function buildFileName(title: string, version: number): string {
  const safe = (title || 'app').replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 40);
  return `${safe}-v${version}.html`;
}

/** 把生成代码下载为独立 HTML 文件 */
export function downloadHtml(title: string, version: number, html: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = buildFileName(title, version);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

type AgentRequestParams = {
  description: string;
  instruction?: string;
  baseHtml?: string;
  version?: number;
  model?: string;
};

/** 调用后端智能体接口生成应用代码（单次调用可能耗时较长，显式放宽超时） */
export async function requestAgentGeneration({
  description,
  instruction,
  baseHtml,
  version,
  model,
}: AgentRequestParams): Promise<GenerationRecord> {
  const response = (await client.apiCall.invoke({
    url: '/api/v1/agent/generate_app',
    method: 'POST',
    data: {
      description,
      instruction: instruction ?? '',
      base_html: baseHtml ?? '',
      model: model ?? '',
      version: version ?? 1,
    },
    options: { timeout: 600_000 },
  })) as { data: AgentGenerateResponse };

  const payload = response.data;
  return {
    id: payload.record_id ?? null,
    description,
    appTitle: payload.app_title,
    category: payload.category,
    planSummary: payload.plan_summary,
    html: payload.html_code,
    model: payload.model,
    version: payload.version ?? version ?? 1,
    kind: 'agent',
  };
}

/** 把历史记录转换为可预览的生成结果，无代码的旧记录返回 null */
export function recordFromHistory(item: HistoryItem): GenerationRecord | null {
  const html = (item.html_code ?? '').trim();
  if (!html) return null;
  return {
    id: item.id,
    description: item.description,
    appTitle: item.app_title || '未命名应用',
    category: item.category || '其他',
    planSummary: item.plan_summary || '',
    html,
    model: item.model || '',
    version: item.version ?? 1,
    kind: 'agent',
    templateName: item.template_name ?? null,
  };
}

/** 历史记录是否为内置模板记录（无生成代码） */
export function isBuiltinRecord(item: HistoryItem): boolean {
  return (item.kind ?? '') === 'builtin' || !(item.html_code ?? '').trim();
}
