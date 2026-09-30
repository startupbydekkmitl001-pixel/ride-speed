import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const cache = new Map();
function load(relative) {
  const filename = fileURLToPath(new URL(relative, import.meta.url));
  if (!existsSync(filename)) return {};
  if (cache.has(filename)) return cache.get(filename);
  const module = { exports: {} };
  cache.set(filename, module.exports);
  const js = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(js, { module, exports: module.exports, console, Intl, setTimeout, clearTimeout,
    require: name => name.startsWith('.') ? load(pathToFileURL(`${resolve(dirname(filename), name)}.ts`).href) : require(name),
  }, { filename });
  cache.set(filename, module.exports);
  return module.exports;
}
const core = load('../src/lib/i18n/core.ts');
const errors = load('../src/lib/i18n/errors.ts');
const resources = load('../src/lib/i18n/resources.ts');
const callable = (module, name) => {
  assert.equal(typeof module[name], 'function', `${name} must implement the localization boundary`);
  return module[name];
};

test('system language picks a supported device preference and falls back to English', () => {
  const language = callable(core, 'resolveLanguage');
  assert.equal(language('system', [{ languageCode: 'th', languageTag: 'th-TH' }]), 'th');
  assert.equal(language('system', [{ languageCode: 'fr' }, { languageCode: 'en' }]), 'en');
  assert.equal(language('system', [{ languageCode: null, languageTag: 'TH-th' }]), 'th');
  assert.equal(language('system', [{ languageCode: 'ja' }]), 'en');
  assert.equal(language('system', []), 'en');
});

test('manual language remains selected when the device language changes', () => {
  const language = callable(core, 'resolveLanguage');
  assert.equal(language('en', [{ languageCode: 'th' }]), 'en');
  assert.equal(language('th', [{ languageCode: 'en' }]), 'th');
  assert.equal(callable(core, 'normalizeLanguagePreference')('invalid'), 'system');
  assert.equal(core.normalizeLanguagePreference('th'), 'th');
  assert.equal(callable(core, 'localeFor')('en'), 'en-US');
  assert.equal(core.localeFor('th'), 'th-TH');
});

test('Thai and English resources have complete key and interpolation parity', () => {
  assert.ok(resources.messages, 'bundled bilingual resources must be available before the first render');
  const { en, th } = resources.messages;
  assert.deepEqual(Object.keys(th).sort(), Object.keys(en).sort());
  for (const key of Object.keys(en)) {
    assert.ok(en[key].trim() && th[key].trim(), `${key} must not be empty`);
    const tokens = text => [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map(m => m[1]).sort();
    assert.deepEqual(tokens(th[key]), tokens(en[key]), `${key} interpolation must agree`);
  }
});

test('counts use English singular/plural and Thai wording without untranslated placeholders', () => {
  const translate = callable(core, 'createTranslator');
  const en = translate('en'), th = translate('th');
  assert.equal(en('profile.garageCount', { count: 1 }), "1 vehicle · Choose today's ride");
  assert.equal(en('profile.garageCount', { count: 3 }), "3 vehicles · Choose today's ride");
  assert.equal(th('profile.garageCount', { count: 3 }), '3 คัน · เลือกคันที่ใช้วันนี้');
  assert.equal(en('profile.savedAs', { name: 'A & B <rider>' }), 'Saved as A & B <rider>');
  assert.equal(th('profile.savedAs', { name: 'อาร์นัล' }), 'บันทึกชื่อ อาร์นัล แล้ว');
});

test('an English translator cannot change another mounted Thai translator', () => {
  const translate = callable(core, 'createTranslator');
  const th = translate('th'), en = translate('en');
  assert.equal(en('common.close'), 'Close');
  assert.equal(th('common.close'), 'ปิด');
  assert.equal(translate('en')('common.close'), 'Close');
  assert.equal(th('common.close'), 'ปิด');
});

test('auth and profile failures map stable codes without exposing arbitrary backend text', () => {
  const key = callable(errors, 'errorKey');
  assert.equal(key({ code: 'invalid_credentials', message: 'debug details' }, 'login'), 'errors.invalidCredentials');
  assert.equal(key({ code: 'over_request_rate_limit' }, 'google'), 'errors.rateLimited');
  assert.equal(key({ code: 'email_not_confirmed' }, 'login', { publicEmailDelivery: false }), 'errors.emailTeamOnly');
  assert.equal(key({ code: 'email_not_confirmed' }, 'login', { publicEmailDelivery: true }), 'errors.emailUnconfirmed');
  assert.equal(key({ code: '23505' }, 'profile'), 'errors.usernameTaken');
  assert.equal(key(new Error('duplicate key value violates unique constraint "rs_profiles_handle_key"'), 'profile'), 'errors.usernameTaken');
  assert.equal(key(new Error('private SQL details token=must-not-display'), 'profile'), 'errors.profileSave');
  assert.equal(key(new Error('arbitrary OAuth redirect description'), 'callback'), 'errors.callbackExpired');
  assert.equal(key(new Error('บัญชีเปลี่ยนแล้ว กรุณาลองใหม่ในบัญชีปัจจุบัน'), 'profile'), 'errors.accountChanged');
  assert.equal(key(new Error('หยุด GPS ไม่สำเร็จ ปิดแล้วเปิดแอปใหม่ก่อนเริ่มอีกครั้ง'), 'ride'), 'errors.gpsStop');
});

test('account setup, photo retries, device storage and deletion failures have bilingual bounded copy',()=>{
  const key=callable(errors,'errorKey');
  for(const [code,context,expected] of [
    ['LOCAL_READ_FAILED','storage','errors.localRead'],['LOCAL_WRITE_FAILED','storage','errors.localWrite'],['ACCOUNT_CHANGED','profile','errors.accountChanged'],
    ['ACCOUNT_STATE_CONFLICT','onboarding','errors.stateConflict'],['AVATAR_PROFILE_REQUIRED','avatar','errors.avatarNeedsProfile'],['AVATAR_REVISION_CONFLICT','avatar','profile.photoConflict'],
    ['DELETION_STATUS_UNAVAILABLE','deletion','errors.deletion'],['AUTH_REQUIRED','deletion','errors.deletionAuth'],['AUTH_CALLBACK_EXPIRED','callback','errors.callbackExpired'],
  ]) {
    assert.equal(key(new Error(code),context),expected);
    assert.ok(resources.messages.th[expected]);assert.ok(resources.messages.en[expected]);
  }
});
