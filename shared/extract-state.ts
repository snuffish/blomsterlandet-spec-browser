/**
 * Blomsterlandet ships each page's view model as:
 *
 *   window.__PRELOADED_STATE__ = "{"header":{...}}";
 *
 * That is a JS *string literal* whose contents are JSON — the payload is double-encoded.
 * Unescaping with a blanket \uXXXX substitution corrupts genuinely escaped quotes inside
 * the HTML-bearing fields, so the literal must be decoded first and parsed second.
 */
const MARKER = 'window.__PRELOADED_STATE__';

export class ExtractionError extends Error {}

export function extractPreloadedState<T = unknown>(html: string): T {
  const marker = html.indexOf(MARKER);
  if (marker === -1) throw new ExtractionError(`${MARKER} not found — page shape changed?`);

  const open = html.indexOf('"', html.indexOf('=', marker) + 1);
  if (open === -1) throw new ExtractionError('No string literal after the assignment');

  let end = -1;
  for (let i = open + 1, escaped = false; i < html.length; i++) {
    const ch = html[i];
    if (escaped) escaped = false;
    else if (ch === '\\') escaped = true;
    else if (ch === '"') {
      end = i;
      break;
    }
  }
  if (end === -1) throw new ExtractionError('Unterminated string literal');

  try {
    return JSON.parse(JSON.parse(html.slice(open, end + 1)) as string) as T;
  } catch (cause) {
    throw new ExtractionError(`Double-decode failed: ${(cause as Error).message}`);
  }
}

/** Depth-first search for every node carrying a given `component` discriminator. */
export function findComponents<T = Record<string, unknown>>(root: unknown, component: string): T[] {
  const found: T[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
    } else if (node && typeof node === 'object') {
      const record = node as Record<string, unknown>;
      if (record.component === component) found.push(record as T);
      Object.values(record).forEach(visit);
    }
  };
  visit(root);
  return found;
}
