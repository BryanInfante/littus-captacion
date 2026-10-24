import { assertEquals } from "../dev_deps.ts";
import {
  EMAIL_REGISTRATION_LIMIT,
  extractClientIp,
  IP_REGISTRATION_LIMIT,
} from "../../_shared/domain/requestLimits.ts";

Deno.test("registration policy allows five email attempts and twenty IP attempts per hour", () => {
  assertEquals(EMAIL_REGISTRATION_LIMIT, { limit: 5, windowSeconds: 3600 });
  assertEquals(IP_REGISTRATION_LIMIT, { limit: 20, windowSeconds: 3600 });
});

Deno.test("client IP uses only the trimmed first forwarded entry", () => {
  for (
    const [header, expected] of [
      [" 203.0.113.7 , 198.51.100.2", "203.0.113.7"],
      ["2001:db8::7, 203.0.113.8", "2001:db8::7"],
      ["::1", "::1"],
      ["::ffff:192.0.2.1", "::ffff:192.0.2.1"],
    ]
  ) {
    assertEquals(extractClientIp(header), expected);
  }
});

Deno.test("missing or invalid client IP uses one shared unknown bucket", () => {
  for (
    const header of [
      null,
      "",
      "   ",
      "unknown",
      "garbage, 203.0.113.7",
      ", 203.0.113.7",
      "256.0.0.1",
      "1.2.3",
      "01.2.3.4",
      "203.0.113.7:443",
      "[2001:db8::1]:443",
      "2001:db8:::1",
      "2001:db8::zz",
      "fe80::1%eth0",
      "https://203.0.113.7",
    ]
  ) {
    assertEquals(extractClientIp(header), "unknown", String(header));
  }
});
