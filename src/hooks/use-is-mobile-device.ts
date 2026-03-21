import { useSyncExternalStore } from 'react';

const MOBILE_UA_RE = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

const getSnapshot = () => {
  if (typeof navigator === 'undefined') return false;
  return MOBILE_UA_RE.test(navigator.userAgent) || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
};

const getServerSnapshot = () => false;

const subscribe = (_cb: () => void) => () => {};

const useIsMobileDevice = (): boolean =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

export default useIsMobileDevice;
