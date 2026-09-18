import { useCallback, useEffect, useRef, useState } from 'react';
import { Gamepad2, Loader2, Sparkles, Wand2, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import {
  APP_EXAMPLES,
  FALLBACK_MODELS,
  fetchAgentModels,
  getErrorMessage,
  historyEntity,
  isBuiltinRecord,
  modelLabel,
  recordFromHistory,
  requestAgentGeneration,
  type AgentModelInfo,
  type GenerationKind,
  type GenerationRecord,
  type HistoryItem,
} from '@/lib/agent';
import {
  BUILTIN_SHORTCUTS,
  createBuiltinRecord,
  matchTemplate,
  restoreBuiltinRecord,
  type TemplateName,
} from '@/lib/templates';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import HistoryPanel from '@/components/agent/HistoryPanel';
import PreviewPane from '@/components/agent/PreviewPane';

/** 生成模式：内置模板免 AI 额度即时可用；智能体生成按描述编写全新代码 */
type GenerateMode = 'builtin' | 'agent';

/** 把生成结果转换成历史列表可用的行数据 */
function toHistoryItem(record: GenerationRecord, kind: GenerationKind): HistoryItem | null {
  if (record.id === null) return null;
  return {
    id: record.id,
    description: record.description,
    template_name: record.templateName ?? '',
    app_title: record.appTitle,
    category: record.category,
    kind,
    html_code: record.html,
    plan_summary: record.planSummary,
    model: record.model,
    version: record.version,
    created_at: new Date().toISOString(),
  };
}

export default function Index() {
  const [mode, setMode] = useState<GenerateMode>('builtin');
  const [description, setDescription] = useState('');
  const [record, setRecord] = useState<GenerationRecord | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [instruction, setInstruction] = useState('');
  const [refining, setRefining] = useState(false);

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [activeId, setActiveId] = useState<number | null>(null);

  const [models, setModels] = useState<AgentModelInfo[]>(FALLBACK_MODELS);
  const [model, setModel] = useState<string>(FALLBACK_MODELS[0].id);

  const previewRef = useRef<HTMLDivElement>(null);
  const lastRequestRef = useRef<{ description: string; instruction?: string } | null>(null);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    setHistoryError('');
    try {
      const response = await historyEntity.query({ sort: '-created_at', limit: 30 });
      setHistory(response?.data?.items ?? []);
    } catch (err) {
      setHistoryError(getErrorMessage(err));
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  // 模型目录来自后端；接口异常时回退到内置目录，选择器始终可用。
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await fetchAgentModels();
      if (cancelled) return;
      setModels(result.models);
      setModel((prev) =>
        result.models.some((item) => item.id === prev) ? prev : result.defaultModel,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const scrollToPreview = () => {
    previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /** 内置模板生成：本地匹配并即时预览，同时把结果落库到历史记录 */
  const runBuiltin = async (text: string) => {
    const name: TemplateName = matchTemplate(text);
    const builtin = createBuiltinRecord(text, name);
    setError('');
    setInstruction('');
    setRecord(builtin);
    setActiveId(null);
    scrollToPreview();
    try {
      const created = await historyEntity.create({
        data: {
          description: text,
          template_name: name,
          app_title: builtin.appTitle,
          category: builtin.category,
          kind: 'builtin',
          html_code: builtin.html,
          plan_summary: builtin.planSummary,
          model: builtin.model,
          version: builtin.version,
          instruction: '',
        },
      });
      const id = created?.data?.id ?? null;
      if (id !== null) {
        setRecord({ ...builtin, id });
        setActiveId(id);
        const row = toHistoryItem({ ...builtin, id }, 'builtin');
        if (row) setHistory((prev) => [row, ...prev.filter((item) => item.id !== row.id)]);
      }
      toast(`已生成「${builtin.appTitle}」`, {
        description: '内置模板可立即在右侧试玩，无需消耗 AI 额度。',
      });
    } catch (err) {
      toast('已生成预览，但历史记录保存失败', { description: getErrorMessage(err) });
    }
  };

  /** 智能体生成：按描述产出 v1 应用代码 */
  const runGenerate = async (text: string) => {
    lastRequestRef.current = { description: text };
    setGenerating(true);
    setError('');
    setInstruction('');
    try {
      const result = await requestAgentGeneration({ description: text, version: 1, model });
      setRecord(result);
      setActiveId(result.id);
      const row = toHistoryItem(result, 'agent');
      if (row) {
        setHistory((prev) => [row, ...prev.filter((item) => item.id !== row.id)]);
      }
      toast(`已生成「${result.appTitle}」`, {
        description:
          result.id === null
            ? '代码已生成，但历史记录保存失败，可点击「刷新」重试。'
            : '可在右侧直接试玩，并在下方历史中随时重新打开。',
      });
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      toast('生成失败', { description: message });
    } finally {
      setGenerating(false);
    }
  };

  /** 迭代生成：在已有代码基础上按修改要求产出新版本 */
  const runRefine = async (base: GenerationRecord, change: string) => {
    lastRequestRef.current = { description: base.description, instruction: change };
    setRefining(true);
    setError('');
    try {
      const result = await requestAgentGeneration({
        description: base.description,
        instruction: change,
        baseHtml: base.html,
        version: base.version + 1,
        model,
      });
      setRecord(result);
      setActiveId(result.id);
      setInstruction('');
      const row = toHistoryItem(result, 'agent');
      if (row) {
        setHistory((prev) => [row, ...prev.filter((item) => item.id !== row.id)]);
      }
      toast(`已更新到 v${result.version}`, { description: '预览已刷新为最新版本。' });
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      toast('迭代失败', { description: message });
    } finally {
      setRefining(false);
    }
  };

  const handleGenerate = () => {
    const text = description.trim();
    if (!text) {
      toast('请先输入应用描述');
      return;
    }
    if (mode === 'builtin') {
      void runBuiltin(text);
      return;
    }
    void runGenerate(text);
  };

  const handleRefine = () => {
    if (!record) return;
    const change = instruction.trim();
    if (!change) {
      toast('请先填写修改要求');
      return;
    }
    void runRefine(record, change);
  };

  /** 失败后按上一次请求重试 */
  const handleRetry = () => {
    const last = lastRequestRef.current;
    if (!last) {
      handleGenerate();
      return;
    }
    setDescription(last.description);
    if (last.instruction && record) {
      setInstruction(last.instruction);
      void runRefine(record, last.instruction);
      return;
    }
    void runGenerate(last.description);
  };

  const handleOpen = (item: HistoryItem) => {
    const restored = isBuiltinRecord(item)
      ? restoreBuiltinRecord(item)
      : recordFromHistory(item);
    if (!restored) {
      toast('这条记录没有可预览的代码', {
        description: '你可以点击「回填」把描述放回输入框，重新生成一版。',
      });
      return;
    }
    setRecord({ ...restored, id: item.id });
    setActiveId(item.id);
    setDescription(restored.description);
    setInstruction('');
    setError('');
    scrollToPreview();
  };

  const handleRefill = (item: HistoryItem) => {
    setDescription(item.description);
    setMode(isBuiltinRecord(item) ? 'builtin' : 'agent');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (item: HistoryItem) => {
    try {
      await historyEntity.delete({ id: item.id });
      setHistory((prev) => prev.filter((row) => row.id !== item.id));
      if (activeId === item.id) {
        setActiveId(null);
      }
      toast('已删除该条历史记录', {
        action: {
          label: '撤销',
          onClick: async () => {
            try {
              await historyEntity.create({
                data: {
                  description: item.description,
                  template_name: item.template_name ?? '',
                  app_title: item.app_title ?? '',
                  category: item.category ?? '',
                  kind: item.kind ?? 'agent',
                  html_code: item.html_code ?? '',
                  plan_summary: item.plan_summary ?? '',
                  model: item.model ?? '',
                  version: item.version ?? 1,
                  instruction: item.instruction ?? '',
                },
              });
              await loadHistory();
              toast('已恢复该条记录');
            } catch (err) {
              toast(getErrorMessage(err));
            }
          },
        },
      });
    } catch (err) {
      toast(getErrorMessage(err));
    }
  };

  const busy = generating || refining;
  const isBuiltin = record?.kind === 'builtin';

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-screen-xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="size-4" aria-hidden="true" />
            </span>
            <div className="leading-tight">
              <h1 className="text-base font-semibold">AI 应用生成器</h1>
              <p className="text-xs text-muted-foreground">
                内置小游戏免额度即玩 · 智能体编写全新代码
              </p>
            </div>
          </div>
          <Badge variant="secondary" className="font-normal">
            生成记录已存入 Atoms Cloud
          </Badge>
        </div>
      </header>

      <main className="mx-auto max-w-screen-xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-12">
          <Card className="lg:col-span-5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Wand2 className="size-4 text-primary" aria-hidden="true" />
                应用需求
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>生成方式</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={mode === 'builtin' ? 'default' : 'outline'}
                    className={mode === 'builtin' ? 'w-full' : 'w-full !bg-transparent'}
                    disabled={busy}
                    onClick={() => setMode('builtin')}
                  >
                    <Gamepad2 className="size-4" aria-hidden="true" />
                    内置模板
                  </Button>
                  <Button
                    type="button"
                    variant={mode === 'agent' ? 'default' : 'outline'}
                    className={mode === 'agent' ? 'w-full' : 'w-full !bg-transparent'}
                    disabled={busy}
                    onClick={() => setMode('agent')}
                  >
                    <Sparkles className="size-4" aria-hidden="true" />
                    智能体生成
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {mode === 'builtin'
                    ? '内置模板本地匹配并即时预览，不消耗 AI 额度，包含数独、贪吃蛇、2048 等可玩小游戏。'
                    : '智能体按描述编写全新代码，功能不受模板限制，需要账户 AI 额度充足。'}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">描述你想生成的应用或小游戏</Label>
                <Textarea
                  id="description"
                  rows={5}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={
                    mode === 'builtin'
                      ? '例如：\n• 数独小游戏\n• 贪吃蛇小游戏\n• 2048 小游戏\n• 一个待办清单'
                      : '例如：\n• 一个数独小游戏，支持难度选择和错误提示\n• 贪吃蛇，键盘与触屏都能玩\n• 一个带番茄钟的待办清单'
                  }
                  className="resize-y"
                  disabled={busy}
                />
                <p className="text-xs text-muted-foreground">
                  {mode === 'builtin'
                    ? '输入包含关键词（数独 / 贪吃蛇 / 2048 / 待办 / 天气 / 时钟 / 计算器）即会匹配对应模板。'
                    : '描述越具体（玩法、界面、数据），生成的代码越贴近你的预期。'}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  {mode === 'builtin' ? '内置可玩模板' : '示例需求'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {(mode === 'builtin'
                    ? BUILTIN_SHORTCUTS.map((item) => item.prompt)
                    : APP_EXAMPLES
                  ).map((prompt) => (
                    <Button
                      key={prompt}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="!bg-transparent font-normal"
                      disabled={busy}
                      onClick={() => setDescription(prompt)}
                    >
                      {prompt}
                    </Button>
                  ))}
                </div>
              </div>

              {mode === 'agent' ? (
                <div className="space-y-2">
                  <Label htmlFor="model">生成模型</Label>
                  <Select value={model} onValueChange={setModel} disabled={busy}>
                    <SelectTrigger id="model">
                      <SelectValue placeholder="选择生成模型" />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.label} · {item.note}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    所选模型不可用时会自动切换到其他候选模型，无需手动重试。
                  </p>
                </div>
              ) : null}

              <Button
                type="button"
                className="w-full"
                onClick={() => handleGenerate()}
                disabled={busy}
              >
                {generating ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    生成中…
                  </>
                ) : (
                  <>
                    {mode === 'builtin' ? (
                      <Gamepad2 className="size-4" aria-hidden="true" />
                    ) : (
                      <Sparkles className="size-4" aria-hidden="true" />
                    )}
                    {mode === 'builtin' ? '生成并试玩' : '生成应用'}
                  </>
                )}
              </Button>

              {record && !isBuiltin ? (
                <div className="space-y-3 rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2">
                    <Wrench className="size-3.5 text-primary" aria-hidden="true" />
                    <p className="text-sm font-medium">继续迭代 v{record.version}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    在「{record.appTitle}」基础上描述要改的地方，智能体会保留其余功能并输出新版本。
                  </p>
                  <Input
                    value={instruction}
                    onChange={(event) => setInstruction(event.target.value)}
                    placeholder="例如：增加难度选择与计时器"
                    disabled={busy}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    onClick={() => handleRefine()}
                    disabled={busy}
                  >
                    {refining ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                        迭代中…
                      </>
                    ) : (
                      <>
                        <Wrench className="size-4" aria-hidden="true" />
                        按指令修改
                      </>
                    )}
                  </Button>
                </div>
              ) : record ? (
                <div className="rounded-lg bg-muted/60 p-3">
                  <p className="text-xs text-muted-foreground">
                    这是内置模板结果，已可直接试玩并保存到历史。若想在此基础上加入新玩法，请切换到「智能体生成」模式描述需求。
                  </p>
                </div>
              ) : (
                <div className="rounded-lg bg-muted/60 p-3">
                  <p className="text-xs text-muted-foreground">
                    生成完成后可在此输入修改要求，例如「把配色改成深色」「加入计时功能」，即可迭代出新版本。
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <div ref={previewRef} className="lg:col-span-7">
            <PreviewPane
              record={record}
              generating={busy}
              error={error}
              modelName={modelLabel(record?.model || model, models)}
              onRetry={() => handleRetry()}
            />
          </div>
        </div>

        <HistoryPanel
          items={history}
          loading={loadingHistory}
          error={historyError}
          activeId={activeId}
          examplePrompt={BUILTIN_SHORTCUTS[0].prompt}
          onReload={() => void loadHistory()}
          onOpen={handleOpen}
          onRefill={handleRefill}
          onDelete={(item) => void handleDelete(item)}
          onUseExample={setDescription}
        />
      </main>
    </div>
  );
}
