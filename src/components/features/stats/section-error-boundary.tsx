import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { useTranslations } from 'next-intl';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ISectionErrorBoundaryProps {
  children: ReactNode;
  sectionName: string;
}

interface ISectionErrorBoundaryState {
  hasError: boolean;
}

const ErrorFallback = ({ onRetry }: { onRetry: () => void }) => {
  const t = useTranslations('stats');
  const tc = useTranslations('common');

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl bg-card py-12 ring-1 ring-foreground/10">
      <AlertCircle className="h-5 w-5 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{t('errorLoadFailed')}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="mr-1.5 h-3 w-3" />
        {tc('retry')}
      </Button>
    </div>
  );
};

class SectionErrorBoundary extends Component<ISectionErrorBoundaryProps, ISectionErrorBoundaryState> {
  state: ISectionErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ISectionErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.sectionName}] Error:`, error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return <ErrorFallback onRetry={this.handleRetry} />;
    }

    return this.props.children;
  }
}

export default SectionErrorBoundary;
