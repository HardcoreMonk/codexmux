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
import {
  GripVertical,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
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
import useSidebarItems, { type ISidebarItem } from '@/hooks/use-sidebar-items';
import IconPicker from '@/components/features/settings/icon-picker';

interface IFormState {
  mode: 'add' | 'edit';
  id?: string;
  name: string;
  icon: string;
  url: string;
}

const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 });

const isBuiltin = (id: string) => id.startsWith('builtin-');

interface ISortableItemProps {
  item: ISidebarItem;
  onEdit: (item: ISidebarItem) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
}

const SortableItem = ({ item, onEdit, onDelete, onToggle }: ISortableItemProps) => {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 1 : undefined,
    position: isDragging ? ('relative' as const) : undefined,
  };

  return (
    <div ref={setNodeRef} className="flex items-center gap-1 bg-background px-1 py-2.5" style={style}>
      <div
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="flex shrink-0 cursor-grab items-center text-muted-foreground/50 active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <IconPicker value={item.icon} readonly size={14} />
          <p className="text-sm font-medium">{item.name}</p>
        </div>
        <p className="truncate font-mono text-xs text-muted-foreground">{item.url}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onEdit(item)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-ui-red hover:text-ui-red/80"
          onClick={() => onDelete(item.id)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
        <Switch checked={item.enabled} onCheckedChange={(v) => onToggle(item.id, v)} />
      </div>
    </div>
  );
};

const SidebarItemsSettings = () => {
  const t = useTranslations('settings.sidebarItems');
  const { allOrderedItems, customItems, toggleBuiltin, saveCustom, saveOrder, deleteItem, resetAll } = useSidebarItems();
  const [form, setForm] = useState<IFormState | null>(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleToggle = useCallback(
    (id: string, enabled: boolean) => {
      if (isBuiltin(id)) {
        toggleBuiltin(id, enabled);
      } else {
        const next = customItems.map((i) => (i.id === id ? { ...i, enabled } : i));
        saveCustom(next);
      }
    },
    [customItems, toggleBuiltin, saveCustom],
  );

  const handleDelete = useCallback(
    (id: string) => {
      deleteItem(id);
    },
    [deleteItem],
  );

  const handleEdit = useCallback((item: ISidebarItem) => {
    setForm({ mode: 'edit', id: item.id, name: item.name, icon: item.icon, url: item.url });
  }, []);

  const handleAdd = useCallback(() => {
    setForm({ mode: 'add', name: '', icon: 'Globe', url: '' });
  }, []);

  const handleFormSave = useCallback(() => {
    if (!form || !form.name.trim() || !form.url.trim()) return;

    if (form.mode === 'edit' && form.id) {
      const next = customItems.map((i) =>
        i.id === form.id ? { ...i, name: form.name.trim(), icon: form.icon, url: form.url.trim() } : i,
      );
      saveCustom(next);
    } else {
      const newItem: ISidebarItem = {
        id: `custom-${nanoid(8)}`,
        name: form.name.trim(),
        icon: form.icon,
        url: form.url.trim(),
        enabled: true,
      };
      saveCustom([...customItems, newItem]);
    }
    setForm(null);
  }, [form, customItems, saveCustom]);

  const handleReset = useCallback(() => {
    resetAll();
    setResetDialogOpen(false);
  }, [resetAll]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = allOrderedItems.findIndex((i) => i.id === active.id);
      const newIndex = allOrderedItems.findIndex((i) => i.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(allOrderedItems, oldIndex, newIndex);
      saveOrder(reordered.map((i) => i.id));
    },
    [allOrderedItems, saveOrder],
  );

  const isFormValid = form ? form.name.trim().length > 0 && form.url.trim().length > 0 : false;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium">{t('title')}</p>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">{t('itemsSection')}</p>
        {allOrderedItems.length > 0 && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={allOrderedItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              <div className="overflow-hidden rounded-lg border">
                {allOrderedItems.map((item) =>
                  isBuiltin(item.id) ? (
                    <div key={item.id} className="flex items-center gap-1 bg-background px-1 py-2.5">
                      <div className="flex shrink-0 items-center text-muted-foreground/20">
                        <GripVertical className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <IconPicker value={item.icon} readonly size={14} />
                          <p className="text-sm font-medium">{item.name}</p>
                        </div>
                        <p className="truncate font-mono text-xs text-muted-foreground">{item.url}</p>
                      </div>
                      <div className="flex shrink-0 items-center">
                        <Switch checked={item.enabled} onCheckedChange={(v) => handleToggle(item.id, v)} />
                      </div>
                    </div>
                  ) : (
                    <SortableItem
                      key={item.id}
                      item={item}
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
            <p className="text-sm font-medium">{form.mode === 'add' ? t('addItem') : t('editItem')}</p>
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
              <label className="text-xs text-muted-foreground">{t('iconLabel')}</label>
              <IconPicker value={form.icon} onChange={(icon) => setForm({ ...form, icon })} />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">{t('urlLabel')}</label>
              <Input
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder={t('urlPlaceholder')}
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

export default SidebarItemsSettings;
