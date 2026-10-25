const spotlights = document.querySelectorAll("[data-spotlight]");
const META_PIXEL_ID = "896484926815497";

const initMetaPixel = () => {
  if (!META_PIXEL_ID) {
    return;
  }

  if (!globalThis.fbq) {
    const fbq = function () {
      fbq.callMethod
        ? fbq.callMethod.apply(fbq, arguments)
        : fbq.queue.push(arguments);
    };

    globalThis.fbq = fbq;
    globalThis._fbq = fbq;
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = "2.0";
    fbq.queue = [];

    const script = document.createElement("script");
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    const firstScript = document.getElementsByTagName("script")[0];
    firstScript.parentNode.insertBefore(script, firstScript);
  }

  const fbq = globalThis.fbq;
  fbq("init", META_PIXEL_ID);
  fbq("track", "PageView");
};

const reduceMotion = globalThis.matchMedia("(prefers-reduced-motion: reduce)");

if (!reduceMotion.matches) {
  spotlights.forEach((spotlight) => {
    spotlight.addEventListener("pointermove", (event) => {
      const rect = spotlight.getBoundingClientRect();
      spotlight.style.setProperty("--mx", `${event.clientX - rect.left}px`);
      spotlight.style.setProperty("--my", `${event.clientY - rect.top}px`);
    });
  });
}

initMetaPixel();
