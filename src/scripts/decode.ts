/**
 * "Decode" text effect: scramble into noise, then settle letter by letter into the new text.
 *  - `.decode[data-words]`        rotates through a JSON list of words every few seconds
 *  - `[data-decode-hover]`        swaps to a JSON list template on hover/focus and back on leave;
 *                                 `{x}` in the template is replaced with a random entry of data-decode-fill
 */
const GLYPHS = "!<>-_\\/[]{}=+*^?#ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const FRAME_MS = 60;
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const rand = <T>(list: ArrayLike<T>): T => list[Math.floor(Math.random() * list.length)]!;
const runs = new WeakMap<HTMLElement, number>();

export function decodeTo(el: HTMLElement, next: string): Promise<void> {
  const run = (runs.get(el) ?? 0) + 1;
  runs.set(el, run);
  if (reduce) {
    el.textContent = next;
    return Promise.resolve();
  }
  const from = el.textContent ?? "";
  const len = Math.max(from.length, next.length);
  // Longer texts settle a little faster per letter so the whole swap stays around a second.
  const per = len > 20 ? 0.6 : 2;
  const settleAt = Array.from({ length: len }, (_, i) => 6 + Math.round(i * per) + Math.floor(Math.random() * 6));
  const last = Math.max(...settleAt);
  return new Promise((done) => {
    let frame = 0;
    const step = () => {
      if (runs.get(el) !== run) return done(); // superseded by a newer swap
      let out = "";
      for (let i = 0; i < len; i++) {
        if (frame >= settleAt[i]!) out += next[i] ?? "";
        else if (frame < 3 && from[i]) out += from[i];
        else if (next[i] === " ") out += " ";
        else out += i < next.length || frame < settleAt[i]! - 3 ? rand(GLYPHS) : "";
      }
      el.textContent = out;
      if (frame++ < last) setTimeout(() => requestAnimationFrame(step), FRAME_MS);
      else {
        el.textContent = next;
        done();
      }
    };
    step();
  });
}

for (const el of document.querySelectorAll<HTMLElement>(".decode[data-words]")) {
  if (reduce) continue;
  const words: string[] = JSON.parse(el.dataset.words!);
  setInterval(() => {
    if (document.hidden) return;
    let next: string;
    do next = rand(words);
    while (next === el.textContent);
    void decodeTo(el, next);
  }, 6000);
}

for (const el of document.querySelectorAll<HTMLElement>("[data-decode-hover]")) {
  const original = el.textContent ?? "";
  const template = el.dataset.decodeHover!;
  const fill: string[] = JSON.parse(el.dataset.decodeFill ?? "[]");
  el.setAttribute("aria-label", original);
  const on = () => void decodeTo(el, template.replace("{x}", fill.length ? rand(fill) : ""));
  const off = () => void decodeTo(el, original);
  el.addEventListener("pointerenter", on);
  el.addEventListener("pointerleave", off);
  el.addEventListener("focus", on);
  el.addEventListener("blur", off);
}
