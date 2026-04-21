const MAX_IP_LENGTH = 64;
const FORWARDED_FOR_PATTERN = /for=(?:"?\[?([A-Fa-f0-9:.]+)\]?"?)/i;

function isValidIpv4(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 4) {
    return false;
  }

  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) {
      return false;
    }

    const numeric = Number.parseInt(part, 10);
    return numeric >= 0 && numeric <= 255;
  });
}

function isValidIpv6(value: string): boolean {
  if (!value.includes(":")) {
    return false;
  }

  try {
    return new URL(`http://[${value}]`).hostname === `[${value}]`;
  } catch {
    return false;
  }
}

export function normalizeClientIp(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > MAX_IP_LENGTH ||
    normalized.toLowerCase() === "unknown"
  ) {
    return null;
  }

  const unquoted =
    normalized.startsWith('"') && normalized.endsWith('"')
      ? normalized.slice(1, -1)
      : normalized;
  const unwrapped =
    unquoted.startsWith("[") && unquoted.endsWith("]")
      ? unquoted.slice(1, -1)
      : unquoted;

  if (isValidIpv4(unwrapped) || isValidIpv6(unwrapped)) {
    return unwrapped;
  }

  return null;
}

export function getClientIpFromHeaders(headers: Headers): string | null {
  const onVercel = headers.get("x-vercel-id");
  const cfConnectingIp = normalizeClientIp(headers.get("cf-connecting-ip"));
  if (cfConnectingIp && !onVercel) {
    return cfConnectingIp;
  }

  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstForwarded = forwardedFor.split(",")[0];
    const normalizedForwarded = normalizeClientIp(firstForwarded);
    if (normalizedForwarded) {
      return normalizedForwarded;
    }
  }

  const realIp = normalizeClientIp(headers.get("x-real-ip"));
  if (realIp) {
    return realIp;
  }

  const forwarded = headers.get("forwarded");
  if (forwarded) {
    const match = FORWARDED_FOR_PATTERN.exec(forwarded);
    const forwardedIp = normalizeClientIp(match?.[1]);
    if (forwardedIp) {
      return forwardedIp;
    }
  }

  return null;
}
