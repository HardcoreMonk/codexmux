import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

interface IPaneClaudeModePromptProps {
  onSwitch: () => void;
  onDismiss: () => void;
}

const PaneClaudeModePrompt = ({ onSwitch, onDismiss }: IPaneClaudeModePromptProps) => {
  const t = useTranslations('terminal');
  const tc = useTranslations('common');

  return (
    <div className="absolute right-3 bottom-3 z-20 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-lg animate-[fadeIn_200ms_ease-out]">
      <span className="text-xs text-muted-foreground">{t('switchToClaudeMode')}</span>
      <Button
        variant="default"
        size="sm"
        className="h-6 px-2 text-[11px]"
        onClick={onSwitch}
      >
        {t('switchMode')}
      </Button>
      <button
        className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
        onClick={onDismiss}
        aria-label={tc('close')}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

export default PaneClaudeModePrompt;
