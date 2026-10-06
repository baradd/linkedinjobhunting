export const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const stripHtml = (html: string): string =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

export const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

export const slug = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '');

export const escapeRegExp = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const isSourceDisabled = (name: string): boolean =>
  (process.env.DISABLE_SOURCES ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .includes(name);

/** Whole-word (token) match, so "node" matches "Node/React" but not "nodes" or "anode". */
export const containsWord = (haystack: string, word: string): boolean => {
  const w = word.trim().toLowerCase();
  if (!w) return false;
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(w)}($|[^a-z0-9])`, 'i').test(
    haystack,
  );
};

export const fetchJson = async <T>(url: string): Promise<T> => {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'linkedin-job-bot/1.0 (+personal job alerts)',
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return (await res.json()) as T;
};
