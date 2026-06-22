const form = document.querySelector("#inscripcion");
const status = document.querySelector(".form-status");
const spotlights = document.querySelectorAll("[data-spotlight]");
const registrationModal = document.querySelector("#registration-success-modal");
const modalPrimaryAction = registrationModal?.querySelector("[data-modal-primary]");
const modalCloseButton = registrationModal?.querySelector("[data-modal-close]");
let previouslyFocusedElement = null;

const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_d3Qth9SGoV8k8AwQw0hJtA_-faBod7E";
const REGISTRATIONS_ENDPOINT =
  "https://qfbhyzynpyqqcpuuibod.supabase.co/rest/v1/eccia_taller_inscripciones";

const showStatus = (state, title, message) => {
  status.dataset.state = state;
  status.hidden = false;
  status.innerHTML = `<strong>${title}</strong>${message}`;
  status.focus();
};

const getFocusableElements = () =>
  [...registrationModal.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')];

const openRegistrationModal = () => {
  if (!registrationModal?.showModal) {
    return;
  }

  previouslyFocusedElement = document.activeElement;
  registrationModal.showModal();
  modalPrimaryAction.focus();
};

const closeRegistrationModal = () => {
  registrationModal?.close();
};

modalCloseButton?.addEventListener("click", closeRegistrationModal);

registrationModal?.addEventListener("click", (event) => {
  if (event.target === registrationModal) {
    closeRegistrationModal();
  }
});

registrationModal?.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    closeRegistrationModal();
    return;
  }

  if (event.key !== "Tab") {
    return;
  }

  const focusableElements = getFocusableElements();
  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  if (event.shiftKey && document.activeElement === firstElement) {
    event.preventDefault();
    lastElement.focus();
  } else if (!event.shiftKey && document.activeElement === lastElement) {
    event.preventDefault();
    firstElement.focus();
  }
});

registrationModal?.addEventListener("close", () => {
  previouslyFocusedElement?.focus();
  previouslyFocusedElement = null;
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!form.reportValidity()) {
    return;
  }

  const submitButton = form.querySelector(".submit-button");
  const originalButtonContent = submitButton.innerHTML;
  const registration = {
    nombre: form.elements.nombre.value.trim(),
    correo: form.elements.correo.value.trim().toLowerCase(),
    marketing_consent: form.elements.marketing_consent.checked,
  };

  submitButton.disabled = true;
  submitButton.textContent = "Registrando...";
  form.setAttribute("aria-busy", "true");
  status.hidden = true;

  try {
    const response = await fetch(REGISTRATIONS_ENDPOINT, {
      method: "POST",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(registration),
    });

    if (response.ok) {
      form.hidden = true;
      showStatus(
        "success",
        "Inscripción confirmada",
        "Tus datos fueron registrados para Ultrasonido - Interpretación del Scan A.",
      );
      openRegistrationModal();
      return;
    }

    const error = await response.json().catch(() => ({}));

    if (response.status === 409 || error.code === "23505") {
      showStatus(
        "error",
        "Este correo ya está registrado",
        "No necesitas volver a inscribirte para este taller técnico.",
      );
      return;
    }

    throw new Error(error.message || `Supabase respondió con estado ${response.status}.`);
  } catch (error) {
    console.error("No se pudo registrar la inscripción.", error);
    showStatus(
      "error",
      "No pudimos completar tu inscripción",
      "Revisa tu conexión e intenta nuevamente en unos minutos.",
    );
  } finally {
    form.removeAttribute("aria-busy");
    submitButton.disabled = false;
    submitButton.innerHTML = originalButtonContent;
  }
});

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

if (!reduceMotion.matches) {
  spotlights.forEach((spotlight) => {
    spotlight.addEventListener("pointermove", (event) => {
      const rect = spotlight.getBoundingClientRect();
      spotlight.style.setProperty("--mx", `${event.clientX - rect.left}px`);
      spotlight.style.setProperty("--my", `${event.clientY - rect.top}px`);
    });
  });
}
