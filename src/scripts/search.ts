/**
 * Front-page quick search. Loads /search.json on first focus and ranks games, toolchains and events as you type:
 * whole title, word starts, initials ("sotn", "ff7"), then other facts (repo, platform aliases, developer, series,
 * genre, year). Picking a result opens its page.
 */
type Item = { t: "g" | "t" | "e"; n: string; s: string; h: string; c?: string; k: string; w: number };
type Prepared = Item & { name: string; nameWords: string[]; initials: string; compact: string; keys: string; keyWords: string[] };

const ROMAN: Record<string, string> = { ii: "2", iii: "3", iv: "4", v: "5", vi: "6", vii: "7", viii: "8", ix: "9", x: "10", xi: "11", xii: "12", xiii: "13" };
/** Lowercase, no accents or punctuation, Roman numerals as digits ("Final Fantasy VII" → "final fantasy 7"). */
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .map((w) => ROMAN[w] ?? w)
    .join(" ");
const SMALL = new Set(["the", "of", "a", "an", "and", "to", "in"]);

function prepare(i: Item): Prepared {
  const name = norm(i.n);
  const nameWords = name.split(" ");
  // initials of the significant words, digits kept whole: "castlevania symphony of the night" → "csotn" and "csn"
  const initials = nameWords.map((w) => (/^\d+$/.test(w) ? w : w[0])).join("") + " " + nameWords.filter((w) => !SMALL.has(w)).map((w) => (/^\d+$/.test(w) ? w : w[0])).join("");
  const keys = norm(i.k);
  return { ...i, name, nameWords, initials, compact: name.replaceAll(" ", ""), keys, keyWords: keys.split(" ") };
}

function score(p: Prepared, q: string, tokens: string[]): number {
  let s = 0;
  if (p.name === q) s += 100;
  else if (p.name.startsWith(q)) s += 70;
  // inside a word only from four letters on: "oot" is Ocarina of Time, not "Bandicoot"
  else if (p.compact.includes(q.replaceAll(" ", "")) && q.length >= 4) s += 45;
  if (q.length >= 2 && !q.includes(" ")) {
    const inis = p.initials.split(" ");
    if (inis.some((ini) => ini.startsWith(q))) s += 50;
    else if (q.length >= 3 && inis.some((ini) => ini.includes(q))) s += 30;
  }
  // every word typed has to show up somewhere: in the title (worth more) or in the other facts
  for (const t of tokens) {
    if (p.nameWords.some((w) => w === t)) s += 22;
    else if (p.nameWords.some((w) => w.startsWith(t))) s += 16;
    else if (t.length >= 4 && p.name.includes(t)) s += 8;
    else if (t.length >= 2 && /[a-z]/.test(t) && p.initials.includes(t)) s += 14;
    else if (p.keyWords.some((w) => w === t)) s += 9;
    else if (p.keyWords.some((w) => w.startsWith(t))) s += 6;
    else if (t.length >= 4 && p.keys.includes(t)) s += 3;
    else if (s < 45) return 0;
  }
  return s;
}

const LABEL = { g: "game", t: "toolchain", e: "event" } as const;
const MAX = 8;

const root = document.getElementById("qs");
const input = document.getElementById("qs-input") as HTMLInputElement | null;
const list = document.getElementById("qs-results") as HTMLUListElement | null;
if (root && input && list) {
  let index: Prepared[] | null = null;
  let loading: Promise<void> | null = null;
  let active = -1;
  let shown: Prepared[] = [];
  const load = () =>
    (loading ??= fetch("/search.json")
      .then((r) => r.json() as Promise<Item[]>)
      .then((items) => {
        index = items.map(prepare);
        render();
      })
      .catch(() => {
        loading = null;
      }));

  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const setActive = (i: number) => {
    active = i;
    list.querySelectorAll("a").forEach((a, k) => a.classList.toggle("on", k === i));
    input.setAttribute("aria-activedescendant", i >= 0 ? `qs-r${i}` : "");
  };
  function render() {
    const q = norm(input!.value);
    if (!q || !index) {
      shown = [];
      list!.hidden = true;
      input!.setAttribute("aria-expanded", "false");
      return;
    }
    const tokens = q.split(" ").filter(Boolean);
    shown = index
      .map((p) => ({ p, s: score(p, q, tokens) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s || b.p.w - a.p.w)
      .slice(0, MAX)
      .map((r) => r.p);
    list!.innerHTML = shown.length
      ? shown
          .map(
            (p, i) =>
              `<li role="presentation"><a id="qs-r${i}" role="option" href="${p.h}" class="qs-hit t-${p.t}">` +
              (p.c ? `<img src="${p.c}" alt="" loading="lazy" />` : `<span class="qs-ico" aria-hidden="true">${p.t === "e" ? "◆" : "⚙"}</span>`) +
              `<span class="qs-txt"><strong>${esc(p.n)}</strong><span>${esc(p.s)}</span></span><span class="qs-type">${LABEL[p.t]}</span></a></li>`,
          )
          .join("")
      : `<li class="qs-none">No games, toolchains or events match “${esc(input!.value.trim())}”.</li>`;
    list!.hidden = false;
    input!.setAttribute("aria-expanded", "true");
    setActive(shown.length ? 0 : -1);
  }

  input.addEventListener("focus", () => {
    load();
    if (input.value) render();
  });
  input.addEventListener("input", () => (index ? render() : load()));
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!shown.length) return;
      e.preventDefault();
      setActive((active + (e.key === "ArrowDown" ? 1 : -1) + shown.length) % shown.length);
      list.querySelectorAll("a")[active]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      const hit = shown[active];
      if (hit) {
        e.preventDefault();
        location.href = hit.h;
      }
    } else if (e.key === "Escape") {
      if (input.value) input.value = "";
      render();
      input.blur();
    }
  });
  document.addEventListener("click", (e) => {
    if (!root.contains(e.target as Node)) {
      list.hidden = true;
      input.setAttribute("aria-expanded", "false");
    }
  });
  // "/" jumps to the search from anywhere on the page, unless you're typing somewhere else
  document.addEventListener("keydown", (e) => {
    const t = e.target as HTMLElement;
    if (e.key !== "/" || e.metaKey || e.ctrlKey || t.closest("input, textarea, select, [contenteditable]")) return;
    e.preventDefault();
    input.focus();
  });
}
