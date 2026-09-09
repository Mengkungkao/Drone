import { describe, expect, it } from 'vitest';
import { compareConfigurations, parseConfiguration } from '../src/domain/configuration';

describe('untrusted project configuration input', () => {
  it.each(['null', '[]', '{}', '{"motor":{}}', '{"mass":1e999}', '{"":1}', '{" mass":1}', '{"__proto__":true}'])('rejects unsafe input %s', (text) => {
    expect(() => parseConfiguration(text)).toThrow();
  });
  it('accepts typed engineering values without implicit conversion', () => {
    expect(parseConfiguration('{"mass_kg":1.6,"label":"X500","gps":false}'))
      .toEqual({ mass_kg: 1.6, label: 'X500', gps: false });
  });
  it('keeps falsy values and reports additions, removals, and type changes', () => {
    expect(compareConfigurations({ flag: false, mass: 1, name: 'old' }, { flag: false, mass: '1', count: 0 })).toEqual([
      { key: 'count', kind: 'added', previous: undefined, next: 0 },
      { key: 'mass', kind: 'changed', previous: 1, next: '1' },
      { key: 'name', kind: 'removed', previous: 'old', next: undefined },
    ]);
  });
});
