/// <reference lib="dom" />
import { assertEquals, assertRejects } from "../dev_deps.ts";
import {
  loadTurnstile,
  renderChallenge,
  TURNSTILE_SCRIPT_URL,
  type TurnstileApi,
  type TurnstileOptions,
} from "../../../../public/js/core/turnstile.js";
import { TURNSTILE_SITE_KEY } from "../../../../public/js/core/config.js";
import { emptyPage } from "./fake_dom.ts";

const script = (document: Document): Element => {
  const element = document.querySelector("script");
  if (element === null) throw new Error("No script");
  return element;
};

const fakeTurnstile = () => {
  const rendered: { slot: HTMLElement; options: TurnstileOptions }[] = [];
  const resets: string[] = [];
  const api: TurnstileApi = {
    render: (slot, options) => {
      rendered.push({ slot, options });
      return "widget-1";
    },
    reset: (widgetId) => {
      resets.push(widgetId);
    },
  };
  return { api, rendered, resets };
};

Deno.test("the challenge renders explicitly with the site key and tracks its single-use token", () => {
  const { document } = emptyPage();
  const slot = document.createElement("div");
  const { api, rendered, resets } = fakeTurnstile();

  const challenge = renderChallenge(api, slot, TURNSTILE_SITE_KEY);
  assertEquals(rendered.length, 1);
  const [{ slot: renderedSlot, options }] = rendered;
  assertEquals(renderedSlot, slot);
  assertEquals(options.sitekey, "0x4AAAAAAFkQkWGC4HttCEQB");
  assertEquals(options.theme, "dark");
  assertEquals(options.language, "es");
  assertEquals(challenge.token(), null);

  options.callback("token-1");
  assertEquals(challenge.token(), "token-1");
  options["expired-callback"]();
  assertEquals(challenge.token(), null);

  options.callback("token-2");
  options["error-callback"]("300010");
  assertEquals(challenge.token(), null);

  options.callback("token-3");
  options["timeout-callback"]();
  assertEquals(challenge.token(), null);

  options.callback("token-4");
  challenge.reset();
  assertEquals(challenge.token(), null);
  assertEquals(resets, ["widget-1"]);
});

Deno.test("loadTurnstile injects the explicit-render script once and resolves its API", async () => {
  const { document, window, dispatch } = emptyPage();
  const { api } = fakeTurnstile();

  const loading = loadTurnstile(document);
  const again = loadTurnstile(document);
  const scripts = [...document.querySelectorAll("script")];
  assertEquals(scripts.map((script) => script.getAttribute("src")), [
    TURNSTILE_SCRIPT_URL,
  ]);
  assertEquals(
    TURNSTILE_SCRIPT_URL,
    "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
  );
  // linkedom's window forwards property writes to globalThis, so the fake
  // API is removed afterwards to keep the next tests without a global.
  Object.assign(window, { turnstile: api });
  try {
    dispatch(scripts[0], "load");
    assertEquals(await loading, api);
    assertEquals(await again, api);
    assertEquals(await loadTurnstile(document), api);
    assertEquals(document.querySelectorAll("script").length, 1);
  } finally {
    Reflect.deleteProperty(globalThis, "turnstile");
  }
});

Deno.test("loadTurnstile fails when the script cannot load or exposes no API", async (t) => {
  await t.step("network error", async () => {
    const { document, dispatch } = emptyPage();
    const loading = loadTurnstile(document);
    dispatch(script(document), "error");
    await assertRejects(() => loading, Error, "Turnstile script failed");
  });
  await t.step("loaded without the global", async () => {
    const { document, dispatch } = emptyPage();
    const loading = loadTurnstile(document);
    dispatch(script(document), "load");
    await assertRejects(() => loading, Error, "Turnstile API missing");
  });
});
