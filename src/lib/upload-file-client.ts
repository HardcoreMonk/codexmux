const MAX_BYTES = 50 * 1024 * 1024;

interface IUploadFileOptions {
  wsId?: string;
  tabId?: string;
}

interface IUploadFileResult {
  path: string;
  filename: string;
}

const uploadFile = async (file: File, options: IUploadFileOptions = {}): Promise<IUploadFileResult> => {
  if (file.size > MAX_BYTES) {
    throw new Error(`File exceeds ${MAX_BYTES} bytes`);
  }

  const headers: Record<string, string> = {
    'Content-Type': file.type || 'application/octet-stream',
    'X-Cmux-Filename': encodeURIComponent(file.name || 'file'),
  };
  if (options.wsId) headers['X-Cmux-Ws-Id'] = options.wsId;
  if (options.tabId) headers['X-Cmux-Tab-Id'] = options.tabId;

  const res = await fetch('/api/upload-file', {
    method: 'POST',
    headers,
    body: file,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? `Upload failed (${res.status})`);
  }

  return (await res.json()) as IUploadFileResult;
};

export { uploadFile, MAX_BYTES };
export type { IUploadFileOptions, IUploadFileResult };
