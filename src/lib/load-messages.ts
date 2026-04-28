import { getConfig } from '@/lib/config-store';
import { normalizeLocale } from '@/lib/locales';
import { MESSAGE_NAMESPACES } from '@/lib/message-namespaces';
import fs from 'fs/promises';
import path from 'path';

type TMessages = Record<string, Record<string, unknown>>;

const messagesDir = path.join(process.cwd(), 'messages');

export const loadMessagesServer = async (): Promise<TMessages> => {
  const config = await getConfig();
  const locale = normalizeLocale(config.locale);
  const entries = await Promise.all(
    MESSAGE_NAMESPACES.map(async (ns) => {
      const raw = await fs.readFile(path.join(messagesDir, locale, `${ns}.json`), 'utf-8');
      return [ns, JSON.parse(raw)] as const;
    }),
  );
  return Object.fromEntries(entries);
};
