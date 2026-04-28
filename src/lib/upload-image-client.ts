const SUPPORTED_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const MAX_BYTES = 10 * 1024 * 1024;
const ROTATABLE_MIMES = new Set(['image/jpeg', 'image/webp']);

interface IUploadOptions {
  wsId?: string;
  tabId?: string;
}

interface IUploadResult {
  path: string;
  filename: string;
}

const isImageFile = (file: File | { type?: string }): boolean => SUPPORTED_MIMES.has(file.type ?? '');

const normalizeOrientation = async (file: File): Promise<File> => {
  if (typeof window === 'undefined') return file;
  if (!ROTATABLE_MIMES.has(file.type)) return file;
  if (typeof createImageBitmap !== 'function') return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file;
  }
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, file.type, 0.92),
    );
    if (!blob) return file;
    return new File([blob], file.name, { type: file.type, lastModified: file.lastModified });
  } finally {
    bitmap.close?.();
  }
};

const uploadImage = async (file: File, options: IUploadOptions = {}): Promise<IUploadResult> => {
  if (!isImageFile(file)) {
    throw new Error(`Unsupported image type: ${file.type}`);
  }
  if (file.size > MAX_BYTES) {
    throw new Error(`Image exceeds ${MAX_BYTES} bytes`);
  }

  const normalized = await normalizeOrientation(file);
  const payload = normalized.size <= MAX_BYTES ? normalized : file;

  const headers: Record<string, string> = {
    'Content-Type': payload.type,
    'X-Cmux-Filename': encodeURIComponent(payload.name || 'image'),
  };
  if (options.wsId) headers['X-Cmux-Ws-Id'] = options.wsId;
  if (options.tabId) headers['X-Cmux-Tab-Id'] = options.tabId;

  const res = await fetch('/api/upload-image', {
    method: 'POST',
    headers,
    body: payload,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? `Upload failed (${res.status})`);
  }

  return (await res.json()) as IUploadResult;
};

export { uploadImage, isImageFile, SUPPORTED_MIMES, MAX_BYTES };
export type { IUploadOptions, IUploadResult };
