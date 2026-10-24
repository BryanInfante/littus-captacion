// @ts-check
/// <reference lib="dom" />

// Cloudflare Turnstile, rendered explicitly so a page decides when the widget
// appears (only once a form exists) and keeps its widget id to reset it:
// tokens are single-use, and a page that stays open after a request needs a
// fresh token before the next one.

export const TURNSTILE_SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/**
 * The subset of Turnstile's render options this site uses.
 *
 * @typedef {{
 *   sitekey: string,
 *   theme: "dark" | "light" | "auto",
 *   language: string,
 *   callback: (token: string) => void,
 *   "expired-callback": () => void,
 *   "error-callback": (errorCode: string) => void,
 *   "timeout-callback": () => void,
 * }} TurnstileOptions
 */

/**
 * @typedef {object} TurnstileApi
 * @property {(container: HTMLElement, options: TurnstileOptions) => string | null | undefined} render
 * @property {(widgetId: string) => void} reset
 */

/**
 * A rendered widget: the current token, if any, and a way to discard it.
 *
 * @typedef {object} Challenge
 * @property {() => string | null} token
 * @property {() => void} reset
 */

/** @type {WeakMap<Document, Promise<TurnstileApi>>} */
const loading = new WeakMap();

/**
 * @param {Document} document
 * @returns {TurnstileApi | undefined}
 */
const globalTurnstile = (document) => {
  const view = /** @type {(Window & { turnstile?: TurnstileApi }) | null} */ (
    document.defaultView
  );
  return view?.turnstile;
};

/**
 * Loads the Turnstile script once per document and resolves its API.
 *
 * @param {Document} document
 * @returns {Promise<TurnstileApi>}
 */
export const loadTurnstile = (document) => {
  const ready = globalTurnstile(document);
  if (ready !== undefined) return Promise.resolve(ready);
  const pending = loading.get(document);
  if (pending !== undefined) return pending;

  /** @type {Promise<TurnstileApi>} */
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.addEventListener("load", () => {
      const api = globalTurnstile(document);
      if (api === undefined) reject(new Error("Turnstile API missing"));
      else resolve(api);
    });
    script.addEventListener("error", () => {
      reject(new Error("Turnstile script failed"));
    });
    document.head.append(script);
  });
  // A failed load may be retried with a new script; a pending one is shared.
  promise.catch(() => loading.delete(document));
  loading.set(document, promise);
  return promise;
};

/**
 * @param {TurnstileApi} turnstile
 * @param {HTMLElement} container
 * @param {string} siteKey
 * @returns {Challenge}
 */
export const renderChallenge = (turnstile, container, siteKey) => {
  /** @type {string | null} */
  let token = null;
  const clear = () => {
    token = null;
  };
  const widgetId = turnstile.render(container, {
    sitekey: siteKey,
    theme: "dark",
    language: "es",
    callback: (value) => {
      token = value;
    },
    "expired-callback": clear,
    "error-callback": clear,
    "timeout-callback": clear,
  });
  return {
    token: () => token,
    reset: () => {
      clear();
      if (typeof widgetId === "string") turnstile.reset(widgetId);
    },
  };
};
