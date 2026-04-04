import { useRouter } from 'next/router';
import { useCallback } from 'react';
import { ExternalLink } from 'lucide-react';
import type { ITaskTabLink } from '@/types/mission';

interface ITabLinkProps {
  tabLink: ITaskTabLink;
}

const TabLink = ({ tabLink }: ITabLinkProps) => {
  const router = useRouter();

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      router.push(`/?workspace=${tabLink.workspaceId}&tab=${tabLink.tabId}`);
    },
    [router, tabLink.workspaceId, tabLink.tabId],
  );

  return (
    <button
      type="button"
      className="ml-auto flex items-center gap-1 text-xs text-ui-blue hover:underline"
      onClick={handleClick}
    >
      {tabLink.workspaceName}
      <ExternalLink size={10} />
    </button>
  );
};

export default TabLink;
