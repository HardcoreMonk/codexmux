import { normalizeLocale, type TSupportedLocale } from '@/lib/locales';

export type TStatusPushType = 'review' | 'needs-input';

const STATUS_PUSH_TITLES: Record<TSupportedLocale, Record<TStatusPushType, string>> = {
  ko: {
    review: '작업 완료',
    'needs-input': '입력 필요',
  },
  en: {
    review: 'Task Complete',
    'needs-input': 'Input Required',
  },
};

export const buildStatusPushTitle = ({
  pushType,
  locale,
}: {
  pushType: TStatusPushType;
  locale?: string | null;
}): string => STATUS_PUSH_TITLES[normalizeLocale(locale)][pushType];
