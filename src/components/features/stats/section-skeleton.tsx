import { Skeleton } from '@/components/ui/skeleton';

interface ISectionSkeletonProps {
  cardCount?: number;
  hasChart?: boolean;
}

const SectionSkeleton = ({ cardCount = 0, hasChart = true }: ISectionSkeletonProps) => {
  return (
    <div className="space-y-4">
      {cardCount > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: cardCount }).map((_, i) => (
            <div key={i} className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
              <Skeleton className="mb-2 h-3 w-16" />
              <Skeleton className="h-7 w-24" />
            </div>
          ))}
        </div>
      )}
      {hasChart && (
        <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <Skeleton className="mb-4 h-4 w-32" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}
    </div>
  );
};

export default SectionSkeleton;
