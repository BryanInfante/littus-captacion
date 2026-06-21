const form = document.querySelector("#inscripcion");
const status = document.querySelector(".form-status");
const spotlights = document.querySelectorAll("[data-spotlight]");

const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_d3Qth9SGoV8k8AwQw0hJtA_-faBod7E";
const REGISTRATIONS_ENDPOINT =
  "https://qfbhyzynpyqqcpuuibod.supabase.co/rest/v1/eccia_taller_inscripciones";

const showStatus = (state, title, message) => {
  status.dataset.state = state;
  status.hidden = false;
  status.innerHTML = `<strong>${title}</strong>${message}`;
  status.focus();
};

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
