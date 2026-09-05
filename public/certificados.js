const form = document.querySelector("#certificado-form");
const status = document.querySelector(".form-status");
const spotlights = document.querySelectorAll("[data-spotlight]");
const certificateModal = document.querySelector("#certificate-ready-modal");
const certificateModalCloseButton = certificateModal?.querySelector("[data-certificate-modal-close]");
const certificateDownloadLink = certificateModal?.querySelector("[data-certificate-download-link]");
const certificateModalTitle = certificateModal?.querySelector("#certificate-ready-title");
const certificateModalDescription = certificateModal?.querySelector("#certificate-ready-description");
const certificateModalNote = certificateModal?.querySelector("[data-certificate-modal-note]");
let previouslyFocusedElement = null;

const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_VrTz-gg1X787doh2KgvX3g_ESS7BzS-";
const ISSUE_CERTIFICATE_ENDPOINT =
  "https://dkvuihkwuuocjjsscuso.supabase.co/functions/v1/issue-certificate";
const SUPPORT_EMAIL = "formanager@littusgroup.com";
const SUPPORT_EMAIL_RETRY_THRESHOLD = 3;
let failedCertificateAttempts = 0;

const showStatus = (state, title, message) => {
  status.dataset.state = state;
  status.hidden = false;
  status.innerHTML = `<strong>${title}</strong>${message}`;
  status.focus();
};

const getCertificateModalFocusableElements = () =>
  [...certificateModal.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')];

const openCertificateModal = ({ certificateUrl, title, description, note }) => {
  if (!certificateModal?.showModal) {
    return;
  }

  if (certificateDownloadLink) {
    certificateDownloadLink.href = certificateUrl;
  }
  if (certificateModalTitle) {
    certificateModalTitle.textContent = title;
  }
  if (certificateModalDescription) {
    certificateModalDescription.textContent = description;
  }
  if (certificateModalNote) {
    certificateModalNote.textContent = note;
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
      // Only trust `result.error` — it's our own function's contract field.
      // A platform-level failure (e.g. WORKER_RESOURCE_LIMIT) responds with
      // Supabase's own {code, message} shape instead, and that `message` is
      // raw infra text that must never reach the user directly.
      throw new Error(result.error || "No se pudo completar la solicitud. Vuelve a intentarlo en unos minutos.");
    }

    form.reset();
    failedCertificateAttempts = 0;

    if (result.status === "issued_email_delayed") {
      showStatus(
        "success",
        "Certificado listo",
        "Por alta demanda de hoy no pudimos enviarte el correo todavía. Descárgalo directo desde la ventana que se abrió.",
      );
      openCertificateModal({
        certificateUrl: result.certificate_url,
        title: "Tu certificado está listo",
        description: "Por alta demanda de hoy no pudimos enviarte el correo todavía.",
        note: "Igual te lo enviaremos por correo en cuanto se libere el cupo diario. Revisa tu bandeja de entrada o spam — puede tardar hasta 48 horas en llegar.",
      });
    } else if (result.status === "issued" || result.status === "already_issued") {
      showStatus(
        "success",
        result.status === "already_issued" ? "Certificado ya generado" : "Certificado enviado",
        "Revisa tu correo: te enviamos el enlace de descarga y validación del certificado.",
      );
      openCertificateModal({
        certificateUrl: result.certificate_url,
        title: result.status === "already_issued" ? "Tu certificado ya estaba generado" : "Tu certificado fue enviado",
        description: "Te enviamos el certificado a tu correo.",
        note: "Revisa tu bandeja de entrada o la carpeta de spam — a veces llega ahí. También puedes descargarlo con el botón de arriba.",
      });
    } else {
      showStatus(
        "success",
        "Certificado solicitado",
        "En unos minutos recibirás el enlace de descarga y validación por correo.",
      );
    }
  } catch (error) {
    console.error("No se pudo solicitar el certificado.", error);
    failedCertificateAttempts += 1;
    const baseMessage = error.message || "Revisa tu conexión e intenta nuevamente en unos minutos.";
    const supportHint =
      failedCertificateAttempts >= SUPPORT_EMAIL_RETRY_THRESHOLD
        ? ` Si ya lo intentaste varias veces sin éxito, escríbenos a <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> y te ayudamos directamente.`
        : "";
    showStatus("error", "No pudimos generar tu certificado", baseMessage + supportHint);
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
