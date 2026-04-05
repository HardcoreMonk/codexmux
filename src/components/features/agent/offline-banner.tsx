import { AlertTriangle } from 'lucide-react';
import Spinner from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';

interface IOfflineBannerProps {
  isRestarting: boolean;
  error?: string | null;
  onRestart: () => void;
}

const OfflineBanner = ({ isRestarting, error, onRestart }: IOfflineBannerProps) => (
  <div className="mb-4 rounded-lg border border-negative/20 bg-negative/10 p-3">
    <div className="flex items-center gap-2">
      {isRestarting ? (
        <>
          <Spinner size={12} className="text-muted-foreground" />
          <span className="text-sm text-muted-foreground">재시작 중...</span>
        </>
      ) : (
        <>
          <AlertTriangle size={14} className="text-negative" />
          <span className="text-sm">
            {error ?? '에이전트가 오프라인입니다'}
          </span>
          <Button variant="outline" size="sm" className="ml-auto h-7" onClick={onRestart}>
            재시작
          </Button>
        </>
      )}
    </div>
  </div>
);

export default OfflineBanner;
