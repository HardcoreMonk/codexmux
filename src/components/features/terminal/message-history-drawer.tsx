import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/ko';
import { Loader2, X } from 'lucide-react';
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

dayjs.extend(relativeTime);
dayjs.locale('ko');

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
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerTrigger asChild>{trigger}</DrawerTrigger>
      <DrawerContent className="max-h-[60vh]">
        <DrawerHeader className="sr-only">
          <DrawerTitle>메시지 히스토리</DrawerTitle>
        </DrawerHeader>
        <Command className="rounded-none" shouldFilter>
          <div className="p-2 pb-0">
            <CommandInput placeholder="히스토리 검색..." value={search} onValueChange={setSearch} />
          </div>
          <CommandList className="max-h-[50vh] p-2">
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
                      className="group min-h-[44px]"
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
      </DrawerContent>
    </Drawer>
  );
};

export default MessageHistoryDrawer;
