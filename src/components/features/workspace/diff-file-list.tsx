import { useCallback, useMemo, useState } from 'react';
import { useTheme } from 'next-themes';
import { ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { DiffView, DiffModeEnum, getLang } from '@git-diff-view/react';
import { parseMultiFileDiff, getDisplayName, buildFileDiffString } from '@/lib/parse-git-diff';
import useConfigStore from '@/hooks/use-config-store';
import useIsMobile from '@/hooks/use-is-mobile';

type TViewMode = 'split' | 'unified';

interface IDiffFileListProps {
  diff: string;
  viewMode: TViewMode;
}

const DIFF_FONT_SIZE: Record<string, number> = {
  normal: 11,
  large: 13,
  'x-large': 15,
};

const DiffFileList = ({ diff, viewMode }: IDiffFileListProps) => {
  const { resolvedTheme } = useTheme();
  const theme: 'light' | 'dark' = resolvedTheme === 'light' ? 'light' : 'dark';
  const isMobile = useIsMobile();
  const fontSize = useConfigStore((s) => s.fontSize);
  const diffFontSize = DIFF_FONT_SIZE[fontSize] ?? DIFF_FONT_SIZE.normal;

  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const toggle = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const files = useMemo(() => {
    if (!diff) return [];
    return parseMultiFileDiff(diff).map((f, i) => {
      const displayName = getDisplayName(f);
      const lang = getLang(displayName);
      const renderable = !f.isBinary && f.hunks.length > 0;
      return {
        key: `${displayName}#${i}`,
        source: f,
        displayName,
        data: renderable
          ? {
              oldFile: { fileName: f.oldName, fileLang: lang },
              newFile: { fileName: f.newName, fileLang: lang },
              hunks: [buildFileDiffString(f)],
            }
          : null,
      };
    });
  }, [diff]);

  const totals = useMemo(() => {
    let add = 0;
    let del = 0;
    for (const f of files) {
      add += f.source.additions;
      del += f.source.deletions;
    }
    return { files: files.length, add, del };
  }, [files]);

  const effectiveMode: TViewMode = isMobile ? 'unified' : viewMode;

  if (files.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 p-2 text-xs">
      <div className="flex items-center gap-3 px-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <FileText className="h-3 w-3" />
          {totals.files}
        </span>
        {totals.add > 0 && <span className="text-ui-teal">+{totals.add}</span>}
        {totals.del > 0 && <span className="text-ui-red">-{totals.del}</span>}
      </div>

      {files.map((f) => {
        const isCollapsed = collapsed.has(f.key);
        return (
          <div key={f.key} className="overflow-hidden rounded border border-border bg-card">
            <button
              type="button"
              onClick={() => toggle(f.key)}
              className="sticky top-0 z-10 flex w-full items-center gap-2 border-b border-border bg-secondary px-3 py-1.5 text-left hover:bg-accent"
            >
              {isCollapsed
                ? <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                : <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />}
              <span className="truncate font-mono text-xs text-foreground">{f.displayName}</span>
              {f.source.isNew && <span className="rounded bg-ui-teal/15 px-1 text-[10px] text-ui-teal">NEW</span>}
              {f.source.isDeleted && <span className="rounded bg-ui-red/15 px-1 text-[10px] text-ui-red">DEL</span>}
              {f.source.isRenamed && <span className="rounded bg-ui-blue/15 px-1 text-[10px] text-ui-blue">RENAME</span>}
              <span className="ml-auto flex items-center gap-2 text-[11px]">
                {f.source.additions > 0 && <span className="text-ui-teal">+{f.source.additions}</span>}
                {f.source.deletions > 0 && <span className="text-ui-red">-{f.source.deletions}</span>}
              </span>
            </button>
            {!isCollapsed && (
              f.data ? (
                <DiffView
                  data={f.data}
                  diffViewMode={effectiveMode === 'unified' ? DiffModeEnum.Unified : DiffModeEnum.Split}
                  diffViewTheme={theme}
                  diffViewHighlight
                  diffViewWrap={isMobile}
                  diffViewFontSize={diffFontSize}
                />
              ) : (
                <div className="px-3 py-2 text-muted-foreground">
                  {f.source.isBinary ? 'Binary file' : 'No diff content'}
                </div>
              )
            )}
          </div>
        );
      })}
    </div>
  );
};

export default DiffFileList;
