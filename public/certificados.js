const form = document.querySelector("#certificado-form");
const status = document.querySelector(".form-status");

const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_d3Qth9SGoV8k8AwQw0hJtA_-faBod7E";
const CERTIFICATE_CLAIMS_ENDPOINT =
  "https://qfbhyzynpyqqcpuuibod.supabase.co/rest/v1/eccia_masterclass_certificados";

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
  submitButton.textContent = "Registrando...";
  form.setAttribute("aria-busy", "true");
  status.hidden = true;

  try {
    const response = await fetch(CERTIFICATE_CLAIMS_ENDPOINT, {
      method: "POST",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(claim),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `Supabase respondió con estado ${response.status}.`);
    }

    form.reset();
    showStatus(
      "success",
      "Nombre registrado",
      "Tu nombre completo fue guardado para la entrega de regalos y certificado.",
    );
  } catch (error) {
    console.error("No se pudo registrar el nombre para certificado.", error);
    showStatus(
      "error",
      "No pudimos registrar tu nombre",
      "Revisa tu conexión e intenta nuevamente en unos minutos.",
    );
  } finally {
    form.removeAttribute("aria-busy");
    submitButton.disabled = false;
    submitButton.innerHTML = originalButtonContent;
  }
});
