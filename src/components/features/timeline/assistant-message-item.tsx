import { memo, type AnchorHTMLAttributes } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { ITimelineAssistantMessage } from '@/types/timeline';

const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [rehypeHighlight];
const MARKDOWN_COMPONENTS = {
  a: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props} target="_blank" rel="noopener noreferrer" />
  ),
};

interface IAssistantMessageItemProps {
  entry: ITimelineAssistantMessage;
}

const AssistantMessageItem = ({ entry }: IAssistantMessageItemProps) => (
  <div className="animate-in fade-in duration-150">
    <div className="prose prose-sm dark:prose-invert max-w-none break-words text-sm [&_h1]:text-[1.6em] [&_h1]:mt-[1.4em] [&_h1]:mb-[0.6em] [&_pre]:bg-muted [&_pre]:rounded-md [&_pre]:p-3 [&_pre_code]:text-foreground [&_code]:text-[0.9em] [&_code.hljs]:text-[1em] [&_code]:font-normal [&_code]:font-mono [&_code::before]:content-none [&_code::after]:content-none">
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={MARKDOWN_COMPONENTS}
      >
        {entry.markdown ?? ''}
      </ReactMarkdown>
    </div>
  </div>
);

export default memo(AssistantMessageItem);
