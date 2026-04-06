import { memo, useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import dayjs from 'dayjs';
import { useTranslations } from 'next-intl';
import { FileText, Pencil, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import MarkdownEditor from '@/components/features/agent/markdown-editor';

const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [rehypeHighlight];

interface IMemoryViewerProps {
  selectedPath: string | null;
  content: string | null;
  sizeBytes: number | null;
  modifiedAt: string | null;
  isLoading: boolean;
  error: string | null;
  isEditing: boolean;
  isSaving: boolean;
  onEdit: () => void;
  onSave: (content: string) => void;
  onCancelEdit: () => void;
  onRetry: () => void;
}

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

const extractAgent = (filePath: string): string | null => {
  const first = filePath.split('/')[0];
  return first && first !== 'shared' ? first : null;
};

const COLLAPSE_HEIGHT = 400;

const CollapsibleToggle = ({ isExpanded, toggle }: { isExpanded: boolean; toggle: () => void }) => {
  const t = useTranslations('agent');
  return (
    <div className="flex justify-center py-2">
      <Button variant="ghost" size="sm" onClick={toggle} className="h-7 gap-1 text-xs text-muted-foreground">
        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {isExpanded ? t('collapse') : t('expand')}
      </Button>
    </div>
  );
};

const CollapsibleContent = ({ children }: { children: React.ReactNode }) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isOverflow, setIsOverflow] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const el = contentRef.current;
    if (el) {
      setIsOverflow(el.scrollHeight > COLLAPSE_HEIGHT);
      setIsExpanded(false);
    }
  }, [children]);

  const toggle = useCallback(() => setIsExpanded((prev) => !prev), []);

  return (
    <div className="relative">
      <div
        ref={contentRef}
        className="overflow-hidden transition-[max-height] duration-200"
        style={{ maxHeight: isOverflow && !isExpanded ? `${COLLAPSE_HEIGHT}px` : 'none' }}
      >
        {children}
      </div>
      {isOverflow && !isExpanded && (
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background to-transparent" />
      )}
      {isOverflow && (
        <CollapsibleToggle isExpanded={isExpanded} toggle={toggle} />
      )}
    </div>
  );
};

const EmptyState = () => {
  const t = useTranslations('agent');
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4">
      <FileText className="h-8 w-8 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">{t('memoryEmpty')}</p>
      <p className="text-sm text-muted-foreground">{t('memoryEmptySub')}</p>
    </div>
  );
};

const LoadingState = () => (
  <div className="space-y-3 p-4">
    <Skeleton className="h-4 w-48" />
    <Skeleton className="h-3 w-full" />
    <Skeleton className="h-3 w-3/4" />
    <Skeleton className="h-3 w-5/6" />
    <Skeleton className="h-3 w-2/3" />
  </div>
);

interface IErrorViewProps {
  error: string;
  path: string;
  onRetry: () => void;
}

const ErrorView = ({ error, path, onRetry }: IErrorViewProps) => {
  const tc = useTranslations('common');
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4">
      <FileText className="h-8 w-8 text-negative/40" />
      <p className="text-sm text-muted-foreground">{error}</p>
      <p className="text-xs text-muted-foreground">{path}</p>
      <Button variant="outline" size="sm" onClick={onRetry} className="gap-1">
        <RefreshCw size={12} />
        {tc('retry')}
      </Button>
    </div>
  );
};

const MemoryViewer = ({
  selectedPath,
  content,
  sizeBytes,
  modifiedAt,
  isLoading,
  error,
  isEditing,
  isSaving,
  onEdit,
  onSave,
  onCancelEdit,
  onRetry,
}: IMemoryViewerProps) => {
  const t = useTranslations('agent');
  if (!selectedPath) return <EmptyState />;

  if (isLoading) return <LoadingState />;

  if (error) return <ErrorView error={error} path={selectedPath} onRetry={onRetry} />;

  const fileName = selectedPath.split('/').pop() ?? selectedPath;

  if (isEditing && content !== null) {
    return (
      <MarkdownEditor
        fileName={fileName}
        initialContent={content}
        onSave={onSave}
        onCancel={onCancelEdit}
        isSaving={isSaving}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <span className="flex-1 truncate text-sm font-medium">{fileName}</span>
        <Button variant="outline" size="sm" onClick={onEdit} className="h-7 gap-1 px-2 text-xs">
          <Pencil size={12} />
          {t('editLabel')}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <CollapsibleContent>
          <div className="prose prose-sm dark:prose-invert max-w-none break-words [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3">
            <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS}>
              {content ?? ''}
            </ReactMarkdown>
          </div>
        </CollapsibleContent>
      </div>

      {(sizeBytes !== null || modifiedAt || selectedPath) && (
        <div className="flex gap-4 border-t px-4 py-2 text-xs text-muted-foreground">
          {sizeBytes !== null && <span>{t('sizeLabel', { size: formatBytes(sizeBytes) })}</span>}
          {modifiedAt && <span>{t('modifiedLabel', { date: dayjs(modifiedAt).format('YYYY-MM-DD HH:mm') })}</span>}
          {selectedPath && extractAgent(selectedPath) && (
            <span>{t('agentLabel', { name: extractAgent(selectedPath)! })}</span>
          )}
        </div>
      )}
    </div>
  );
};

export default memo(MemoryViewer);
