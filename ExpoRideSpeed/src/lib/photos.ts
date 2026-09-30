import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
export async function pickPicture(square = false) {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: square,
    aspect: square ? [1, 1] : undefined,
    quality: 1,
    exif: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if ((asset.fileSize ?? 0) > 20 * 1024 * 1024)
    throw new Error("เลือกรูปขนาดไม่เกิน 20 MB");
  const context = ImageManipulator.manipulate(asset.uri);
  if (square) {
    const side = Math.min(asset.width, asset.height);
    context
      .crop({
        originX: (asset.width - side) / 2,
        originY: (asset.height - side) / 2,
        width: side,
        height: side,
      })
      .resize({ width: 512 });
  } else
    context.resize(
      asset.width >= asset.height
        ? { width: Math.min(asset.width, 1440) }
        : { height: Math.min(asset.height, 1440) },
    );
  const image = await context.renderAsync();
  const output = await image.saveAsync({
    format: SaveFormat.JPEG,
    compress: 0.8,
    base64: true,
  });
  if (!output.base64) throw new Error("เตรียมรูปไม่สำเร็จ");
  if (output.base64.length * 0.75 > 3 * 1024 * 1024)
    throw new Error("รูปยังใหญ่เกินไป กรุณาเลือกรูปที่เล็กลง");
  return {
    uri: `data:image/jpeg;base64,${output.base64}`,
    base64: output.base64,
  };
}
export function pictureBytes(base64: string) {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer;
}

/** Garage-only budget. Existing profile/community picker sizing remains unchanged. */
export async function pickGaragePhoto() {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"], allowsEditing: false, quality: 1, exif: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset || (asset.fileSize ?? 0) > 20 * 1024 * 1024 || !Number.isFinite(asset.width) || !Number.isFinite(asset.height)
    || asset.width <= 0 || asset.height <= 0 || asset.width * asset.height > 40_000_000) throw new Error("GARAGE_PHOTO_INVALID");
  for (const [dimension, compress] of [[720, 0.75], [512, 0.68], [384, 0.58]] as const) {
    const context = ImageManipulator.manipulate(asset.uri);
    let image: Awaited<ReturnType<typeof context.renderAsync>> | null = null;
    try {
      context.resize(asset.width >= asset.height
        ? { width: Math.min(asset.width, dimension) }
        : { height: Math.min(asset.height, dimension) });
      image = await context.renderAsync();
      // Re-encode pixels as JPEG rather than uploading the picked file/metadata.
      const output = await image.saveAsync({ format: SaveFormat.JPEG, compress, base64: true });
      if (!output.base64) throw new Error("GARAGE_PHOTO_INVALID");
      if (pictureBytes(output.base64).byteLength <= 1_048_576) return { uri: `data:image/jpeg;base64,${output.base64}`, base64: output.base64 };
    } finally { image?.release(); context.release(); }
  }
  throw new Error("GARAGE_PHOTO_INVALID");
}
