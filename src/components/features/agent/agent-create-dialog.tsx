import { useState, useCallback } from 'react';
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
        setNameError('30자 이내로 입력해주세요');
        return false;
      }
      if (!NAME_PATTERN.test(value)) {
        setNameError('공백은 사용할 수 없습니다');
        return false;
      }
      if (agents.some((a) => a.name === value)) {
        setNameError('이미 사용 중인 이름입니다');
        return false;
      }
      setNameError('');
      return true;
    },
    [agents],
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
          <DialogTitle>새 에이전트 만들기</DialogTitle>
          <DialogDescription>에이전트 이름과 역할을 설정하세요</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">아바타</Label>
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
            <Label className="text-sm font-medium">이름</Label>
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
            <Label className="text-sm font-medium">역할</Label>
            <Input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="백엔드 개발 전담"
              maxLength={100}
            />
          </div>

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isCreating}>
            취소
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isCreating ? (
              <>
                <Spinner className="h-3 w-3" />
                만드는 중
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" />
                만들기
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AgentCreateDialog;
