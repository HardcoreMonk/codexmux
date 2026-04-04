import { useState, useCallback } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

interface IAgentCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (agentId: string) => void;
}

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

const AgentCreateDialog = ({ open, onOpenChange, onCreated }: IAgentCreateDialogProps) => {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [nameError, setNameError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const agents = useAgentStore(useShallow(selectAgentList));
  const createAgent = useAgentStore((s) => s.createAgent);

  const resetForm = () => {
    setName('');
    setRole('');
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
        setNameError('영문 소문자, 숫자, 하이픈만 사용 가능합니다');
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
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
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
