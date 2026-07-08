export const DISCOVERY_PREFIX = "/discovery";

export function isDiscoveryPath(pathname: string): boolean {
  return pathname === DISCOVERY_PREFIX || pathname.startsWith(`${DISCOVERY_PREFIX}/`);
}

export function toDiscoveryPath(pathname: string): string {
  if (!pathname.startsWith("/")) return pathname;
  if (isDiscoveryPath(pathname)) return pathname;
  if (pathname === "/") return DISCOVERY_PREFIX;
  return `${DISCOVERY_PREFIX}${pathname}`;
}

export function fromDiscoveryPath(pathname: string): string {
  if (pathname === DISCOVERY_PREFIX) return "/";
  if (!isDiscoveryPath(pathname)) return pathname;
  return pathname.slice(DISCOVERY_PREFIX.length) || "/";
}

export function toDiscoveryRoute(to: string): string {
  if (!to.startsWith("/") || isExternalRoute(to)) return to;

  const hashIndex = to.indexOf("#");
  const hash = hashIndex >= 0 ? to.slice(hashIndex) : "";
  const routeWithoutHash = hashIndex >= 0 ? to.slice(0, hashIndex) : to;
  const queryIndex = routeWithoutHash.indexOf("?");
  const pathname = queryIndex >= 0 ? routeWithoutHash.slice(0, queryIndex) : routeWithoutHash;
  const query = queryIndex >= 0 ? routeWithoutHash.slice(queryIndex) : "";

  return `${toDiscoveryPath(pathname)}${query}${hash}`;
}

export function fromDiscoveryRoute(to: string): string {
  if (!to.startsWith("/") || isExternalRoute(to)) return to;

  const hashIndex = to.indexOf("#");
  const hash = hashIndex >= 0 ? to.slice(hashIndex) : "";
  const routeWithoutHash = hashIndex >= 0 ? to.slice(0, hashIndex) : to;
  const queryIndex = routeWithoutHash.indexOf("?");
  const pathname = queryIndex >= 0 ? routeWithoutHash.slice(0, queryIndex) : routeWithoutHash;
  const query = queryIndex >= 0 ? routeWithoutHash.slice(queryIndex) : "";

  return `${fromDiscoveryPath(pathname)}${query}${hash}`;
}

function isExternalRoute(to: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(to);
}
