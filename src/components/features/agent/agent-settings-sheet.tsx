import { useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import useAgentStore, { selectAgentList } from '@/hooks/use-agent-store';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import type { IAgentInfo } from '@/types/agent';

interface IAgentSettingsSheetProps {
  agent: IAgentInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleteClick: () => void;
}

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

interface ISettingsFormProps {
  agent: IAgentInfo;
  onClose: () => void;
  onDeleteClick: () => void;
}

const SettingsForm = ({ agent, onClose, onDeleteClick }: ISettingsFormProps) => {
  const [name, setName] = useState(agent.name);
  const [role, setRole] = useState(agent.role);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([...agent.projects]);
  const [nameError, setNameError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const agents = useAgentStore(selectAgentList);
  const updateAgent = useAgentStore((s) => s.updateAgent);

  const validateName = useCallback(
    (value: string) => {
      if (!value) {
        setNameError('이름을 입력해주세요');
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
      if (agents.some((a) => a.name === value && a.id !== agent.id)) {
        setNameError('이미 사용 중인 이름입니다');
        return false;
      }
      setNameError('');
      return true;
    },
    [agents, agent.id],
  );

  const handleToggleProject = (projectName: string) => {
    setSelectedProjects((prev) =>
      prev.includes(projectName)
        ? prev.filter((p) => p !== projectName)
        : [...prev, projectName],
    );
  };

  const handleSave = async () => {
    if (!validateName(name)) return;
    setIsSaving(true);

    const success = await updateAgent(agent.id, {
      name,
      role,
      projects: selectedProjects,
    });

    setIsSaving(false);
    if (success) onClose();
  };

  const canSave = name.length > 0 && !nameError && !isSaving;

  return (
    <>
      <SheetHeader>
        <SheetTitle>에이전트 설정</SheetTitle>
        <SheetDescription>{agent.name} 설정을 수정합니다</SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-4 overflow-y-auto px-4">
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">이름</Label>
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (nameError) validateName(e.target.value);
            }}
            onBlur={() => { if (name) validateName(name); }}
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
            placeholder="역할을 입력하세요"
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

      <div className="flex flex-col gap-3 border-t p-4">
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            취소
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {isSaving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                저장 중
              </>
            ) : (
              '저장'
            )}
          </Button>
        </div>

        <Button
          variant="destructive"
          size="sm"
          className="w-full"
          onClick={onDeleteClick}
          disabled={isSaving}
        >
          에이전트 삭제
        </Button>
      </div>
    </>
  );
};

const AgentSettingsSheet = ({ agent, open, onOpenChange, onDeleteClick }: IAgentSettingsSheetProps) => {
  const handleClose = () => onOpenChange(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        {agent && (
          <SettingsForm
            key={agent.id}
            agent={agent}
            onClose={handleClose}
            onDeleteClick={onDeleteClick}
          />
        )}
      </SheetContent>
    </Sheet>
  );
};

export default AgentSettingsSheet;
