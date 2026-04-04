import type { ReactNode } from 'react';
import useIsMobile from '@/hooks/use-is-mobile';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import MobileLayout from '@/components/features/mobile/mobile-layout';
import AppHeader from '@/components/layout/app-header';

interface IPageShellProps {
  children: ReactNode;
  showAppHeader?: boolean;
}

const switchWorkspace = (workspaceId: string) => {
  useWorkspaceStore.getState().switchWorkspace(workspaceId);
};

const PageShell = ({ children, showAppHeader }: IPageShellProps) => {
  const isMobile = useIsMobile();

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-background">
      {isMobile ? (
        <MobileLayout onSelectWorkspace={switchWorkspace}>
          {children}
        </MobileLayout>
      ) : (
        <>
          {showAppHeader && <AppHeader />}
          {children}
        </>
      )}
    </div>
  );
};

export default PageShell;
