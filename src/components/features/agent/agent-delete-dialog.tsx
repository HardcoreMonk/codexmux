import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Spinner from '@/components/ui/spinner';
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
  const t = useTranslations('agent');
  const tc = useTranslations('common');
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
          <DialogTitle>{t('deleteTitle')}</DialogTitle>
          <DialogDescription>
            {t('deleteDescription', { name: agentName })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <p className="text-sm text-muted-foreground">{t('deleteConfirmHint')}</p>
          <Input
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={agentName}
            autoFocus
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isDeleting}>
            {tc('cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!nameMatches || isDeleting}
          >
            {isDeleting ? (
              <>
                <Spinner className="h-3 w-3" />
                {t('deleting')}
              </>
            ) : (
              tc('delete')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AgentDeleteDialog;
