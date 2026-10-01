import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat, type ImageManipulatorContext, type ImageRef } from 'expo-image-manipulator';
import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
import { Image } from 'expo-image';
import { communityLimits, outputSize, validPhotoDescriptor, type CommunityPhotoDescriptor } from './content';

export type CommunityPhotoSource = Readonly<{ uri: string; width: number; height: number; byteCount?: number; webFile?: Blob }>;
export type PreparedCommunityPhoto = Readonly<{
 uri: string; bytes: Uint8Array<ArrayBuffer>; descriptor: Readonly<CommunityPhotoDescriptor>;
 /** Call after the initiating owner's durable byte copy succeeds, or after abandoning this candidate. */
 dispose: () => Promise<void>;
}>;

function invalid(): never { throw Error('COMMUNITY_PHOTO_INVALID'); }
function size(value: number, maximum: number) { if (!Number.isSafeInteger(value) || value < 1) invalid(); if (value > maximum) throw Error('COMMUNITY_PHOTO_TOO_LARGE'); return value; }
function localURI(value: string, web: boolean) {
 try { const uri = new URL(value); if (uri.search || uri.hash || uri.username || uri.password || !(web ? uri.protocol === 'blob:' : uri.protocol === 'content:' || uri.protocol === 'file:' && !uri.host)) invalid(); } catch { invalid(); }
}

/**
 * Pixel re-encoding creates a local candidate only. No cloud request, committed-media flag or server
 * decoding claim is made here. The caller captures account + activity and checks both in assertCurrent.
 */
export async function prepareCommunityPhoto(source: CommunityPhotoSource, assertCurrent: () => void): Promise<PreparedCommunityPhoto> {
 assertCurrent(); const web = Platform.OS === 'web'; localURI(source.uri, web); outputSize(source.width, source.height);
 if (source.byteCount !== undefined) size(source.byteCount, communityLimits.rawPhotoBytes);
 const temporaries = new Set<string>(), references = new Set<ImageRef>(); let context: ImageManipulatorContext | null = null;
 const cache = web ? null : new URL(Paths.cache.uri.endsWith('/') ? Paths.cache.uri : Paths.cache.uri + '/');
 const ownTemporary = (uri: string) => {
  if (uri === source.uri) return false;
  try { const path = new URL(uri); if (web) return path.protocol === 'blob:';
   const decoded = decodeURIComponent(path.pathname), prefix = decodeURIComponent(cache!.pathname);
   return path.protocol === 'file:' && path.host === cache!.host && !path.search && !path.hash && decoded.startsWith(prefix) && !decoded.slice(prefix.length).split('/').some(p => p === '.' || p === '..');
  } catch { return false; }
 };
 const remember = (uri: string) => { if (!ownTemporary(uri)) invalid(); temporaries.add(uri); };
 const rememberReference = (ref: ImageRef) => { references.add(ref); const uri = (ref as unknown as { uri?: unknown }).uri; if (typeof uri === 'string' && ownTemporary(uri)) temporaries.add(uri); };
 const discard = async (uri: string) => { if (!temporaries.has(uri)) return; try { if (web) URL.revokeObjectURL(uri); else { const file = new File(uri); if (file.exists) file.delete(); } temporaries.delete(uri); } catch { /* Cleanup cannot touch another path or disguise a completed owner write as a failure. */ } };
 const cleanup = async (except?: string) => { for (const uri of [...temporaries]) if (uri !== except) await discard(uri); };
 const read = async (uri: string): Promise<Uint8Array<ArrayBuffer> | null> => {
  assertCurrent();
  if (web) {
   const response = await fetch(uri); assertCurrent(); if (!response.ok) invalid();
   const blob = await response.blob(); assertCurrent(); if (blob.size > communityLimits.photoBytes) return null; size(blob.size, communityLimits.photoBytes);
   const buffer = await blob.arrayBuffer(); assertCurrent(); return new Uint8Array(buffer);
  }
  const file = new File(uri), length = file.size; if (length > communityLimits.photoBytes) return null; size(length, communityLimits.photoBytes);
  const bytes = await file.bytes(); assertCurrent(); if (bytes.byteLength > communityLimits.photoBytes) return null; size(bytes.byteLength, communityLimits.photoBytes); return new Uint8Array(bytes);
 };
 try {
  let input = source.uri;
  if (web) { if (!(source.webFile instanceof Blob)) invalid(); size(source.webFile.size, communityLimits.rawPhotoBytes); input = URL.createObjectURL(source.webFile); remember(input); }
  else size(new File(source.uri).size, communityLimits.rawPhotoBytes);
  assertCurrent(); context = ImageManipulator.manipulate(input);
  const original = await context.renderAsync(); rememberReference(original); assertCurrent(); const target = outputSize(original.width, original.height);
  let image = original;
  // Resize from actual decoded dimensions, including the picker's normalized orientation.
  if (target.width !== original.width || target.height !== original.height) { context.resize(target); image = await context.renderAsync(); rememberReference(image); assertCurrent(); }
  if (image.width !== target.width || image.height !== target.height) invalid();
  for (const quality of [.86, .72, .58]) {
   assertCurrent(); const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: quality }); remember(saved.uri); assertCurrent();
   if (saved.width !== image.width || saved.height !== image.height) invalid();
   const bytes = await read(saved.uri); assertCurrent(); if (!bytes) { await discard(saved.uri); assertCurrent(); continue; }
   // Hash the actual upload bytes. A base64/string digest would describe a different payload.
   const hashed = await digest(CryptoDigestAlgorithm.SHA256, bytes); assertCurrent(); if (hashed.byteLength !== 32) invalid();
   const sha256 = Array.from(new Uint8Array(hashed), value => value.toString(16).padStart(2, '0')).join('');
   let blurhash: string | null = null;
   if (!web) { try { blurhash = await Image.generateBlurhashAsync(saved.uri, [4, 3]); } catch { blurhash = null; } assertCurrent(); }
   const candidate: CommunityPhotoDescriptor = { mime: 'image/jpeg', sha256, byte_count: bytes.byteLength, width: saved.width, height: saved.height, blurhash };
   if (!validPhotoDescriptor(candidate as unknown)) { candidate.blurhash = null; if (!validPhotoDescriptor(candidate as unknown)) invalid(); }
   await cleanup(saved.uri); assertCurrent();
   return Object.freeze({ uri: saved.uri, bytes, descriptor: Object.freeze(candidate), dispose: () => cleanup() });
  }
  throw Error('COMMUNITY_PHOTO_TOO_LARGE');
 } catch (error) {
  await cleanup(); assertCurrent();
  if (error instanceof Error && ['ACCOUNT_CHANGED', 'ACCOUNT_DELETION_PENDING', 'COMMUNITY_MOVING', 'COMMUNITY_REVIEW_REQUIRED', 'COMMUNITY_PHOTO_TOO_LARGE', 'COMMUNITY_PHOTO_INVALID'].includes(error.message)) throw error;
  throw Error('COMMUNITY_PHOTO_INVALID');
 } finally {
  for (const ref of references) { try { ref.release(); } catch { /* A best-effort release never mutates a persisted draft. */ } }
  try { context?.release(); } catch { /* Context has no account-owned durable data. */ }
 }
}
