// @ts-check
/// <reference lib="dom" />

// Entry point of public/inscripcion.html: wires the real browser dependencies
// into the container. Everything with logic lives in the imported modules.

import { createApiClient } from "../core/api.js";
import { TURNSTILE_SITE_KEY } from "../core/config.js";
import { loadTurnstile, renderChallenge } from "../core/turnstile.js";
import { startRegistrationPage } from "./container.js";

startRegistrationPage({
  document,
  search: globalThis.location.search,
  now: () => new Date(),
  api: createApiClient((input, init) => fetch(input, init)),
  loadChallenge: async (slot) =>
    renderChallenge(await loadTurnstile(document), slot, TURNSTILE_SITE_KEY),
});
