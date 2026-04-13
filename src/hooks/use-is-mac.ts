import { useSyncExternalStore } from 'react';

const detectMac = () =>
  /Mac|iPhone|iPad|iPod/.test(navigator.platform ?? navigator.userAgent);

const subscribe = () => () => {};

const useIsMac = () =>
  useSyncExternalStore(
    subscribe,
    () => detectMac(),
    () => false,
  );

export default useIsMac;
