import { ArrowDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

interface INewMessageButtonProps {
  onClick: () => void;
}

const NewMessageButton = ({ onClick }: INewMessageButtonProps) => {
  const t = useTranslations('agent');
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
      <Button
        variant="secondary"
        size="sm"
        className="rounded-full shadow-sm"
        onClick={onClick}
      >
        <ArrowDown className="h-3.5 w-3.5" />
        {t('newMessage')}
      </Button>
    </div>
  );
};

export default NewMessageButton;
