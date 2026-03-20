import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface ISessionEndedOverlayProps {
  visible: boolean;
  onNewSession: () => void;
}

const SessionEndedOverlay = ({
  visible,
  onNewSession,
}: ISessionEndedOverlayProps) => (
  <div
    className={cn(
      'absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-3 bg-[#1e1f29]/90 pb-8 pt-6 transition-opacity duration-150',
      visible ? 'opacity-100' : 'pointer-events-none opacity-0',
    )}
  >
    <span className="text-sm text-zinc-400">세션이 종료되었습니다.</span>
    <Button variant="outline" size="sm" onClick={onNewSession}>
      새 세션 시작
    </Button>
  </div>
);

export default SessionEndedOverlay;
