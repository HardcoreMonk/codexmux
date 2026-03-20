import { ArrowDown } from 'lucide-react';

interface IScrollToBottomButtonProps {
  visible: boolean;
  onClick: () => void;
}

const ScrollToBottomButton = ({ visible, onClick }: IScrollToBottomButtonProps) => {
  if (!visible) return null;

  return (
    <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2">
      <button
        type="button"
        className="flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-xs shadow-sm transition-colors hover:bg-muted"
        onClick={onClick}
      >
        <ArrowDown size={12} />
        최신으로 이동
      </button>
    </div>
  );
};

export default ScrollToBottomButton;
