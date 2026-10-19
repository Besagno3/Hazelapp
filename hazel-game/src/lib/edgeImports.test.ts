import { describe, it, expect } from 'vitest';
// The Deno side's TEXT (`?raw`: its `npm:` imports are never resolved here).
import lockText from '../../package-lock.json?raw';

const sources = import.meta.glob('../../supabase/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;

/** Every remote import in a file: `npm:` / `jsr:` / URL specifiers, static or dynamic. */
function remoteImports(text: string): string[] {
  const found = text.matchAll(/(?:from\s+|import\s*\(\s*)['"]((?:npm:|jsr:|https?:\/\/)[^'"]+)['"]/g);
  return [...found].map((m) => m[1]);
}

/** `npm:@scope/name@1.2.3/sub` → name + version (version null when it has none). */
function parseSpecifier(spec: string): { name: string; version: string | null } {
  const body = spec.replace(/^(npm|jsr):/, '');
  const at = body.indexOf('@', body.startsWith('@') ? 1 : 0);
  if (at < 0) return { name: body.split('/').slice(0, body.startsWith('@') ? 2 : 1).join('/'), version: null };
  return { name: body.slice(0, at), version: body.slice(at + 1).split('/')[0] };
}

describe('the edge function and scripts pin their imports (#131d)', () => {
  const files = Object.entries(sources);

  it('finds the function and the recheck script', () => {
    const names = files.map(([path]) => path);
    expect(names.some((p) => p.endsWith('functions/generate-questions/index.ts'))).toBe(true);
    expect(names.some((p) => p.endsWith('scripts/recheck-questions.ts'))).toBe(true);
  });

  it('every npm: / jsr: / URL import names an exact version', () => {
    const loose = files.flatMap(([path, text]) =>
      remoteImports(text)
        .filter((spec) =>
          spec.startsWith('http') ? !/@\d+\.\d+\.\d+/.test(spec) : !/^\d+\.\d+\.\d+$/.test(parseSpecifier(spec).version ?? ''),
        )
        .map((spec) => `${path}: ${spec}`),
    );
    expect(loose).toEqual([]);
  });

  it('a package has one version everywhere on the Deno side', () => {
    const versions = new Map<string, Set<string>>();
    for (const [, text] of files) {
      for (const spec of remoteImports(text).filter((s) => !s.startsWith('http'))) {
        const { name, version } = parseSpecifier(spec);
        versions.set(name, new Set([...(versions.get(name) ?? []), version ?? 'none']));
      }
    }
    const split = [...versions].filter(([, v]) => v.size > 1).map(([name, v]) => `${name}: ${[...v].join(', ')}`);
    expect(split).toEqual([]);
  });

  it('supabase-js is the version the app installs (package-lock)', () => {
    const lock = JSON.parse(lockText) as { packages: Record<string, { version?: string }> };
    const app = lock.packages['node_modules/@supabase/supabase-js']?.version;
    expect(app).toBeTruthy();
    const pinned = files.flatMap(([, text]) =>
      remoteImports(text)
        .map(parseSpecifier)
        .filter((s) => s.name === '@supabase/supabase-js'),
    );
    expect(pinned.length).toBeGreaterThan(0);
    for (const s of pinned) expect(s.version).toBe(app);
  });

  it('reads specifiers the way Deno writes them', () => {
    expect(parseSpecifier('npm:@anthropic-ai/sdk@0.135.0')).toEqual({ name: '@anthropic-ai/sdk', version: '0.135.0' });
    expect(parseSpecifier('npm:@anthropic-ai/sdk')).toEqual({ name: '@anthropic-ai/sdk', version: null });
    expect(parseSpecifier('npm:zod@3.23.8/v4')).toEqual({ name: 'zod', version: '3.23.8' });
    expect(parseSpecifier('jsr:@std/assert@1')).toEqual({ name: '@std/assert', version: '1' });
    expect(remoteImports("import a from 'npm:x@1.0.0';\nconst b = await import('jsr:@std/y@2.0.0');")).toEqual([
      'npm:x@1.0.0',
      'jsr:@std/y@2.0.0',
    ]);
  });
});
