/// <reference lib="dom" />
import { assertEquals, parseHTML } from "../dev_deps.ts";

const LANDING = new URL("../../../../public/index.html", import.meta.url);
const REGISTRATION_URL =
  "inscripcion.html?evento=ultrasonido-industrial-scan-a";

Deno.test("landing registration calls use the generic event route", async () => {
  const { document } = parseHTML(await Deno.readTextFile(LANDING));
  const registrationCalls = [
    ...document.querySelectorAll("a[data-registration-cta]"),
  ];

  assertEquals(registrationCalls.length, 9);
  assertEquals(
    registrationCalls.map((link) => link.getAttribute("href")),
    Array(9).fill(REGISTRATION_URL),
  );
  assertEquals(document.querySelector("form"), null);
  assertEquals(document.querySelector("#registration-success-modal"), null);
});
