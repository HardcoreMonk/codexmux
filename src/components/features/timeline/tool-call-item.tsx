import { useState, useMemo, memo } from 'react';
import { useTranslations } from 'next-intl';
import hljs from 'highlight.js/lib/common';
import {
  FileText,
  FilePen,
  FilePlus,
  Terminal,
  Search,
  Wrench,
  Users,
  Globe,
  SearchCode,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ITimelineToolCall, ITimelineToolResult, TToolName } from '@/types/timeline';

interface IToolCallItemProps {
  entry: ITimelineToolCall;
  result?: ITimelineToolResult;
}

const TOOL_ICONS: Record<string, typeof FileText> = {
  Read: FileText,
  Edit: FilePen,
  Write: FilePlus,
  Bash: Terminal,
  Grep: Search,
  Glob: Search,
  Agent: Users,
  WebSearch: Globe,
  WebFetch: Globe,
  ToolSearch: SearchCode,
};

const renderToolIcon = (toolName: TToolName, size: number) => {
  const IconComponent = TOOL_ICONS[toolName] ?? Wrench;
  return <IconComponent size={size} />;
};

const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'bash',
  json: 'json',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'ini',
  md: 'markdown',
  mdx: 'markdown',
  html: 'xml',
  xml: 'xml',
  svg: 'xml',
  vue: 'xml',
  css: 'css',
  scss: 'scss',
  sass: 'scss',
  less: 'less',
  sql: 'sql',
  dockerfile: 'dockerfile',
  lua: 'lua',
  pl: 'perl',
  r: 'r',
  dart: 'dart',
};

const detectLanguage = (filePath?: string): string | undefined => {
  if (!filePath) return undefined;
  const base = filePath.split('/').pop()?.toLowerCase() ?? '';
  if (base === 'dockerfile') return 'dockerfile';
  const ext = base.includes('.') ? base.split('.').pop() : undefined;
  if (!ext) return undefined;
  const lang = EXT_TO_LANG[ext];
  return lang && hljs.getLanguage(lang) ? lang : undefined;
};

const splitHighlightedLines = (html: string): string[] => {
  const tagRegex = /<span class="[^"]*">|<\/span>/g;
  const lines: string[] = [];
  const openStack: string[] = [];
  let cursor = 0;
  let lineBuffer = '';
  let match: RegExpExecArray | null;

  const flushLine = () => {
    const closing = '</span>'.repeat(openStack.length);
    const opening = openStack.join('');
    lines.push(opening + lineBuffer + closing);
    lineBuffer = '';
  };

  const appendText = (text: string) => {
    const segments = text.split('\n');
    for (let i = 0; i < segments.length; i += 1) {
      lineBuffer += segments[i];
      if (i < segments.length - 1) flushLine();
    }
  };

  while ((match = tagRegex.exec(html)) !== null) {
    if (match.index > cursor) {
      appendText(html.slice(cursor, match.index));
    }
    const tag = match[0];
    lineBuffer += tag;
    if (tag === '</span>') {
      openStack.pop();
    } else {
      openStack.push(tag);
    }
    cursor = match.index + tag.length;
  }
  if (cursor < html.length) {
    appendText(html.slice(cursor));
  }
  flushLine();
  return lines;
};

const highlightBlock = (code: string, language: string | undefined): string[] => {
  if (!language) return code.split('\n');
  try {
    const html = hljs.highlight(code, { language, ignoreIllegals: true }).value;
    return splitHighlightedLines(html);
  } catch {
    return code.split('\n');
  }
};

const DiffView = ({
  oldString,
  newString,
  filePath,
}: {
  oldString: string;
  newString: string;
  filePath?: string;
}) => {
  const { oldLines, newLines, useHtml } = useMemo(() => {
    const language = detectLanguage(filePath);
    return {
      oldLines: highlightBlock(oldString, language),
      newLines: highlightBlock(newString, language),
      useHtml: Boolean(language),
    };
  }, [oldString, newString, filePath]);

  const renderLine = (line: string) =>
    useHtml ? (
      <span className="hljs" dangerouslySetInnerHTML={{ __html: line || '\u200b' }} />
    ) : (
      <span>{line}</span>
    );

  return (
    <div className="mt-1.5 overflow-x-auto rounded border bg-ui-gray/5 font-mono text-xs whitespace-pre">
      {oldLines.map((line, i) => (
        <div key={`old-${i}`} className="bg-ui-red/10 px-3 py-0.5">
          <span className="mr-2 text-ui-red select-none">-</span>
          {renderLine(line)}
        </div>
      ))}
      {newLines.map((line, i) => (
        <div key={`new-${i}`} className="bg-ui-teal/10 px-3 py-0.5">
          <span className="mr-2 text-ui-teal select-none">+</span>
          {renderLine(line)}
        </div>
      ))}
    </div>
  );
};

const ToolCallItem = ({ entry, result }: IToolCallItemProps) => {
  const t = useTranslations('timeline');
  const [isDiffOpen, setIsDiffOpen] = useState(false);
  const hasDiff = entry.diff && (entry.diff.oldString || entry.diff.newString);

  const statusColor = {
    pending: 'text-ui-amber',
    success: 'text-muted-foreground',
    error: 'text-negative',
  }[entry.status];

  const statusPulse = entry.status === 'pending' ? 'animate-pulse' : '';

  return (
    <div className="py-1">
      <div className="flex items-start gap-1.5">
        <span className={cn('shrink-0 mt-0.5', statusColor, statusPulse)}>
          {renderToolIcon(entry.toolName, 12)}
        </span>
        <div className="min-w-0 flex-1">
          <span className="text-xs font-mono break-all block">{entry.summary}</span>
          {result && result.summary && (
            <p
              className={cn(
                'mt-0.5 text-xs whitespace-pre-wrap break-words font-mono',
                result.isError ? 'text-negative/70' : 'text-muted-foreground/60',
              )}
            >
              {result.summary}
            </p>
          )}
        </div>
      </div>
      {hasDiff && (
        <>
          <button
            className="ml-4 mt-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setIsDiffOpen((prev) => !prev)}
          >
            {isDiffOpen ? `▾ ${t('diffHide')}` : `▸ ${t('diffShow')}`}
          </button>
          {isDiffOpen && entry.diff && (
            <div className="ml-4">
              <DiffView
                oldString={entry.diff.oldString}
                newString={entry.diff.newString}
                filePath={entry.diff.filePath}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default memo(ToolCallItem);
