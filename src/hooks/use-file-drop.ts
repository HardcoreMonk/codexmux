import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import isElectron from '@/hooks/use-is-electron';
import { isImageFile, uploadImage } from '@/lib/upload-image-client';

const escapeShellPath = (filePath: string): string =>
  filePath.replace(/[ \t\\'"(){}[\]!#$&;`|*?<>~^%]/g, '\\$&');

interface IUseFileDropOptions {
  sendStdin: (data: string) => void;
  focus: () => void;
  wsId?: string;
  tabId?: string;
}

const useFileDrop = ({ sendStdin, focus, wsId, tabId }: IUseFileDropOptions) => {
  const [showPathInput, setShowPathInput] = useState(false);
  const [droppedFileHint, setDroppedFileHint] = useState('');

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const sendPaths = useCallback((paths: string[]) => {
    if (paths.length === 0) return;
    sendStdin(`\x1b[200~${paths.join(' ')}\x1b[201~`);
    focus();
  }, [sendStdin, focus]);

  const uploadAndSend = useCallback(async (files: File[]) => {
    const images = files.filter(isImageFile);
    if (images.length === 0) return false;
    try {
      const results = await Promise.all(images.map((f) => uploadImage(f, { wsId, tabId })));
      sendPaths(results.map((r) => escapeShellPath(r.path)));
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
      return true;
    }
  }, [wsId, tabId, sendPaths]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const { files } = e.dataTransfer;
    if (files.length === 0) return;

    const electronAPI = isElectron
      ? (window as unknown as { electronAPI: { getPathForFile: (file: File) => string } }).electronAPI
      : null;

    const paths: string[] = [];
    const fileList = Array.from(files);
    for (const file of fileList) {
      const filePath = electronAPI?.getPathForFile(file);
      if (filePath) {
        paths.push(escapeShellPath(filePath));
      }
    }

    if (paths.length > 0) {
      sendPaths(paths);
      return;
    }

    const handled = fileList.some(isImageFile);
    if (handled) {
      void uploadAndSend(fileList);
      return;
    }

    const names = fileList.map((f) => f.name).join(', ');
    setDroppedFileHint(names);
    setShowPathInput(true);
  }, [sendPaths, uploadAndSend]);

  const handlePathInputSubmit = useCallback((value: string) => {
    setShowPathInput(false);
    setDroppedFileHint('');
    if (value.trim()) {
      const escaped = escapeShellPath(value.trim());
      sendStdin(`\x1b[200~${escaped}\x1b[201~`);
      focus();
    }
  }, [sendStdin, focus]);

  const handlePathInputDismiss = useCallback(() => {
    setShowPathInput(false);
    setDroppedFileHint('');
    focus();
  }, [focus]);

  return {
    showPathInput,
    droppedFileHint,
    handleDragOver,
    handleDrop,
    handlePathInputSubmit,
    handlePathInputDismiss,
  };
};

export default useFileDrop;
