import { useState, useCallback, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Eye, EyeOff, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [rehypeHighlight];

interface IMarkdownEditorProps {
  fileName: string;
  initialContent: string;
  onSave: (content: string) => void;
  onCancel: () => void;
  isSaving: boolean;
}

const MarkdownEditor = ({
  fileName,
  initialContent,
  onSave,
  onCancel,
  isSaving,
}: IMarkdownEditorProps) => {
  const [content, setContent] = useState(initialContent);
  const [isPreview, setIsPreview] = useState(false);

  const hasChanges = content !== initialContent;

  const handleSave = useCallback(() => {
    onSave(content);
  }, [content, onSave]);

  const handleCancel = useCallback(() => {
    if (hasChanges) {
      if (!window.confirm('변경사항을 버리시겠습니까?')) return;
    }
    onCancel();
  }, [hasChanges, onCancel]);

  const togglePreview = useCallback(() => {
    setIsPreview((prev) => !prev);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <span className="flex-1 truncate text-sm font-medium">{fileName}</span>
        <Button variant="ghost" size="sm" onClick={togglePreview} className="h-7 gap-1 px-2 text-xs">
          {isPreview ? <EyeOff size={12} /> : <Eye size={12} />}
          {isPreview ? '편집' : '미리보기'}
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={handleSave}
          disabled={isSaving || !hasChanges}
          className="h-7 gap-1 px-2 text-xs"
        >
          <Save size={12} />
          저장
        </Button>
        <Button variant="ghost" size="sm" onClick={handleCancel} className="h-7 px-2 text-xs">
          <X size={12} />
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className={isPreview ? 'w-1/2 border-r' : 'w-full'}>
          <Textarea
            aria-label="마크다운 편집"
            className="h-full min-h-0 resize-none rounded-none border-0 font-mono text-sm focus-visible:ring-0"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </div>

        {isPreview && (
          <div className="w-1/2 overflow-y-auto px-4 py-4">
            <div className="prose prose-sm dark:prose-invert max-w-none break-words [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3">
              <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS}>
                {content}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(MarkdownEditor);
