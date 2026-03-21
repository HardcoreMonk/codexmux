import { useState, useCallback } from 'react';
import { nanoid } from 'nanoid';
import { Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import useQuickPrompts, { type IQuickPrompt } from '@/hooks/use-quick-prompts';

interface IFormState {
  mode: 'add' | 'edit';
  id?: string;
  name: string;
  prompt: string;
}

const QuickPromptsSettings = () => {
  const { builtinPrompts, customPrompts, toggleBuiltin, saveCustom, resetAll } = useQuickPrompts();
  const [form, setForm] = useState<IFormState | null>(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  const handleCustomToggle = useCallback(
    (id: string, enabled: boolean) => {
      const next = customPrompts.map((p) => (p.id === id ? { ...p, enabled } : p));
      saveCustom(next);
    },
    [customPrompts, saveCustom],
  );

  const handleDelete = useCallback(
    (id: string) => {
      const next = customPrompts.filter((p) => p.id !== id);
      saveCustom(next);
    },
    [customPrompts, saveCustom],
  );

  const handleEdit = useCallback((p: IQuickPrompt) => {
    setForm({ mode: 'edit', id: p.id, name: p.name, prompt: p.prompt });
  }, []);

  const handleAdd = useCallback(() => {
    setForm({ mode: 'add', name: '', prompt: '' });
  }, []);

  const handleFormSave = useCallback(() => {
    if (!form || !form.name.trim() || !form.prompt.trim()) return;

    if (form.mode === 'edit' && form.id) {
      const next = customPrompts.map((p) =>
        p.id === form.id ? { ...p, name: form.name.trim(), prompt: form.prompt.trim() } : p,
      );
      saveCustom(next);
    } else {
      const newPrompt: IQuickPrompt = {
        id: `custom-${nanoid(8)}`,
        name: form.name.trim(),
        prompt: form.prompt.trim(),
        enabled: true,
      };
      saveCustom([...customPrompts, newPrompt]);
    }
    setForm(null);
  }, [form, customPrompts, saveCustom]);

  const handleReset = useCallback(() => {
    resetAll();
    setResetDialogOpen(false);
  }, [resetAll]);

  const isFormValid = form ? form.name.trim().length > 0 && form.prompt.trim().length > 0 : false;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium">빠른 프롬프트</p>
        <p className="text-sm text-muted-foreground">
          입력창 위에 표시할 프롬프트 버튼을 관리합니다.
        </p>
      </div>

      {builtinPrompts.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">기본 프롬프트</p>
          <div className="divide-y divide-border rounded-lg border">
            {builtinPrompts.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">{p.prompt}</p>
                </div>
                <Switch checked={p.enabled} onCheckedChange={(v) => toggleBuiltin(p.id, v)} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">사용자 프롬프트</p>
        {customPrompts.length > 0 && (
          <div className="divide-y divide-border rounded-lg border">
            {customPrompts.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">{p.prompt}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleEdit(p)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-ui-red hover:text-ui-red/80"
                    onClick={() => handleDelete(p.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  <Switch checked={p.enabled} onCheckedChange={(v) => handleCustomToggle(p.id, v)} />
                </div>
              </div>
            ))}
          </div>
        )}

        {form && (
          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-sm font-medium">
              {form.mode === 'add' ? '프롬프트 추가' : '프롬프트 수정'}
            </p>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">이름</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="예: 코드 리뷰"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">프롬프트</label>
              <Textarea
                value={form.prompt}
                onChange={(e) => setForm({ ...form, prompt: e.target.value })}
                placeholder="예: 현재 변경사항을 리뷰해주세요."
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setForm(null)}>
                취소
              </Button>
              <Button size="sm" onClick={handleFormSave} disabled={!isFormValid}>
                저장
              </Button>
            </div>
          </div>
        )}

        {!form && (
          <Button variant="outline" size="sm" onClick={handleAdd}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            프롬프트 추가
          </Button>
        )}
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        onClick={() => setResetDialogOpen(true)}
      >
        <RotateCcw className="mr-1 h-3.5 w-3.5" />
        기본값으로 초기화
      </Button>

      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>기본값으로 초기화</AlertDialogTitle>
            <AlertDialogDescription>
              모든 사용자 프롬프트가 삭제되고, 기본 프롬프트가 활성화됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset}>초기화</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default QuickPromptsSettings;
