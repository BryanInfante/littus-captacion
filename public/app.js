const form = document.querySelector("#inscripcion");
const status = document.querySelector(".form-status");
const spotlights = document.querySelectorAll("[data-spotlight]");

form?.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!form.reportValidity()) {
    return;
  }

  form.hidden = true;
  status.hidden = false;
  status.setAttribute("aria-live", "polite");
  status.innerHTML = `
    <strong>Registro de demostración completado</strong>
    La interfaz funciona correctamente. No se enviaron ni almacenaron datos.
  `;
});

spotlights.forEach((spotlight) => {
  spotlight.addEventListener("pointermove", (event) => {
    const rect = spotlight.getBoundingClientRect();
    spotlight.style.setProperty("--mx", `${event.clientX - rect.left}px`);
    spotlight.style.setProperty("--my", `${event.clientY - rect.top}px`);
  });
});
