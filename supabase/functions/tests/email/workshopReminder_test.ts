import { assertEquals } from "../dev_deps.ts";
import { renderWorkshopReminderEmail } from "../../send-workshop-reminder/template.ts";

// Replaces the static PowerShell assertions on the reminder template source.
Deno.test("the workshop reminder renders the approved subject, event name and stream link", () => {
  const html = renderWorkshopReminderEmail("Ana Pérez");
  for (
    const expected of [
      "Tu masterclass inicia en 30 minutos",
      "Masterclass Ultrasonido Industrial - Interpretación del Scan-A",
      "https://youtube.com/live/yW3OQFl76kg?feature=share",
      "Hola Ana,",
    ]
  ) assertEquals(html.includes(expected), true, expected);
  assertEquals(html.includes("Tu taller técnico inicia en 30 minutos"), false);
  assertEquals(html.includes("marketing_consent"), false);
});

Deno.test("the workshop reminder escapes the recipient name", () => {
  const html = renderWorkshopReminderEmail("<script>x</script> Ana");
  assertEquals(html.includes("<script>"), false);
});
