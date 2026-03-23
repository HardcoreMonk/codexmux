import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { ITimelineAssistantMessage } from '@/types/timeline';

const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [rehypeHighlight];

interface IAssistantMessageItemProps {
  entry: ITimelineAssistantMessage;
}

const AssistantMessageItem = ({ entry }: IAssistantMessageItemProps) => (
  <div className="animate-in fade-in duration-150">
    <div className="prose prose-sm dark:prose-invert max-w-none text-sm [&_pre]:bg-muted [&_pre]:rounded-md [&_pre]:p-3 [&_pre_code]:text-foreground [&_code]:text-[13px] [&_code]:font-normal [&_code]:font-mono [&_code::before]:content-none [&_code::after]:content-none">
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS}>
        {entry.markdown ?? ''}
      </ReactMarkdown>
    </div>
  </div>
);

export default AssistantMessageItem;
