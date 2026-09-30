import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

export const ffmpeg = process.env.FFMPEG_PATH || (fs.existsSync('C:/ffmpeg/ffmpeg.exe') ? 'C:/ffmpeg/ffmpeg.exe' : 'ffmpeg');
export const ffprobe = process.env.FFPROBE_PATH || (fs.existsSync('C:/ffmpeg/ffprobe.exe') ? 'C:/ffmpeg/ffprobe.exe' : 'ffprobe');

export function run(binary, args, maxBuffer = 100 * 1024 * 1024) {
  const result = spawnSync(binary, args, { maxBuffer, windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${binary} failed: ${result.stderr.toString().slice(-3000)}`);
  return result.stdout;
}
