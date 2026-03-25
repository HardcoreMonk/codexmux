import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/ko';
import { Loader2, X } from 'lucide-react';
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
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (open) {
      onFetch();
      setSearch('');
    }
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
          <CommandInput placeholder="히스토리 검색..." value={search} onValueChange={setSearch} />
          <CommandList className="max-h-[300px]">
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : isError ? (
              <div className="flex flex-col items-center gap-2 py-6 text-sm text-muted-foreground">
                <span>불러오기 실패</span>
                <Button variant="outline" size="sm" onClick={onFetch}>
                  다시 시도
                </Button>
              </div>
            ) : (
              <>
                <CommandEmpty>{search ? '검색 결과가 없습니다' : '히스토리가 없습니다'}</CommandEmpty>
                <CommandGroup>
                  {entries.map((entry) => (
                    <CommandItem
                      key={entry.id}
                      value={entry.message}
                      onSelect={() => handleSelect(entry)}
                      className="group"
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
                        aria-label="삭제"
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
