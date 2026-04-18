import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import dayjs from 'dayjs';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command';
import type { IHistoryEntry } from '@/types/message-history';

interface IMessageHistoryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: IHistoryEntry[];
  isLoading: boolean;
  isError: boolean;
  onFetch: () => void;
  onSelect: (message: string) => void;
  onDelete: (id: string) => void;
  trigger: React.ReactNode;
}

const MessageHistoryDrawer = ({
  open,
  onOpenChange,
  entries,
  isLoading,
  isError,
  onFetch,
  onSelect,
  onDelete,
  trigger,
}: IMessageHistoryDrawerProps) => {
  const t = useTranslations('messageHistory');
  const [search, setSearch] = useState('');
  const [prevOpen, setPrevOpen] = useState(false);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setSearch('');
  }

  useEffect(() => {
    if (open) onFetch();
  }, [open, onFetch]);

  const handleSelect = (entry: IHistoryEntry) => {
    onSelect(entry.message);
    onOpenChange(false);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    onDelete(id);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerTrigger asChild>{trigger}</DrawerTrigger>
      <DrawerContent className="max-h-[60vh]">
        <DrawerHeader className="sr-only">
          <DrawerTitle>{t('title')}</DrawerTitle>
        </DrawerHeader>
        <Command className="rounded-none" shouldFilter>
          <div className="p-2 pb-0">
            <CommandInput placeholder={t('searchPlaceholder')} value={search} onValueChange={setSearch} />
          </div>
          <CommandList className="max-h-[50vh] p-2" data-vaul-no-drag>
            {isLoading && entries.length === 0 ? (
              <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                {t('loading')}
              </div>
            ) : isError ? (
              <div className="flex flex-col items-center gap-2 py-6 text-sm text-muted-foreground">
                <span>{t('fetchError')}</span>
                <Button variant="outline" size="sm" onClick={onFetch}>
                  {t('retry')}
                </Button>
              </div>
            ) : (
              <>
                <CommandEmpty>{search ? t('noSearchResults') : t('noHistory')}</CommandEmpty>
                <CommandGroup>
                  {entries.map((entry) => (
                    <CommandItem
                      key={entry.id}
                      value={entry.message}
                      onSelect={() => handleSelect(entry)}
                      className="group min-h-[44px] [&>svg.ml-auto]:hidden"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {entry.message.split('\n')[0]}
                      </span>
                      <span className="ml-2 shrink-0 text-xs text-muted-foreground whitespace-nowrap">
                        {dayjs(entry.sentAt).fromNow()}
                      </span>
                      <button
                        type="button"
                        className="ml-1 shrink-0 rounded p-0.5 hover:bg-muted"
                        onClick={(e) => handleDelete(e, entry.id)}
                        aria-label={t('deleteLabel')}
                      >
                        <X className="size-3" />
                      </button>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </DrawerContent>
    </Drawer>
  );
};

export default MessageHistoryDrawer;
