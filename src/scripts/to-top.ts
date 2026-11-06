/**
 * Floating "back to the top" button (Base.astro). It appears once the reader is more than a screen and a half
 * down, and its ring fills with how far down the page they are.
 */
const btn = document.querySelector<HTMLButtonElement>(".to-top");
if (btn) {
  const ring = btn.querySelector<SVGCircleElement>(".tt-ring")!;
  let queued = false;
  const update = () => {
    queued = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    btn.hidden = false;
    btn.classList.toggle("on", scrollY > innerHeight * 1.5);
    ring.style.strokeDashoffset = String(100 - (max > 0 ? (scrollY / max) * 100 : 0));
  };
  addEventListener(
    "scroll",
    () => {
      if (!queued) requestAnimationFrame(update);
      queued = true;
    },
    { passive: true },
  );
  addEventListener("resize", update);
  update();
  btn.addEventListener("click", () => {
    scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    // keyboard users land at the start of the page, not on a button that is about to fade out
    document.querySelector<HTMLElement>(".brand")?.focus({ preventScroll: true });
  });
}

export {};
