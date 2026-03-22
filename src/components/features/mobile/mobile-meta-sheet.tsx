import { Sheet, SheetContent } from '@/components/ui/sheet';
import { MetaDetail } from '@/components/features/terminal/session-meta-content';
import type { IMetaDetailProps } from '@/components/features/terminal/session-meta-content';
import type { IGitStatus } from '@/lib/git-status';

interface ISessionMetaData {
  title: string;
  createdAt: string | null;
  updatedAt: string | null;
  userCount: number;
  assistantCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  totalCost: number | null;
  tokensByModel: IMetaDetailProps['tokensByModel'];
}

interface IMobileMetaSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meta: ISessionMetaData;
  branch: string | null;
  isBranchLoading: boolean;
  sessionId: string | null;
  gitStatus: IGitStatus | null;
}

const MobileMetaSheet = ({
  open,
  onOpenChange,
  meta,
  branch,
  isBranchLoading,
  sessionId,
  gitStatus,
}: IMobileMetaSheetProps) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side="bottom" showCloseButton={false} className="rounded-t-xl">
      <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-muted-foreground/20" />
      <div className="px-4 pt-4 pb-6">
        <MetaDetail
          title={meta.title}
          sessionId={sessionId}
          createdAt={meta.createdAt}
          updatedAt={meta.updatedAt}
          userCount={meta.userCount}
          assistantCount={meta.assistantCount}
          inputTokens={meta.inputTokens}
          outputTokens={meta.outputTokens}
          totalTokens={meta.totalTokens}
          totalCost={meta.totalCost}
          tokensByModel={meta.tokensByModel}
          branch={branch}
          isBranchLoading={isBranchLoading}
          gitStatus={gitStatus}
        />
      </div>
    </SheetContent>
  </Sheet>
);

export default MobileMetaSheet;
