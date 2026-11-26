"use client";
/**
 * Reads a video's metadata in the browser and captures a poster frame (JPEG) from
 * shortly after the start. The server re-encodes the poster like any uploaded image.
 * Resolves with whatever could be read; never throws.
 */
export interface VideoInfo {
  width?: number;
  height?: number;
  durationMs?: number;
  poster?: Blob;
}

export function inspectVideo(file: Blob, timeoutMs = 6000): Promise<VideoInfo> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "auto";
    v.muted = true;
    v.playsInline = true;
    let done = false;
    const finish = (info: VideoInfo) => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(url);
      v.removeAttribute("src");
      v.load();
      resolve(info);
    };
    const meta = (): VideoInfo => ({
      width: v.videoWidth || undefined,
      height: v.videoHeight || undefined,
      durationMs: Number.isFinite(v.duration) ? Math.round(v.duration * 1000) : undefined,
    });
    v.onloadedmetadata = () => {
      // Seek a little past the start; the first frame is often black.
      const t = Number.isFinite(v.duration) ? Math.min(0.5, v.duration / 4) : 0;
      try {
        v.currentTime = t;
      } catch {
        finish(meta());
      }
    };
    v.onseeked = () => {
      const info = meta();
      if (!info.width || !info.height) return finish(info);
      const scale = Math.min(1, 1280 / Math.max(info.width, info.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(info.width * scale);
      canvas.height = Math.round(info.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return finish(info);
      try {
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((b) => finish({ ...info, poster: b ?? undefined }), "image/jpeg", 0.85);
      } catch {
        finish(info);
      }
    };
    v.onerror = () => finish({});
    setTimeout(() => finish(meta()), timeoutMs);
    v.src = url;
  });
}
