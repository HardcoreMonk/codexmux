import { useState, useCallback, useRef, useEffect } from 'react';
import { Loader2, Check, X } from 'lucide-react';
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
      <DialogContent
        className="sm:max-w-md"
        style={{
          backgroundColor: 'oklch(0.18 0.006 286)',
          borderColor: 'oklch(0.30 0.006 286)',
        }}
      >
        <DialogHeader>
          <DialogTitle>Workspace 추가</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <label className="text-sm text-zinc-400">프로젝트 디렉토리</label>
          <Input
            placeholder="디렉토리 경로 입력"
            value={directory}
            onChange={(e) => handleDirectoryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            style={{
              backgroundColor: 'oklch(0.15 0.006 286)',
              borderColor: 'oklch(0.30 0.006 286)',
            }}
          />
          <div className="min-h-5">
            {isValidating && (
              <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                <Loader2 className="h-3 w-3 animate-spin" />
                검증 중...
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
            취소
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!validation?.valid || isSubmitting}
          >
            {isSubmitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            추가
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateWorkspaceDialog;
