import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import Spinner from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useShallow } from 'zustand/react/shallow';
import useAgentStore, { selectAgentList } from '@/hooks/use-agent-store';
import { AVATAR_OPTIONS } from '@/lib/agent-avatars';

interface IAgentCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (agentId: string) => void;
}

const NAME_PATTERN = /^\S+$/;

const AgentCreateDialog = ({ open, onOpenChange, onCreated }: IAgentCreateDialogProps) => {
  const t = useTranslations('agent');
  const tc = useTranslations('common');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [avatar, setAvatar] = useState('');
  const [nameError, setNameError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const agents = useAgentStore(useShallow(selectAgentList));
  const createAgent = useAgentStore((s) => s.createAgent);

  const resetForm = () => {
    setName('');
    setRole('');
    setAvatar('');
    setNameError('');
    setIsCreating(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  };

  const validateName = useCallback(
    (value: string) => {
      if (!value) {
        setNameError('');
        return false;
      }
      if (value.length > 30) {
        setNameError(t('nameMaxLength'));
        return false;
      }
      if (!NAME_PATTERN.test(value)) {
        setNameError(t('nameNoSpaces'));
        return false;
      }
      if (agents.some((a) => a.name === value)) {
        setNameError(t('nameDuplicate'));
        return false;
      }
      setNameError('');
      return true;
    },
    [agents, t],
  );

  const handleNameBlur = () => {
    if (name) validateName(name);
  };

  const handleSubmit = async () => {
    if (!validateName(name)) return;
    setIsCreating(true);

    handleOpenChange(false);

    const agentId = await createAgent({
      name,
      role,
      ...(avatar ? { avatar } : {}),
    });

    if (agentId) {
      onCreated(agentId);
    }
  };

  const canSubmit = name.length > 0 && !nameError && !isCreating;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('createTitle')}</DialogTitle>
          <DialogDescription>{t('createDescription')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{t('labelAvatar')}</Label>
            <div className="flex gap-2">
              <button
                type="button"
                className={`rounded-full ring-2 ring-offset-2 ring-offset-background transition-all ${!avatar ? 'ring-primary' : 'ring-transparent hover:ring-muted-foreground/30'}`}
                onClick={() => setAvatar('')}
              >
                <Avatar size="default">
                  <AvatarFallback>{name ? name[0]?.toUpperCase() : '?'}</AvatarFallback>
                </Avatar>
              </button>
              {AVATAR_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={`rounded-full ring-2 ring-offset-2 ring-offset-background transition-all ${avatar === opt ? 'ring-primary' : 'ring-transparent hover:ring-muted-foreground/30'}`}
                  onClick={() => setAvatar(opt)}
                >
                  <Avatar size="default">
                    <AvatarImage src={opt} alt={opt} />
                    <AvatarFallback>?</AvatarFallback>
                  </Avatar>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{t('labelName')}</Label>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) validateName(e.target.value);
              }}
              onBlur={handleNameBlur}
              placeholder="backend-bot"
              autoFocus
              aria-invalid={!!nameError}
            />
            {nameError && (
              <p className="text-xs text-destructive">{nameError}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{t('labelRole')}</Label>
            <Input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder={t('backendRolePlaceholder')}
              maxLength={100}
            />
          </div>

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isCreating}>
            {tc('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isCreating ? (
              <>
                <Spinner className="h-3 w-3" />
                {t('creating')}
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" />
                {tc('create')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AgentCreateDialog;
