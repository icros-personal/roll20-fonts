import "./styles.css";
import "./generated-fonts.css";

const capitalGlyphs = [
  ["A", "Die 1"],
  ["B", "Die 2"],
  ["C", "Die 3"],
  ["D", "Die 4"],
  ["E", "Die 5"],
  ["F", "Die 6"],
  ["G", "Die 1"],
  ["H", "Die 2"],
  ["I", "Die 3"],
  ["J", "Die 4"],
  ["K", "Die 5"],
  ["L", "Die 6"],
  ["M", "Die 2"],
  ["N", "Die 3"],
  ["O", "Die 6"],
  ["P", "Die 2"],
  ["Q", "Die 3"],
  ["R", "Die 6"],
];
const lowercaseGlyphs = capitalGlyphs.map(([c, label]) => [
  c.toLowerCase(),
  label,
]);

const fontUrls = {
  "probe.ttf": new URL("./fonts/probe.ttf", import.meta.url),
  "probe.woff": new URL("./fonts/probe.woff", import.meta.url),
  "probe.woff2": new URL("./fonts/probe.woff2", import.meta.url),
  "roll20-d6.woff": new URL("./fonts/roll20-d6.woff", import.meta.url),
  "roll20-d6.ttf": new URL("./fonts/roll20-d6.ttf", import.meta.url),
  "roll20-d6-names.woff": new URL(
    "./fonts/roll20-d6-names.woff",
    import.meta.url
  ),
  "roll20-d6-clean.woff": new URL(
    "./fonts/roll20-d6-clean.woff",
    import.meta.url
  ),
};

// Every @font-face family on the page, from simplest (self-made probe) to the real thing.
const cssTests = [
  ["probe-ttf", "ABCD", "Probe font, external .ttf"],
  ["probe-woff", "ABCD", "Probe font, external .woff"],
  ["probe-woff2", "ABCD", "Probe font, external .woff2"],
  ["probe-woff-b64", "ABCD", "Probe font, base64 data: URI woff"],
  ["dicefontd6", "ABCDEF", "Roll20 font, base64 (as Roll20 serves it)"],
  ["dicefontd6notx", "ABCDEF", "Roll20 font, base64, font/woff mime"],
  ["roll20-ext-woff", "ABCDEF", "Roll20 font, external .woff (same bytes)"],
  ["roll20-ext-ttf", "ABCDEF", "Roll20 font, external .ttf (decompressed)"],
  ["roll20-names-woff", "ABCDEF", "Roll20 font, name table repaired, external"],
  ["roll20-names-b64", "ABCDEF", "Roll20 font, name table repaired, base64"],
  ["roll20-clean-woff", "ABCDEF", "Roll20 font, names repaired + unhinted"],
];

const cspViolations = [];
document.addEventListener("securitypolicyviolation", (e) =>
  cspViolations.push(`${e.violatedDirective} blocked ${e.blockedURI}`)
);

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function addSamples(family, glyphs) {
  const samples = document.getElementById("samples");
  samples.append(el("h3", { textContent: family }));
  const grid = el("div", { className: "grid" });
  for (const [char, label] of glyphs) {
    const glyph = el("div", { className: "glyphs", textContent: char });
    glyph.style.fontFamily = `"${family}", sans-serif`;
    grid.append(
      el("div", { className: "sample" }, glyph, el("div", { textContent: label }))
    );
  }
  samples.append(grid);
}

addSamples("dicefontd6", [...capitalGlyphs, ...lowercaseGlyphs]);
addSamples("probe-woff", [
  ["A", "Square"],
  ["B", "Diamond"],
  ["C", "Triangle"],
  ["D", "Ring"],
]);

// Width-based detection: if text set in "family, fallback" measures the same as text in
// plain "fallback" for two different fallbacks, the browser is not drawing with the font.
function textWidth(fontFamily, text) {
  const span = el("span", { textContent: text });
  span.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font-size:48px;font-family:${fontFamily}`;
  document.body.append(span);
  const w = span.getBoundingClientRect().width;
  span.remove();
  return w;
}

function rendersWith(family, text) {
  const diffs = ["monospace", "serif"].map(
    (fb) => textWidth(`"${family}", ${fb}`, text) !== textWidth(fb, text)
  );
  return diffs.every(Boolean);
}

async function faceStatus(family) {
  const faces = [...document.fonts].filter(
    (f) => f.family.replace(/^["']|["']$/g, "") === family
  );
  if (!faces.length) return "no @font-face registered";
  const out = [];
  for (const face of faces) {
    try {
      await face.load();
      out.push(face.status);
    } catch (e) {
      out.push(`${face.status}: ${e.name} ${e.message}`);
    }
  }
  return out.join(", ");
}

async function cssRows() {
  const rows = [];
  for (const [family, chars, desc] of cssTests) {
    const status = await faceStatus(family);
    const used = rendersWith(family, chars);
    const preview = el("span", { className: "preview", textContent: chars });
    preview.style.fontFamily = `"${family}", monospace`;
    rows.push({ desc, family, status, used, preview });
  }
  return rows;
}

// Bypass CSS entirely: fetch the raw bytes and hand them to the FontFace constructor.
// A sanitizer rejection shows up here as an exception with a message.
async function rawRows() {
  const rows = [];
  for (const [name, url] of Object.entries(fontUrls)) {
    const row = { name, fetch: "", parse: "", used: false };
    try {
      const res = await fetch(url);
      const buf = await res.arrayBuffer();
      const sig = String.fromCharCode(...new Uint8Array(buf.slice(0, 4)))
        .replace(/[^\x20-\x7e]/g, "·");
      row.fetch = `${res.status} ${
        res.headers.get("content-type") || "(no type)"
      }, ${buf.byteLength} B, sig "${sig}"`;
      const family = `raw-${name.replace(/\W/g, "-")}`;
      const face = new FontFace(family, buf);
      document.fonts.add(face);
      await face.load();
      row.parse = face.status;
      row.used = rendersWith(family, name.startsWith("probe") ? "ABCD" : "ABCDEF");
    } catch (e) {
      row.parse = row.parse || `${e.name}: ${e.message}`;
      if (!row.fetch) row.fetch = `${e.name}: ${e.message}`;
    }
    rows.push(row);
  }
  return rows;
}

function yesNo(b) {
  return el("span", { className: b ? "ok" : "bad", textContent: b ? "YES" : "no" });
}

function environment() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return [
    `User agent: ${navigator.userAgent}`,
    `Platform: ${navigator.platform || "not reported"}`,
    `Languages: ${navigator.languages?.join(", ")}`,
    `Time zone: ${tz} (offset ${new Date().getTimezoneOffset()})`,
    `Screen: ${screen.width}x${screen.height}, DPR ${devicePixelRatio}`,
    `Page origin: ${location.origin}`,
    `document.fonts API: ${"fonts" in document ? "available" : "not available"}`,
    `FontFace constructor: ${typeof FontFace}`,
    `CSP violations: ${cspViolations.join("; ") || "none"}`,
  ].join("\n");
}

function interpret(css, raw) {
  const probeOk = css.filter((r) => r.family.startsWith("probe")).some((r) => r.used);
  const probeLoaded = css
    .filter((r) => r.family.startsWith("probe"))
    .some((r) => r.status.includes("loaded"));
  const roll20Ok = css.find((r) => r.family === "dicefontd6").used;
  const anyRoll20 = css.filter((r) => r.family.startsWith("roll20")).some((r) => r.used);
  if (roll20Ok) return "The Roll20 font renders here. If Roll20 itself still fails, suspect something site-specific: an extension (uBlock Origin \"block remote fonts\", NoScript), a per-site permission, or Roll20's own CSS/CSP.";
  if (!probeOk && probeLoaded)
    return "Fonts LOAD but are never USED, even the tiny self-made one. This is almost certainly the Firefox setting \"Allow pages to choose their own fonts\" being off (Settings → Fonts → Advanced, pref browser.display.use_document_fonts = 0), or a hardened profile (LibreWolf, arkenfox, resistFingerprinting).";
  if (!probeOk)
    return "No web font loads at all, even the tiny self-made one. Suspect web fonts disabled (gfx.downloadable_fonts.enabled = false), a content blocker blocking fonts, or a CSP violation (see environment).";
  if (anyRoll20)
    return "The self-made font and a modified Roll20 font work, but the original does not. Compare which variant first succeeds: name table repair or hinting removal points at the font file itself.";
  return "The self-made font works but no version of the Roll20 font does. Check the raw-bytes table for a parse error message, and the browser console for \"downloadable font\" warnings.";
}

let lastReport = "";

async function runChecks() {
  const results = document.getElementById("results");
  results.replaceChildren(el("p", { textContent: "Checking…" }));
  try {
    await document.fonts.ready;
  } catch (_) {}
  const css = await cssRows();
  const raw = await rawRows();

  const cssTable = el(
    "table",
    {},
    el("thead", { innerHTML: "<tr><th>Test</th><th>Preview</th><th>FontFace status</th><th>Actually rendered?</th></tr>" }),
    el(
      "tbody",
      {},
      ...css.map((r) =>
        el(
          "tr",
          {},
          el("td", {}, r.desc, el("br"), el("code", { textContent: r.family })),
          el("td", {}, r.preview),
          el("td", { textContent: r.status }),
          el("td", {}, yesNo(r.used))
        )
      )
    )
  );
  const rawTable = el(
    "table",
    {},
    el("thead", { innerHTML: "<tr><th>File</th><th>Fetch</th><th>FontFace(bytes)</th><th>Actually rendered?</th></tr>" }),
    el(
      "tbody",
      {},
      ...raw.map((r) =>
        el(
          "tr",
          {},
          el("td", {}, el("code", { textContent: r.name })),
          el("td", { textContent: r.fetch }),
          el("td", { textContent: r.parse }),
          el("td", {}, yesNo(r.used))
        )
      )
    )
  );
  const verdict = interpret(css, raw);
  results.replaceChildren(
    el("p", { className: "verdict", textContent: verdict }),
    el("h3", { textContent: "Via CSS @font-face" }),
    cssTable,
    el("h3", { textContent: "Raw bytes via FontFace API (no CSS involved)" }),
    rawTable
  );
  const env = environment();
  document.getElementById("environment").textContent = env;

  lastReport = [
    "== Roll20 dice-font diagnostic ==",
    `Verdict: ${verdict}`,
    "",
    "-- CSS @font-face --",
    ...css.map((r) => `${r.used ? "RENDERED" : "not used"} | ${r.family} | ${r.status}`),
    "",
    "-- Raw bytes --",
    ...raw.map((r) => `${r.used ? "RENDERED" : "not used"} | ${r.name} | ${r.fetch} | ${r.parse}`),
    "",
    "-- Environment --",
    env,
  ].join("\n");
  document.getElementById("report").value = lastReport;
}

document.getElementById("run").addEventListener("click", runChecks);
document.getElementById("copy").addEventListener("click", async () => {
  const box = document.getElementById("report");
  try {
    await navigator.clipboard.writeText(lastReport);
  } catch (_) {
    box.select();
    document.execCommand("copy");
  }
  document.getElementById("copy").textContent = "Copied!";
});
runChecks();
