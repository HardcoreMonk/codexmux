import { getConfig } from '@/lib/config-store';
import fs from 'fs/promises';
import path from 'path';

type TMessages = Record<string, Record<string, unknown>>;

const NAMESPACES = [
  'common', 'sidebar', 'header', 'terminal', 'connection',
  'workspace', 'login', 'onboarding', 'settings', 'stats',
  'reset', 'reports', 'agents', 'agent', 'timeline',
  'notification', 'session', 'messageHistory', 'webBrowser',
  'mobile', 'toolsRequired', 'diff',
] as const;

const VALID_LOCALES = new Set([
  'en', 'ko', 'ja', 'zh-CN', 'es', 'de', 'fr', 'pt-BR', 'zh-TW', 'ru', 'tr',
]);

const resolveLocale = (locale: string | undefined): string =>
  locale && VALID_LOCALES.has(locale) ? locale : 'en';

const messagesDir = path.join(process.cwd(), 'messages');

export const loadMessagesServer = async (): Promise<TMessages> => {
  const config = await getConfig();
  const locale = resolveLocale(config.locale);
  const entries = await Promise.all(
    NAMESPACES.map(async (ns) => {
      const raw = await fs.readFile(path.join(messagesDir, locale, `${ns}.json`), 'utf-8');
      return [ns, JSON.parse(raw)] as const;
    }),
  );
  return Object.fromEntries(entries);
};
