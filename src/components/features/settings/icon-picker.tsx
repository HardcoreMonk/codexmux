import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import IconRenderer, { getIcon } from '@/components/features/settings/icon-renderer';

const ICON_NAMES = [
  'Globe', 'Link', 'ExternalLink', 'Bookmark', 'Star',
  'Home', 'FileText', 'BarChart3', 'PieChart', 'LineChart',
  'Activity', 'Zap', 'Terminal', 'Code', 'Database',
  'Server', 'Cloud', 'Shield', 'Lock', 'Key',
  'User', 'Users', 'Mail', 'MessageSquare', 'Bell',
  'Calendar', 'Clock', 'Search', 'Eye', 'Camera',
  'Image', 'Film', 'Music', 'Headphones', 'Mic',
  'Folder', 'File', 'Archive', 'Download', 'Upload',
  'GitBranch', 'GitCommit', 'GitPullRequest', 'GitFork', 'Bug',
  'Wrench', 'Settings', 'Sliders', 'Palette', 'Brush',
  'Map', 'MapPin', 'Navigation', 'Compass', 'Wifi',
  'Monitor', 'Smartphone', 'Tablet', 'Laptop', 'Cpu',
  'HardDrive', 'MemoryStick', 'CircuitBoard', 'Radio', 'Bluetooth',
  'Heart', 'ThumbsUp', 'Smile', 'Coffee', 'Rocket',
  'Flame', 'Sun', 'Moon', 'Sparkles', 'Award',
  'Trophy', 'Target', 'Flag', 'Crosshair', 'Layers',
  'Layout', 'Grid', 'List', 'Table', 'Kanban',
  'Bot', 'Brain', 'Lightbulb', 'GraduationCap', 'BookOpen',
] as const;

interface IIconPickerProps {
  value: string;
  onChange?: (icon: string) => void;
  readonly?: boolean;
  size?: number;
}

const IconPicker = ({ value, onChange, readonly, size = 16 }: IIconPickerProps) => {
  const t = useTranslations('settings.sidebarItems');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return ICON_NAMES;
    const q = search.toLowerCase();
    return ICON_NAMES.filter((name) => name.toLowerCase().includes(q));
  }, [search]);

  if (readonly) {
    return <IconRenderer name={value} className="shrink-0 text-muted-foreground" style={{ width: size, height: size }} />;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <IconRenderer name={value} className="h-4 w-4" />
        <span className="text-xs text-muted-foreground">{value}</span>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <Input
          placeholder={t('iconSearch')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-2 h-8 text-xs"
          autoFocus
        />
        <div className="grid max-h-48 grid-cols-8 gap-0.5 overflow-y-auto">
          {filtered.map((name) => {
            if (!getIcon(name)) return null;
            return (
              <button
                key={name}
                type="button"
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded transition-colors hover:bg-accent',
                  value === name && 'bg-accent ring-1 ring-primary',
                )}
                onClick={() => {
                  onChange?.(name);
                  setOpen(false);
                  setSearch('');
                }}
                title={name}
              >
                <IconRenderer name={name} className="h-4 w-4" />
              </button>
            );
          })}
        </div>
        {filtered.length === 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground">{t('iconNotFound')}</p>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default IconPicker;
