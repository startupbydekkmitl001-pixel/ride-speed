import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePreferences, resolveDarkTheme } from '../src/lib/preferences.ts';

test('new users follow system while valid existing choices survive migration', () => {
  assert.equal(parsePreferences(null).theme, 'system');
  assert.equal(parsePreferences({ theme: 'dark', unit: 'mph', reduceGlass: true }).theme, 'dark');
  assert.equal(parsePreferences({ theme: 'light', language: 'th', unit: 'mph' }).unit, 'mph');
  assert.equal(resolveDarkTheme('system', 'light'), false);
  assert.equal(resolveDarkTheme('system', 'dark'), true);
  assert.equal(resolveDarkTheme('system', null), true);
  assert.equal(resolveDarkTheme('system', 'unspecified'), true);
});

test('malformed stored values cannot disable accessibility or select an invalid locale', () => {
  const result = parsePreferences({ theme: 'purple', language: 'ja', reduceMotion: 'false', reduceGlass: 1, welcomeDone: 'yes', unit: 'kph' });
  assert.equal(result.theme, 'system');
  assert.equal(result.language, 'system');
  assert.equal(result.reduceMotion, false);
  assert.equal(result.reduceGlass, false);
  assert.equal(result.welcomeDone, false);
  assert.equal(result.unit, 'kmh');
});

test('explicit reduced effects and English override are retained without coercion', () => {
  const result = parsePreferences({ language: 'en', reduceMotion: true, reduceGlass: true, welcomeDone: true });
  assert.equal(result.language, 'en');
  assert.equal(result.reduceMotion, true);
  assert.equal(result.reduceGlass, true);
  assert.equal(result.welcomeDone, true);
});
