import { MessageSquare, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ISessionEmptyViewProps {
  onClose?: () => void;
}

const SessionEmptyView = ({ onClose }: ISessionEmptyViewProps) => (
  <div className="relative flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
    {onClose && (
      <Button
        variant="ghost"
        size="sm"
        className="absolute top-2 right-2 h-7 w-7 p-0 text-muted-foreground"
        onClick={onClose}
        aria-label="닫기"
      >
        <X size={14} />
      </Button>
    )}
    <MessageSquare size={32} className="opacity-50" />
    <div className="text-center">
      <p className="text-sm font-medium">세션 없음</p>
      <p className="mt-1 text-xs opacity-70">
        터미널에서 claude를 실행하여
        <br />
        새 세션을 시작하세요
      </p>
    </div>
  </div>
);

export default SessionEmptyView;
