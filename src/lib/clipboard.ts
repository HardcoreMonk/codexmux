interface IClipboardEnvironment {
  isSecureContext?: boolean;
  navigator?: Pick<Navigator, 'clipboard'>;
  document?: Document;
}

const defaultEnvironment = (): IClipboardEnvironment => ({
  isSecureContext: typeof window !== 'undefined' ? window.isSecureContext : false,
  navigator: typeof navigator !== 'undefined' ? navigator : undefined,
  document: typeof document !== 'undefined' ? document : undefined,
});

export const copyTextToClipboard = async (
  text: string,
  environment: IClipboardEnvironment = defaultEnvironment(),
): Promise<boolean> => {
  if (!text) return false;

  if (environment.isSecureContext && environment.navigator?.clipboard?.writeText) {
    try {
      await environment.navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Continue with the selection-based fallback.
    }
  }

  const doc = environment.document;
  if (!doc?.body || typeof doc.execCommand !== 'function') return false;

  const activeElement = doc.activeElement && 'focus' in doc.activeElement
    ? doc.activeElement as HTMLElement
    : null;
  const selection = doc.getSelection?.();
  const ranges = selection
    ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange())
    : [];
  const textarea = doc.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.inset = '-9999px auto auto -9999px';
  textarea.style.opacity = '0';
  doc.body.appendChild(textarea);

  try {
    textarea.focus();
    textarea.select();
    return doc.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea.remove();
    selection?.removeAllRanges();
    for (const range of ranges) selection?.addRange(range);
    activeElement?.focus();
  }
};
