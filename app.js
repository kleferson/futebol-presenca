import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cfg = window.FUTEBOL_CONFIG || {};
const hasSupabase = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes("COLE_AQUI");

const $ = (id) => document.getElementById(id);
const groupNameEl = $("groupName");
const matchDateEl = $("matchDate");
const matchLocEl = $("matchLoc");
const countEl = $("count");
const listEl = $("list");
const emptyMsg = $("emptyMsg");
const formMsg = $("formMsg");
const configWarning = $("configWarning");
const matchListEl = $("matchList");
const matchEmptyMsg = $("matchEmptyMsg");
const historyListEl = $("historyList");
const historyEmptyMsg = $("historyEmptyMsg");
const homeView = $("homeView");
const gameView = $("gameView");

let homeTab = "up"; // 'up' = próximos, 'hist' = histórico

let supabase = null;
let matches = [];
let counts = {};
let currentMatch = null;
let confirmations = [];
let isAdmin = false;

// ---------- Modo demonstração local ----------
const demoStore = {
  KEY_V2: "futebol-demo-v2",
  KEY_V1: "futebol-demo",
  load() {
    try {
      const v2 = JSON.parse(localStorage.getItem(this.KEY_V2));
      if (v2 && Array.isArray(v2.matches)) return v2;
      // migra formato antigo { match, confirmations } -> { matches, confirmations }
      const v1 = JSON.parse(localStorage.getItem(this.KEY_V1));
      if (v1 && v1.match) {
        const m = { ...v1.match, id: v1.match.id || crypto.randomUUID() };
        const confs = (v1.confirmations || []).map((c) => ({ ...c, match_id: m.id }));
        const data = { matches: [m], confirmations: confs };
        localStorage.setItem(this.KEY_V2, JSON.stringify(data));
        return data;
      }
    } catch { /* ignora */ }
    return null;
  },
  save(data) { localStorage.setItem(this.KEY_V2, JSON.stringify(data)); }
};

function getDemoData() {
  let d = demoStore.load();
  if (!d || !d.matches.length) {
    const next = new Date();
    next.setDate(next.getDate() + 7);
    const m = {
      id: crypto.randomUUID(),
      group_name: "",
      date: next.toISOString().slice(0, 10),
      time: "15:00",
      location: "Quadra a definir"
    };
    d = { matches: [m], confirmations: [] };
    demoStore.save(d);
  }
  return d;
}

// ---------- Helpers ----------
// Padrão de exibição: 05/10 - 20:00H (segunda-feira)
function partsDay(iso) {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  return { y, m, d };
}
function fmtDay(iso) {
  const { m, d } = partsDay(iso);
  if (!m || !d) return "—";
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}
function fmtWeekday(iso) {
  const { y, m, d } = partsDay(iso);
  if (!y || !m || !d) return "";
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", { weekday: "long" });
}
function fmtHour(t) {
  return (t || "").slice(0, 5) + "H";
}
function fmtGame(date, time) {
  return `${fmtDay(date)} - ${fmtHour(time)} (${fmtWeekday(date)})`;
}

// group_name agora guarda "Observações" (opcional).
// Legado "Futebol da Galera" é tratado como vazio para não poluir a UI.
function getNotes(m) {
  const v = String(m?.notes ?? m?.group_name ?? "").trim();
  return v === "Futebol da Galera" ? "" : v;
}

function showMsg(el, text, type = "") {
  if (!el) return;
  el.textContent = text;
  el.className = "msg " + type;
  if (text) setTimeout(() => { if (el.textContent === text) { el.textContent = ""; el.className = "msg"; } }, 4000);
}

function sortMatches(arr) {
  return [...arr].sort((a, b) =>
    String(a.date).localeCompare(String(b.date)) || String(a.time).localeCompare(String(b.time)));
}

function getIdFromUrl() {
  return new URLSearchParams(location.search).get("m");
}

function setIdInUrl(id) {
  const url = new URL(location.href);
  if (id) url.searchParams.set("m", id);
  else url.searchParams.delete("m");
  history.replaceState(null, "", url);
}

function getMatchFromUrl(list) {
  const fromUrl = getIdFromUrl();
  if (fromUrl && list.some((m) => m.id === fromUrl)) {
    return list.find((m) => m.id === fromUrl);
  }
  return null;
}

function focusHeading(el) {
  if (!el) return;
  try { el.focus({ preventScroll: true }); } catch { el.focus(); }
}

function isDemoAdmin() {
  try { return localStorage.getItem("futebol-admin-demo") === "1"; }
  catch { return false; }
}

function goHome(focus = true) {
  currentMatch = null;
  confirmations = [];
  setIdInUrl(null);
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (focus) focusHeading(groupNameEl);
}

// ---------- Render ----------
function render() {
  const inGame = !!currentMatch;
  if (homeView) homeView.classList.toggle("hidden", inGame);
  if (gameView) gameView.classList.toggle("hidden", !inGame);

  // Home: título genérico + lista com confirmados por jogo
  renderMatchList();
  updateHomeSummary();
  updateTabs();

  if (!currentMatch) {
    groupNameEl.textContent = "Futebol da Galera";
    document.title = "Futebol da Galera — Próximos jogos";
    const _nb = $("notesBox");
    if (_nb) _nb.classList.add("hidden");
    const _nm = $("matchNotes");
    if (_nm) _nm.textContent = "";
    return;
  }
  groupNameEl.textContent = "Futebol da Galera";
  document.title = `Futebol da Galera — ${fmtGame(currentMatch.date, currentMatch.time)}`;
  matchDateEl.textContent = fmtGame(currentMatch.date, currentMatch.time);
  matchLocEl.textContent = currentMatch.location;
  const notesEl = $("matchNotes");
  const notesBox = $("notesBox");
  if (notesEl && notesBox) {
    const notes = getNotes(currentMatch);
    notesEl.textContent = notes;
    notesBox.classList.toggle("hidden", !notes);
  }
  countEl.textContent = confirmations.length;

  listEl.innerHTML = "";
  emptyMsg.style.display = confirmations.length ? "none" : "block";
  if ($("adminHint")) $("adminHint").classList.toggle("hidden", !isAdmin);

  confirmations.forEach((c) => {
    const li = document.createElement("li");
    const initial = (c.name || "?").trim().charAt(0).toUpperCase();
    li.innerHTML = `
      <div class="who">
        <span class="avatar">${initial}</span>
        <div><strong></strong><small></small></div>
      </div>`;
    li.querySelector("strong").textContent = c.name;
    li.querySelector("small").textContent = new Date(c.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

    if (isAdmin) {
      const btn = document.createElement("button");
      btn.className = "btn ghost small";
      btn.textContent = "Remover";
      btn.setAttribute("aria-label", `Remover ${c.name} deste jogo`);
      btn.onclick = () => removeConfirmation(c.id, c.name);
      li.appendChild(btn);
    }
    listEl.appendChild(li);
  });

  renderMatchList();
}

function updateHomeSummary() {
  const el = $("homeSummary");
  if (!el) return;
  const totalGames = matches.length;
  const totalConf = Object.values(counts).reduce((a, b) => a + (b || 0), 0);
  el.textContent = totalGames
    ? `${totalGames} jogo${totalGames === 1 ? "" : "s"} • ${totalConf} confirmado${totalConf === 1 ? "" : "s"} no total`
    : "";
}

function updateTabs() {
  const share = $("tabShare");
  const jogos = $("tabJogos");
  if (share) share.classList.toggle("hidden", !currentMatch);
  if (jogos) {
    if (currentMatch) {
      jogos.removeAttribute("aria-current");
      jogos.setAttribute("aria-label", "Voltar para a lista de jogos");
    } else {
      jogos.setAttribute("aria-current", "page");
      jogos.setAttribute("aria-label", "Lista de jogos");
    }
  }
}

function daysUntil(iso) {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  if (!y || !m || !d) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((new Date(y, m - 1, d) - today) / 86400000);
}

function nextTag(diff) {
  if (diff === null || diff < 0) return null;
  if (diff === 0) return "É HOJE!";
  if (diff === 1) return "AMANHÃ";
  return `EM ${diff} DIAS`;
}

function nextMatchId(list) {
  let best = null;
  list.forEach((m) => {
    const diff = daysUntil(m.date);
    if (diff === null || diff < 0) return;
    if (!best || diff < best.diff) best = { id: m.id, diff };
  });
  return best;
}

function switchHomeTab(tab) {
  homeTab = tab;
  const up = tab === "up";
  if ($("tabUpcoming")) {
    $("tabUpcoming").classList.toggle("active", up);
    $("tabUpcoming").setAttribute("aria-selected", String(up));
  }
  if ($("tabHistory")) {
    $("tabHistory").classList.toggle("active", !up);
    $("tabHistory").setAttribute("aria-selected", String(!up));
  }
  if ($("paneUpcoming")) $("paneUpcoming").classList.toggle("hidden", !up);
  if ($("paneHistory")) $("paneHistory").classList.toggle("hidden", up);
}

function matchItem(m, n, { past = false, isActive = false, isNext = false, tag = null } = {}) {
  const li = document.createElement("li");
  li.className = "match-item" + (isActive ? " active" : "") + (isNext ? " next" : "") + (past ? " past" : "");
  const label = `${isNext ? "Próximo jogo. " : ""}${past ? "Jogo encerrado. " : ""}Jogo ${fmtGame(m.date, m.time)} em ${m.location} com ${n} confirmados. Abrir jogo.`;

  const info = document.createElement("button");
  info.type = "button";
  info.className = "match-link";
  info.setAttribute("aria-label", label);
  if (isActive) info.setAttribute("aria-current", "true");
  info.innerHTML = `${tag ? `<span class="next-tag"></span>` : ``}<strong></strong><span class="match-where"></span>`;
  if (tag) info.querySelector(".next-tag").textContent = tag;
  info.querySelector("strong").textContent = fmtGame(m.date, m.time);
  const _notes = getNotes(m);
  const _where = info.querySelector(".match-where");
  _where.textContent = _notes ? `${m.location} • ${_notes}` : m.location;
  if (_notes) _where.title = _notes;
  info.onclick = () => selectMatch(m.id);
  li.appendChild(info);

  const right = document.createElement("div");
  right.className = "match-right";
  right.innerHTML = `<span class="badge"><span></span><i class="fi fi-rr-check" aria-hidden="true"></i></span>`;
  const badge = right.querySelector(".badge");
  badge.querySelector(":scope > span").textContent = n;
  badge.title = `${n} confirmado${n === 1 ? "" : "s"}`;
  if (n > 0) badge.classList.add("has-count");
  li.appendChild(right);

  const enter = document.createElement("button");
  enter.type = "button";
  enter.className = "btn primary small";
  enter.textContent = "Entrar →";
  enter.setAttribute("aria-label", label);
  enter.onclick = () => selectMatch(m.id);
  li.appendChild(enter);

  return li;
}

function renderMatchList() {
  if (!matchListEl) return;
  matchListEl.innerHTML = "";
  if (historyListEl) historyListEl.innerHTML = "";
  const ordered = sortMatches(matches);
  const upcoming = ordered.filter((m) => { const d = daysUntil(m.date); return d === null || d >= 0; });
  const past = ordered.filter((m) => { const d = daysUntil(m.date); return d !== null && d < 0; });
  const next = nextMatchId(ordered);

  if (matchEmptyMsg) matchEmptyMsg.classList.toggle("hidden", upcoming.length > 0);
  if (historyEmptyMsg) historyEmptyMsg.classList.toggle("hidden", past.length > 0);

  // contadores nas abas + resumos
  if ($("tabUpcoming")) $("tabUpcoming").textContent = `Próximos (${upcoming.length})`;
  if ($("tabHistory")) $("tabHistory").textContent = `Histórico (${past.length})`;
  const hs = $("historySummary");
  if (hs) hs.textContent = past.length ? `${past.length} jogo${past.length === 1 ? "" : "s"} encerrado${past.length === 1 ? "" : "s"}` : "";

  upcoming.forEach((m) => {
    const isActive = currentMatch && m.id === currentMatch.id;
    const isNext = next && m.id === next.id;
    matchListEl.appendChild(matchItem(m, counts[m.id] ?? 0, {
      isActive, isNext, tag: isNext ? nextTag(next.diff) : null
    }));
  });
  if (historyListEl) {
    [...past].reverse().forEach((m) => { // mais recentes primeiro
      historyListEl.appendChild(matchItem(m, counts[m.id] ?? 0, { past: true }));
    });
  }
}

async function selectMatch(id, push = true) {
  const found = matches.find((m) => m.id === id);
  if (!found) return;
  currentMatch = found;
  if (push) setIdInUrl(id);
  await loadConfirmations();
  window.scrollTo({ top: 0 });
  focusHeading(matchDateEl);
}

// ---------- Supabase / Demo: leitura ----------
async function initSupabase() {
  supabase = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  const { data: { session } } = await supabase.auth.getSession();
  isAdmin = !!session || isDemoAdmin();
  render();

  await loadMatches();

  supabase
    .channel("futebol-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "confirmations" }, async () => {
      await loadCounts();
      if (currentMatch) await loadConfirmations();
      else render();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "match_info" }, loadMatches)
    .subscribe();
}

async function loadMatches() {
  if (hasSupabase) {
    const { data, error } = await supabase
      .from("match_info").select("*").order("date", { ascending: true }).order("time", { ascending: true });
    if (error) { showMsg(formMsg, "Erro ao carregar jogos: " + error.message, "err"); return; }
    matches = data || [];
    await loadCounts();
    // Home primeiro: só entra na página do jogo se a URL tiver ?m= válido.
    // Mantém a seleção se ainda existir (realtime), senão volta pra home.
    const fromUrl = getMatchFromUrl(sortMatches(matches));
    if (currentMatch && matches.some((m) => m.id === currentMatch.id)) {
      currentMatch = matches.find((m) => m.id === currentMatch.id);
      await loadConfirmations();
    } else if (fromUrl && !currentMatch) {
      currentMatch = fromUrl;
      await loadConfirmations();
    } else if (fromUrl && currentMatch && currentMatch.id !== fromUrl.id) {
      // URL mudou externamente (voltar/avançar do navegador)
      currentMatch = fromUrl;
      await loadConfirmations();
    } else {
      if (!currentMatch) setIdInUrl(null);
      confirmations = currentMatch ? confirmations : [];
      render();
      if (currentMatch) await loadConfirmations();
    }
  } else {
    const d = getDemoData();
    matches = sortMatches(d.matches);
    const all = d.confirmations || [];
    counts = {};
    matches.forEach((m) => { counts[m.id] = all.filter((c) => c.match_id === m.id).length; });
    const fromUrl = getMatchFromUrl(matches);
    if (currentMatch && matches.some((m) => m.id === currentMatch.id)) {
      currentMatch = matches.find((m) => m.id === currentMatch.id);
    } else if (!currentMatch) {
      currentMatch = fromUrl; // null na home
      setIdInUrl(currentMatch?.id);
    } else if (fromUrl && currentMatch.id !== fromUrl.id) {
      currentMatch = fromUrl;
    }
    if (!currentMatch) { confirmations = []; render(); return; }
    confirmations = all
      .filter((c) => currentMatch && c.match_id === currentMatch.id)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    render();
  }
}

async function loadCounts() {
  if (!hasSupabase || !matches.length) {
    if (!hasSupabase) return; // já calculado em loadMatches demo
    counts = {};
    renderMatchList();
    return;
  }
  const { data, error } = await supabase.from("confirmations").select("match_id");
  if (error) return;
  counts = {};
  matches.forEach((m) => { counts[m.id] = 0; });
  (data || []).forEach((r) => { if (r.match_id in counts) counts[r.match_id]++; });
  renderMatchList();
}

async function loadConfirmations() {
  if (!currentMatch) { confirmations = []; render(); return; }
  if (hasSupabase) {
    const { data, error } = await supabase
      .from("confirmations").select("*").eq("match_id", currentMatch.id).order("created_at");
    if (error) { showMsg(formMsg, "Erro ao carregar lista.", "err"); return; }
    confirmations = data || [];
    render();
  } else {
    const d = getDemoData();
    confirmations = (d.confirmations || [])
      .filter((c) => c.match_id === currentMatch.id)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const all = d.confirmations || [];
    matches.forEach((m) => { counts[m.id] = all.filter((c) => c.match_id === m.id).length; });
    render();
  }
}

// ---------- Escrita: presenças ----------
async function confirmPresence(name) {
  name = name.trim().replace(/\s+/g, " ");
  if (name.length < 2) { showMsg(formMsg, "Digite um nome com ao menos 2 letras.", "err"); return; }
  if (!currentMatch) { showMsg(formMsg, "Nenhum jogo selecionado.", "err"); return; }

  if (hasSupabase) {
    const { error } = await supabase.from("confirmations").insert({ match_id: currentMatch.id, name });
    if (error) {
      if (error.code === "23505") showMsg(formMsg, `"${name}" já confirmou neste jogo!`, "err");
      else showMsg(formMsg, "Erro: " + error.message, "err");
    } else showMsg(formMsg, `${name} confirmado!`, "ok");
  } else {
    const d = getDemoData();
    if (d.confirmations.some((c) => c.match_id === currentMatch.id && c.name.toLowerCase() === name.toLowerCase())) {
      showMsg(formMsg, `"${name}" já confirmou neste jogo!`, "err"); return;
    }
    d.confirmations.push({ id: crypto.randomUUID(), match_id: currentMatch.id, name, created_at: new Date().toISOString() });
    demoStore.save(d);
    confirmations = d.confirmations
      .filter((c) => c.match_id === currentMatch.id)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    counts[currentMatch.id] = confirmations.length;
    render();
    showMsg(formMsg, `${name} confirmado! (modo demo)`, "ok");
  }
}

async function removeConfirmation(id, name) {
  if (!confirm(`Remover "${name}" deste jogo?`)) return;
  if (hasSupabase) {
    const { error } = await supabase.from("confirmations").delete().eq("id", id);
    if (error) alert("Erro: " + error.message);
  } else {
    const d = getDemoData();
    d.confirmations = d.confirmations.filter((c) => c.id !== id);
    demoStore.save(d);
    confirmations = d.confirmations.filter((c) => currentMatch && c.match_id === currentMatch.id);
    counts[currentMatch.id] = confirmations.length;
    render();
  }
}

// ---------- Admin na página inicial ----------
// A edição agora mora em admin.html. Aqui só descobrimos se é admin
// (sessão Supabase persiste entre páginas) para mostrar o botão Remover.
async function initAdmin() {
  if (isDemoAdmin()) isAdmin = true;

  // Tab bar inferior: Jogos volta para a lista sem recarregar
  if ($("tabJogos")) {
    $("tabJogos").onclick = () => { if (currentMatch) goHome(); else window.scrollTo({ top: 0, behavior: "smooth" }); };
  }

  // Abas da home: Próximos x Histórico
  if ($("tabUpcoming")) $("tabUpcoming").onclick = () => switchHomeTab("up");
  if ($("tabHistory")) $("tabHistory").onclick = () => switchHomeTab("hist");

  // Teclado: Esc fecha o diálogo ou volta para a lista
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    if (!$("confirmModal").classList.contains("hidden")) { closeConfirmDialog(); return; }
    if (currentMatch) goHome();
  });

  if ($("tabShare")) {
    $("tabShare").onclick = async () => {
      if (!currentMatch) return;
      const url = `${location.origin}${location.pathname}?m=${currentMatch.id}`;
      const title = `Futebol da Galera — ${fmtGame(currentMatch.date, currentMatch.time)}`;
      if (navigator.share) {
        try { await navigator.share({ title, text: `Confirme presença: ${title}`, url }); return; }
        catch { /* usuário cancelou ou falhou: cai no clipboard */ }
      }
      try {
        await navigator.clipboard.writeText(url);
        showMsg($("matchMsg2"), "Link copiado! Cole no WhatsApp.", "ok");
      } catch {
        try { prompt("Copie o link do jogo:", url); } catch { /* sem dialog */ }
        showMsg($("matchMsg2"), "Link do jogo pronto para compartilhar.", "ok");
      }
    };
  }
}

// ---------- Diálogo de confirmação de presença ----------
let dialogName = null;

function openConfirmDialog(name) {
  dialogName = name;
  $("confirmModalName").textContent = name;
  const _n = currentMatch ? getNotes(currentMatch) : "";
  $("confirmModalGame").textContent = currentMatch
    ? `${fmtGame(currentMatch.date, currentMatch.time)} • ${currentMatch.location}${_n ? " • " + _n : ""}`
    : "";
  $("confirmModal").classList.remove("hidden");
  $("confirmModalOk").focus();
}

function closeConfirmDialog() {
  dialogName = null;
  $("confirmModal").classList.add("hidden");
  $("nameInput").focus();
}

// ---------- Boot ----------
$("confirmForm").onsubmit = async (e) => {
  e.preventDefault();
  const input = $("nameInput");
  const typed = input.value.trim().replace(/\s+/g, " ");
  if (typed.length < 2) {
    showMsg(formMsg, "Digite um nome com ao menos 2 letras.", "err");
    return;
  }
  if (!currentMatch) { showMsg(formMsg, "Nenhum jogo selecionado.", "err"); return; }
  openConfirmDialog(typed);
};

$("confirmModalOk").onclick = async () => {
  const name = dialogName;
  const okBtn = $("confirmModalOk");
  if (!name || okBtn.disabled) return; // evita duplo toque
  okBtn.disabled = true;
  try {
    await confirmPresence(name);
  } finally {
    okBtn.disabled = false;
  }
  closeConfirmDialog();
  $("nameInput").value = "";
};

$("confirmModalCancel").onclick = () => closeConfirmDialog();
$("confirmModal").addEventListener("click", (e) => {
  if (e.target.id === "confirmModal") closeConfirmDialog();
});

// Voltar/avançar do navegador troca entre home <-> jogo
window.addEventListener("popstate", async () => {
  const fromUrl = getMatchFromUrl(matches);
  if (fromUrl) {
    currentMatch = fromUrl;
    await loadConfirmations();
    focusHeading(matchDateEl);
  } else {
    goHome();
  }
});

(async function boot() {
  await initAdmin();
  if (hasSupabase) {
    configWarning.classList.add("hidden");
    await initSupabase();
  } else {
    configWarning.classList.remove("hidden");
    await loadMatches();
  }
})();
