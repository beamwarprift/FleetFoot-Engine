// CLI for the build audits. Runs on the production output in .output/ (never on a dev build, which
// carries reload tooling), except `modules` and `public`, which read the source.
// Usage: node scripts/audit.ts <manifest|privacy|size|modules|public>

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseJson, readObject, readString } from './audit/json.ts';
import {
  auditManifest,
  auditPermissionDocs,
  parseManifestPolicy,
  type Target,
} from './audit/manifest.ts';
import { auditModules, isProductModule, lineCount, parseModulePolicy } from './audit/modules.ts';
import {
  auditRuntimeDependencies,
  classifyFile,
  type Finding,
  parseNetworkAllowlist,
  scanText,
} from './audit/privacy.ts';
import { auditPublic, isBinary } from './audit/public.ts';
import { auditSize, isJavaScript, parseBudget } from './audit/size.ts';

const ROOT = join(import.meta.dirname, '..');
const OUTPUT = join(ROOT, '.output');
const TARGETS: readonly Target[] = ['chrome', 'firefox'];

function readJsonFile(path: string): unknown {
  return parseJson(readFileSync(path, 'utf8'), relative(ROOT, path));
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .map((entry) => join(dir, entry))
    .filter((path) => statSync(path).isFile());
}

function targetDir(target: Target): string {
  return join(OUTPUT, `${target}-mv3`);
}

function packageField(field: 'name' | 'version'): string {
  const pkg = readObject(readJsonFile(join(ROOT, 'package.json')), 'package.json');
  return readString(pkg, field, 'package.json');
}

// WXT names store zips `<package name>-<version>-<browser>.zip`.
function zipFor(target: Target): string {
  return join(OUTPUT, `${packageField('name')}-${packageField('version')}-${target}.zip`);
}

function runManifest(): string[] {
  const policy = parseManifestPolicy(
    readJsonFile(join(ROOT, 'config/manifest-policy.json')),
    'config/manifest-policy.json',
  );
  const version = packageField('version');
  const errors = TARGETS.flatMap((target) =>
    auditManifest(
      readJsonFile(join(targetDir(target), 'manifest.json')),
      policy,
      target,
      version,
    ).map((error) => `${target}: ${error}`),
  );
  const docs = readFileSync(join(ROOT, 'docs/PERMISSIONS.md'), 'utf8');
  return [...errors, ...auditPermissionDocs(policy, docs)];
}

function formatFinding(finding: Finding): string {
  return `${finding.file}: ${finding.rule} → ${finding.match}`;
}

function runPrivacy(): string[] {
  const allowlist = parseNetworkAllowlist(
    readJsonFile(join(ROOT, 'config/network-allowlist.json')),
    'config/network-allowlist.json',
  );
  const errors = auditRuntimeDependencies(readJsonFile(join(ROOT, 'package.json')));
  for (const target of TARGETS) {
    const dir = targetDir(target);
    for (const path of listFiles(dir)) {
      const file = relative(dir, path).split('\\').join('/');
      const kind = classifyFile(file);
      if (kind === 'forbidden') {
        errors.push(`${target}/${file}: file type not allowed in the bundle`);
      } else if (kind === 'scan') {
        const findings = scanText(`${target}/${file}`, readFileSync(path, 'utf8'), allowlist);
        errors.push(...findings.map(formatFinding));
      }
    }
  }
  return errors;
}

function runSize(): string[] {
  const budget = parseBudget(
    readJsonFile(join(ROOT, 'config/budgets.json')),
    'config/budgets.json',
  );
  return TARGETS.flatMap((target) => {
    const jsBytes = listFiles(targetDir(target))
      .filter(isJavaScript)
      .reduce((sum, path) => sum + statSync(path).size, 0);
    const zipBytes = statSync(zipFor(target)).size;
    console.log(
      `${target}: JS ${jsBytes} B / ${budget.jsBytesMax} B, zip ${zipBytes} B / ${budget.zipBytesMax} B`,
    );
    return auditSize(target, { jsBytes, zipBytes }, budget);
  });
}

function runModules(): string[] {
  const policy = parseModulePolicy(
    readJsonFile(join(ROOT, 'config/module-size.json')),
    'config/module-size.json',
  );
  const lengths: Record<string, number> = {};
  for (const dir of ['src', 'entrypoints']) {
    for (const path of listFiles(join(ROOT, dir))) {
      const file = relative(ROOT, path).split('\\').join('/');
      if (isProductModule(file)) lengths[file] = lineCount(readFileSync(path, 'utf8'));
    }
  }
  const longest = Math.max(...Object.values(lengths));
  console.log(
    `modules: ${Object.keys(lengths).length}, longest ${longest} / ${policy.maxLines} lines`,
  );
  return auditModules(lengths, policy);
}

/**
 * Every file of this folder that git tracks or would track: what a publication of it carries,
 * new files included before they are added.
 */
function runPublic(): string[] {
  const tracked = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: ROOT, encoding: 'utf8' },
  )
    .split('\0')
    .filter((path) => path !== '');
  console.log(`public: ${tracked.length} files`);
  return auditPublic(
    tracked.map((path) => ({
      path,
      text: isBinary(path) ? null : readFileSync(join(ROOT, path), 'utf8'),
    })),
  );
}

const AUDITS: Readonly<Record<string, () => string[]>> = {
  manifest: runManifest,
  privacy: runPrivacy,
  size: runSize,
  modules: runModules,
  public: runPublic,
};

const kind = process.argv[2] ?? '';
const audit = AUDITS[kind];
if (audit === undefined) {
  console.error(`usage: node scripts/audit.ts <${Object.keys(AUDITS).join('|')}>`);
  process.exit(2);
}

const errors = audit();
if (errors.length > 0) {
  console.error(`audit:${kind} FAILED (${errors.length})`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log(`audit:${kind} PASS`);
