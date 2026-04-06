import { useState, useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Trash2 } from 'lucide-react';
import Spinner from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { useShallow } from 'zustand/react/shallow';
import useAgentStore, { selectAgentList } from '@/hooks/use-agent-store';
import { AVATAR_OPTIONS } from '@/lib/agent-avatars';
import type { IAgentInfo } from '@/types/agent';

interface IAgentSettingsSheetProps {
  agent: IAgentInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleteClick: () => void;
}

const NAME_PATTERN = /^\S+$/;

interface ISettingsFormProps {
  agent: IAgentInfo;
  onClose: () => void;
  onDeleteClick: () => void;
}

const SettingsForm = ({ agent, onClose, onDeleteClick }: ISettingsFormProps) => {
  const t = useTranslations('agent');
  const tc = useTranslations('common');
  const [name, setName] = useState(agent.name);
  const [role, setRole] = useState(agent.role);
  const [avatar, setAvatar] = useState(agent.avatar ?? '');
  const [soul, setSoul] = useState('');
  const [nameError, setNameError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingSoul, setIsLoadingSoul] = useState(true);

  const agents = useAgentStore(useShallow(selectAgentList));
  const updateAgent = useAgentStore((s) => s.updateAgent);

  useEffect(() => {
    const fetchSoul = async () => {
      try {
        const res = await fetch(`/api/agent/${agent.id}`);
        if (res.ok) {
          const data = await res.json();
          setSoul(data.soul ?? '');
        }
      } catch { /* ignore */ }
      setIsLoadingSoul(false);
    };
    fetchSoul();
  }, [agent.id]);

  const validateName = useCallback(
    (value: string) => {
      if (!value) {
        setNameError(t('nameRequired'));
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
      if (agents.some((a) => a.name === value && a.id !== agent.id)) {
        setNameError(t('nameDuplicate'));
        return false;
      }
      setNameError('');
      return true;
    },
    [agents, agent.id, t],
  );

  const handleSave = async () => {
    if (!validateName(name)) return;
    setIsSaving(true);

    const success = await updateAgent(agent.id, {
      name,
      role,
      soul,
      avatar,
    });

    setIsSaving(false);
    if (success) onClose();
  };

  const canSave = name.length > 0 && !nameError && !isSaving;

  return (
    <>
      <SheetHeader>
        <SheetTitle>{t('settingsTitle')}</SheetTitle>
        <SheetDescription>{t('settingsDescription', { name: agent.name })}</SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-4 overflow-y-auto px-4">
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
            onBlur={() => { if (name) validateName(name); }}
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
            placeholder={t('rolePlaceholder')}
            maxLength={100}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm font-medium">{t('labelSoul')}</Label>
          <p className="text-xs text-muted-foreground">{t('soulDescription')}</p>
          {isLoadingSoul ? (
            <div className="flex h-32 items-center justify-center rounded-md border">
              <Spinner className="h-3 w-3 text-muted-foreground" />
            </div>
          ) : (
            <textarea
              value={soul}
              onChange={(e) => setSoul(e.target.value)}
              className="flex min-h-[160px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              placeholder="## Core Truths\n- ...\n\n## Vibe\n- ..."
            />
          )}
        </div>

      </div>

      <div className="flex items-center justify-between border-t p-4">
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive"
          onClick={onDeleteClick}
          disabled={isSaving}
        >
          <Trash2 className="h-4 w-4" />
          <span className="sr-only">{t('deleteAgent')}</span>
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            {tc('cancel')}
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {isSaving ? (
              <>
                <Spinner className="h-3 w-3" />
                {t('saving')}
              </>
            ) : (
              tc('save')
            )}
          </Button>
        </div>
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
