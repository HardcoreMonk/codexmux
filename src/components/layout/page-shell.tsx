import type { ReactNode } from 'react';
import useIsMobile from '@/hooks/use-is-mobile';
import MobileLayout from '@/components/features/mobile/mobile-layout';
import Sidebar from '@/components/layout/sidebar';

interface IPageShellProps {
  children: ReactNode;
}

const PageShell = ({ children }: IPageShellProps) => {
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
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      <Sidebar />
      <div className="relative flex min-w-0 flex-1 flex-col">
        {children}
      </div>
    </div>
  );
};

export default PageShell;
