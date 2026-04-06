import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Activity, AlertCircle, CheckCircle2, Clock, HelpCircle, Loader2, ShieldQuestion } from 'lucide-react';
import dayjs from 'dayjs';
import { useTranslations } from 'next-intl';
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

const agentTypeIcons: Record<string, React.ReactNode> = {
  question: <HelpCircle className="h-3 w-3 text-ui-amber" />,
  done: <CheckCircle2 className="h-3 w-3 text-positive" />,
  error: <AlertCircle className="h-3 w-3 text-negative" />,
  approval: <ShieldQuestion className="h-3 w-3 text-ui-purple" />,
  activity: <Activity className="h-3 w-3 text-muted-foreground/60" />,
};

const agentTypeLabelKeys: Record<string, string> = {
  question: 'typeQuestion',
  done: 'typeDone',
  error: 'typeError',
  approval: 'typeApproval',
};

const ChatBubble = ({ message, isFailed, approvalResolved, onResend, onApproval }: IChatBubbleProps) => {
  const t = useTranslations('agent');
  const isUser = message.role === 'user';
  const time = dayjs(message.timestamp).format('HH:mm');
  const isQueued = message.metadata && 'queued' in message.metadata;

  if (isUser) {
    return (
      <div className="animate-in fade-in duration-150 flex justify-end" role="article" aria-label={t('userMessageAria', { time })}>
        <div className="flex max-w-[85%] flex-col items-end gap-1">
          <div className="rounded-lg bg-ui-blue/10 px-4 py-2.5 text-sm">
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
            <div className="mt-1 flex items-center justify-end gap-1">
              {isQueued && (
                <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/60">
                  <Clock className="h-2.5 w-2.5" />
                  {t('queued')}
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
              {t('resend')}
            </button>
          )}
        </div>
      </div>
    );
  }

  const typeLabelKey = agentTypeLabelKeys[message.type];
  const typeIcon = agentTypeIcons[message.type];
  const hasTypeLabel = typeLabelKey && typeIcon;

  if (message.type === 'activity') {
    return (
      <div className="animate-in fade-in duration-150 flex items-center gap-1.5 py-1 text-xs text-muted-foreground/60" role="article" aria-label={t('agentActivityAria', { time })}>
        <Activity className="h-3 w-3" />
        <span>{message.content}</span>
        <span className="text-[10px] text-muted-foreground/40">{time}</span>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-150" role="article" aria-label={t('agentMessageAria', { time })}>
      {hasTypeLabel && (
        <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
          {typeIcon}
          <span>{t(typeLabelKey)}</span>
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
