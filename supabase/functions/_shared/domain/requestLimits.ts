export type RequestLimitPolicy = {
  readonly limit: number;
  readonly windowSeconds: number;
};

// Fixed windows counted from the first attempt, global across events. An
// initial balance between legitimate corrections and abuse: a shared IP can
// exhaust the budget of several people.
export const EMAIL_REGISTRATION_LIMIT: RequestLimitPolicy = {
  limit: 5,
  windowSeconds: 3600,
};

export const IP_REGISTRATION_LIMIT: RequestLimitPolicy = {
  limit: 20,
  windowSeconds: 3600,
};

// Every missing or invalid client address shares this one bucket, so a bad
// header can never bypass the IP limit.
const UNKNOWN_CLIENT_IP = "unknown";

// The longest textual IPv6 address (with an embedded IPv4 tail) is 45 chars.
const MAX_IP_LENGTH = 45;
const IPV4_OCTET = /^(?:0|[1-9][0-9]{0,2})$/;
const IPV6_HEXTET = /^[0-9a-f]{1,4}$/i;

const isIpv4 = (value: string): boolean => {
  const octets = value.split(".");
  return octets.length === 4 &&
    octets.every((octet) => IPV4_OCTET.test(octet) && Number(octet) <= 255);
};

const isIpv6 = (value: string): boolean => {
  const halves = value.split("::");
  if (halves.length > 2) return false;
  const groups = (part: string): string[] => part === "" ? [] : part.split(":");
  const hextets = halves.flatMap(groups);
  let units = hextets.length;
  const last = hextets.at(-1);
  if (last !== undefined && last.includes(".")) {
    if (!isIpv4(last)) return false;
    hextets.pop();
    units += 1;
  }
  if (!hextets.every((hextet) => IPV6_HEXTET.test(hextet))) return false;
  return halves.length === 2 ? units <= 7 : units === 8;
};

// A bare address only: no port, brackets, zone index, or scheme.
export const isClientIp = (value: string): boolean =>
  value.length > 0 && value.length <= MAX_IP_LENGTH &&
  (value.includes(":") ? isIpv6(value) : isIpv4(value));

// Only the first x-forwarded-for entry is the client as seen by the gateway;
// later entries are never searched for a valid one.
export const extractClientIp = (header: string | null): string => {
  const first = header?.split(",")[0]?.trim() ?? "";
  return isClientIp(first) ? first.toLowerCase() : UNKNOWN_CLIENT_IP;
};
