import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Code2,
  Copy,
  Download,
  Loader2,
  MonitorPlay,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  CATEGORY_TONES,
  GENERATION_STAGES,
  PREVIEW_PLACEHOLDER_HTML,
  WALLET_TOPUP_URL,
  buildFileName,
  downloadHtml,
  htmlSignature,
  isBalanceError,
  type GenerationRecord,
} from '@/lib/agent';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type PreviewPaneProps = {
  record: GenerationRecord | null;
  generating: boolean;
  error: string;
  modelName: string;
  onRetry: () => void;
};

export default function PreviewPane({
  record,
  generating,
  error,
  modelName,
  onRetry,
}: PreviewPaneProps) {
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    if (!generating) {
      setStageIndex(0);
      return;
    }
    const timer = window.setInterval(() => {
      setStageIndex((prev) => (prev + 1 < GENERATION_STAGES.length ? prev + 1 : prev));
    }, 12000);
    return () => window.clearInterval(timer);
  }, [generating]);

  const html = record?.html ?? PREVIEW_PLACEHOLDER_HTML;
  const signature = record ? htmlSignature(record.html) : 'placeholder';

  const handleCopy = async () => {
    if (!record) return;
    try {
      await navigator.clipboard.writeText(record.html);
      toast('已复制完整 HTML 代码');
    } catch {
      toast('复制失败，请手动在代码区选择复制');
    }
  };

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <MonitorPlay className="size-4 text-primary" aria-hidden="true" />
          生成结果
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          {record ? (
            <>
              <Badge className={`font-normal ${CATEGORY_TONES[record.category] ?? ''}`}>
                {record.category}
              </Badge>
              <Badge variant="secondary" className="font-normal">
                v{record.version}
              </Badge>
              <Badge variant="outline" className="font-normal">
                {record.kind === 'builtin' ? '内置模板' : modelName}
              </Badge>
            </>
          ) : (
            <Badge variant="secondary" className="font-normal">
              尚未生成
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {record ? (
          <div className="space-y-1">
            <p className="text-sm font-medium">{record.appTitle}</p>
            {record.planSummary ? (
              <p className="text-xs leading-relaxed text-muted-foreground">
                {record.planSummary}
              </p>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <div className="flex flex-col items-start gap-3 rounded-lg bg-destructive/10 p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
              <p className="text-sm">{error}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" className="!bg-transparent" onClick={onRetry}>
                <RotateCcw className="size-4" aria-hidden="true" />
                重新生成
              </Button>
              {isBalanceError(error) ? (
                <Button type="button" size="sm" asChild>
                  <a href={WALLET_TOPUP_URL} target="_blank" rel="noreferrer noopener">
                    前往充值
                  </a>
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        <Tabs defaultValue="preview">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TabsList>
              <TabsTrigger value="preview">
                <MonitorPlay className="mr-1.5 size-3.5" aria-hidden="true" />
                预览
              </TabsTrigger>
              <TabsTrigger value="code" disabled={!record}>
                <Code2 className="mr-1.5 size-3.5" aria-hidden="true" />
                代码
              </TabsTrigger>
            </TabsList>

            {record ? (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="!bg-transparent"
                  onClick={() => void handleCopy()}
                >
                  <Copy className="size-3.5" aria-hidden="true" />
                  复制代码
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="!bg-transparent"
                  onClick={() => downloadHtml(record.appTitle, record.version, record.html)}
                >
                  <Download className="size-3.5" aria-hidden="true" />
                  {buildFileName(record.appTitle, record.version)}
                </Button>
              </div>
            ) : null}
          </div>

          <TabsContent value="preview" className="mt-3">
            <div className="relative overflow-hidden rounded-lg border border-border">
              {generating ? (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/85 backdrop-blur-sm">
                  <Loader2 className="size-6 animate-spin text-primary" aria-hidden="true" />
                  <p className="text-sm font-medium">{GENERATION_STAGES[stageIndex]}</p>
                  <p className="max-w-xs text-center text-xs text-muted-foreground">
                    智能体正在编写完整代码，通常需要 20–60 秒，请保持页面打开。
                  </p>
                </div>
              ) : null}
              <iframe
                key={signature}
                title="应用预览"
                srcDoc={html}
                sandbox="allow-scripts allow-modals"
                className="h-[460px] w-full border-0 bg-white"
              />
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="size-3.5" aria-hidden="true" />
              预览区可直接交互；游戏类应用请先用鼠标点击预览区域，再使用键盘操作。
            </p>
          </TabsContent>

          <TabsContent value="code" className="mt-3">
            <pre className="max-h-[460px] overflow-auto rounded-lg border border-border bg-muted/40 p-4 text-xs leading-relaxed">
              <code>{record?.html ?? ''}</code>
            </pre>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
