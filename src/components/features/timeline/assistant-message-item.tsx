import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { ITimelineAssistantMessage } from '@/types/timeline';

interface IAssistantMessageItemProps {
  entry: ITimelineAssistantMessage;
}

const AssistantMessageItem = ({ entry }: IAssistantMessageItemProps) => (
  <div className="animate-in fade-in duration-150">
    <div className="prose prose-sm dark:prose-invert max-w-none text-sm [&_pre]:bg-muted [&_pre]:rounded-md [&_pre]:p-3 [&_code]:text-sm [&_code]:font-mono [&_code::before]:content-none [&_code::after]:content-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {entry.markdown ?? ''}
      </ReactMarkdown>
    </div>
  </div>
);

export default AssistantMessageItem;
