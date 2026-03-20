import dayjs from 'dayjs';
import type { ITimelineUserMessage } from '@/types/timeline';

interface IUserMessageItemProps {
  entry: ITimelineUserMessage;
}

const UserMessageItem = ({ entry }: IUserMessageItemProps) => (
  <div className="animate-in fade-in duration-150">
    <span className="text-xs text-muted-foreground">
      {dayjs(entry.timestamp).format('HH:mm')}
    </span>
    <div className="mt-1 border-l-2 border-ui-blue bg-ui-blue/10 px-4 py-3">
      <p className="text-sm whitespace-pre-wrap break-words">{entry.text}</p>
    </div>
  </div>
);

export default UserMessageItem;
