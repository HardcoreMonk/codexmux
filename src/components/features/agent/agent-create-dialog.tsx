import { useState, useCallback } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import useAgentStore, { selectAgentList } from '@/hooks/use-agent-store';
import useWorkspaceStore from '@/hooks/use-workspace-store';

interface IAgentCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (agentId: string) => void;
}

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

const AgentCreateDialog = ({ open, onOpenChange, onCreated }: IAgentCreateDialogProps) => {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [nameError, setNameError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const agents = useAgentStore(selectAgentList);
  const createAgent = useAgentStore((s) => s.createAgent);

  const resetForm = () => {
    setName('');
    setRole('');
    setSelectedProjects([]);
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

  const handleToggleProject = (projectName: string) => {
    setSelectedProjects((prev) =>
      prev.includes(projectName)
        ? prev.filter((p) => p !== projectName)
        : [...prev, projectName],
    );
  };

  const handleSubmit = async () => {
    if (!validateName(name)) return;
    setIsCreating(true);

    const agentId = await createAgent({
      name,
      role,
      projects: selectedProjects,
    });

    setIsCreating(false);
    if (agentId) {
      handleOpenChange(false);
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

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">담당 프로젝트</Label>
            {workspaces.length === 0 ? (
              <p className="text-xs text-muted-foreground">등록된 워크스페이스가 없습니다</p>
            ) : (
              <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border p-3">
                {workspaces.map((ws) => (
                  <label key={ws.id} className="flex cursor-pointer items-center gap-2">
                    <Checkbox
                      checked={selectedProjects.includes(ws.name)}
                      onCheckedChange={() => handleToggleProject(ws.name)}
                    />
                    <span className="text-sm">{ws.name}</span>
                  </label>
                ))}
              </div>
            )}
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
