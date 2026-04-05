import { cn } from '@/lib/utils';

interface ISpinnerProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: number;
}

const Spinner = ({ className, size, style, ...props }: ISpinnerProps) => (
  <span
    className={cn('shrink-0 animate-spin rounded-full border border-current border-t-transparent', className)}
    style={size ? { width: size, height: size, ...style } : style}
    aria-hidden="true"
    {...props}
  />
);

export default Spinner;
