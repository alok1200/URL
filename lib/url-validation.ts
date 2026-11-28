import dns from "node:dns/promises";
import net from "node:net";

export interface UrlValidationResult {
  valid: boolean;
  normalizedUrl?: string;
  error?: string;
  code?: "INVALID_URL" | "BLOCKED_HOST" | "DNS_FAILURE";
}

export type DnsLookupFn = (hostname: string) => Promise<string[]>;

const MAX_URL_LENGTH = 2048;

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata.google.internal",
  "metadata.goog",
]);

/**
 * Checks if an IPv4 address belongs to a private, loopback, link-local,
 * multicast, or otherwise non-public range.
 */
function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map((segment) => Number.parseInt(segment, 10));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }

  const [a, b] = parts;

  // 0.0.0.0/8 ("This network")
  if (a === 0) return true;
  // 10.0.0.0/8 (Private)
  if (a === 10) return true;
  // 100.64.0.0/10 (Carrier-grade NAT)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;
  // 169.254.0.0/16 (Link-local / cloud metadata)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12 (Private: 172.16.0.0 - 172.31.255.255)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.0.0.0/24 (IETF Protocol Assignments)
  if (a === 192 && b === 0 && parts[2] === 0) return true;
  // 192.0.2.0/24 (TEST-NET-1)
  if (a === 192 && b === 0 && parts[2] === 2) return true;
  // 192.168.0.0/16 (Private)
  if (a === 192 && b === 168) return true;
  // 198.18.0.0/15 (Benchmarking)
  if (a === 198 && (b === 18 || b === 19)) return true;
  // 224.0.0.0/4 (Multicast) and 240.0.0.0/4 (Reserved / Broadcast)
  if (a >= 224) return true;

  return false;
}

/**
 * Checks if an IPv6 address is loopback, unspecified, unique-local,
 * link-local, multicast, or an IPv4-mapped private address.
 */
function isPrivateIpv6(rawIp: string): boolean {
  // Strip zone index (e.g. fe80::1%en0) and brackets
  const ip = rawIp.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];

  // Unspecified or loopback
  if (ip === "::" || ip === "::1" || ip === "0:0:0:0:0:0:0:0" || ip === "0:0:0:0:0:0:0:1") {
    return true;
  }

  // IPv4-mapped IPv6 in dotted-quad notation (e.g. ::ffff:127.0.0.1)
  const v4MappedDotted = ip.match(/^(?:::ffff:|0:0:0:0:0:ffff:)(\d+\.\d+\.\d+\.\d+)$/);
  if (v4MappedDotted) {
    return isPrivateIpv4(v4MappedDotted[1]);
  }

  // IPv4-mapped IPv6 in hex notation (e.g. ::ffff:7f00:1)
  const v4MappedHex = ip.match(/^(?:::ffff:|0:0:0:0:0:ffff:)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (v4MappedHex) {
    const hi = Number.parseInt(v4MappedHex[1], 16);
    const lo = Number.parseInt(v4MappedHex[2], 16);
    const dotted = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    return isPrivateIpv4(dotted);
  }

  // Unique Local Addresses (fc00::/7 -> fc.. or fd..)
  if (ip.startsWith("fc") || ip.startsWith("fd")) {
    return true;
  }

  // Link-Local (fe80::/10 -> fe80..febf)
  if (/^fe[89ab][0-9a-f]:/.test(ip) || /^fe[89ab][0-9a-f]$/.test(ip)) {
    return true;
  }

  // Multicast (ff00::/8)
  if (ip.startsWith("ff")) {
    return true;
  }

  return false;
}

/**
 * Returns true if the IP address (IPv4 or IPv6) is non-public / blocked.
 */
export function isPrivateIp(ip: string): boolean {
  const cleaned = ip.trim().replace(/^\[|\]$/g, "");
  const version = net.isIP(cleaned);
  if (version === 4) {
    return isPrivateIpv4(cleaned);
  }
  if (version === 6) {
    return isPrivateIpv6(cleaned);
  }
  // If it's not a valid IP at all, fail closed.
  return true;
}

/**
 * Validates URL syntax, protocol, flag-injection safety, and static private hosts.
 */
export function validateUrlSyntax(rawUrl: string): UrlValidationResult {
  if (typeof rawUrl !== "string") {
    return {
      valid: false,
      code: "INVALID_URL",
      error: "Please enter a valid video or audio link.",
    };
  }

  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) {
    return {
      valid: false,
      code: "INVALID_URL",
      error: "Please enter a valid link (under 2048 characters).",
    };
  }

  // Reject flag-like inputs or whitespace/control characters
  if (trimmed.startsWith("-") || /[\r\n\t\x00-\x1f]/.test(trimmed)) {
    return {
      valid: false,
      code: "INVALID_URL",
      error: "That doesn't look like a valid http or https link.",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      valid: false,
      code: "INVALID_URL",
      error: "Please enter a valid http or https link.",
    };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      valid: false,
      code: "INVALID_URL",
      error: "Only http and https links are supported.",
    };
  }

  if (!parsed.hostname) {
    return {
      valid: false,
      code: "INVALID_URL",
      error: "The link is missing a valid website address.",
    };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  const bareHost = hostname.replace(/^\[|\]$/g, "");

  if (
    BLOCKED_HOSTNAMES.has(bareHost) ||
    bareHost.endsWith(".localhost") ||
    bareHost.endsWith(".local") ||
    bareHost.endsWith(".internal")
  ) {
    return {
      valid: false,
      code: "BLOCKED_HOST",
      error: "Links pointing to local or private network addresses are not allowed.",
    };
  }

  // If the hostname is already an IP literal, validate it immediately
  if (net.isIP(bareHost) !== 0) {
    if (isPrivateIp(bareHost)) {
      return {
        valid: false,
        code: "BLOCKED_HOST",
        error: "Links pointing to local or private IP addresses are not allowed.",
      };
    }
  }

  return {
    valid: true,
    normalizedUrl: parsed.toString(),
  };
}

async function defaultDnsLookup(hostname: string): Promise<string[]> {
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  return records.map((r) => r.address);
}

/**
 * Full SSRF-safe URL validation: syntax check + DNS resolution + resolved IP check.
 */
export async function validateUrl(
  rawUrl: string,
  lookupFn: DnsLookupFn = defaultDnsLookup,
): Promise<UrlValidationResult> {
  const syntax = validateUrlSyntax(rawUrl);
  if (!syntax.valid || !syntax.normalizedUrl) {
    return syntax;
  }

  const parsed = new URL(syntax.normalizedUrl);
  const bareHost = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");

  // Already checked IP literals above
  if (net.isIP(bareHost) !== 0) {
    return syntax;
  }

  try {
    const ips = await lookupFn(bareHost);
    if (!ips || ips.length === 0) {
      return {
        valid: false,
        code: "DNS_FAILURE",
        error: "Could not resolve the website address. Please check the link and try again.",
      };
    }

    for (const ip of ips) {
      if (isPrivateIp(ip)) {
        return {
          valid: false,
          code: "BLOCKED_HOST",
          error: "This link resolves to a private or local network address and cannot be accessed.",
        };
      }
    }

    return syntax;
  } catch {
    return {
      valid: false,
      code: "DNS_FAILURE",
      error: "Could not reach that website address. Please double-check the link.",
    };
  }
}
