import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { AlertCircle, CheckCircle2, Clock, HelpCircle, ShieldQuestion } from 'lucide-react';
import dayjs from 'dayjs';
import ApprovalActions from '@/components/features/agent/approval-actions';
import type { IChatMessage } from '@/types/agent';

const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [rehypeHighlight];

interface IChatBubbleProps {
  message: IChatMessage;
  isFailed?: boolean;
  approvalResolved?: 'approved' | 'rejected' | null;
  onResend?: () => void;
  onApproval?: (action: '승인' | '거부') => void;
}

const agentTypeLabels: Record<string, { icon: React.ReactNode; label: string } | null> = {
  report: null,
  question: {
    icon: <HelpCircle className="h-3 w-3 text-ui-amber" />,
    label: '질문',
  },
  done: {
    icon: <CheckCircle2 className="h-3 w-3 text-positive" />,
    label: '완료',
  },
  error: {
    icon: <AlertCircle className="h-3 w-3 text-negative" />,
    label: '오류',
  },
  approval: {
    icon: <ShieldQuestion className="h-3 w-3 text-ui-purple" />,
    label: '승인 요청',
  },
};

const ChatBubble = ({ message, isFailed, approvalResolved, onResend, onApproval }: IChatBubbleProps) => {
  const isUser = message.role === 'user';
  const time = dayjs(message.timestamp).format('HH:mm');
  const isQueued = message.metadata && 'queued' in message.metadata;

  if (isUser) {
    return (
      <div className="animate-in fade-in duration-150 flex justify-end" role="article" aria-label={`사용자 메시지, ${time}`}>
        <div className="flex max-w-[85%] flex-col items-end gap-1">
          <div className="rounded-lg bg-ui-blue/10 px-4 py-2.5 text-sm">
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
            <div className="mt-1 flex items-center justify-end gap-1">
              {isQueued && (
                <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/60">
                  <Clock className="h-2.5 w-2.5" />
                  큐잉됨
                </span>
              )}
              <span className="text-[10px] text-muted-foreground/60">{time}</span>
            </div>
          </div>
          {isFailed && (
            <button
              className="flex items-center gap-1 text-xs text-negative"
              onClick={onResend}
            >
              <AlertCircle className="h-3 w-3" />
              재전송
            </button>
          )}
        </div>
      </div>
    );
  }

  const typeLabel = agentTypeLabels[message.type] ?? null;

  return (
    <div className="animate-in fade-in duration-150" role="article" aria-label={`에이전트 메시지, ${time}`}>
      {typeLabel && (
        <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
          {typeLabel.icon}
          <span>{typeLabel.label}</span>
        </div>
      )}
      <div className="prose prose-sm dark:prose-invert max-w-none break-words text-sm [&_pre]:bg-muted [&_pre]:rounded-md [&_pre]:p-3 [&_pre_code]:text-foreground [&_code]:text-[0.9em] [&_code.hljs]:text-[1em] [&_code]:font-normal [&_code]:font-mono [&_code::before]:content-none [&_code::after]:content-none">
        <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS}>
          {message.content}
        </ReactMarkdown>
      </div>
      {message.type === 'approval' && onApproval && (
        <ApprovalActions onAction={onApproval} resolvedAs={approvalResolved} />
      )}
      <div className="mt-1">
        <span className="text-[10px] text-muted-foreground">{time}</span>
      </div>
    </div>
  );
};

export default memo(ChatBubble);
