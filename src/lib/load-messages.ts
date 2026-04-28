import { getConfig } from '@/lib/config-store';
import { normalizeLocale, type TSupportedLocale } from '@/lib/locales';
import { MESSAGE_NAMESPACES } from '@/lib/message-namespaces';
import fs from 'fs/promises';
import path from 'path';

type TMessages = Record<string, Record<string, unknown>>;

const messagesDir = path.join(process.cwd(), 'messages');

export const resolveMessagesLocale = async (): Promise<TSupportedLocale> => {
  const config = await getConfig();
  return normalizeLocale(config.locale);
};

export const loadMessagesServer = async (locale?: TSupportedLocale): Promise<TMessages> => {
  const resolvedLocale = locale ?? await resolveMessagesLocale();
  const entries = await Promise.all(
    MESSAGE_NAMESPACES.map(async (ns) => {
      const raw = await fs.readFile(path.join(messagesDir, resolvedLocale, `${ns}.json`), 'utf-8');
      return [ns, JSON.parse(raw)] as const;
    }),
  );
  return Object.fromEntries(entries);
};

export const loadMessagesServerBundle = async (): Promise<{ locale: TSupportedLocale; messages: TMessages }> => {
  const locale = await resolveMessagesLocale();
  return { locale, messages: await loadMessagesServer(locale) };
};
