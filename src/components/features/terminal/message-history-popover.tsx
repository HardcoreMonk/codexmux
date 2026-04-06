import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/ko';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command';
import type { IHistoryEntry } from '@/types/message-history';

dayjs.extend(relativeTime);
dayjs.locale('ko');

interface IMessageHistoryPopoverProps {
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

const MessageHistoryPopover = ({
  open,
  onOpenChange,
  entries,
  isLoading,
  isError,
  onFetch,
  onSelect,
  onDelete,
  trigger,
}: IMessageHistoryPopoverProps) => {
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
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger render={trigger as React.ReactElement} />
      <PopoverContent side="top" align="start" sideOffset={8} className="w-80 p-0">
        <Command className="rounded-lg" shouldFilter>
          <CommandInput placeholder={t('searchPlaceholder')} value={search} onValueChange={setSearch} />
          <CommandList className="max-h-[300px]">
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
                      className="group [&>svg.ml-auto]:hidden"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {entry.message.split('\n')[0]}
                      </span>
                      <span className="ml-2 shrink-0 text-xs text-muted-foreground whitespace-nowrap">
                        {dayjs(entry.sentAt).fromNow()}
                      </span>
                      <button
                        type="button"
                        className="ml-1 shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
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
      </PopoverContent>
    </Popover>
  );
};

export default MessageHistoryPopover;
