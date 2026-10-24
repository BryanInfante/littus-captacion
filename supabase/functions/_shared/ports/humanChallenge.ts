export interface HumanChallenge {
  // Resolves false for every failure, including an unreachable verifier.
  verify(token: string, remoteIp: string): Promise<boolean>;
}
