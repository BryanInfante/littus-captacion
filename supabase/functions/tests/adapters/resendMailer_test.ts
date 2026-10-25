import { assertEquals, assertRejects } from "../dev_deps.ts";
import {
  createResendMailer,
  RESEND_API_URL,
} from "../../_shared/adapters/resend/mailer.ts";
import { Email } from "../../_shared/domain/email.ts";
import { DomainError } from "../../_shared/domain/errors.ts";
import type { OperationalEmail } from "../../_shared/ports/mailer.ts";

const API_KEY = "re_fixture_private_key";
const message: OperationalEmail = {
  to: Email.parse("ana@example.invalid"),
  subject: "Inscripción confirmada | Evento",
  html: "<p>Hola</p>",
  idempotencyKey: "registration-confirmation/abc",
  tags: [{ name: "email_type", value: "registration_confirmation" }],
};

const mailerWith = (
  respond: (request: Request) => Response | Promise<Response>,
  requests: Request[] = [],
) =>
  createResendMailer({
    apiKey: API_KEY,
    from: "Sender <sender@example.invalid>",
    replyTo: "reply@example.invalid",
    fetch: (input, init) => {
      const request = new Request(input, init);
      requests.push(request.clone());
      return Promise.resolve(respond(request));
    },
  });

const assertDeliveryFailure = async (send: Promise<unknown>) => {
  const error = await assertRejects(() => send, DomainError);
  assertEquals((error as DomainError).code, "MAIL_DELIVERY_FAILED");
  assertEquals(String((error as DomainError).message).includes(API_KEY), false);
};

Deno.test("posts one operational email to /emails with idempotency and returns the id", async () => {
  const requests: Request[] = [];
  const mailer = mailerWith(
    () => Response.json({ id: "resend-id-1" }),
    requests,
  );

  assertEquals(await mailer.send(message), { id: "resend-id-1" });

  assertEquals(requests.length, 1);
  const [request] = requests;
  assertEquals(request.method, "POST");
  assertEquals(request.url, `${RESEND_API_URL}/emails`);
  assertEquals(request.headers.get("authorization"), `Bearer ${API_KEY}`);
  assertEquals(
    request.headers.get("idempotency-key"),
    "registration-confirmation/abc",
  );
  assertEquals(await request.json(), {
    from: "Sender <sender@example.invalid>",
    to: ["ana@example.invalid"],
    reply_to: "reply@example.invalid",
    subject: message.subject,
    html: message.html,
    tags: message.tags,
  });
});

Deno.test("a rejected message fails with a typed error that hides provider text", async () => {
  const mailer = mailerWith(() =>
    Response.json({ message: "ana@example.invalid is invalid" }, {
      status: 422,
    })
  );
  await assertDeliveryFailure(mailer.send(message));
});

Deno.test("a success response without an id is a delivery failure", async () => {
  await assertDeliveryFailure(
    mailerWith(() => Response.json({})).send(message),
  );
  await assertDeliveryFailure(
    mailerWith(() => new Response("not json", { status: 200 })).send(message),
  );
});

Deno.test("a network error is a delivery failure", async () => {
  const mailer = createResendMailer({
    apiKey: API_KEY,
    from: "Sender <sender@example.invalid>",
    replyTo: "reply@example.invalid",
    fetch: () => Promise.reject(new Error(`boom ${API_KEY}`)),
  });
  await assertDeliveryFailure(mailer.send(message));
});
