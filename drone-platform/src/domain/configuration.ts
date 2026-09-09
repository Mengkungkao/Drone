import type { ConfigurationValues } from './types';

export interface ConfigurationChange {
  key: string;
  kind: 'added' | 'changed' | 'removed';
  previous: string | number | boolean | undefined;
  next: string | number | boolean | undefined;
}

/** Project-local engineering values only; this never writes to a controller. */
export function parseConfiguration(text: string): ConfigurationValues {
  if (new TextEncoder().encode(text).length > 65_536) {
    throw new Error('Configuration input must be at most 64 KiB.');
  }
  const candidate: unknown = JSON.parse(text);
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error('Configuration must be a JSON object.');
  }
  if (Object.keys(candidate).length === 0 || Object.keys(candidate).length > 256) {
    throw new Error('Configuration must contain 1 to 256 values.');
  }
  for (const [key, value] of Object.entries(candidate)) {
    if (!key.trim() || key.trim() !== key || key.length > 128 || /[\u0000-\u001f\u007f-\u009f]/u.test(key)
      || ['__proto__', 'constructor', 'prototype'].includes(key)) {
      throw new Error('Configuration keys must be nonempty, safe names of at most 128 characters.');
    }
    if (!['string', 'number', 'boolean'].includes(typeof value)
      || (typeof value === 'number' && !Number.isFinite(value))
      || (typeof value === 'string' && (value.length > 4096 || /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/u.test(value)))) {
      throw new Error(`Value for "${key}" must be a finite number, boolean, or string of at most 4096 characters.`);
    }
  }
  return candidate as ConfigurationValues;
}

export function compareConfigurations(previous: ConfigurationValues, next: ConfigurationValues): ConfigurationChange[] {
  const keys = [...new Set([...Object.keys(previous), ...Object.keys(next)])].sort();
  return keys.flatMap((key) => {
    const before = Object.hasOwn(previous, key);
    const after = Object.hasOwn(next, key);
    if (before && after && previous[key] === next[key]) return [];
    return [{ key, kind: !before ? 'added' : !after ? 'removed' : 'changed',
      previous: before ? previous[key] : undefined, next: after ? next[key] : undefined }];
  });
}
