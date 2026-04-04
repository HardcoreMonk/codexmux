import { useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { AlertCircle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import type { IBlockReasonResponse } from '@/types/mission';

interface IBlockedPopoverProps {
  agentId: string;
  missionId: string;
  taskId: string;
  children: React.ReactNode;
}

const BlockedPopover = ({ agentId, missionId, taskId, children }: IBlockedPopoverProps) => {
  const router = useRouter();
  const [reason, setReason] = useState<IBlockReasonResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);

  const fetchReason = useCallback(async () => {
    if (reason) return;
    setIsLoading(true);
    setError(false);
    try {
      const res = await fetch(
        `/api/agent/${agentId}/missions/${missionId}/tasks/${taskId}/block-reason`,
      );
      if (!res.ok) throw new Error();
      const data: IBlockReasonResponse = await res.json();
      setReason(data);
    } catch {
      setError(true);
    } finally {
      setIsLoading(false);
    }
  }, [agentId, missionId, taskId, reason]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) fetchReason();
    },
    [fetchReason],
  );

  const handleChatNavigate = useCallback(() => {
    const query = reason?.chatMessageId ? `?messageId=${reason.chatMessageId}` : '';
    router.push(`/agents/${agentId}/chat${query}`);
  }, [router, agentId, reason]);

  return (
    <Popover onOpenChange={handleOpenChange}>
      <PopoverTrigger className="w-full text-left">{children}</PopoverTrigger>
      <PopoverContent className="w-72" align="start">
        <div className="flex items-center gap-1.5">
          <AlertCircle size={12} className="text-ui-amber" />
          <span className="text-xs font-medium text-ui-amber">사용자 확인 필요</span>
        </div>

        <div className="mt-1 text-sm text-muted-foreground">
          {isLoading && '불러오는 중...'}
          {error && '정보를 불러올 수 없습니다'}
          {reason && `"${reason.reason}"`}
        </div>

        <Button variant="outline" size="sm" className="mt-3 w-full" onClick={handleChatNavigate}>
          채팅에서 답변하기
        </Button>
      </PopoverContent>
    </Popover>
  );
};

export default BlockedPopover;
