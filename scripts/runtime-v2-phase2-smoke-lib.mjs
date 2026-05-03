export const collectPaneNodes = (layout) => {
  const panes = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'pane') {
      panes.push(node);
      return;
    }
    if (node.type === 'split' && Array.isArray(node.children)) {
      node.children.forEach(visit);
    }
  };
  visit(layout?.root);
  return panes;
};

export const collectLayoutTabs = (layout) =>
  collectPaneNodes(layout).flatMap((pane) => Array.isArray(pane.tabs) ? pane.tabs : []);

export const resolveSmokeTerminalEndpoint = (tab) =>
  tab?.runtimeVersion === 2 ? '/api/v2/terminal' : '/api/terminal';

export const buildSmokeTerminalWsUrl = ({
  baseUrl,
  endpoint,
  sessionName,
  clientId,
  cols,
  rows,
}) => {
  const url = new URL(endpoint, baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('clientId', clientId);
  url.searchParams.set('session', sessionName);
  if (cols && rows) {
    url.searchParams.set('cols', String(cols));
    url.searchParams.set('rows', String(rows));
  }
  return url;
};

export const extractCookieHeader = (response) => {
  const headers = response?.headers;
  const cookies = typeof headers?.getSetCookie === 'function'
    ? headers.getSetCookie()
    : [];
  const raw = cookies[0] ?? (typeof headers?.get === 'function' ? headers.get('set-cookie') : null);
  if (!raw) return '';
  return raw.split(';')[0] ?? '';
};
