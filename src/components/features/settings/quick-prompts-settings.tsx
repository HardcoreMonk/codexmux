import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { nanoid } from 'nanoid';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
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

const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 });

const isBuiltin = (id: string) => id.startsWith('builtin-');

interface ISortableBuiltinPromptProps {
  prompt: IQuickPrompt;
  onToggle: (id: string, enabled: boolean) => void;
}

const SortableBuiltinPrompt = ({ prompt: p, onToggle }: ISortableBuiltinPromptProps) => {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: p.id,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 1 : undefined,
    position: isDragging ? ('relative' as const) : undefined,
  };

  return (
    <div ref={setNodeRef} className="flex items-center gap-1 bg-background py-2.5 pl-1 pr-3" style={style}>
      <div
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="flex shrink-0 cursor-grab items-center text-muted-foreground/50 active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{p.name}</p>
        <p className="truncate font-mono text-xs text-muted-foreground">{p.prompt}</p>
      </div>
      <div className="flex shrink-0 items-center">
        <Switch checked={p.enabled} onCheckedChange={(v) => onToggle(p.id, v)} />
      </div>
    </div>
  );
};

interface ISortablePromptItemProps {
  prompt: IQuickPrompt;
  onEdit: (p: IQuickPrompt) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
}

const SortablePromptItem = ({ prompt: p, onEdit, onDelete, onToggle }: ISortablePromptItemProps) => {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: p.id,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 1 : undefined,
    position: isDragging ? ('relative' as const) : undefined,
  };

  return (
    <div ref={setNodeRef} className="flex items-center gap-1 bg-background py-2.5 pl-1 pr-3" style={style}>
      <div
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="flex shrink-0 cursor-grab items-center text-muted-foreground/50 active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{p.name}</p>
        <p className="truncate font-mono text-xs text-muted-foreground">{p.prompt}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onEdit(p)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-ui-red hover:text-ui-red/80"
          onClick={() => onDelete(p.id)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
        <Switch checked={p.enabled} onCheckedChange={(v) => onToggle(p.id, v)} />
      </div>
    </div>
  );
};

const QuickPromptsSettings = () => {
  const t = useTranslations('settings.quickPrompts');
  const { allOrderedPrompts, customPrompts, toggleBuiltin, saveCustom, saveOrder, deletePrompt, resetAll } =
    useQuickPrompts();
  const [form, setForm] = useState<IFormState | null>(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleToggle = useCallback(
    (id: string, enabled: boolean) => {
      if (isBuiltin(id)) {
        toggleBuiltin(id, enabled);
      } else {
        const next = customPrompts.map((p) => (p.id === id ? { ...p, enabled } : p));
        saveCustom(next);
      }
    },
    [customPrompts, toggleBuiltin, saveCustom],
  );

  const handleDelete = useCallback(
    (id: string) => {
      setDeleteTargetId(id);
    },
    [],
  );

  const handleDeleteConfirm = useCallback(() => {
    if (deleteTargetId) {
      deletePrompt(deleteTargetId);
      setDeleteTargetId(null);
    }
  }, [deleteTargetId, deletePrompt]);

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
        p.id === form.id ? { ...p, name: form.name.trim(), prompt: form.prompt } : p,
      );
      saveCustom(next);
    } else {
      const newPrompt: IQuickPrompt = {
        id: `custom-${nanoid(8)}`,
        name: form.name.trim(),
        prompt: form.prompt,
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

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = allOrderedPrompts.findIndex((p) => p.id === active.id);
      const newIndex = allOrderedPrompts.findIndex((p) => p.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(allOrderedPrompts, oldIndex, newIndex);
      saveOrder(reordered.map((p) => p.id));
    },
    [allOrderedPrompts, saveOrder],
  );

  const isFormValid = form ? form.name.trim().length > 0 && form.prompt.trim().length > 0 : false;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium">{t('title')}</p>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">{t('itemsSection')}</p>
        {allOrderedPrompts.length > 0 && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={allOrderedPrompts.map((p) => p.id)} strategy={verticalListSortingStrategy}>
              <div className="overflow-hidden rounded-lg border">
                {allOrderedPrompts.map((p) =>
                  isBuiltin(p.id) ? (
                    <SortableBuiltinPrompt key={p.id} prompt={p} onToggle={handleToggle} />
                  ) : (
                    <SortablePromptItem
                      key={p.id}
                      prompt={p}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onToggle={handleToggle}
                    />
                  ),
                )}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {form && (
          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-sm font-medium">{form.mode === 'add' ? t('addPrompt') : t('editPrompt')}</p>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">{t('nameLabel')}</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t('namePlaceholder')}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">{t('promptLabel')}</label>
              <Textarea
                value={form.prompt}
                onChange={(e) => setForm({ ...form, prompt: e.target.value })}
                placeholder={t('promptPlaceholder')}
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setForm(null)}>
                {t('cancel')}
              </Button>
              <Button size="sm" onClick={handleFormSave} disabled={!isFormValid}>
                {t('save')}
              </Button>
            </div>
          </div>
        )}

        {!form && (
          <Button variant="outline" size="sm" onClick={handleAdd}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            {t('addButton')}
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
        {t('resetToDefault')}
      </Button>

      <AlertDialog open={!!deleteTargetId} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('deleteDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('deleteCancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>{t('deleteConfirm')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('resetTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('resetDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('resetCancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset}>{t('resetConfirm')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default QuickPromptsSettings;
