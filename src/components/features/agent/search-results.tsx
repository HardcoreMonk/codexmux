import { memo, useCallback } from 'react';
import { FileText } from 'lucide-react';
import type { IMemorySearchResult } from '@/types/memory';

interface IHighlightedTextProps {
  text: string;
  query: string;
}

const HighlightedText = ({ text, query }: IHighlightedTextProps) => {
  if (!query) return <>{text}</>;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);

  if (idx === -1) return <>{text}</>;

  return (
    <>
      {text.slice(0, idx)}
      <span className="rounded bg-ui-amber/20">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
};

interface ISearchResultsProps {
  results: IMemorySearchResult[];
  query: string;
  onFileSelect: (path: string) => void;
}

const SearchResults = ({ results, query, onFileSelect }: ISearchResultsProps) => {
  const handleClick = useCallback(
    (filePath: string) => {
      onFileSelect(filePath);
    },
    [onFileSelect],
  );

  if (results.length === 0) {
    return (
      <div className="px-3 py-8 text-center">
        <p className="text-sm text-muted-foreground">검색 결과가 없습니다</p>
      </div>
    );
  }

  return (
    <div className="space-y-1 px-1">
      {results.map((result) => (
        <div key={result.path}>
          <button
            type="button"
            className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left hover:bg-muted/50"
            onClick={() => handleClick(result.path)}
          >
            <FileText size={14} className="shrink-0 text-muted-foreground" />
            <span className="truncate text-sm font-medium">{result.fileName}</span>
          </button>
          {result.matches.slice(0, 3).map((match) => (
            <button
              key={`${result.path}:${match.line}`}
              type="button"
              className="ml-4 block w-full truncate rounded px-2 py-0.5 text-left text-xs text-muted-foreground hover:bg-muted/50"
              onClick={() => handleClick(result.path)}
            >
              <HighlightedText text={match.content} query={query} />
            </button>
          ))}
        </div>
      ))}
    </div>
  );
};

export default memo(SearchResults);
