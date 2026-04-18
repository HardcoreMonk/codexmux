import { useState } from 'react';
import { Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import useIsMobileDevice from '@/hooks/use-is-mobile-device';
import MessageHistoryPopover from '@/components/features/workspace/message-history-popover';
import MessageHistoryDrawer from '@/components/features/workspace/message-history-drawer';
import type { IHistoryEntry } from '@/types/message-history';

interface IMessageHistoryPickerProps {
  entries: IHistoryEntry[];
  isLoading: boolean;
  isError: boolean;
  disabled: boolean;
  onFetch: () => void;
  onSelect: (message: string) => void;
  onDelete: (id: string) => void;
  onClose?: () => void;
}

const MessageHistoryPicker = ({
  entries,
  isLoading,
  isError,
  disabled,
  onFetch,
  onSelect,
  onDelete,
  onClose,
}: IMessageHistoryPickerProps) => {
  const t = useTranslations('terminal');
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobileDevice();

  const isEmpty = entries.length === 0 && !isLoading;

  const triggerButton = (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        'h-7 w-7 shrink-0 self-end p-0 text-muted-foreground hover:text-foreground hover:bg-muted',
        (disabled || isEmpty) && 'opacity-50 pointer-events-none',
      )}
      disabled={disabled || isEmpty}
      aria-label={t('messageHistory')}
    >
      <Clock size={16} />
    </Button>
  );

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) onClose?.();
  };

  const sharedProps = {
    open,
    onOpenChange: handleOpenChange,
    entries,
    isLoading,
    isError,
    onFetch,
    onSelect: (message: string) => {
      onSelect(message);
      setOpen(false);
    },
    onDelete,
    trigger: triggerButton,
  };

  if (isMobile) {
    return <MessageHistoryDrawer {...sharedProps} />;
  }

  return <MessageHistoryPopover {...sharedProps} />;
};

export default MessageHistoryPicker;
