import { describe, it, expect } from 'vitest';
// The Deno side's TEXT (`?raw`: its `npm:` imports are never resolved here).
import lockText from '../../package-lock.json?raw';

const sources = import.meta.glob('../../supabase/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;

/**
 * The code without its comments (strings kept whole, so a URL's `//` stays).
 * A quote or apostrophe string ends at its line's end at the latest, so a
 * stray `'` (in a regex, say) can't swallow the rest of the file.
 */
function stripComments(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < text.length && text[j] !== c && (c === '`' || text[j] !== '\n')) j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end < 0 ? text.length : end + 1;
    } else {
      out += c;
    }
  }
  return out;
}

/** Every remote import in a file: `npm:` / `jsr:` / URL specifiers — static, side-effect only, or dynamic; not in comments. */
function remoteImports(text: string): string[] {
  const found = stripComments(text).matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)['"]((?:npm:|jsr:|https?:\/\/)[^'"]+)['"]/g);
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

  it('counts a side-effect import, and not one in a comment', () => {
    const text = [
      "import 'npm:polyfill';",
      "import'jsr:@std/dotenv@0.225.0/load';",
      "// import old from 'npm:left-pad';",
      "/* import gone from 'npm:gone';",
      "   still a comment */",
      "const url = 'https://example.com/a'; // not an import",
      "export { x } from 'npm:x@1.0.0';",
    ].join('\n');
    expect(remoteImports(text)).toEqual(['npm:polyfill', 'jsr:@std/dotenv@0.225.0/load', 'npm:x@1.0.0']);
  });
});
