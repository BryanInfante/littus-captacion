const form = document.querySelector("#certificado-form");
const status = document.querySelector(".form-status");
const spotlights = document.querySelectorAll("[data-spotlight]");

const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_d3Qth9SGoV8k8AwQw0hJtA_-faBod7E";
const ISSUE_CERTIFICATE_ENDPOINT =
  "https://qfbhyzynpyqqcpuuibod.supabase.co/functions/v1/issue-certificate";

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
  const claim = {
    nombre_completo: form.elements.nombre_completo.value.trim(),
    correo: form.elements.correo.value.trim().toLowerCase(),
  };

  submitButton.disabled = true;
  submitButton.textContent = "Generando...";
  form.setAttribute("aria-busy", "true");
  status.hidden = true;

  try {
    const response = await fetch(ISSUE_CERTIFICATE_ENDPOINT, {
      method: "POST",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(claim),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error || result.message || `Supabase respondió con estado ${response.status}.`);
    }

    form.reset();

    if (result.status === "issued_email_delayed") {
      showStatus(
        "success",
        "Certificado listo",
        `Por alta demanda de hoy no pudimos enviarte el correo. Descárgalo directo desde este enlace: <a href="${result.certificate_url}" target="_blank" rel="noopener">${result.certificate_url}</a>`,
      );
    } else {
      showStatus(
        "success",
        result.status === "already_issued" ? "Certificado ya generado" : "Certificado solicitado",
        "Revisa tu correo: enviaremos el enlace de descarga y validación del certificado.",
      );
    }
  } catch (error) {
    console.error("No se pudo solicitar el certificado.", error);
    showStatus(
      "error",
      "No pudimos generar tu certificado",
      error.message || "Revisa tu conexión e intenta nuevamente en unos minutos.",
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
