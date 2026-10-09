import { describe, expect, it } from 'vitest';
import { auditPublic, isBinary, type PublicFile } from '../../../scripts/audit/public.ts';

// Samples are put together at run time, so that this file holds none of what it looks for.
const join = (...parts: string[]) => parts.join('');
const file = (path: string, text: string | null = ''): PublicFile => ({ path, text });

describe('a folder published as it is', () => {
  it('passes with code, its documents and links between them', () => {
    expect(
      auditPublic([
        file('README.md', 'See [PRIVACY.md](PRIVACY.md) and docs/PERMISSIONS.md.'),
        file('PRIVACY.md'),
        file('docs/PERMISSIONS.md', `Back to [the readme](${join('../README', '.md')}).`),
        file('src/a.ts', "import { b } from '../lib/b.ts'; // user@example.com, x@site.test"),
        file('public/icon/16.png', null),
      ]),
    ).toEqual([]);
  });

  it('refuses a file of secrets by its name, whatever it holds', () => {
    const errors = auditPublic(
      [
        '.env',
        'config/.env.production',
        'certs/server.pem',
        'deploy.key',
        '.npmrc',
        'id_ed25519',
      ].map((path) => file(path)),
    );
    expect(errors).toHaveLength(6);
    expect(auditPublic([file('.env.example')])).toEqual([]);
  });

  it('refuses keys and tokens inside any file', () => {
    const samples = [
      join('-----BEGIN ', 'RSA PRIVATE KEY-----'),
      join('ghp_', 'a'.repeat(36)),
      join('github_pat_', 'A'.repeat(60)),
      join('npm_', 'b'.repeat(36)),
      join('AKIA', 'ABCDEFGHIJKLMNOP'),
      join('AIza', 'c'.repeat(35)),
      join('xoxb-', '1234567890-abc'),
      join('sk-', 'd'.repeat(24)),
    ];
    for (const sample of samples) {
      expect(auditPublic([file('src/x.ts', `const k = '${sample}';`)])).toHaveLength(1);
    }
  });

  it('refuses a path on a machine and a real mail address', () => {
    expect(
      auditPublic([file('a.ts', `// built in ${join('/ho', 'me/dev/project')}`)]),
    ).toHaveLength(1);
    expect(auditPublic([file('a.ts', `cd ${join('/Us', 'ers/dev')}`)])).toHaveLength(1);
    expect(auditPublic([file('a.ts', `"${join('C:', '\\Users\\dev')}"`)])).toHaveLength(1);
    expect(auditPublic([file('a.ts', `mail ${join('someone', '@', 'gmail.com')}`)])).toHaveLength(
      1,
    );
    // A package at a version is no address.
    expect(auditPublic([file('pnpm-lock.yaml', 'wxt@0.21.4 vite@8.3.1')])).toEqual([]);
  });

  it('refuses a pointer to a document the folder does not hold', () => {
    const cited = join('SP', 'EC §25');
    expect(auditPublic([file('a.ts', `// as ${cited} says`)])).toHaveLength(1);
    expect(auditPublic([file('a.ts', `// see ${join('SP', 'EC L1258')}`)])).toHaveLength(1);
    expect(auditPublic([file('a.ts', `// see ${join('notes', '.md')}`)])).toHaveLength(1);
    const outside = join('../../outside', '.md');
    expect(auditPublic([file(join('docs/a', '.md'), `see [x](${outside})`)])).toHaveLength(1);
    // The word alone, in a sentence of its own, points nowhere.
    expect(auditPublic([file('a.ts', '// the spec of the format')])).toEqual([]);
  });

  it('refuses a path that leaves the folder, written whole or built step by step', () => {
    const up = join('.', '.');
    const steps = `join(import.meta.dirname, '${up}', '${up}', 'docs', 'brand', 'icon.svg')`;
    expect(auditPublic([file('scripts/icons.ts', steps)])).toHaveLength(1);
    expect(
      auditPublic([file('scripts/a.ts', `read('${join(up, '/', up, '/x.json')}')`)]),
    ).toHaveLength(1);
    // Inside the folder, however deep, is fine.
    expect(
      auditPublic([
        file('src/core/media/a.ts', `import b from '${join(up, '/', up, '/ui/b.ts')}';`),
        file('src/ui/b.ts'),
        file('scripts/b.ts', `join(import.meta.dirname, '${up}', 'package.json')`),
      ]),
    ).toEqual([]);
  });

  it("refuses a file named by a path from the folder's own directories that it does not hold", () => {
    const missing = join('docs/brand/', 'icon.svg');
    const errors = auditPublic([
      file('scripts/icons.ts', `// drawn from ${missing}`),
      file(join('docs/PERMISSIONS', '.md')),
    ]);
    expect(errors).toHaveLength(1);
    // A test names made-up files on purpose.
    expect(auditPublic([file('tests/a.test.ts', `// ${missing}`), file('docs/x.txt')])).toEqual([]);
  });

  it('reads no binary file as text', () => {
    expect(isBinary('public/icon/128.png')).toBe(true);
    expect(isBinary('src/a.ts')).toBe(false);
  });
});
