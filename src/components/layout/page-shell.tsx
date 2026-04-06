import type { ReactElement, ReactNode } from 'react';
import useIsMobile from '@/hooks/use-is-mobile';
import MobileLayout from '@/components/features/mobile/mobile-layout';
import Sidebar from '@/components/layout/sidebar';
import useSync from '@/hooks/use-sync';
import useAgentStatus from '@/hooks/use-agent-status';

interface IPageShellProps {
  children: ReactNode;
}

const PageShell = ({ children }: IPageShellProps) => {
  useSync();
  useAgentStatus();

  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="flex h-dvh w-full flex-col overflow-hidden bg-background">
        <MobileLayout>
          {children}
        </MobileLayout>
      </div>
    );
  }

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background max-md:hidden">
      <Sidebar />
      <div className="relative flex min-w-0 flex-1 flex-col">
        {children}
      </div>
    </div>
  );
};

export const getPageShellLayout = (page: ReactElement) => <PageShell>{page}</PageShell>;

export const getPageShellWithTitlebarLayout = (page: ReactElement) => (
  <PageShell>
    <div className="flex min-h-0 flex-1 flex-col pt-titlebar">{page}</div>
  </PageShell>
);

export default PageShell;
