export const LOCAL_WORKSPACE_KEY = 'orbit.device-workspace.v1';
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
export type LocalWorkspace = Record<string, unknown> & { schema: 1; savedAt: string };
export function readLocalWorkspace(storage: StorageLike): LocalWorkspace | null {
  const raw = storage.getItem(LOCAL_WORKSPACE_KEY);
  if (raw === null) return null;
  const value = JSON.parse(raw);
  if (!value || value.schema !== 1 || !Array.isArray(value.tasks) || !Array.isArray(value.projects)) throw new Error('Unreadable local workspace; existing bytes preserved');
  return value;
}
export function saveLocalWorkspace(storage: StorageLike, value: Record<string, unknown>, expectedRevision?: string | null) {
  // One atomic write keeps the previous complete snapshot on quota failure.
  // Never silently replace an unreadable earlier snapshot.
  const current = readLocalWorkspace(storage);
  if (expectedRevision !== undefined && (current?.revision ?? null) !== expectedRevision) {
    const copy = { ...value, schema: 1, savedAt: new Date().toISOString(), conflictWith: current?.revision ?? null };
    storage.setItem('orbit.device-conflict.v1:' + crypto.randomUUID(), JSON.stringify(copy));
    throw new Error('Another tab saved a newer workspace. Your input is preserved in a separate device recovery copy.');
  }
  const revision = crypto.randomUUID();
  storage.setItem(LOCAL_WORKSPACE_KEY, JSON.stringify({ ...value, schema: 1, revision, savedAt: new Date().toISOString() }));
  return revision;
}
export function localNavigation(href: string, paths: Record<string, string>) {
  const target = new URL(href, 'https://orbit.invalid');
  const view = Object.entries(paths).find(([, path]) => path === target.pathname)?.[0] ?? (target.pathname.startsWith('/projects/') ? 'projects' : 'today');
  const params = new URLSearchParams(target.search); params.set('view', view);
  if (target.pathname.startsWith('/projects/')) params.set('projectId', decodeURIComponent(target.pathname.slice(10)));
  return '/offline?' + params;
}
export function blockLocalApi(target: { fetch: typeof fetch; location: { href: string } }) {
  const previous = target.fetch;
  target.fetch = ((input: RequestInfo | URL, options?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, target.location.href);
    if (url.origin === new URL(target.location.href).origin && /^\/api(?:\/|$)/.test(url.pathname)) return Promise.reject(new Error('Account actions and file uploads require an online account. Local workspace edits stay on this device.'));
    return previous.call(target, input, options);
  }) as typeof fetch;
  return () => { target.fetch = previous; };
}
