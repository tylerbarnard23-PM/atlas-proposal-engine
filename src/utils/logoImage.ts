"use client";

import { LOGO_ACCEPTED_TYPES, LOGO_MAX_BYTES, LOGO_MAX_DIMENSION, checkLogoDataUrl } from "@/domain/branding";

const MAX_INPUT_BYTES = 5 * 1024 * 1024;

// Turns an uploaded file into a clean PNG data URL. Re-drawing through a canvas
// keeps only pixels: metadata (EXIF, GPS), embedded profiles and any non-image
// payload are dropped, and the result is bounded in size and dimensions.
export async function processLogoFile(file: File): Promise<string> {
  if (!(LOGO_ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
    throw new Error("Use a PNG, JPEG or WebP image. SVG isn't accepted because it can contain scripts.");
  }
  if (file.size > MAX_INPUT_BYTES) throw new Error("That file is over 5 MB. Use a smaller logo.");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That file couldn't be read as an image.");
  }

  // Shrink until the PNG fits the size cap (logos usually fit at the first pass).
  for (let max = LOGO_MAX_DIMENSION; max >= 64; max = Math.floor(max * 0.75)) {
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser can't process images.");
    ctx.drawImage(bitmap, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/png");
    const check = checkLogoDataUrl(dataUrl);
    if (check.ok) {
      bitmap.close();
      return dataUrl;
    }
    if (dataUrl.length * 0.75 <= LOGO_MAX_BYTES) throw new Error(check.reason);
  }
  bitmap.close();
  throw new Error("That logo is too detailed to fit in 200 KB. Try a simpler or smaller image.");
}
