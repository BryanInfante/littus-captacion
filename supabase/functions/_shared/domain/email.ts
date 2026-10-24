import { DomainError } from "./errors.ts";

export class Email {
  private constructor(readonly value: string) {
    Object.freeze(this);
  }

  static parse(input: string): Email {
    const value = input.trim().toLowerCase();
    // Keep the database's format and length constraints as the last defense.
    if (
      value.length < 6 || value.length > 254 ||
      !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(value)
    ) {
      throw new DomainError("INVALID_INPUT");
    }
    return new Email(value);
  }
}
