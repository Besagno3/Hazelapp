import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const page = readFileSync(join(root, 'index.html'), 'utf8');

/** A PNG's width and height, from its IHDR chunk. */
function pngSize(file: string): [number, number] {
  const buf = readFileSync(file);
  expect(buf.subarray(1, 4).toString('latin1')).toBe('PNG');
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

describe("the game's icon is the project's own (#146a)", () => {
  it("index.html names Ember's egg, not Vite's default", () => {
    expect(page).toContain('<link rel="icon" type="image/png" href="/favicon.png" />');
    expect(page).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />');
    expect(page).not.toContain('favicon.svg');
    expect(existsSync(join(root, 'public', 'favicon.svg'))).toBe(false);
  });

  it('the icons are at the root, where the game at /play/ asks for them, and match the public pages', () => {
    // Root paths: the game is built with base '/', only its page moves to /play/ (scripts/build-web.mjs).
    expect(pngSize(join(root, 'public', 'favicon.png'))).toEqual([64, 64]);
    expect(pngSize(join(root, 'public', 'apple-touch-icon.png'))).toEqual([180, 180]);
    expect(readFileSync(join(root, 'public', 'favicon.png'))).toEqual(readFileSync(join(root, 'site', 'assets', 'img', 'favicon.png')));
    expect(readFileSync(join(root, 'public', 'apple-touch-icon.png'))).toEqual(
      readFileSync(join(root, 'site', 'assets', 'img', 'apple-touch-icon.png')),
    );
  });
});
