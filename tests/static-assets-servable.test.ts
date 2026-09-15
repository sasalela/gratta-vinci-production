import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

type VercelConfig = {
  builds?: Array<{ src?: string; use?: string }>;
  routes?: Array<{ src?: string; dest?: string }>;
};

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function loadIgnorePatterns(): string[] {
  const ignorePath = join(root, '.vercelignore');
  if (!existsSync(ignorePath)) return [];
  return readFileSync(ignorePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

/** Minimal .vercelignore matcher for root-level and simple glob patterns. */
function isIgnored(relPath: string, patterns: string[]): boolean {
  const normalized = relPath.replace(/^\.\//, '').replace(/\\/g, '/');
  for (const pattern of patterns) {
    if (pattern.endsWith('/')) {
      if (normalized === pattern.slice(0, -1) || normalized.startsWith(pattern)) return true;
      continue;
    }
    if (pattern.includes('*')) {
      const escaped = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '::DS::')
        .replace(/\*/g, '[^/]*')
        .replace(/::DS::/g, '.*');
      if (new RegExp(`^${escaped}$`).test(normalized)) return true;
      continue;
    }
    if (normalized === pattern || normalized.startsWith(`${pattern}/`)) return true;
  }
  return false;
}

function stripQuery(url: string): string {
  return url.split('?')[0].split('#')[0];
}

function isLocalAssetRef(ref: string): boolean {
  const value = stripQuery(ref.trim());
  if (!value) return false;
  if (/^(https?:|data:|mailto:|tel:|javascript:)/i.test(value)) return false;
  if (value.startsWith('//')) return false;
  return true;
}

function resolveLocalRef(htmlFile: string, ref: string): string {
  const cleaned = stripQuery(ref.trim()).replace(/^\//, '');
  const abs = join(dirname(join(root, htmlFile)), cleaned);
  return relative(root, abs).replace(/\\/g, '/');
}

function extractLocalAssets(htmlRel: string): string[] {
  const html = readFileSync(join(root, htmlRel), 'utf8');
  const refs: string[] = [];
  const scriptRe = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;
  const linkRe = /<link\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi;
  for (const re of [scriptRe, linkRe]) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(html)) !== null) {
      if (!isLocalAssetRef(match[1])) continue;
      refs.push(resolveLocalRef(htmlRel, match[1]));
    }
  }
  return [...new Set(refs)];
}

function publicHtmlFiles(config: VercelConfig): string[] {
  const fromBuilds = (config.builds || [])
    .filter((b) => b.use === '@vercel/static' && typeof b.src === 'string' && b.src.endsWith('.html'))
    .map((b) => b.src as string);
  // index.html is public even if only reached via "/"
  const listed = new Set(fromBuilds);
  if (existsSync(join(root, 'index.html'))) listed.add('index.html');
  return [...listed].sort();
}

function staticBuildSrcs(config: VercelConfig): Set<string> {
  return new Set(
    (config.builds || [])
      .filter((b) => b.use === '@vercel/static' && typeof b.src === 'string')
      .map((b) => (b.src as string).replace(/^\.\//, ''))
  );
}

function routedDests(config: VercelConfig): Set<string> {
  const dests = new Set<string>();
  for (const route of config.routes || []) {
    if (!route.dest) continue;
    const dest = route.dest.replace(/^\//, '').split('?')[0];
    if (dest && !dest.includes('(.*)')) dests.add(dest);
  }
  return dests;
}

function isServable(
  assetRel: string,
  builds: Set<string>,
  routes: Set<string>,
  ignorePatterns: string[]
): { ok: boolean; reason: string } {
  if (!existsSync(join(root, assetRel))) {
    return { ok: false, reason: `manca nel repo: ${assetRel}` };
  }
  if (isIgnored(assetRel, ignorePatterns)) {
    return { ok: false, reason: `escluso da .vercelignore: ${assetRel}` };
  }
  if (!builds.has(assetRel)) {
    return { ok: false, reason: `assente da builds @vercel/static: ${assetRel}` };
  }
  if (!routes.has(assetRel)) {
    return { ok: false, reason: `assente da routes: ${assetRel}` };
  }
  return { ok: true, reason: 'ok' };
}

describe('asset statici HTML pubblici servibili', () => {
  it('ogni script/link locale esiste ed è in builds+routes (non in .vercelignore)', () => {
    const config = loadJson<VercelConfig>(join(root, 'vercel.json'));
    const ignorePatterns = loadIgnorePatterns();
    const builds = staticBuildSrcs(config);
    const routes = routedDests(config);
    const htmlFiles = publicHtmlFiles(config);

    assert.ok(htmlFiles.length > 0, 'nessun HTML pubblico trovato');

    const failures: string[] = [];
    const seen = new Set<string>();

    for (const htmlRel of htmlFiles) {
      for (const asset of extractLocalAssets(htmlRel)) {
        if (seen.has(asset)) continue;
        seen.add(asset);
        const result = isServable(asset, builds, routes, ignorePatterns);
        if (!result.ok) {
          failures.push(`${htmlRel} → ${result.reason}`);
        }
      }
    }

    assert.deepEqual(failures, [], failures.join('\n'));
  });

  it('root HTML pubblici elencati in vercel builds', () => {
    const config = loadJson<VercelConfig>(join(root, 'vercel.json'));
    const builds = staticBuildSrcs(config);
    const rootHtml = readdirSync(root).filter((name) => name.endsWith('.html'));
    // game.html è legacy e non fa parte del deploy pannello/gioco attuale
    const expectedPublic = rootHtml.filter((name) => name !== 'game.html');
    for (const html of expectedPublic) {
      assert.ok(builds.has(html), `HTML pubblico senza build: ${html}`);
    }
  });
});
