import { useTranslations } from 'next-intl';

const TypingIndicator = () => {
  const t = useTranslations('agent');
  return (
  <div
    className="flex justify-start"
    aria-label={t('agentTypingAria')}
    aria-live="polite"
  >
    <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-muted px-4 py-3">
      <span
        className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/40"
        style={{ animationDelay: '0ms' }}
      />
      <span
        className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/40"
        style={{ animationDelay: '150ms' }}
      />
      <span
        className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/40"
        style={{ animationDelay: '300ms' }}
      />
    </div>
  </div>
  );
};

export default TypingIndicator;
