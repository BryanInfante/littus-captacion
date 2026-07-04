const form = document.querySelector("#certificado-form");
const status = document.querySelector(".form-status");

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
    showStatus(
      "success",
      result.status === "already_issued" ? "Certificado ya generado" : "Certificado solicitado",
      "Revisa tu correo: enviaremos el enlace de descarga y validación del certificado.",
    );
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
