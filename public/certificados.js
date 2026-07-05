const form = document.querySelector("#certificado-form");
const status = document.querySelector(".form-status");
const spotlights = document.querySelectorAll("[data-spotlight]");
const certificateModal = document.querySelector("#certificate-ready-modal");
const certificateModalCloseButton = certificateModal?.querySelector("[data-certificate-modal-close]");
const certificateDownloadLink = certificateModal?.querySelector("[data-certificate-download-link]");
let previouslyFocusedElement = null;

const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_d3Qth9SGoV8k8AwQw0hJtA_-faBod7E";
const ISSUE_CERTIFICATE_ENDPOINT =
  "https://qfbhyzynpyqqcpuuibod.supabase.co/functions/v1/issue-certificate";

const showStatus = (state, title, message) => {
  status.dataset.state = state;
  status.hidden = false;
  status.innerHTML = `<strong>${title}</strong>${message}`;
  status.focus();
};

const getCertificateModalFocusableElements = () =>
  [...certificateModal.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')];

const openCertificateModal = (certificateUrl) => {
  if (!certificateModal?.showModal) {
    return;
  }

  if (certificateDownloadLink) {
    certificateDownloadLink.href = certificateUrl;
  }

  previouslyFocusedElement = document.activeElement;
  certificateModal.showModal();
  certificateDownloadLink?.focus();
};

const closeCertificateModal = () => {
  certificateModal?.close();
};

certificateModalCloseButton?.addEventListener("click", closeCertificateModal);

certificateModal?.addEventListener("click", (event) => {
  if (event.target === certificateModal) {
    closeCertificateModal();
  }
});

certificateModal?.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    closeCertificateModal();
    return;
  }

  if (event.key !== "Tab") {
    return;
  }

  const focusableElements = getCertificateModalFocusableElements();
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

certificateModal?.addEventListener("close", () => {
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
        "Por alta demanda de hoy no pudimos enviarte el correo todavía. Descárgalo directo abajo.",
      );
      openCertificateModal(result.certificate_url);
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
