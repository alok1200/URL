const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * Sanitizes a media title into a cross-platform safe filename (Windows, macOS, Linux).
 */
export function sanitizeFilename(rawTitle: string | undefined, extension: string): string {
  const cleanExt = extension.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "bin";

  let base = (rawTitle || "download")
    // Normalize unicode to NFC
    .normalize("NFC")
    // Remove control characters
    .replace(/[\x00-\x1f\x7f]/g, "")
    // Replace illegal filesystem characters across Windows/macOS/Linux
    .replace(/[<>:"/\\|?*]/g, " ")
    // Collapse whitespace
    .replace(/\s+/g, " ")
    // Trim leading/trailing dots and spaces (Windows rejects trailing dots/spaces)
    .replace(/^[\s.]+|[\s.]+$/g, "");

  if (!base || WINDOWS_RESERVED.test(base)) {
    base = "download";
  }

  // Keep filename comfortably under 255 bytes across UTF-8 filesystems
  if (base.length > 120) {
    base = base.slice(0, 120).replace(/[\s.]+$/g, "");
  }

  return `${base || "download"}.${cleanExt}`;
}

/**
 * Builds a standards-compliant Content-Disposition header with both
 * an ASCII fallback filename and an RFC 5987 UTF-8 encoded filename*.
 */
export function buildContentDisposition(filename: string): string {
  const asciiFallback = filename
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_")
    .trim() || "download";

  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
