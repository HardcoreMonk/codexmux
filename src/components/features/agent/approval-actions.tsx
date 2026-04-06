import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

type TApprovalResult = 'approved' | 'rejected' | null;

interface IApprovalActionsProps {
  onAction: (action: '승인' | '거부') => void;
  resolvedAs?: TApprovalResult;
  disabled?: boolean;
}

const ApprovalActions = ({ onAction, resolvedAs, disabled }: IApprovalActionsProps) => {
  const t = useTranslations('agent');
  const [localResult, setLocalResult] = useState<TApprovalResult>(null);
  const result = localResult ?? resolvedAs;

  const handleAction = (action: '승인' | '거부') => {
    setLocalResult(action === '승인' ? 'approved' : 'rejected');
    onAction(action);
  };

  if (result) {
    return (
      <span className="mt-2 text-xs text-muted-foreground">
        {result === 'approved' ? t('approved') : t('rejected')}
      </span>
    );
  }

  return (
    <div className="mt-2 flex gap-2">
      <Button
        variant="outline"
        size="xs"
        onClick={() => handleAction('거부')}
        disabled={disabled}
      >
        {t('reject')}
      </Button>
      <Button
        variant="default"
        size="xs"
        onClick={() => handleAction('승인')}
        disabled={disabled}
      >
        {t('approve')}
      </Button>
    </div>
  );
};

export default ApprovalActions;
