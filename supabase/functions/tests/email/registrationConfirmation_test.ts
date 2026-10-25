import { assertEquals } from "../dev_deps.ts";
import { renderRegistrationConfirmation } from "../../_shared/email/registrationConfirmation.ts";
import {
  scanAContent,
  SITE_URL,
  ut2Content,
} from "../fixtures/eventContent.ts";

const SNAPSHOTS = new URL("./snapshots/", import.meta.url);

const render = (content = scanAContent, recipientName = "Ana María Pérez") =>
  renderRegistrationConfirmation({ content, recipientName, siteUrl: SITE_URL });

// Goldens are reviewed files: update them deliberately, never in the test.
const assertSnapshot = async (name: string, actual: string) => {
  const expected = (await Deno.readTextFile(new URL(name, SNAPSHOTS)))
    .replaceAll("\r\n", "\n");
  assertEquals(actual, expected);
};

Deno.test("snapshot: Scan A webinar confirmation", async () => {
  const { subject, html } = render(scanAContent);
  assertEquals(
    subject,
    "Inscripción confirmada | Domina la lectura del Scan A",
  );
  await assertSnapshot("scan-a.snap", html);
});

Deno.test("snapshot: UT2 course confirmation", async () => {
  const { subject, html } = render(ut2Content);
  assertEquals(
    subject,
    "Inscripción confirmada | Ultrasonido Convencional Nivel II",
  );
  await assertSnapshot("ut2.snap", html);
});

Deno.test("event links and details come only from the event content", () => {
  const { html } = render(scanAContent);
  for (
    const expected of [
      scanAContent.communityUrl,
      scanAContent.streamUrl,
      `href="${scanAContent.classroomUrl}"`,
      "Visitar el aula virtual",
      "15h00 a 17h00",
      `${SITE_URL}/brand/assets/logo-dark.png`,
    ]
  ) assertEquals(html.includes(expected ?? ""), true, expected ?? "");
});

Deno.test("sections without event data are omitted", () => {
  const { html } = render(ut2Content);
  for (
    const absent of [
      "Horario",
      "Modalidad",
      "Incluye",
      "comunidad de WhatsApp",
      "Abrir o guardar",
      "community.example",
    ]
  ) assertEquals(html.includes(absent), false, absent);
});

Deno.test("recipient name and event text are HTML-escaped", () => {
  const { html, subject } = render(
    { ...ut2Content, title: "<b>Curso</b> & más" },
    '<img src=x onerror="alert(1)"> Ana',
  );
  assertEquals(html.includes("<img src=x"), false);
  assertEquals(html.includes("&lt;img"), true);
  assertEquals(html.includes("<b>Curso</b>"), false);
  assertEquals(html.includes("&lt;b&gt;Curso&lt;/b&gt; &amp; más"), true);
  assertEquals(subject, "Inscripción confirmada | <b>Curso</b> & más");
});

Deno.test("only https links are rendered", () => {
  const { html } = render({
    ...scanAContent,
    communityUrl: "javascript:alert(1)",
    streamUrl: "http://stream.example.invalid/",
  });
  assertEquals(html.includes("javascript:"), false);
  assertEquals(html.includes("http://stream"), false);
});

Deno.test("an operational email never carries promotional markers", () => {
  const { html } = render();
  assertEquals(html.includes("RESEND_UNSUBSCRIBE_URL"), false);
  assertEquals(html.includes("aceptaste comunicaciones"), false);
  assertEquals(html.includes("cuando esté disponible"), false);
  assertEquals(html.includes("marketing_consent"), false);
});

Deno.test("a blank name falls back to a generic greeting", () => {
  assertEquals(
    render(scanAContent, "   ").html.includes("Hola profesional,"),
    true,
  );
});
