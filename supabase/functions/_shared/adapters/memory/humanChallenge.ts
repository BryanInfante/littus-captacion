import type { HumanChallenge } from "../../ports/humanChallenge.ts";

export class MemoryHumanChallenge implements HumanChallenge {
  constructor(private readonly passes: boolean) {}

  verify(_token: string, _remoteIp: string): Promise<boolean> {
    return Promise.resolve(this.passes);
  }
}
