import { assertEquals, assertThrows } from "../dev_deps.ts";
import { Email } from "../../_shared/domain/email.ts";
import { DomainError } from "../../_shared/domain/errors.ts";

Deno.test("Email trims and lowercases before checking the format", () => {
  assertEquals(
    Email.parse("  PERSON+TAG@Example.COM  ").value,
    "person+tag@example.com",
  );
});

Deno.test("Email rejects invalid formats with a typed invalid input error", () => {
  for (
    const value of [
      "",
      "plain",
      "a@@b.co",
      "@example.com",
      "a@",
      "a@b",
      "a@b.c",
      "a b@example.com",
      "a@example.com\nother@example.com",
    ]
  ) {
    const error = assertThrows(() => Email.parse(value), DomainError);
    if (!(error instanceof DomainError)) {
      throw new Error("Expected DomainError", { cause: error });
    }
    assertEquals(error.code, "INVALID_INPUT");
  }
});

Deno.test("Email accepts normalized lengths 6 and 254 and rejects 5 and 255", () => {
  const maximum = `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${
    "d".repeat(57)
  }.com`;
  assertEquals(maximum.length, 254);
  assertEquals(Email.parse(" a@b.co ").value, "a@b.co");
  assertEquals(Email.parse(` ${maximum.toUpperCase()} `).value, maximum);
  for (const value of ["a@b.c", `a${maximum}`]) {
    const error = assertThrows(() => Email.parse(value), DomainError);
    if (!(error instanceof DomainError)) {
      throw new Error("Expected DomainError", { cause: error });
    }
    assertEquals(
      error.code,
      "INVALID_INPUT",
    );
  }
});
