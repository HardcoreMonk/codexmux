import { ChevronLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

interface ISessionNavBarProps {
  onNavigateToList: () => void;
}

const SessionNavBar = ({ onNavigateToList }: ISessionNavBarProps) => {
  const t = useTranslations('terminal');

  return (
    <div className="flex items-center border-b px-4 py-2">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1 text-sm text-muted-foreground hover:text-foreground"
        onClick={onNavigateToList}
      >
        <ChevronLeft size={16} />
        {t('sessionList')}
      </Button>
    </div>
  );
};

export default SessionNavBar;
