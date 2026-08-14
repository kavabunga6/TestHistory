import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

const tokenLikeQueryKey = /(?:token|secret|password|passwd|api[_-]?key|signature|credential)/i;

export function parseSafeOutboundUrl(raw: string, env: NodeJS.ProcessEnv = process.env): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Outbound integration URL must be a valid absolute URL");
  }
  if (url.protocol !== "https:") {
    throw new Error("Outbound integration URL must use https");
  }
  if (url.username.length > 0 || url.password.length > 0) {
    throw new Error("Outbound integration URL must not include credentials");
  }
  for (const key of url.searchParams.keys()) {
    if (tokenLikeQueryKey.test(key)) {
      throw new Error("Outbound integration URL must not include token-like query parameters");
    }
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (isPrivateHostname(hostname) && !outboundHostAllowlist(env).has(hostname)) {
    throw new Error("Outbound integration URL resolves to a private or local host");
  }
  return url;
}

export function outboundHostAllowlist(env: NodeJS.ProcessEnv = process.env): Set<string> {
  return new Set(
    (env.TESTHISTORY_OUTBOUND_HOST_ALLOWLIST ?? "")
      .split(",")
      .map((host) => host.trim().toLowerCase().replace(/\.$/, ""))
      .filter(Boolean)
  );
}

export async function assertSafeOutboundDestination(
  url: URL,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (outboundHostAllowlist(env).has(hostname) || isIP(hostname) !== 0) return;
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("Outbound integration host could not be resolved");
  }
  if (addresses.length === 0 || addresses.some((entry) => isPrivateHostname(entry.address))) {
    throw new Error("Outbound integration host resolves to a private or local address");
  }
}

function isPrivateHostname(hostname: string): boolean {
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  )
    return true;
  if (isIP(hostname) === 6) {
    return (
      hostname === "::1" ||
      hostname.startsWith("fc") ||
      hostname.startsWith("fd") ||
      hostname.startsWith("fe80:")
    );
  }
  if (isIP(hostname) !== 4) return false;
  const [a = 0, b = 0] = hostname.split(".").map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}
