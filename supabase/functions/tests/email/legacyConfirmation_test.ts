import { assertEquals } from "../dev_deps.ts";
import {
  renderConfirmationEmail,
  renderWorkshopReminderEmail,
} from "../../send-registration-confirmation/template.ts";

// Replaces the static PowerShell assertions on the legacy template source: the
// legacy function must keep rendering the approved Scan A links through the
// shared template until FN-03-03 retires it.
Deno.test("legacy confirmation renders the approved Scan A links through the shared template", () => {
  const html = renderConfirmationEmail("Ana Pérez");
  for (
    const expected of [
      "https://chat.whatsapp.com/EnFIAc8hBNc5Xn4jufjeGD",
      "https://www.youtube.com/live/yW3OQFl76kg?si=F1X3As2vkM9lQ6v_",
      'href="https://cursos.littusgroup.com/"',
      "Visitar el aula virtual",
      "03 de julio",
      "15h00 a 17h00",
      "https://preinscripcion.littusgroup.com/brand/assets/logo-dark.png",
      "Hola Ana,",
    ]
  ) assertEquals(html.includes(expected), true, expected);
  assertEquals(html.includes("cuando esté disponible"), false);
  assertEquals(html.includes("marketing_consent"), false);
});

Deno.test("the workshop reminder keeps rendering from the legacy template", () => {
  const html = renderWorkshopReminderEmail("Ana Pérez");
  assertEquals(html.includes("Tu masterclass inicia en 30 minutos"), true);
  assertEquals(
    html.includes("https://youtube.com/live/yW3OQFl76kg?feature=share"),
    true,
  );
});
