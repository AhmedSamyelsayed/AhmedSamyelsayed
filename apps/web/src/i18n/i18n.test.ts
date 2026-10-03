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
