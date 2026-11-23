export function parseOwnersSection(markdown: string, heading: string): string[] {
  const lines = markdown.split('\n');
  const target = heading.trim().toLowerCase();
  const start = lines.findIndex((l) => {
    const m = l.match(/^#{2,6}\s+(.+?)\s*$/);
    return m !== null && m[1].toLowerCase() === target;
  });
  if (start === -1) throw new Error(`OWNERS.md: section "${heading}" not found`);
  const logins: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,6}\s/.test(line)) break;
    for (const m of line.matchAll(/github\.com\/([A-Za-z0-9-]+)\)/g))
      logins.push(m[1].toLowerCase());
  }
  if (logins.length === 0)
    throw new Error(`OWNERS.md: section "${heading}" lists no GitHub logins`);
  return [...new Set(logins)];
}

export function parseCodeowners(
  text: string,
  team: string,
  user: string,
): { ownerless: Set<string>; mine: Set<string> } {
  const ownerless = new Set<string>();
  const mine = new Set<string>();
  for (const line of text.split('\n')) {
    // Only top-level workspace entries: /workspaces/<name> or /workspaces/<name>/
    const m = line.match(/^\/workspaces\/([^/\s]+)\/?\s+(.+)$/);
    if (!m) continue;
    const owners = m[2].replace(/#.*$/, '').trim().split(/\s+/);
    if (owners.length === 1 && owners[0].toLowerCase() === team.toLowerCase()) ownerless.add(m[1]);
    if (owners.some((o) => o.toLowerCase() === `@${user.toLowerCase()}`)) mine.add(m[1]);
  }
  return { ownerless, mine };
}

export type PoolKind = 'mine' | 'ownerless' | 'repo';

export function classifyPool(
  paths: string[],
  cw: { ownerless: Set<string>; mine: Set<string> },
): PoolKind | null {
  if (paths.length === 0) return null;
  const ws = new Set(
    paths
      .filter((p) => p.startsWith('workspaces/') && p.split('/').length > 2)
      .map((p) => p.split('/')[1]),
  );
  if (ws.size === 0) return 'repo';
  if ([...ws].some((w) => cw.mine.has(w))) return 'mine';
  if ([...ws].every((w) => cw.ownerless.has(w))) return 'ownerless';
  return null;
}
