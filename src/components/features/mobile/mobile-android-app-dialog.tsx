import { useMemo } from 'react';
import { RotateCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import packageJson from '../../../../package.json';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  canRestartAndroidApp,
  readAndroidAppInfo,
  restartAndroidApp,
} from '@/lib/android-bridge';

interface IMobileAndroidAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MobileAndroidAppDialog = ({ open, onOpenChange }: IMobileAndroidAppDialogProps) => {
  const t = useTranslations('mobile');
  const tc = useTranslations('common');
  const appInfo = open ? readAndroidAppInfo() : null;
  const restartAvailable = open && canRestartAndroidApp();

  const serverVersion = useMemo(() => {
    const commit = process.env.NEXT_PUBLIC_COMMIT_HASH;
    return commit ? `${packageJson.version} (${commit})` : packageJson.version;
  }, []);

  const rows = appInfo
    ? [
        [t('appVersion'), appInfo.versionName],
        [t('appBuild'), appInfo.versionCode],
        [t('appPackage'), appInfo.packageName],
        [t('appDevice'), appInfo.deviceModel],
        [t('appAndroid'), appInfo.androidVersion],
        [t('serverVersion'), serverVersion],
      ]
    : [[t('serverVersion'), serverVersion]];

  const handleRestart = () => {
    if (restartAndroidApp()) return;
    toast.error(t('restartAppUnavailable'));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-sm gap-3 rounded-xl p-4">
        <DialogHeader>
          <DialogTitle className="text-sm font-medium">{t('appInfo')}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-2 rounded-lg border bg-muted/30 p-3">
          {rows.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 text-xs leading-5">
              <span className="text-muted-foreground">{label}</span>
              <span className="min-w-0 break-words font-mono text-foreground">{value}</span>
            </div>
          ))}
        </div>

        {!appInfo && (
          <p className="text-xs text-muted-foreground">{t('androidAppOnly')}</p>
        )}

        <DialogFooter className="-mx-4 -mb-4 px-4 py-3 sm:flex-row">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc('close')}
          </Button>
          <Button
            variant="secondary"
            onClick={handleRestart}
            disabled={!restartAvailable}
          >
            <RotateCw data-icon="inline-start" />
            {t('restartApp')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MobileAndroidAppDialog;
