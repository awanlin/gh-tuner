// test/capacity-owners.test.ts
import { describe, it, expect } from 'vitest';
import { parseOwnersSection, parseCodeowners, classifyPool } from '../src/capacity/owners.js';

const OWNERS = `# Owners

## Core Maintainers

Team: @backstage/maintainers

| Maintainer | Organization | GitHub | Discord |
| --- | --- | --- | --- |
| André Wanlin | Spotify | [awanlin](https://github.com/awanlin) | x |
| Patrik Oldsberg | Spotify | [Rugvip](https://github.com/Rugvip) | x |

## Project Areas

### Community Plugins

| Name | Organization | GitHub | Discord |
| --- | --- | --- | --- |
| André Wanlin | Spotify | [awanlin](https://github.com/awanlin) | x |
| Kashish Mittal | Red Hat | [04kash](https://github.com/04kash) | x |

### Design System

| Charles | Spotify | [cdedreuille](https://github.com/cdedreuille) | x |
`;

describe('parseOwnersSection', () => {
  it('reads an h2 section and stops at the next heading', () => {
    expect(parseOwnersSection(OWNERS, 'Core Maintainers')).toEqual(['awanlin', 'rugvip']);
  });
  it('reads an h3 section and does not bleed into the next one', () => {
    expect(parseOwnersSection(OWNERS, 'Community Plugins')).toEqual(['awanlin', '04kash']);
  });
  it('is case-insensitive on the heading', () => {
    expect(parseOwnersSection(OWNERS, 'core maintainers')).toHaveLength(2);
  });
  it('throws when the heading is missing', () => {
    expect(() => parseOwnersSection(OWNERS, 'Nope')).toThrow(/Nope/);
  });
});

const CO = `# comment
/workspaces/3scale     @backstage/community-plugins-maintainers @04kash @someone
/workspaces/tech-radar @backstage/community-plugins-maintainers
/workspaces/linguist   @backstage/community-plugins-maintainers @awanlin
/workspaces/catalog    @backstage/community-plugins-maintainers @awanlin @freben
/workspaces/catalog/plugins/x @backstage/community-plugins-maintainers @other
/.github               @backstage/community-plugins-maintainers
`;

describe('parseCodeowners', () => {
  const cw = parseCodeowners(CO, '@backstage/community-plugins-maintainers', 'awanlin');
  it('finds ownerless workspaces (team only)', () =>
    expect([...cw.ownerless]).toEqual(['tech-radar']));
  it('finds workspaces naming the user', () =>
    expect([...cw.mine].sort()).toEqual(['catalog', 'linguist']));
});

describe('classifyPool', () => {
  const cw = {
    ownerless: new Set(['tech-radar']),
    mine: new Set(['linguist']),
  };
  it('ownerless workspace', () =>
    expect(classifyPool(['workspaces/tech-radar/a.ts'], cw)).toBe('ownerless'));
  it("user's workspace wins over an owned one", () =>
    expect(classifyPool(['workspaces/linguist/a.ts', 'workspaces/3scale/b.ts'], cw)).toBe('mine'));
  it('repo-level when nothing is under workspaces/', () =>
    expect(classifyPool(['.github/workflows/ci.yml', 'package.json'], cw)).toBe('repo'));
  it('owned workspace + root files is owned (null)', () =>
    expect(classifyPool(['workspaces/3scale/a.ts', 'yarn.lock'], cw)).toBeNull());
  it('empty file list is null', () => expect(classifyPool([], cw)).toBeNull());
});

describe('owners edge cases', () => {
  it('strips trailing comments and matches team case-insensitively', () => {
    const cw = parseCodeowners(
      '/workspaces/a @Backstage/Team # note @awanlin\n',
      '@backstage/team',
      'awanlin',
    );
    expect([...cw.ownerless]).toEqual(['a']);
    expect([...cw.mine]).toEqual([]);
  });
  it('workspaces/README.md is repo-level', () =>
    expect(
      classifyPool(['workspaces/README.md'], {
        ownerless: new Set(),
        mine: new Set(),
      }),
    ).toBe('repo'));
});
