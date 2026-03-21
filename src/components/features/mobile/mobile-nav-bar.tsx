import { Menu, Terminal } from 'lucide-react';
import type { TPanelType } from '@/types/terminal';

interface IMobileNavBarProps {
  workspaceName: string;
  surfaceName: string;
  panelType: TPanelType;
  onMenuOpen: () => void;
  onTogglePanel: () => void;
}

const MobileNavBar = ({
  workspaceName,
  surfaceName,
  panelType,
  onMenuOpen,
  onTogglePanel,
}: IMobileNavBarProps) => {
  const isClaudeCode = panelType === 'claude-code';

  return (
    <div
      className="flex shrink-0 items-center border-b bg-background"
      style={{
        borderBottomWidth: '0.5px',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <button
        className="flex h-11 w-11 shrink-0 items-center justify-center text-foreground"
        onClick={onMenuOpen}
        aria-label="메뉴 열기"
      >
        <Menu size={20} />
      </button>

      <div className="flex min-w-0 flex-1 items-center justify-center px-2">
        <span className="truncate text-sm font-medium">
          <span className="text-muted-foreground">{workspaceName}</span>
          <span className="text-muted-foreground"> / </span>
          <span className="text-foreground">{surfaceName}</span>
        </span>
      </div>

      {isClaudeCode ? (
        <button
          className="flex h-11 w-11 shrink-0 items-center justify-center"
          onClick={onTogglePanel}
          aria-label="터미널 보기"
        >
          <Terminal size={18} className="text-muted-foreground" />
        </button>
      ) : (
        <div className="w-11 shrink-0" />
      )}
    </div>
  );
};

export default MobileNavBar;
