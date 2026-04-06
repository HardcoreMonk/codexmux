import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Check, X } from 'lucide-react';
import Spinner from '@/components/ui/spinner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface ICreateWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (directory: string) => Promise<void>;
  onValidate: (directory: string) => Promise<{
    valid: boolean;
    error?: string;
    suggestedName?: string;
  }>;
}

const CreateWorkspaceDialog = ({
  open,
  onOpenChange,
  onSubmit,
  onValidate,
}: ICreateWorkspaceDialogProps) => {
  const t = useTranslations('workspace');
  const tc = useTranslations('common');
  const [directory, setDirectory] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validation, setValidation] = useState<{
    valid: boolean;
    error?: string;
    suggestedName?: string;
  } | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) {
      setDirectory('');
      setValidation(null);
      setIsValidating(false);
      setIsSubmitting(false);
    }
  }, [open]);

  const handleDirectoryChange = useCallback(
    (value: string) => {
      setDirectory(value);
      setValidation(null);

      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (!value.trim()) {
        setIsValidating(false);
        return;
      }

      setIsValidating(true);
      debounceRef.current = setTimeout(async () => {
        const result = await onValidate(value.trim());
        setValidation(result);
        setIsValidating(false);
      }, 300);
    },
    [onValidate],
  );

  const handleSubmit = useCallback(async () => {
    if (!validation?.valid || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit(directory.trim());
    } finally {
      setIsSubmitting(false);
    }
  }, [directory, validation, isSubmitting, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && validation?.valid && !isSubmitting) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [validation, isSubmitting, handleSubmit],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('add')}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <label className="text-sm text-muted-foreground">{t('projectDirectory')}</label>
          <Input
            placeholder={t('directoryPlaceholder')}
            value={directory}
            onChange={(e) => handleDirectoryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
          <div className="min-h-5">
            {isValidating && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Spinner className="h-2.5 w-2.5" />
                {t('validating')}
              </div>
            )}
            {!isValidating && validation?.valid && (
              <div className="flex items-center gap-1.5 text-xs text-ui-teal">
                <Check className="h-3 w-3" />
                {validation.suggestedName}
              </div>
            )}
            {!isValidating && validation && !validation.valid && (
              <div className="flex items-center gap-1.5 text-xs text-ui-red">
                <X className="h-3 w-3" />
                {validation.error}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            {tc('cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!validation?.valid || isSubmitting}
          >
            {isSubmitting && <Spinner className="mr-1.5 h-3.5 w-3.5" />}
            {t('addButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateWorkspaceDialog;
