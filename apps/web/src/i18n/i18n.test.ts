import { describe, expect, it } from 'vitest';
import ar from './locales/ar.json';
import en from './locales/en.json';
import { directionFor } from './index';

type Tree = { [key: string]: string | Tree };

function keys(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([k, v]) =>
    typeof v === 'string' ? [`${prefix}${k}`] : keys(v, `${prefix}${k}.`),
  );
}

function values(tree: Tree): string[] {
  return Object.values(tree).flatMap((v) => (typeof v === 'string' ? [v] : values(v)));
}

describe('i18n', () => {
  it('en and ar have the same keys', () => {
    expect(keys(ar).sort()).toEqual(keys(en).sort());
  });

  it('Arabic strings have no diacritics (tashkeel)', () => {
    const tashkeel = /[ً-ْٰ]/;
    expect(values(ar).filter((v) => tashkeel.test(v))).toEqual([]);
  });

  it('uses RTL for Arabic', () => {
    expect(directionFor('ar')).toBe('rtl');
    expect(directionFor('ar-EG')).toBe('rtl');
    expect(directionFor('en')).toBe('ltr');
  });
});

describe('translation keys used in code', () => {
  it('exist in en.json', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const root = join(__dirname, '..');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name) && !name.endsWith('.test.ts')) files.push(path);
      }
    };
    walk(root);
    const flat = new Set(keys(en));
    const used = files.flatMap((f) =>
      [...readFileSync(f, 'utf8').matchAll(/\bt\(\s*'([^']+)'/g)].map((m) => m[1]!),
    );
    expect(used.filter((k) => !flat.has(k))).toEqual([]);
  });
});
