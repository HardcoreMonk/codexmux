import useIsMac from '@/hooks/use-is-mac';

interface IShortcutKeyProps {
  mac: string;
  other: string;
  className?: string;
}

const ShortcutKey = ({ mac, other, className }: IShortcutKeyProps) => {
  const isMac = useIsMac();
  return <span className={className}>{isMac ? mac : other}</span>;
};

export default ShortcutKey;
