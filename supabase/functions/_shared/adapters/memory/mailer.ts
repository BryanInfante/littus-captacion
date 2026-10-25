import type { Mailer, OperationalEmail } from "../../ports/mailer.ts";

export class MemoryMailer implements Mailer {
  readonly sent: OperationalEmail[] = [];
  private failures: unknown[] = [];

  failNext(error: unknown): void {
    this.failures.push(error);
  }

  send(email: OperationalEmail): Promise<{ readonly id: string }> {
    const failure = this.failures.shift();
    if (failure !== undefined) return Promise.reject(failure);
    this.sent.push(email);
    return Promise.resolve({ id: `memory-email-${this.sent.length}` });
  }
}
