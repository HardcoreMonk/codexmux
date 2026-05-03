const STATUS_DISABLED_PATHS = new Set(['/login']);

export const shouldEnableAgentStatus = (pathname: string | null | undefined): boolean =>
  !pathname || !STATUS_DISABLED_PATHS.has(pathname);
