import { History, Loader2, RefreshCw } from 'lucide-react';
import { CATEGORY_TONES, formatTime, isBuiltinRecord, type HistoryItem } from '@/lib/agent';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type HistoryPanelProps = {
  items: HistoryItem[];
  loading: boolean;
  error: string;
  activeId: number | null;
  examplePrompt: string;
  onReload: () => void;
  onOpen: (item: HistoryItem) => void;
  onRefill: (item: HistoryItem) => void;
  onDelete: (item: HistoryItem) => void;
  onUseExample: (prompt: string) => void;
};

export default function HistoryPanel({
  items,
  loading,
  error,
  activeId,
  examplePrompt,
  onReload,
  onOpen,
  onRefill,
  onDelete,
  onUseExample,
}: HistoryPanelProps) {
  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4 text-primary" aria-hidden="true" />
          生成历史
        </CardTitle>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="!bg-transparent"
          onClick={onReload}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="size-4" aria-hidden="true" />
          )}
          刷新
        </Button>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-start gap-3 rounded-lg bg-destructive/10 p-4">
            <p className="text-sm">历史记录加载失败：{error}</p>
            <Button type="button" variant="outline" size="sm" className="!bg-transparent" onClick={onReload}>
              重新加载
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <p className="text-sm font-medium">还没有生成记录</p>
            <p className="max-w-md text-sm text-muted-foreground">
              在上方描述你想做的应用或小游戏，生成结果会自动保存到这里，随时可以重新打开预览或按指令继续迭代。
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 !bg-transparent"
              onClick={() => onUseExample(examplePrompt)}
            >
              试试「{examplePrompt}」
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">#</TableHead>
                  <TableHead>描述</TableHead>
                  <TableHead className="w-40">应用</TableHead>
                  <TableHead className="w-24">分类</TableHead>
                  <TableHead className="w-28">来源</TableHead>
                  <TableHead className="w-44">生成时间</TableHead>
                  <TableHead className="w-52 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => {
                  const builtin = isBuiltinRecord(item);
                  return (
                    <TableRow
                      key={item.id}
                      className={item.id === activeId ? 'bg-accent/60' : undefined}
                    >
                      <TableCell className="tabular-nums text-muted-foreground">
                        {index + 1}
                      </TableCell>
                      <TableCell className="max-w-[20rem] truncate" title={item.description}>
                        {item.description}
                      </TableCell>
                      <TableCell className="max-w-[10rem] truncate" title={item.app_title ?? ''}>
                        {item.app_title || (builtin ? '内置示例' : '—')}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`font-normal ${CATEGORY_TONES[item.category ?? ''] ?? ''}`}
                          variant="secondary"
                        >
                          {item.category || '其他'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {builtin ? '内置模板' : '智能体生成'}
                          {item.version && item.version > 1 ? ` · v${item.version}` : ''}
                        </span>
                      </TableCell>
                      <TableCell className="tabular-nums text-sm text-muted-foreground">
                        {formatTime(item.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="!bg-transparent"
                            onClick={() => onOpen(item)}
                          >
                            打开
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => onRefill(item)}
                          >
                            回填
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => onDelete(item)}
                          >
                            删除
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
