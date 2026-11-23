/* Security+ practice: a single-file hash-routed quiz runner. No build step; open index.html. */
(() => {
"use strict";

// ---------- data ----------
// data.js and pbq.js hold the book's questions. They are generated locally from your own copy
// of the PDF (see README) and are not in the public repo.
if (!window.MCQ || !window.PBQ) {
  window.NO_DATA = true;
  window.MCQ = window.MCQ || { A: [], B: [], C: [] }; window.PBQ = window.PBQ || { A: [], B: [], C: [] };
}
const Q = {};
for (const set of ["A", "B", "C"]) {
  for (const p of window.PBQ[set]) Q[p.id] = { ...p, type: "pbq", set };
  for (const m of window.MCQ[set]) Q[m.id] = { ...m, set };
}
const SETS = {
  A: { name: "Exam A", blurb: "The full first exam, in book order." },
  B: { name: "Exam B", blurb: "The full second exam, in book order." },
  C: { name: "Exam C", blurb: "The full third exam, in book order." },
  M: { name: "Mixed", blurb: "30 from each exam, drawn fresh each time. PBQs first." },
  R: { name: "Missed questions", blurb: "The ones you got wrong last time." },
};
const EXAM_SECONDS = 90 * 60;

const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function buildIds(set) {
  if (set !== "M") return [...window.PBQ[set].map((p) => p.id), ...window.MCQ[set].map((m) => m.id)];
  // Mixed: 5 PBQs from the pool of 15, then fill each exam's quota of 30 with multiple choice.
  const pbqs = shuffle(Object.values(window.PBQ).flat()).slice(0, 5);
  const mcq = [];
  for (const s of ["A", "B", "C"]) {
    const need = 30 - pbqs.filter((p) => p.id[0] === s).length;
    mcq.push(...shuffle(window.MCQ[s]).slice(0, need));
  }
  return [...shuffle(pbqs).map((p) => p.id), ...shuffle(mcq).map((m) => m.id)];
}

// ---------- storage ----------
const KEY = "secplus.v1";
let store;
try { store = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { store = {}; }
store.sessions ||= {}; store.history ||= [];
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* private mode: progress lives for this tab only */ } };

function newSession(set, mode, ids) {
  const s = { set, mode, ids: ids || buildIds(set), answers: {}, checked: {}, flags: {}, idx: 0, elapsed: 0, done: false, started: Date.now() };
  store.sessions[set] = s; save(); return s;
}

// ---------- grading ----------
const needCount = (q) => q.answer.length;
function emptyAnswer(q) {
  if (q.type !== "pbq") return [];
  if (q.kind === "firewall") return q.rows.map(() => ({ src: "", dst: "", proto: "", port: "", action: "" }));
  return q.targets.map((t) => Array(t.slots || 1).fill(null));
}
function isAnswered(q, a) {
  if (!a) return false;
  if (q.type !== "pbq") return a.length > 0;
  if (q.kind === "firewall") return a.some((r) => Object.values(r).some(Boolean));
  return a.some((t) => t.some(Boolean));
}
const FW_FIELDS = ["src", "dst", "proto", "port", "action"];
function grade(q, a) {
  if (q.type !== "pbq") {
    const ok = !!a && a.length === q.answer.length && q.answer.every((x) => a.includes(x));
    return { got: ok ? 1 : 0, of: 1 };
  }
  let got = 0, of = 0;
  if (q.kind === "firewall") {
    q.rows.forEach((row, i) => FW_FIELDS.forEach((f) => { of++; if (a && a[i] && a[i][f] === row[f]) got++; }));
    return { got: got / of, of: 1, parts: [Math.round(got), of] };
  }
  q.targets.forEach((t, i) => {
    const placed = (a && a[i]) || [];
    const want = t.answer.slice();
    of += want.length;
    for (const p of placed) { const k = want.indexOf(p); if (k > -1) { want.splice(k, 1); got++; } }
  });
  return { got: got / of, of: 1, parts: [got, of] };
}
const isRight = (q, a) => grade(q, a).got === 1;

// ---------- helpers ----------
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtTime = (sec) => { sec = Math.max(0, Math.round(sec)); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0"); };
const pct = (x) => Math.round(x * 100);
const announce = (msg) => { const l = $("#live"); l.textContent = ""; setTimeout(() => (l.textContent = msg), 30); };
const app = $("#app"), tools = $("#bar-tools");

function stemHTML(text) {
  // Lines starting with ` are verbatim log/code lines from the PDF.
  const out = []; let code = [];
  const flush = () => { if (code.length) { out.push(`<pre class="code">${esc(code.join("\n"))}</pre>`); code = []; } };
  const bullets = [];
  const flushB = () => { if (bullets.length) { out.push(`<ul class="stem-list">${bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`); bullets.length = 0; } };
  for (const line of text.split("\n")) {
    if (line.startsWith("`")) { flushB(); code.push(line.slice(1)); continue; }
    flush();
    if (line.startsWith("•")) { bullets.push(line.replace(/^•\s*/, "")); continue; }
    flushB();
    if (line.trim()) out.push(`<p>${esc(line)}</p>`);
  }
  flush(); flushB();
  return out.join("");
}
const icon = {
  flag: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 14V2.5h8l-1.6 3 1.6 3h-8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  ok: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  bad: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
};

// ---------- tiers: 90%+ pass, 75%+ nearly there, below that read more ----------
const TIERS = [
  { min: 0.9, key: "pass", name: "Pass", line: "You're ready. Book the real exam." },
  { min: 0.75, key: "near", name: "Nearly there", line: "Good try. Close the gaps below and go again." },
  { min: 0, key: "fail", name: "Not yet", line: "Read more on the weak domains below, then retry the ones you missed." },
];
const tierOf = (score) => TIERS.find((t) => score >= t.min);
function rosette() {
  // an original award rosette: 24-point scalloped disc, inner seal, two tails
  const pts = [];
  for (let i = 0; i < 48; i++) { const r = i % 2 ? 54 : 62, a = (i / 48) * Math.PI * 2; pts.push(`${(70 + r * Math.sin(a)).toFixed(1)},${(66 - r * Math.cos(a)).toFixed(1)}`); }
  return `<svg class="rosette" viewBox="0 0 140 190" aria-hidden="true">
    <path class="rosette__tail" d="M44 100 L26 182 L46 168 L58 186 L70 110 Z"/>
    <path class="rosette__tail rosette__tail--r" d="M96 100 L114 182 L94 168 L82 186 L70 110 Z"/>
    <polygon class="rosette__edge" points="${pts.join(" ")}"/>
    <circle class="rosette__seal" cx="70" cy="66" r="42"/>
    <circle class="rosette__ring" cx="70" cy="66" r="35"/>
    <path class="rosette__tick" d="M52 67 l12 12 l24 -26"/>
  </svg>`;
}
const confetti = () => `<div class="confetti" aria-hidden="true">${Array.from({ length: 24 }, (_, i) => `<i style="--x:${(Math.random() * 2 - 1).toFixed(2)};--d:${(Math.random() * 0.4).toFixed(2)}s;--r:${Math.round(Math.random() * 360)}deg" class="c${i % 3}"></i>`).join("")}</div>`;

// ---------- router ----------
let timer = null, tickStart = 0;
function stopClock(s) { if (timer) { clearInterval(timer); timer = null; if (s && !s.done) { s.elapsed += (Date.now() - tickStart) / 1000; save(); } } }
function route() {
  const cur = currentSession(); stopClock(cur);
  const v = location.hash.split("/")[1] || "";
  document.querySelectorAll(".bar__nav a").forEach((a) => { const on = a.dataset.nav === (v === "quiz" || v === "results" ? "practice" : v); on ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"); });
  window.scrollTo(0, 0);
  const [, view, set, n] = location.hash.split("/");
  if (view === "quiz" && store.sessions[set]) return renderQuiz(store.sessions[set], Math.max(0, (parseInt(n, 10) || 1) - 1));
  if (view === "results" && store.sessions[set]) return renderResults(store.sessions[set]);
  if (view === "ports") return renderPorts();
  if (view === "practice") return renderHome();
  renderLanding();
}
let activeSet = null;
const currentSession = () => (activeSet ? store.sessions[activeSet] : null);
window.addEventListener("hashchange", route);
window.addEventListener("pagehide", () => stopClock(currentSession()));


// ---------- landing ----------
function renderLanding() {
  activeSet = null; tools.innerHTML = ""; document.title = "Security+ Practice";
  const DOMAINS = [["General security concepts", 12], ["Threats, vulnerabilities and mitigations", 22], ["Security architecture", 18], ["Security operations", 28], ["Security program management and oversight", 20]];
  const ext = (href, text) => `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;
  app.innerHTML = `
  <div class="land">
    <section class="hero">
      <div class="hero__text">
        <h1>Rehearse Security+ the way it runs</h1>
        <p class="lead">Three full SY0-701 practice exams, drag-and-drop PBQs and every answer explained.</p>
        <div class="hero__go">
          <a class="btn btn--primary btn--lg" href="#/practice">Start practising</a>
          <a class="btn btn--lg" href="#/ports">Learn the ports</a>
        </div>
      </div>
      <dl class="panels readout" aria-label="The real exam at a glance">
        <div><dt>Questions</dt><dd class="reading">90</dd><p class="muted small">up to 90, including a handful of PBQs</p></div>
        <div><dt>Minutes</dt><dd class="reading">90</dd><p class="muted small">one sitting, test center or online</p></div>
        <div><dt>To pass</dt><dd class="reading">750</dd><p class="muted small">on CompTIA's 100 to 900 scale</p></div>
        <div><dt>Exam code</dt><dd class="reading readout__code">SY0-701</dd><p class="muted small">the current Security+ version</p></div>
      </dl>
    </section>

    <section class="block" aria-labelledby="what-h">
      <div class="block__head"><h2 id="what-h">What cybersecurity is</h2>
        <p>Keeping data, and the systems that store and move it, safe from people who should not read it, change it or knock it offline. Every topic on the exam comes back to three goals, plus one guarantee.</p></div>
      <ul class="panels cia" role="list">
        <li><h3>Confidentiality</h3><p>Only the right people can see it. Encryption is the classic tool.</p></li>
        <li><h3>Integrity</h3><p>It stays accurate and unaltered. Hashes and checksums prove it.</p></li>
        <li><h3>Availability</h3><p>It is there when needed. Redundancy and backups keep it up.</p></li>
        <li><h3>Non-repudiation</h3><p>Nobody can deny what they did. Digital signatures tie an action to a person.</p></li>
      </ul>
    </section>

    <section class="block" aria-labelledby="exam-h">
      <div class="block__head"><h2 id="exam-h">The exam: CompTIA Security+ SY0-701</h2>
        <p>Security+ is the entry point for a career in IT security: one exam that proves you understand attacks, defenses, secure architecture, cryptography and how security is run day to day. CompTIA suggests having A+ and Network+, or a year or two of hands-on IT, first. That is a recommendation, not a rule.</p></div>
      <div class="exam-grid">
        <div>
          <h3>What it covers</h3>
          <ul class="weights" role="list">${DOMAINS.map(([n, w], i) => `<li><span>${i + 1}. ${n}</span><span class="meter" aria-hidden="true"><span style="--v:${w / 28}"></span></span><span class="measured">${w}%</span></li>`).join("")}</ul>
        </div>
        <div>
          <h3>What the questions look like</h3>
          <ul class="facts" role="list">
            <li><strong>Multiple choice.</strong> Most questions, one right answer.</li>
            <li><strong>Multiple select.</strong> A few ask you to pick two or three.</li>
            <li><strong>Performance-based (PBQ).</strong> Hands-on tasks: match, order, drag and drop, configure a firewall.</li>
            <li><strong>No trick questions,</strong> but at least one answer is usually a distractor. Watch words in bold or capitals.</li>
          </ul>
        </div>
      </div>
    </section>

    <section class="block" aria-labelledby="how-h">
      <div class="block__head"><h2 id="how-h">How this site is set up</h2>
        <p>The questions come from Professor Messer's SY0-701 practice exams, which are built to match the real exam's format and difficulty.</p></div>
      <ul class="panels how" role="list">
        <li><h3>Exams A, B and C</h3><p>90 questions each, PBQs first, like the real test.</p></li>
        <li><h3>Mixed</h3><p>30 from each exam, shuffled fresh every time you start.</p></li>
        <li><h3>Study or exam mode</h3><p>Check each answer as you go, or race a 90-minute clock and review at the end.</p></li>
        <li><h3>Every option explained</h3><p>Why the right answer is right, why each wrong one is wrong, and a video link for the objective.</p></li>
      </ul>
      <div class="tiers-key">
        <h3>How your score reads</h3>
        <ul role="list">
          <li><span class="tier tier--pass">Pass</span><span class="measured">90% and up</span><span>Ready to book.</span></li>
          <li><span class="tier tier--near">Nearly there</span><span class="measured">75 to 89%</span><span>Good try. Close the gaps and go again.</span></li>
          <li><span class="tier tier--fail">Not yet</span><span class="measured">below 75%</span><span>Read more on your weakest domains.</span></li>
        </ul>
        <p class="muted small">CompTIA doesn't publish how its scaled score maps to a percentage, so treat these as readiness marks, not a prediction.</p>
      </div>
    </section>

    <section class="block" aria-labelledby="buy-h">
      <div class="block__head"><h2 id="buy-h">Buying the exam, and paying less for it</h2>
        <p>You pay with an exam voucher, then book a slot with Pearson VUE, either at a testing center or online from home with OnVUE. Prices vary by country.</p></div>
      <ol class="steps" role="list">
        <li><h3>Get a voucher</h3><p>Straight from ${ext("https://store.comptia.org", "the CompTIA store")}, or when you schedule at ${ext("https://home.pearsonvue.com/comptia", "Pearson VUE")}.</p></li>
        <li><h3>Look for the discount</h3><p>Dion Training is a CompTIA Platinum Partner and sells vouchers for about 10% off the regular price, for 50+ countries: ${ext("https://www.diontraining.com/vouchers", "diontraining.com/vouchers")}.</p></li>
        <li><h3>Book it</h3><p>Pick a test center or online proctoring, and a time slot when you're fresh.</p></li>
      </ol>
    </section>

    <section class="block" aria-labelledby="when-h">
      <div class="block__head"><h2 id="when-h">When to book</h2>
        <p>Book when your practice scores say so, not when the calendar does.</p></div>
      <div class="exam-grid">
        <ul class="facts" role="list">
          <li><strong>Over 90% on these practice exams:</strong> you're ready for the real one.</li>
          <li><strong>80 to 90%:</strong> a strong showing. A little more study earns real points.</li>
          <li><strong>Below that:</strong> use each missed question's objective link to find the gaps.</li>
          <li><strong>Not confident?</strong> Wait a few days and take more practice sets. Aim to understand why, not to memorise the key.</li>
        </ul>
        <div>
          <h3>On the day</h3>
          <ul class="facts" role="list">
            <li>Pick a time of day that suits you. Don't squeeze it in after a long shift.</li>
            <li>At a test center you get a whiteboard: spend the first minute or two writing down ports and anything you might forget.</li>
            <li>Flag hard questions, PBQs included, and come back to them.</li>
            <li>Never leave a blank. Wrong guesses cost nothing, so eliminate and guess.</li>
          </ul>
        </div>
      </div>
      <div class="cta"><p>Start with any exam. They're all at about the same difficulty.</p><a class="btn btn--primary btn--lg" href="#/practice">Pick a practice set</a></div>
    </section>

    <footer class="foot">
      <p>Questions and explanations: Professor Messer, SY0-701 Practice Exams (${ext("https://www.professormesser.com", "professormesser.com")}). Exam facts and tips: Dion Training, SY0-701 Study Notes. This is a personal study tool, not affiliated with CompTIA, Professor Messer or Dion Training.</p>
    </footer>
  </div>`;
  app.onclick = app.onchange = null; document.onkeydown = null;
  app.ondrop = app.ondragstart = app.ondragover = app.ondragleave = app.ondragend = null;
}

// ---------- home ----------
let homeMode = (() => { try { return localStorage.getItem(KEY + ".mode") || "study"; } catch { return "study"; } })();
function renderHome() {
  activeSet = null; tools.innerHTML = ""; document.title = "Practice sets - Security+ Practice";
  const rows = ["A", "B", "C", "M"].map((k) => {
    const s = store.sessions[k];
    const last = store.history.find((h) => h.set === k);
    const best = store.history.filter((h) => h.set === k).reduce((m, h) => Math.max(m, h.score), -1);
    const inProgress = s && !s.done && Object.keys(s.answers).length > 0;
    const answered = inProgress ? s.ids.filter((id) => isAnswered(Q[id], s.answers[id])).length : 0;
    const count = "5 PBQs, 85 multiple choice";
    return `<li class="set">
      <div class="set__name"><h2>${SETS[k].name}</h2><p class="muted">${SETS[k].blurb}</p></div>
      <p class="set__count">${count}</p>
      <dl class="set__stats">
        <div><dt>Last</dt><dd class="measured">${last ? pct(last.score) + "%" : "none yet"}</dd></div>
        <div><dt>Best</dt><dd class="measured">${best >= 0 ? pct(best) + "%" : "none yet"}</dd></div>
        ${best >= 0 ? `<div><dt>Best result</dt><dd><span class="tier tier--${tierOf(best).key}">${tierOf(best).name}</span></dd></div>` : ""}
      </dl>
      <div class="set__go">
        ${inProgress ? `<button class="btn btn--primary" data-act="resume" data-set="${k}">Resume <span class="measured">${answered}/${s.ids.length}</span></button>
          <button class="btn" data-act="start" data-set="${k}">Start over</button>`
        : `<button class="btn btn--primary" data-act="start" data-set="${k}">Start ${SETS[k].name}</button>`}
      </div></li>`;
  }).join("");
  const hist = store.history.slice(0, 12);
  const H = store.history;
  const right = H.reduce((m, h) => m + h.full, 0), seen = H.reduce((m, h) => m + h.total, 0);
  const passes = H.filter((h) => tierOf(h.score).key === "pass").length;
  const stats = H.length ? `
    <section class="stats" aria-labelledby="stats-h">
      <h2 id="stats-h">Your numbers so far</h2>
      <div class="panels stats__grid">
        <div><p class="stats__k">Accuracy</p><p class="stats__v measured">${pct(right / seen)}%</p></div>
        <div><p class="stats__k">Right</p><p class="stats__v measured stats__v--ok">${right}</p></div>
        <div><p class="stats__k">Wrong</p><p class="stats__v measured stats__v--bad">${seen - right}</p></div>
        <div><p class="stats__k">Sets finished</p><p class="stats__v measured">${H.length}</p></div>
        <div><p class="stats__k">Passes at 90%</p><p class="stats__v measured">${passes}</p></div>
      </div>
      <div class="split" role="img" aria-label="${right} right and ${seen - right} wrong out of ${seen} questions"><span class="split__ok" style="--v:${right / seen}"></span></div>
      <p class="muted small">Across every finished set. A PBQ only counts as right when every box is right.</p>
    </section>` : "";
  app.innerHTML = `
    <section class="home">
      <div class="home__head">
        <div>
          <h1>Pick a practice set</h1>
          <p class="lead">Each exam is 90 questions. PBQs come first, the way the real test opens.</p>
        </div>
        <fieldset class="seg" aria-describedby="mode-help">
          <legend>Mode</legend>
          <label><input type="radio" name="mode" value="study" ${homeMode === "study" ? "checked" : ""}><span>Study</span></label>
          <label><input type="radio" name="mode" value="exam" ${homeMode === "exam" ? "checked" : ""}><span>Exam</span></label>
          <p id="mode-help" class="muted small">${homeMode === "study" ? "Check each answer as you go and read why every option is right or wrong." : "90-minute clock, no feedback until you submit. Then review everything."}</p>
        </fieldset>
      </div>
      ${window.NO_DATA ? `<p class="empty">Question data isn't built yet. Run <code>python3 tools/build.py path/to/messer-sy0-701.pdf</code> with your own copy of the PDF, then reload. The README has the steps.</p>` : ""}
      <ul class="sets" role="list">${rows}</ul>
      ${stats}
      <a class="ports-link" href="#/ports"><span><strong>Ports flashcards</strong><span class="muted">${window.PORTS.length} ports and protocols, including VoIP. Flip, then sort into got it or again.</span></span><span class="btn">Open flashcards</span></a>
    </section>
    <section class="trail-wrap" aria-labelledby="hist-h">
      <h2 id="hist-h">Your attempts</h2>
      ${hist.length ? `<ol class="trail" role="list">${hist.map((h) => `
        <li><span class="trail__set">${esc(SETS[h.set]?.name || h.set)}</span>
          <span class="trail__mode">${h.mode === "exam" ? "Exam mode" : "Study mode"}</span>
          <span class="measured trail__score">${pct(h.score)}% <span class="tier tier--${tierOf(h.score).key}">${tierOf(h.score).name}</span></span>
          <span class="measured trail__full">${h.full}/${h.total} fully right</span>
          <span class="measured trail__when">${new Date(h.date).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>
          <span class="measured trail__time">${fmtTime(h.secs)}</span></li>`).join("")}</ol>
        <button class="btn btn--quiet" data-act="clear-hist">Clear history</button>`
      : `<p class="empty">No attempts yet. Finish a set and your score lands here, newest first.</p>`}
    </section>`;
  app.onclick = (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const k = b.dataset.set;
    if (b.dataset.act === "start") {
      const s = store.sessions[k];
      if (s && !s.done && Object.keys(s.answers).length && !confirm(`Start ${SETS[k].name} over? Your current progress in it will be lost.`)) return;
      newSession(k, homeMode); location.hash = `#/quiz/${k}/1`;
    } else if (b.dataset.act === "resume") {
      location.hash = `#/quiz/${k}/${store.sessions[k].idx + 1}`;
    } else if (b.dataset.act === "clear-hist") {
      if (confirm("Clear all past attempt scores? This cannot be undone.")) { store.history = []; save(); renderHome(); }
    }
  };
  app.onchange = (e) => {
    if (e.target.name === "mode") { homeMode = e.target.value; try { localStorage.setItem(KEY + ".mode", homeMode); } catch {} renderHome(); $(`input[value="${homeMode}"]`).focus(); }
  };
  document.onkeydown = null;
}

// ---------- quiz ----------
let pick = null; // tap-to-place: the token currently held, {token, from:[t,s]|null}
function renderQuiz(s, idx) {
  activeSet = s.set;
  if (s.done && !s.reviewing) { location.replace(`#/results/${s.set}`); return; }
  idx = Math.min(idx, s.ids.length - 1); s.idx = idx; save();
  const q = Q[s.ids[idx]];
  const review = s.done;
  const locked = review || !!s.checked[q.id];
  const showKey = locked;
  s.answers[q.id] ??= emptyAnswer(q);
  const a = s.answers[q.id];
  document.title = `Question ${idx + 1} - ${SETS[s.set].name}`;

  // top bar
  const remaining = EXAM_SECONDS - s.elapsed;
  tools.innerHTML = `
    <span class="bar__set">${SETS[s.set].name}${review ? " review" : ""}</span>
    ${s.mode === "study" && !review ? (() => { const ch = s.ids.filter((id) => s.checked[id]); const ok = ch.filter((id) => isRight(Q[id], s.answers[id])).length; return ch.length ? `<span class="tally measured" aria-label="${ok} right, ${ch.length - ok} wrong so far"><span class="tally__ok">${ok}</span> right <span class="tally__bad">${ch.length - ok}</span> wrong <span class="tally__pct">${pct(ok / ch.length)}%</span></span>` : ""; })() : ""}
    ${review ? "" : `<span class="measured clock" id="clock" aria-label="${s.mode === "exam" ? "Time left" : "Time spent"}">${s.mode === "exam" ? fmtTime(remaining) : fmtTime(s.elapsed)}</span>`}
    ${review ? `<a class="btn" href="#/results/${s.set}">Back to results</a>` : `<button class="btn" data-act="finish">Submit set</button>`}`;

  const answeredN = s.ids.filter((id) => isAnswered(Q[id], s.answers[id])).length;
  const nav = s.ids.map((id, i) => {
    const qq = Q[id], aa = s.answers[id], st = [];
    let label = `Question ${i + 1}`;
    if (s.checked[id] || review) { const r = isRight(qq, aa); st.push(r ? "is-ok" : "is-bad"); label += r ? ", correct" : ", incorrect"; }
    else if (isAnswered(qq, aa)) { st.push("is-done"); label += ", answered"; }
    if (s.flags[id]) { st.push("is-flag"); label += ", flagged"; }
    if (qq.type === "pbq") label += ", PBQ";
    return `<a href="#/quiz/${s.set}/${i + 1}" class="nav__q ${st.join(" ")}" ${i === idx ? 'aria-current="step"' : ""} aria-label="${label}">${i + 1}</a>`;
  }).join("");

  const multi = q.type !== "pbq" && needCount(q) > 1;
  let body = "";
  if (q.type !== "pbq") body = mcqHTML(q, a, locked, showKey, multi);
  else if (q.kind === "firewall") body = firewallHTML(q, a, locked, showKey);
  else body = matchHTML(q, a, locked, showKey);

  const g = locked ? grade(q, a) : null;
  const verdict = g ? (g.got === 1 ? `<p class="verdict verdict--ok">${icon.ok}<span>Correct</span></p>`
    : `<p class="verdict verdict--bad">${icon.bad}<span>${q.type === "pbq" ? `Partly right: ${g.parts[0]} of ${g.parts[1]}` : isAnswered(q, a) ? "Not quite" : "Not answered"}</span></p>`) : "";
  const info = locked && (q.objective || q.link) ? `<p class="objective">${q.link ? `<a href="${esc(q.link)}" target="_blank" rel="noopener">${esc(q.objective || "Professor Messer video")}</a>` : esc(q.objective)}</p>` : "";
  const mainExpl = locked && (q.explanation) ? `<div class="explain"><h3>Why</h3><p>${esc(q.explanation)}</p></div>` : "";

  const canCheck = !locked && s.mode === "study";
  const last = idx === s.ids.length - 1;
  app.innerHTML = `
    <div class="quiz">
      <article class="panel q" aria-labelledby="q-head">
        <header class="q__head">
          <h1 id="q-head" class="q__num">Question <span class="measured">${idx + 1}</span> <span class="muted">of ${s.ids.length}</span></h1>
          <span class="chip chip--cool measured" title="Question number in the book">${q.id}${q.type === "pbq" ? " PBQ" : ""}</span>
          <button class="btn btn--icon ${s.flags[q.id] ? "is-on" : ""}" data-act="flag" aria-pressed="${!!s.flags[q.id]}">${icon.flag}<span>${s.flags[q.id] ? "Flagged" : "Flag"}</span></button>
        </header>
        <div class="q__stem">${stemHTML(q.type === "pbq" ? q.prompt : q.q)}</div>
        ${multi ? `<p class="hint">Select ${needCount(q) === 2 ? "two" : "three"}.</p>` : ""}
        ${body}
        ${verdict}${mainExpl}${info}
        <footer class="q__foot">
          <button class="btn" data-act="prev" ${idx === 0 ? "disabled" : ""}>Previous</button>
          <span class="q__keys muted small">Keys: A to G pick, Enter ${canCheck ? "checks" : "moves on"}, arrows move</span>
          ${canCheck ? `<button class="btn btn--primary" data-act="check" ${isAnswered(q, a) ? "" : "disabled"}>Check answer</button>`
            : last ? (review ? `<a class="btn btn--primary" href="#/results/${s.set}">Back to results</a>` : `<button class="btn btn--primary" data-act="finish">Submit set</button>`)
            : `<button class="btn btn--primary" data-act="next">Next question</button>`}
        </footer>
      </article>
      <aside class="nav" aria-label="All questions">
        <details class="nav__box" ${matchMedia("(min-width: 64rem)").matches ? "open" : ""}>
          <summary><span>All questions</span> <span class="measured">${answeredN}/${s.ids.length} answered</span></summary>
          <div class="nav__grid">${nav}</div>
          <p class="nav__legend muted small"><span class="key key--ok">${icon.ok}</span> correct <span class="key key--bad">${icon.bad}</span> wrong <span class="key key--flag">${icon.flag}</span> flagged</p>
        </details>
      </aside>
    </div>`;

  if (!review) { tickStart = Date.now(); timer = setInterval(() => tick(s), 1000); }
  wireQuiz(s, q, idx, locked);
}

function tick(s) {
  const now = Date.now(); s.elapsed += (now - tickStart) / 1000; tickStart = now;
  const c = $("#clock"); if (!c) return;
  if (s.mode === "exam") {
    const left = EXAM_SECONDS - s.elapsed;
    c.textContent = left > 0 ? fmtTime(left) : "Over by " + fmtTime(-left);
    c.classList.toggle("is-late", left <= 0);
  } else c.textContent = fmtTime(s.elapsed);
  if (Math.round(s.elapsed) % 10 === 0) save();
}

function mcqHTML(q, a, locked, showKey, multi) {
  return `<fieldset class="opts"><legend class="visually-hidden">Answer options</legend>${Object.entries(q.options).map(([L, text]) => {
    const chosen = a.includes(L), right = q.answer.includes(L);
    const cls = showKey ? (right ? "is-right" : chosen ? "is-wrong" : "is-off") : "";
    const why = showKey ? (right && q.answer.length > 1 && q.why[L] ? q.why[L] : q.why[L]) : "";
    const tag = showKey ? (right ? `<span class="opt__tag opt__tag--ok">${icon.ok}${chosen ? "Your answer, correct" : "Correct answer"}</span>` : chosen ? `<span class="opt__tag opt__tag--bad">${icon.bad}Your answer</span>` : "") : "";
    return `<label class="opt ${cls}">
      <input type="${multi ? "checkbox" : "radio"}" name="opt" value="${L}" ${chosen ? "checked" : ""} ${locked ? "disabled" : ""}>
      <span class="opt__letter measured">${L}</span>
      <span class="opt__body"><span class="opt__text">${esc(text)}</span>${tag}${why ? `<span class="opt__why">${esc(why)}</span>` : ""}</span>
    </label>`;
  }).join("")}</fieldset>`;
}

function matchHTML(q, a, locked, showKey) {
  const used = a.flat().filter(Boolean);
  const bank = q.tokens.map((t) => {
    const out = !q.reuse && used.includes(t);
    const held = pick && pick.token === t && !pick.from;
    return `<button type="button" class="tok ${held ? "is-held" : ""}" draggable="${!locked && !out}" data-tok="${esc(t)}" ${out || locked ? "disabled" : ""} aria-pressed="${held}">${esc(t)}</button>`;
  }).join("");
  const rows = q.targets.map((t, ti) => {
    const slots = (a[ti] || []).map((v, si) => {
      const ok = showKey && v && t.answer.includes(v) && a[ti].indexOf(v) === si;
      const st = showKey ? (v ? (ok ? "is-right" : "is-wrong") : "is-wrong") : "";
      const held = pick && pick.from && pick.from[0] === ti && pick.from[1] === si;
      return `<button type="button" class="slot ${v ? "is-filled" : ""} ${st} ${held ? "is-held" : ""}" data-t="${ti}" data-s="${si}" ${locked ? "disabled" : ""}
        draggable="${!locked && !!v}" aria-label="${esc(t.label)}${(t.slots || 1) > 1 ? ", slot " + (si + 1) : ""}: ${v ? esc(v) : "empty"}">
        ${v ? esc(v) : `<span class="slot__empty">${locked ? "Left empty" : pick ? "Place here" : "Drop here"}</span>`}</button>`;
    }).join("");
    const key = showKey && !isTargetRight(t, a[ti]) ? `<p class="target__key">${icon.ok}<span>${esc(t.answer.join(", "))}</span></p>` : "";
    const note = showKey && t.note ? `<p class="target__note">${esc(t.note)}</p>` : "";
    return `<li class="target ${q.order ? "target--step" : ""}">
      <div class="target__label">${t.sub ? `<span class="target__sub">${esc(t.sub)}</span>` : ""}<span>${esc(t.label)}</span></div>
      <div class="target__slots">${slots}</div>${key}${note}</li>`;
  }).join("");
  const table = q.table ? `<div class="table-wrap"><table class="rules"><thead><tr>${q.table.head.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead>
    <tbody>${q.table.rows.map((r) => `<tr>${r.map((c) => `<td class="measured">${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : "";
  return `${table}
    ${locked ? "" : `<p class="hint">Drag a choice onto a box, or tap a choice and then tap the box. Tap a placed choice to pick it back up.${q.reuse ? " Choices can be used more than once." : ""}</p>`}
    <div class="pbq">
      ${locked ? "" : `<div class="bank" aria-label="Choices"><div class="bank__toks">${bank}</div></div>`}
      <ol class="targets" role="list">${rows}</ol>
    </div>
    ${showKey && q.explanation ? "" : ""}`;
}
const isTargetRight = (t, placed) => { const want = t.answer.slice(); let got = 0; for (const p of placed || []) { const k = want.indexOf(p); if (k > -1) { want.splice(k, 1); got++; } } return got === t.answer.length; };

function firewallHTML(q, a, locked, showKey) {
  const ips = q.hosts.map((h) => h.ip);
  const sel = (i, f, opts, label) => {
    const v = a[i][f], want = q.rows[i][f];
    const st = showKey ? (v === want ? "is-right" : "is-wrong") : "";
    return `<td><select class="fw ${st}" data-row="${i}" data-f="${f}" aria-label="Rule ${i + 1} ${label}" ${locked ? "disabled" : ""}>
      <option value="">Select</option>${opts.map((o) => `<option ${v === o ? "selected" : ""}>${o}</option>`).join("")}</select>
      ${showKey && v !== want ? `<span class="fw__key measured">${want}</span>` : ""}</td>`;
  };
  const hosts = ["DMZ", "Internal"].map((z) => `<div class="zone"><h3>${z === "DMZ" ? "DMZ" : "Internal network"}</h3><ul role="list">${q.hosts.filter((h) => h.zone === z).map((h) => `<li><span>${esc(h.name)}</span><span class="measured">${h.ip}</span></li>`).join("")}</ul></div>`).join(`<div class="zone zone--fw" aria-hidden="true"><span>Firewall</span></div>`);
  return `<div class="net"><p class="net__inet muted small">Internet connects through the firewall</p><div class="zones">${hosts}</div></div>
    <div class="table-wrap"><table class="rules rules--edit"><thead><tr><th scope="col">Rule</th><th scope="col">Source IP</th><th scope="col">Destination IP</th><th scope="col">Protocol</th><th scope="col">Port</th><th scope="col">Allow or block</th></tr></thead>
    <tbody>${q.rows.map((_, i) => `<tr><th scope="row" class="measured">${i + 1}</th>${sel(i, "src", ips, "source IP")}${sel(i, "dst", ips, "destination IP")}${sel(i, "proto", ["TCP", "UDP"], "protocol")}${sel(i, "port", q.ports, "port")}${sel(i, "action", ["Allow", "Block"], "allow or block")}</tr>`).join("")}</tbody></table></div>`;
}

function wireQuiz(s, q, idx, locked) {
  const go = (i) => { pick = null; location.hash = `#/quiz/${s.set}/${i + 1}`; };
  const rerender = () => { stopClock(s); renderQuiz(s, idx); };
  const a = s.answers[q.id];
  const check = () => { if (!isAnswered(q, a)) return; s.checked[q.id] = true; save(); pick = null; rerender(); const r = isRight(q, a); announce(r ? "Correct." : "Not quite. The explanation is below."); $(".verdict")?.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); };
  const finish = () => {
    const left = s.ids.filter((id) => !isAnswered(Q[id], s.answers[id])).length;
    if (!confirm(left ? `Submit with ${left} unanswered? They count as wrong.` : "Submit this set and see your score?")) return;
    stopClock(s); finalize(s); location.hash = `#/results/${s.set}`;
  };
  tools.onclick = (e) => { if (e.target.closest('[data-act="finish"]')) finish(); };

  app.onclick = (e) => {
    const b = e.target.closest("button"); if (!b || b.disabled) return;
    const act = b.dataset.act;
    if (act === "prev") return go(idx - 1);
    if (act === "next") return go(idx + 1);
    if (act === "check") return check();
    if (act === "finish") return finish();
    if (act === "flag") { s.flags[q.id] = !s.flags[q.id]; save(); return rerender(); }
    if (locked) return;
    if (b.dataset.tok) { // pick up from bank
      pick = pick && pick.token === b.dataset.tok && !pick.from ? null : { token: b.dataset.tok, from: null };
      rerender(); if (pick) announce(`${pick.token} picked up. Choose a box to place it.`);
      $(`[data-tok="${CSS.escape(b.dataset.tok)}"]`)?.focus(); return;
    }
    if (b.dataset.t != null) { // a slot
      const t = +b.dataset.t, si = +b.dataset.s, cur = a[t][si];
      if (pick) { place(pick, t, si); pick = null; rerender(); $(`.slot[data-t="${t}"][data-s="${si}"]`)?.focus(); return; }
      if (cur) { pick = { token: cur, from: [t, si] }; rerender(); announce(`${cur} picked up. Choose another box, or the same box to put it back in the choices.`); $(`.slot[data-t="${t}"][data-s="${si}"]`)?.focus(); }
    }
  };
  function place(p, t, si) {
    if (p.from && p.from[0] === t && p.from[1] === si) { a[t][si] = null; save(); return; } // tap twice: return to bank
    const displaced = a[t][si];
    if (p.from) a[p.from[0]][p.from[1]] = q.reuse ? null : displaced || null;
    else if (!q.reuse) { // a token lives in one place only
      a.forEach((row) => row.forEach((v, k) => { if (v === p.token) row[k] = null; }));
    }
    a[t][si] = p.token; save();
  }
  app.onchange = (e) => {
    if (e.target.name === "opt") {
      const vals = [...app.querySelectorAll('input[name="opt"]:checked')].map((x) => x.value);
      if (vals.length > needCount(q) && e.target.type === "checkbox") { e.target.checked = false; announce(`Select only ${needCount(q)}.`); return; }
      a.length = 0; a.push(...vals); save(); // mutate in place: check() holds this array
      const cb = $('[data-act="check"]'); if (cb) cb.disabled = !vals.length;
    } else if (e.target.classList.contains("fw")) {
      a[+e.target.dataset.row][e.target.dataset.f] = e.target.value; save();
      const cb = $('[data-act="check"]'); if (cb) cb.disabled = !isAnswered(q, a);
    }
  };
  // drag and drop (pointer users); tap-to-place above covers touch and keyboard
  app.ondragstart = (e) => {
    const el = e.target.closest("[draggable=true]"); if (!el) return;
    pick = el.dataset.tok ? { token: el.dataset.tok, from: null } : { token: a[+el.dataset.t][+el.dataset.s], from: [+el.dataset.t, +el.dataset.s] };
    e.dataTransfer.setData("text/plain", pick.token); e.dataTransfer.effectAllowed = "move";
    requestAnimationFrame(() => app.classList.add("is-dragging"));
  };
  app.ondragover = (e) => { const sl = e.target.closest(".slot, .bank"); if (sl && pick) { e.preventDefault(); app.querySelectorAll(".is-over").forEach((x) => x.classList.remove("is-over")); sl.classList.add("is-over"); } };
  app.ondragleave = (e) => { const sl = e.target.closest(".slot, .bank"); if (sl && !sl.contains(e.relatedTarget)) sl.classList.remove("is-over"); };
  app.ondrop = (e) => {
    e.preventDefault(); if (!pick) return;
    const sl = e.target.closest(".slot");
    if (sl) place(pick, +sl.dataset.t, +sl.dataset.s);
    else if (e.target.closest(".bank") && pick.from) { a[pick.from[0]][pick.from[1]] = null; save(); }
    pick = null; rerender();
  };
  app.ondragend = () => { app.classList.remove("is-dragging"); if (pick) { pick = null; rerender(); } };

  document.onkeydown = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.target.tagName === "SELECT") return;
    const k = e.key;
    if (k === "ArrowRight" && idx < s.ids.length - 1 && e.target.type !== "radio") { e.preventDefault(); go(idx + 1); }
    else if (k === "ArrowLeft" && idx > 0 && e.target.type !== "radio") { e.preventDefault(); go(idx - 1); }
    else if (k === "Escape" && pick) { pick = null; rerender(); }
    else if ((k === "f" || k === "F") && !e.target.closest("input")) { s.flags[q.id] = !s.flags[q.id]; save(); rerender(); }
    else if (q.type !== "pbq" && !locked && /^[a-gA-G1-7]$/.test(k)) {
      const L = /\d/.test(k) ? "ABCDEFG"[+k - 1] : k.toUpperCase();
      const inp = $(`input[name="opt"][value="${L}"]`); if (inp) { inp.click(); inp.focus(); }
    } else if (k === "Enter" && !e.target.closest("button, a, summary")) {
      e.preventDefault();
      if (!locked && s.mode === "study") check();
      else if (idx < s.ids.length - 1) go(idx + 1);
    }
  };
}

function finalize(s) {
  s.done = true; s.reviewing = false; s.justFinished = true;
  for (const id of s.ids) s.checked[id] = true;
  const results = s.ids.map((id) => grade(Q[id], s.answers[id]));
  const score = results.reduce((m, r) => m + r.got, 0) / s.ids.length;
  const full = results.filter((r) => r.got === 1).length;
  store.history.unshift({ set: s.set, mode: s.mode, score, full, total: s.ids.length, secs: s.elapsed, date: Date.now() });
  store.history = store.history.slice(0, 50);
  save();
}


// ---------- ports flashcards ----------
const deck = { dir: "port", filter: "all", cards: null, i: 0, flipped: false, known: 0 };
function dealPorts() {
  const all = window.PORTS.filter((c) => deck.filter === "all" || (deck.filter === "yours" ? c.yours : !c.yours));
  deck.cards = shuffle(all); deck.total = all.length; deck.known = 0; deck.flipped = false;
}
function renderPorts() {
  activeSet = null; document.title = "Ports flashcards";
  tools.innerHTML = "";
  if (!deck.cards) dealPorts();
  const c = deck.cards[0];
  const yoursN = window.PORTS.filter((x) => x.yours).length;
  const front = (x) => deck.dir === "port"
    ? `<span class="card__ask muted">Which protocol uses port</span><span class="reading card__big">${esc(x.port)}</span>`
    : `<span class="card__ask muted">Which port does this use?</span><span class="card__name">${esc(x.name)}</span><span class="muted">${esc(x.full)}</span>`;
  const back = (x) => `<span class="card__row"><span class="reading card__mid">${esc(x.port)}</span><span class="chip chip--cool measured">${esc(x.proto)}</span></span>
    <span class="card__name">${esc(x.name)}</span><span class="card__full">${esc(x.full)}</span>
    <span class="card__note">${esc(x.note)}</span>${x.yours ? "" : `<span class="card__added muted small">Added to your list</span>`}`;
  app.innerHTML = `
    <section class="ports">
      <div class="home__head">
        <div><h1>Ports flashcards</h1><p class="lead">Say the answer out loud, flip, then be honest about it.</p></div>
        <div class="ports__ctl">
          <fieldset class="seg"><legend>Show me</legend>
            <label><input type="radio" name="dir" value="port" ${deck.dir === "port" ? "checked" : ""}><span>The port</span></label>
            <label><input type="radio" name="dir" value="name" ${deck.dir === "name" ? "checked" : ""}><span>The protocol</span></label>
          </fieldset>
          <div class="tabs" role="group" aria-label="Which cards">
            ${[["all", "All", window.PORTS.length], ["yours", "Your list", yoursN], ["added", "Added", window.PORTS.length - yoursN]].map(([k, l, n]) => `<button class="tab" data-deck="${k}" aria-pressed="${deck.filter === k}">${l} <span class="measured">${n}</span></button>`).join("")}
          </div>
        </div>
      </div>
      <div class="flash">
        <p class="flash__count muted small"><span class="measured">${deck.known}</span> got it, <span class="measured">${deck.cards.length}</span> left of <span class="measured">${deck.total}</span></p>
        ${c ? `<button class="card ${deck.flipped ? "is-flipped" : ""}" data-act="flip" aria-label="${deck.flipped ? "Card answer shown. Press to hide." : "Flip card"}">
            ${deck.flipped ? `<span class="card__face card__back">${back(c)}</span>` : `<span class="card__face card__front">${front(c)}<span class="card__tap muted small">Click or press Space to flip</span></span>`}
          </button>
          <div class="flash__go">
            <button class="btn" data-act="again" ${deck.flipped ? "" : "disabled"}>Again <span class="measured">1</span></button>
            <button class="btn btn--primary" data-act="know" ${deck.flipped ? "" : "disabled"}>Got it <span class="measured">2</span></button>
          </div>`
        : `<div class="card card--done"><span class="card__name">Deck done</span><span class="muted">All ${deck.total} cards sorted into got it.</span><button class="btn btn--primary" data-act="redeal">Shuffle and go again</button></div>`}
      </div>
      <details class="ref">
        <summary>The whole list</summary>
        <div class="table-wrap"><table class="rules"><thead><tr><th scope="col">Port</th><th scope="col">Protocol</th><th scope="col">Transport</th><th scope="col">Note</th></tr></thead>
        <tbody>${window.PORTS.slice().sort((x, y) => parseInt(x.port) - parseInt(y.port)).map((x) => `<tr><td class="measured">${esc(x.port)}</td><td class="ref__name">${esc(x.name)}${x.yours ? "" : ` <span class="muted small">added</span>`}</td><td class="measured">${esc(x.proto)}</td><td class="ref__note">${esc(x.note)}</td></tr>`).join("")}</tbody></table></div>
      </details>
    </section>`;
  const act = (k) => {
    if (k === "flip") { deck.flipped = !deck.flipped; renderPorts(); $(".card")?.focus(); if (deck.flipped) announce(`${c.name}, port ${c.port}, ${c.proto}`); return; }
    if (k === "redeal") { dealPorts(); renderPorts(); $(".card")?.focus(); return; }
    if (!deck.flipped || !c) return;
    deck.cards.shift();
    if (k === "know") deck.known++;
    else deck.cards.splice(Math.min(deck.cards.length, 3 + Math.floor(Math.random() * 4)), 0, c); // comes back in a few cards
    deck.flipped = false; renderPorts(); $(".card")?.focus();
  };
  app.onclick = (e) => {
    const d = e.target.closest("[data-deck]"); if (d) { deck.filter = d.dataset.deck; dealPorts(); return renderPorts(); }
    const b = e.target.closest("[data-act]"); if (b && !b.disabled) act(b.dataset.act);
  };
  app.onchange = (e) => { if (e.target.name === "dir") { deck.dir = e.target.value; deck.flipped = false; renderPorts(); $(`input[name="dir"][value="${deck.dir}"]`).focus(); } };
  document.onkeydown = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest("input, summary")) return;
    if (e.key === " " && !e.target.closest(".btn, .tab")) { e.preventDefault(); act("flip"); }
    else if (e.key === "1") act("again");
    else if (e.key === "2") act("know");
  };
  app.ondrop = app.ondragstart = app.ondragover = app.ondragleave = app.ondragend = null;
}

// ---------- results ----------
let filter = "all";
function renderResults(s) {
  activeSet = s.set; s.reviewing = false;
  if (!s.done) { location.replace(`#/quiz/${s.set}/${s.idx + 1}`); return; }
  document.title = `Results - ${SETS[s.set].name}`;
  tools.innerHTML = `<span class="bar__set">${SETS[s.set].name} results</span>`;
  const rows = s.ids.map((id, i) => ({ i, q: Q[id], g: grade(Q[id], s.answers[id]), flag: !!s.flags[id] }));
  const score = rows.reduce((m, r) => m + r.g.got, 0) / rows.length;
  const full = rows.filter((r) => r.g.got === 1).length;
  const missed = rows.filter((r) => r.g.got < 1);
  const pbq = rows.filter((r) => r.q.type === "pbq"), mcq = rows.filter((r) => r.q.type !== "pbq");
  const part = (list) => list.length ? `${pct(list.reduce((m, r) => m + r.g.got, 0) / list.length)}%` : "none";
  const bySet = s.set === "M" || s.set === "R" ? ["A", "B", "C"].map((k) => { const l = rows.filter((r) => r.q.set === k); return l.length ? `<div><dt>From exam ${k}</dt><dd class="measured">${part(l)} <span class="muted">of ${l.length}</span></dd></div>` : ""; }).join("") : "";
  const shown = rows.filter((r) => filter === "all" || (filter === "missed" && r.g.got < 1) || (filter === "flagged" && r.flag));
  // group by objective domain (first digit) for a weak-spot read
  const domains = {};
  for (const r of rows) { const m = /Objectives? (\d)\./.exec(r.q.objective || ""); if (!m) continue; (domains[m[1]] ||= []).push(r); }
  const DOMAIN = { 1: "General security concepts", 2: "Threats, vulnerabilities and mitigations", 3: "Security architecture", 4: "Security operations", 5: "Security program management" };
  const domScores = Object.keys(domains).map((d) => [d, domains[d].reduce((m, r) => m + r.g.got, 0) / domains[d].length]).sort((x, y) => x[1] - y[1]);
  const weakest = domScores.length ? `${domScores[0][0]}. ${DOMAIN[domScores[0][0]]}` : "";
  const T = tierOf(score);
  const fresh = s.justFinished; s.justFinished = false; save();
  const dom = Object.keys(domains).sort().map((d) => { const l = domains[d]; const v = l.reduce((m, r) => m + r.g.got, 0) / l.length;
    return `<li><span>${d}. ${DOMAIN[d]}</span><span class="meter" aria-hidden="true"><span style="--v:${v}"></span></span><span class="measured">${pct(v)}% <span class="muted">of ${l.length}</span></span></li>`; }).join("");

  app.innerHTML = `
    <section class="results">
      <div class="panels score">
        <div class="score__lead verdict-box verdict-box--${T.key} ${fresh ? "is-fresh" : ""}">
          ${T.key === "pass" && fresh ? confetti() : ""}
          <div class="verdict-box__top">
            <div>
              <h1>${SETS[s.set].name}, ${s.mode === "exam" ? "exam mode" : "study mode"}</h1>
              <p class="reading">${pct(score)}%</p>
            </div>
            <div class="badge badge--${T.key}">${T.key === "pass" ? rosette() : T.key === "near" ? `<svg class="badge__ring" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="50" class="badge__track"/><circle cx="60" cy="60" r="50" class="badge__fill" style="--v:${score}"/></svg>` : `<svg class="badge__book" viewBox="0 0 120 120" aria-hidden="true"><path d="M20 30 Q40 22 60 32 Q80 22 100 30 V92 Q80 84 60 94 Q40 84 20 92 Z"/><path d="M60 32 V94"/></svg>`}</div>
          </div>
          <p class="tier-line"><span class="tier tier--${T.key}">${T.name}</span> <span>${T.line}${T.key !== "pass" && weakest ? ` Weakest: <strong>${weakest}</strong>.` : ""}</span></p>
          <div class="split" role="img" aria-label="${full} right and ${rows.length - full} wrong"><span class="split__ok" style="--v:${full / rows.length}"></span></div>
          <p class="muted"><span class="measured tally__ok">${full}</span> right, <span class="measured tally__bad">${rows.length - full}</span> wrong, in <span class="measured">${fmtTime(s.elapsed)}</span>. The score gives PBQs partial credit. Pass mark here is 90%, nearly there from 75%.</p>
          <div class="score__go">
            ${missed.length ? `<button class="btn btn--primary" data-act="retry">Retry the ${missed.length} missed</button>` : ""}
            <button class="btn" data-act="again">${s.set === "M" ? "New mixed set" : "Take it again"}</button>
            <a class="btn btn--quiet" href="#/practice">All sets</a>
          </div>
        </div>
        <dl class="score__parts">
          <div><dt>PBQs</dt><dd class="measured">${part(pbq)} <span class="muted">of ${pbq.length}</span></dd></div>
          <div><dt>Multiple choice</dt><dd class="measured">${part(mcq)} <span class="muted">of ${mcq.length}</span></dd></div>
          ${bySet}
        </dl>
      </div>
      ${dom ? `<section aria-labelledby="dom-h" class="domains"><h2 id="dom-h">By exam domain</h2><ul role="list" class="dom">${dom}</ul></section>` : ""}
      <section aria-labelledby="rev-h" class="review">
        <div class="review__head">
          <h2 id="rev-h">Every question</h2>
          <div class="tabs" role="group" aria-label="Show">
            ${[["all", "All", rows.length], ["missed", "Missed", missed.length], ["flagged", "Flagged", rows.filter((r) => r.flag).length]].map(([k, l, n]) => `<button class="tab" data-filter="${k}" aria-pressed="${filter === k}">${l} <span class="measured">${n}</span></button>`).join("")}
          </div>
        </div>
        ${shown.length ? `<ol class="rlist" role="list">${shown.map((r) => `
          <li><a href="#/quiz/${s.set}/${r.i + 1}" data-review="${r.i}" class="rrow">
            <span class="rrow__mark ${r.g.got === 1 ? "is-ok" : "is-bad"}">${r.g.got === 1 ? icon.ok : icon.bad}<span class="visually-hidden">${r.g.got === 1 ? "Correct" : "Missed"}</span></span>
            <span class="measured rrow__n">${r.i + 1}</span>
            <span class="rrow__q">${esc((r.q.type === "pbq" ? r.q.prompt : r.q.q).split("\n")[0])}</span>
            <span class="chip chip--cool measured">${r.q.id}</span></a></li>`).join("")}</ol>`
        : `<p class="empty">${filter === "missed" ? "Nothing missed. Every question was fully right." : "Nothing flagged. Use Flag on a question to mark it for later."}</p>`}
      </section>
    </section>`;
  app.onclick = (e) => {
    const f = e.target.closest("[data-filter]"); if (f) { filter = f.dataset.filter; return renderResults(s); }
    const r = e.target.closest("[data-review]"); if (r) { s.reviewing = true; save(); return; }
    const b = e.target.closest("[data-act]"); if (!b) return;
    if (b.dataset.act === "retry") { const ids = missed.map((m) => m.q.id); newSession("R", s.mode, [...ids.filter((id) => Q[id].type === "pbq"), ...shuffle(ids.filter((id) => Q[id].type !== "pbq"))]); location.hash = "#/quiz/R/1"; }
    if (b.dataset.act === "again") { newSession(s.set, s.mode); location.hash = `#/quiz/${s.set}/1`; }
  };
  app.onchange = null; document.onkeydown = null; app.ondrop = app.ondragstart = app.ondragover = app.ondragleave = app.ondragend = null;
}

route();
})();
