// @ts-check
/// <reference lib="dom" />

// Container of the registration page: owns the page state and the I/O (the
// api client and the human challenge), decides with the pure model and
// renders through the view. Its dependencies are injected, so tests drive the
// whole flow against a fake DOM without a network.

import {
  CHALLENGE_REQUIRED,
  CHALLENGE_UNAVAILABLE,
  describeRegistrationError,
  normalizeEmail,
  pageStateFor,
  parseEventSlug,
  validateRegistration,
} from "./model.js";
import {
  clearFeedback,
  readRegistrationForm,
  renderCatalogUnavailable,
  renderClosedEvent,
  renderEventNotFound,
  renderMissingEvent,
  renderOpenEvent,
  renderSuccess,
  setSubmitting,
  showEmailValue,
  showFieldErrors,
  showStatus,
} from "./view.js";

/** @typedef {import("../core/api.js").PublicEvent} PublicEvent */
/** @typedef {import("../core/api.js").RegistrationRequest} RegistrationRequest */
/** @typedef {import("../core/api.js").RegistrationResult} RegistrationResult */
/** @typedef {import("../core/turnstile.js").Challenge} Challenge */
/** @typedef {import("./view.js").FormRefs} FormRefs */

/**
 * @typedef {object} RegistrationPageDependencies
 * @property {Document} document
 * @property {string} search The page's `location.search`.
 * @property {() => Date} now
 * @property {{
 *   fetchPublicEvent: (code: string) => Promise<PublicEvent | null>,
 *   register: (request: RegistrationRequest) => Promise<RegistrationResult>,
 * }} api
 * @property {(slot: HTMLElement) => Promise<Challenge>} loadChallenge
 */

/** @type {RegistrationResult} */
const UNEXPECTED_FAILURE = {
  ok: false,
  error: "UNEXPECTED_RESPONSE",
  retryAfterSeconds: null,
};

/**
 * @param {RegistrationPageDependencies} dependencies
 * @param {PublicEvent} event
 */
const startForm = (dependencies, event) => {
  const { document, api } = dependencies;
  const refs = renderOpenEvent(document, event);

  /** @type {{ kind: "loading" } | { kind: "ready", challenge: Challenge } | { kind: "failed" }} */
  let challengeState = { kind: "loading" };
  dependencies.loadChallenge(refs.challengeSlot).then(
    (challenge) => {
      challengeState = { kind: "ready", challenge };
    },
    () => {
      challengeState = { kind: "failed" };
    },
  );

  let submitting = false;

  refs.email.addEventListener("blur", () => {
    showEmailValue(refs, normalizeEmail(readRegistrationForm(refs).email));
  });

  refs.form.addEventListener("submit", async (submitEvent) => {
    submitEvent.preventDefault();
    if (submitting) return;
    clearFeedback(refs);

    const validation = validateRegistration(readRegistrationForm(refs));
    if (!validation.ok) {
      showFieldErrors(refs, validation.errors);
      return;
    }
    showEmailValue(refs, validation.values.email);

    if (challengeState.kind !== "ready") {
      showFieldErrors(refs, {
        challenge: challengeState.kind === "failed"
          ? CHALLENGE_UNAVAILABLE
          : CHALLENGE_REQUIRED,
      });
      return;
    }
    const { challenge } = challengeState;
    const challengeToken = challenge.token();
    if (challengeToken === null) {
      showFieldErrors(refs, { challenge: CHALLENGE_REQUIRED });
      return;
    }

    submitting = true;
    setSubmitting(refs, true);
    /** @type {RegistrationResult} */
    let result;
    try {
      result = await api.register({
        eventCode: event.code,
        ...validation.values,
        challengeToken,
      });
    } catch {
      result = UNEXPECTED_FAILURE;
    } finally {
      // The token was spent on this request, whatever its outcome.
      challenge.reset();
      submitting = false;
      setSubmitting(refs, false);
    }

    if (result.ok) {
      renderSuccess(document);
      return;
    }
    const feedback = describeRegistrationError(result);
    if (feedback.target === "status") {
      showStatus(refs, feedback);
    } else {
      showFieldErrors(refs, { [feedback.target]: feedback.message });
    }
  });
};

/**
 * Renders the page for the event in `?evento=` and, when its registration is
 * open, wires the form.
 *
 * @param {RegistrationPageDependencies} dependencies
 * @returns {Promise<void>}
 */
export const startRegistrationPage = async (dependencies) => {
  const { document } = dependencies;
  const slug = parseEventSlug(dependencies.search);
  if (slug.kind === "missing") {
    renderMissingEvent(document);
    return;
  }
  if (slug.kind === "invalid") {
    renderEventNotFound(document);
    return;
  }

  /** @type {PublicEvent | null} */
  let event;
  try {
    event = await dependencies.api.fetchPublicEvent(slug.code);
  } catch {
    renderCatalogUnavailable(document);
    return;
  }

  const state = pageStateFor(event, dependencies.now());
  if (state.kind === "not-found") renderEventNotFound(document);
  else if (state.kind === "closed") renderClosedEvent(document, state.event);
  else startForm(dependencies, state.event);
};
