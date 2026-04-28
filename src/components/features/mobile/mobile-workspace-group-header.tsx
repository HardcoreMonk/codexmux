import { useCallback, useState, memo, type KeyboardEvent } from 'react';
import { ChevronDown, ChevronRight, MoreHorizontal, Pencil, FolderMinus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { IWorkspaceGroup } from '@/types/terminal';

interface IMobileWorkspaceGroupHeaderProps {
  group: IWorkspaceGroup;
  count: number;
  onToggle: (groupId: string) => void;
  onRenameRequest: (groupId: string) => void;
  onUngroup: (groupId: string) => void;
}

const MobileWorkspaceGroupHeader = ({
  group,
  count,
  onToggle,
  onRenameRequest,
  onUngroup,
}: IMobileWorkspaceGroupHeaderProps) => {
  const t = useTranslations('sidebar');
  const [menuOpen, setMenuOpen] = useState(false);

  const handleToggle = useCallback(() => {
    onToggle(group.id);
  }, [group.id, onToggle]);

  const handleHeaderKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    handleToggle();
  }, [handleToggle]);

  const handleRenameAction = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    onRenameRequest(group.id);
  }, [group.id, onRenameRequest]);

  const handleUngroupAction = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    onUngroup(group.id);
  }, [group.id, onUngroup]);

  const Icon = group.collapsed ? ChevronRight : ChevronDown;

  return (
    <div
      className="flex min-h-8 touch-manipulation cursor-pointer items-center gap-2 px-4 py-1 text-xs font-medium tracking-wide text-muted-foreground transition-colors hover:bg-accent/40 active:bg-accent/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      onClick={handleToggle}
      onKeyDown={handleHeaderKeyDown}
      role="button"
      tabIndex={0}
      aria-expanded={!group.collapsed}
    >
      <Icon size={12} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">
        {group.name} <span className="text-muted-foreground/60">({count})</span>
      </span>
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger
          render={
            <button
              className="flex h-6 w-6 shrink-0 touch-manipulation items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent/50 active:bg-accent/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              onClick={(e) => e.stopPropagation()}
              aria-label={t('renameGroup')}
            />
          }
        >
          <MoreHorizontal size={14} />
        </PopoverTrigger>
        <PopoverContent side="bottom" align="end" className="w-44 gap-0 p-1">
          <button
            className="flex w-full touch-manipulation items-center gap-2 rounded px-2 py-2 text-left text-sm transition-colors hover:bg-accent active:bg-accent/70 focus-visible:outline-none"
            onClick={handleRenameAction}
          >
            <Pencil size={14} />
            {t('renameGroup')}
          </button>
          <button
            className="flex w-full touch-manipulation items-center gap-2 rounded px-2 py-2 text-left text-sm transition-colors hover:bg-accent active:bg-accent/70 focus-visible:outline-none"
            onClick={handleUngroupAction}
          >
            <FolderMinus size={14} />
            {t('ungroup')}
          </button>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default memo(MobileWorkspaceGroupHeader);
