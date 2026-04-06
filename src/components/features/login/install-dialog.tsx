import { useCallback, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import useTerminal from '@/hooks/use-terminal';
import useInstallWebSocket from '@/hooks/use-install-websocket';

interface IInstallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  command: string;
  label: string;
}

const InstallDialog = ({ open, onOpenChange, command, label }: IInstallDialogProps) => {
  const t = useTranslations('terminal');
  const tc = useTranslations('common');
  const connectedRef = useRef(false);
  const writeRef = useRef<(data: Uint8Array) => void>(() => {});

  const { status, connect, disconnect, sendStdin, sendResize } = useInstallWebSocket(
    (data) => writeRef.current(data),
  );

  const { terminalRef, write, fit, isReady } = useTerminal({
    fontSize: 12,
    onInput: sendStdin,
    onResize: sendResize,
  });

  useEffect(() => { writeRef.current = write; }, [write]);

  useEffect(() => {
    if (open && isReady && !connectedRef.current) {
      connectedRef.current = true;
      const { cols, rows } = fit();
      connect(command, cols, rows);
    }
  }, [open, isReady, command, connect, fit]);

  const handleClose = useCallback(() => {
    disconnect();
    connectedRef.current = false;
    onOpenChange(false);
    window.location.reload();
  }, [disconnect, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-2xl" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
        </DialogHeader>
        <div
          ref={terminalRef}
          className="h-[400px] w-full rounded-md bg-black p-2"
        />
        <DialogFooter>
          <span className="mr-auto text-xs text-muted-foreground">
            {status === 'connected' && t('installRunning')}
            {status === 'disconnected' && t('installDone')}
          </span>
          <Button variant="outline" onClick={handleClose}>
            {tc('close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default InstallDialog;
