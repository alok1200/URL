export interface MappedError {
  message: string;
  status: number;
  code: string;
}

/**
 * Converts raw yt-dlp, ffmpeg, or runtime error output into a safe,
 * human-readable message without leaking file paths or stack traces.
 */
export function mapError(rawError: unknown): MappedError {
  const text =
    rawError instanceof Error
      ? rawError.message
      : typeof rawError === "string"
        ? rawError
        : "";
  const lower = text.toLowerCase();

  // Binary missing
  if (lower.includes("enoent") && (lower.includes("yt-dlp") || lower.includes("spawn yt-dlp"))) {
    return {
      code: "MISSING_YTDLP",
      status: 503,
      message: "The download engine (yt-dlp) is not installed on this server. Check the README for setup instructions.",
    };
  }
  if (lower.includes("ffmpeg") && (lower.includes("not found") || lower.includes("enoent") || lower.includes("please install"))) {
    return {
      code: "MISSING_FFMPEG",
      status: 503,
      message: "FFmpeg is required for video merging and MP3 conversion, but it is not installed on this server.",
    };
  }

  // DRM-protected content (never circumvent)
  if (
    lower.includes("drm") ||
    lower.includes("widevine") ||
    lower.includes("playready") ||
    lower.includes("fairplay") ||
    lower.includes("this video is drm protected") ||
    lower.includes("protected by drm")
  ) {
    return {
      code: "DRM_PROTECTED",
      status: 422,
      message: "This media is DRM-protected and cannot be downloaded.",
    };
  }

  // Timeout
  if (lower.includes("timed out") || lower.includes("timeout") || lower.includes("etimedout")) {
    return {
      code: "TIMEOUT",
      status: 504,
      message: "The request timed out while fetching or converting this media. Please try a lower quality or try again later.",
    };
  }

  // File size / duration limits
  if (
    lower.includes("file is larger than max-filesize") ||
    lower.includes("filesize") ||
    lower.includes("file too large") ||
    lower.includes("exceeds the maximum file size")
  ) {
    return {
      code: "FILE_TOO_LARGE",
      status: 413,
      message: "This file exceeds the server's maximum download size limit. Try choosing a lower video quality or Audio (MP3).",
    };
  }
  if (lower.includes("exceeds the maximum allowed duration")) {
    return {
      code: "DURATION_TOO_LONG",
      status: 413,
      message: "This video exceeds the maximum allowed duration for downloads on this server.",
    };
  }

  // Site blocking server IP / bot checks / HTTP 429
  if (
    lower.includes("http error 429") ||
    lower.includes("too many requests") ||
    lower.includes("sign in to confirm you’re not a bot") ||
    lower.includes("sign in to confirm you're not a bot") ||
    lower.includes("not a bot") ||
    lower.includes("captcha") ||
    lower.includes("cloudflare") ||
    lower.includes("blocked by") ||
    lower.includes("ip has been blocked") ||
    lower.includes("403: forbidden") ||
    lower.includes("http error 403")
  ) {
    return {
      code: "SITE_BLOCKED",
      status: 503,
      message:
        "This website is temporarily blocking requests from this server's IP. For the best success rate, run the app locally on your computer or configure COOKIES_FILE / PROXY_URL in your environment.",
    };
  }

  // Geo-blocked
  if (
    lower.includes("not available in your country") ||
    lower.includes("geo-restricted") ||
    lower.includes("geo restricted") ||
    lower.includes("geoblocked") ||
    lower.includes("geo-blocked") ||
    lower.includes("uploader has not made this video available in your country")
  ) {
    return {
      code: "GEO_BLOCKED",
      status: 403,
      message: "This video is geo-blocked and not available in the server's region.",
    };
  }

  // Login / age-restricted / members-only
  if (
    lower.includes("sign in to confirm your age") ||
    lower.includes("age-restricted") ||
    lower.includes("login required") ||
    lower.includes("log in") ||
    lower.includes("cookies") ||
    lower.includes("members-only") ||
    lower.includes("members only") ||
    lower.includes("join this channel") ||
    lower.includes("authentication") ||
    lower.includes("requires payment") ||
    lower.includes("subscribers only")
  ) {
    return {
      code: "LOGIN_REQUIRED",
      status: 403,
      message:
        "This content requires signing in or age verification. If you have access to it, you can configure your own COOKIES_FILE when running locally.",
    };
  }

  // Private / removed / unavailable
  if (
    lower.includes("private video") ||
    lower.includes("video unavailable") ||
    lower.includes("this video is unavailable") ||
    lower.includes("has been removed") ||
    lower.includes("deleted") ||
    lower.includes("does not exist") ||
    lower.includes("http error 404") ||
    lower.includes("404 not found") ||
    lower.includes("account associated with this video has been terminated")
  ) {
    return {
      code: "UNAVAILABLE",
      status: 404,
      message: "This video is private, removed, or no longer available.",
    };
  }

  // Unsupported URL / site
  if (
    lower.includes("unsupported url") ||
    lower.includes("no video formats found") ||
    lower.includes("no suitable extractor") ||
    lower.includes("there is no video")
  ) {
    return {
      code: "UNSUPPORTED_SITE",
      status: 400,
      message: "This link is not supported or does not contain downloadable video or audio.",
    };
  }

  // Invalid URL
  if (lower.includes("is not a valid url") || lower.includes("invalid url")) {
    return {
      code: "INVALID_URL",
      status: 400,
      message: "Please enter a valid video or audio link.",
    };
  }

  // Live stream currently active
  if (lower.includes("live event will begin") || lower.includes("is live")) {
    return {
      code: "LIVE_STREAM",
      status: 400,
      message: "Live or upcoming streams cannot be downloaded until they finish.",
    };
  }

  // Generic safe fallback (never leak raw stderr or server paths)
  return {
    code: "DOWNLOAD_ERROR",
    status: 500,
    message: "Unable to process this link right now. Please verify the link is public and try again.",
  };
}
