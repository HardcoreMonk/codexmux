import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface IAgentDeleteDialogProps {
  agentName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
}

const AgentDeleteDialog = ({ agentName, open, onOpenChange, onConfirm }: IAgentDeleteDialogProps) => {
  const [confirmName, setConfirmName] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setConfirmName('');
      setIsDeleting(false);
    }
    onOpenChange(nextOpen);
  };

  const nameMatches = confirmName === agentName;

  const handleDelete = async () => {
    if (!nameMatches) return;
    setIsDeleting(true);
    await onConfirm();
    setIsDeleting(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" aria-live="assertive">
        <DialogHeader>
          <DialogTitle>에이전트 삭제</DialogTitle>
          <DialogDescription>
            &ldquo;{agentName}&rdquo;을 삭제하면 채팅 이력과 메모리가 모두 삭제됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <p className="text-sm text-muted-foreground">확인을 위해 에이전트 이름을 입력하세요</p>
          <Input
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={agentName}
            autoFocus
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isDeleting}>
            취소
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!nameMatches || isDeleting}
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                삭제 중
              </>
            ) : (
              '삭제'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AgentDeleteDialog;
