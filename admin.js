import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cfg = window.FUTEBOL_CONFIG || {};
const hasSupabase = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes("COLE_AQUI");
const $ = (id) => document.getElementById(id);

let supabase = null;
let matches = [];
let counts = {};

// ---------- Demo local (mesma chave do site) ----------
const demoStore = {
  KEY_V2: "futebol-demo-v2",
  KEY_V1: "futebol-demo",
  load() {
    try {
      const v2 = JSON.parse(localStorage.getItem(this.KEY_V2));
      if (v2 && Array.isArray(v2.matches)) return v2;
      const v1 = JSON.parse(localStorage.getItem(this.KEY_V1));
      if (v1?.match) {
        const m = { ...v1.match, id: v1.match.id || crypto.randomUUID() };
        const data = { matches: [m], confirmations: (v1.confirmations || []).map((c) => ({ ...c, match_id: m.id })) };
        localStorage.setItem(this.KEY_V2, JSON.stringify(data));
        return data;
      }
    } catch { /* ignora */ }
    return { matches: [], confirmations: [] };
  },
  save(d) { localStorage.setItem(this.KEY_V2, JSON.stringify(d)); }
};

const fmtGame = (iso, time) => {
  if (!iso) return "—";
  const [y, m, d] = String(iso).split("-").map(Number);
  const wd = new Date(y, m - 1, d).toLocaleDateString("pt-BR", { weekday: "long" });
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")} - ${(time || "").slice(0, 5)}H (${wd})`;
};
const msg = (el, t, c = "") => {
  if (!el) return;
  el.textContent = t; el.className = "msg " + c;
  if (t) setTimeout(() => { el.textContent = ""; el.className = "msg"; }, 4000);
};

// group_name agora guarda "Observações" (opcional).
// Legado "Futebol da Galera" é tratado como vazio para não poluir a UI.
const getNotes = (m) => {
  const v = String(m?.notes ?? m?.group_name ?? "").trim();
  return v === "Futebol da Galera" ? "" : v;
};

let admTab = "up";

function daysUntil(iso) {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  if (!y || !m || !d) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((new Date(y, m - 1, d) - today) / 86400000);
}

function switchAdmTab(tab) {
  admTab = tab;
  const up = tab === "up";
  $("admTabUpcoming").classList.toggle("active", up);
  $("admTabUpcoming").setAttribute("aria-selected", String(up));
  $("admTabHistory").classList.toggle("active", !up);
  $("admTabHistory").setAttribute("aria-selected", String(!up));
  $("admPaneUpcoming").classList.toggle("hidden", !up);
  $("admPaneHistory").classList.toggle("hidden", up);
}

// ---------- Leitura ----------
async function loadAll() {
  if (hasSupabase) {
    const { data, error } = await supabase.from("match_info").select("*").order("date").order("time");
    if (error) return alert("Erro: " + error.message);
    matches = data || [];
    const { data: confs } = await supabase.from("confirmations").select("match_id");
    counts = {};
    matches.forEach((m) => (counts[m.id] = 0));
    (confs || []).forEach((r) => { if (r.match_id in counts) counts[r.match_id]++; });
  } else {
    const d = demoStore.load();
    if (!d.matches.length) {
      // mesmo jogo demo da página inicial (consistência entre telas)
      const next = new Date();
      next.setDate(next.getDate() + 7);
      d.matches.push({ id: crypto.randomUUID(), group_name: "", date: next.toISOString().slice(0, 10), time: "15:00", location: "Quadra a definir" });
      demoStore.save(d);
    }
    matches = [...(d.matches || [])].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    counts = {};
    matches.forEach((m) => (counts[m.id] = (d.confirmations || []).filter((c) => c.match_id === m.id).length));
  }
  renderList();
}

function gameItem(m, n, past) {
    const li = document.createElement("li");
    li.className = "admin-game" + (past ? " past" : "");
    li.innerHTML = `
      <div class="admin-game-top">
        <div><strong></strong><span></span></div>
        <span class="badge"></span>
      </div>
      <form class="stack edit-form hidden">
        <label class="field"><span>Observações <small class="muted">(opcional)</small></span><input data-f="group_name" maxlength="140" placeholder="Ex: Levar colete..." /></label>
        <div class="grid2">
          <label class="field"><span>Data</span><input data-f="date" type="date" required /></label>
          <label class="field"><span>Hora</span><input data-f="time" type="time" required /></label>
        </div>
        <label class="field"><span>Local</span><input data-f="location" maxlength="80" required /></label>
        <div class="row">
          <button class="btn primary small" type="submit">Salvar</button>
          <button class="btn ghost small" type="button" data-act="cancel">Cancelar</button>
        </div>
      </form>
      <div class="row admin-actions"></div>`;
    li.querySelector("strong").textContent = fmtGame(m.date, m.time);
    const notes = getNotes(m);
    li.querySelector("span").textContent = notes ? `${m.location} • ${notes}` : m.location;
    const badge = li.querySelector(".badge");
    badge.innerHTML = `<span></span><i class="fi fi-rr-check" aria-hidden="true"></i>`;
    badge.querySelector(":scope > span").textContent = n;
    badge.title = `${n} confirmado${n === 1 ? "" : "s"}`;
    if (n > 0) badge.classList.add("has-count");

    const actions = li.querySelector(".admin-actions");
    const mk = (label, cls, fn) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "btn small " + cls; b.textContent = label;
      b.onclick = fn;
      actions.appendChild(b);
    };
    mk("Abrir", "primary", () => (location.href = `index.html?m=${m.id}`));
    mk("Editar", "ghost", () => {
      const f = li.querySelector(".edit-form");
      f.classList.toggle("hidden");
      f.querySelector('[data-f="group_name"]').value = getNotes(m);
      f.querySelector('[data-f="date"]').value = m.date || "";
      f.querySelector('[data-f="time"]').value = (m.time || "").slice(0, 5);
      f.querySelector('[data-f="location"]').value = m.location || "";
    });
    mk("Limpar lista", "ghost", async () => {
      if (!confirm(`Limpar as ${n} presenças de ${fmtGame(m.date, m.time)}?`)) return;
      if (hasSupabase) {
        const { error } = await supabase.from("confirmations").delete().eq("match_id", m.id);
        if (error) return alert("Erro: " + error.message);
      } else {
        const d = demoStore.load();
        d.confirmations = d.confirmations.filter((c) => c.match_id !== m.id);
        demoStore.save(d);
      }
      loadAll();
    });
    mk("Excluir jogo", "danger", async () => {
      if (!confirm(`Excluir ${fmtGame(m.date, m.time)} e as ${n} presenças?`)) return;
      if (hasSupabase) {
        const { error } = await supabase.from("match_info").delete().eq("id", m.id);
        if (error) return alert("Erro: " + error.message);
      } else {
        const d = demoStore.load();
        d.matches = d.matches.filter((x) => x.id !== m.id);
        d.confirmations = d.confirmations.filter((c) => c.match_id !== m.id);
        demoStore.save(d);
      }
      loadAll();
    });

    li.querySelector('[data-act="cancel"]').onclick = () => li.querySelector(".edit-form").classList.add("hidden");
    li.querySelector(".edit-form").onsubmit = async (e) => {
      e.preventDefault();
      const payload = {
        group_name: li.querySelector('[data-f="group_name"]').value.trim(),
        date: li.querySelector('[data-f="date"]').value,
        time: li.querySelector('[data-f="time"]').value,
        location: li.querySelector('[data-f="location"]').value.trim()
      };
      if (hasSupabase) {
        const { error } = await supabase.from("match_info").update(payload).eq("id", m.id);
        if (error) return alert("Erro: " + error.message);
      } else {
        const d = demoStore.load();
        Object.assign(d.matches.find((x) => x.id === m.id), payload);
        demoStore.save(d);
      }
      loadAll();
    };
    return li;
}

function renderList() {
  const ul = $("adminMatchList");
  const histUl = $("adminHistoryList");
  ul.innerHTML = "";
  if (histUl) histUl.innerHTML = "";
  const upcoming = matches.filter((m) => { const d = daysUntil(m.date); return d === null || d >= 0; });
  const past = matches.filter((m) => { const d = daysUntil(m.date); return d !== null && d < 0; });

  $("adminEmpty").classList.toggle("hidden", upcoming.length > 0);
  if ($("adminHistoryEmpty")) $("adminHistoryEmpty").classList.toggle("hidden", past.length > 0);
  $("admTabUpcoming").textContent = `Próximos (${upcoming.length})`;
  $("admTabHistory").textContent = `Histórico (${past.length})`;
  const hs = $("admHistSummary");
  if (hs) hs.textContent = past.length ? `${past.length} jogo${past.length === 1 ? "" : "s"} encerrado${past.length === 1 ? "" : "s"}` : "";

  upcoming.forEach((m) => ul.appendChild(gameItem(m, counts[m.id] ?? 0, false)));
  if (histUl) [...past].reverse().forEach((m) => histUl.appendChild(gameItem(m, counts[m.id] ?? 0, true)));
}

// ---------- Boot ----------
(async function boot() {
  if (hasSupabase) supabase = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  // data sugerida: próximo sábado
  const sug = new Date();
  sug.setDate(sug.getDate() + (((6 - sug.getDay() + 7) % 7) || 7));
  if ($("nDate")) $("nDate").value = sug.toISOString().slice(0, 10);

  const showPanel = (email) => {
    $("loginCard").classList.toggle("hidden", !!email);
    $("panel").classList.toggle("hidden", !email);
    if (email) $("adminEmail").textContent = email;
  };

  $("admTabUpcoming").onclick = () => switchAdmTab("up");
  $("admTabHistory").onclick = () => switchAdmTab("hist");

  // Credenciais do modo demonstração (sem Supabase).
  // ATENÇÃO: validação apenas local, visível no código-fonte.
  // Quando configurar o Supabase, o login passa a ser o do Supabase Auth
  // (crie o usuário admin@admin.com por lá) e este bloco deixa de ser usado.
  const DEMO_EMAIL = "admin@admin.com";
  const DEMO_PASS = "@futedagalera";

  if (!hasSupabase) {
    $("emailInput").value = DEMO_EMAIL;
    $("loginForm").onsubmit = (e) => {
      e.preventDefault();
      const em = $("emailInput").value.trim().toLowerCase();
      const pw = $("passInput").value;
      if (em === DEMO_EMAIL && pw === DEMO_PASS) {
        try { localStorage.setItem("futebol-admin-demo", "1"); } catch { /* privado */ }
        msg($("loginMsg"), "", "");
        showPanel(DEMO_EMAIL); loadAll();
      } else {
        msg($("loginMsg"), "Email ou senha inválidos.", "err");
      }
    };
    if (localStorage.getItem("futebol-admin-demo") === "1") { showPanel(DEMO_EMAIL); loadAll(); }
    $("logoutBtn").onclick = () => {
      try { localStorage.removeItem("futebol-admin-demo"); } catch { /* privado */ }
      showPanel(null);
    };
  } else {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) { showPanel(session.user.email); loadAll(); }
    $("loginForm").onsubmit = async (e) => {
      e.preventDefault();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: $("emailInput").value.trim(), password: $("passInput").value
      });
      if (error) msg($("loginMsg"), "Login falhou: " + error.message, "err");
      else { showPanel(data.user.email); loadAll(); }
    };
    $("logoutBtn").onclick = async () => { await supabase.auth.signOut(); showPanel(null); };
    supabase.channel("admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "match_info" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "confirmations" }, loadAll)
      .subscribe();
  }

  // ---------- Confirmação antes de criar o jogo ----------
  let pendingMatch = null;

  function openNewMatchConfirm(payload) {
    pendingMatch = payload;
    $("cfDate").textContent = fmtGame(payload.date, payload.time);
    $("cfLoc").textContent = payload.location || "—";
    $("cfNotes").textContent = payload.group_name ? payload.group_name : "Nenhuma";
    $("newMatchConfirmModal").classList.remove("hidden");
    $("cfOk").focus();
  }

  function closeNewMatchConfirm() {
    pendingMatch = null;
    $("newMatchConfirmModal").classList.add("hidden");
  }

  async function doCreateMatch(payload) {
    if (hasSupabase) {
      const { error } = await supabase.from("match_info").insert(payload);
      if (error) return msg($("newMatchMsg"), "Erro: " + error.message, "err");
    } else {
      const d = demoStore.load();
      // garante login demo antes de criar
      if ($("panel").classList.contains("hidden")) { showPanel(DEMO_EMAIL); }
      d.matches.push({ id: crypto.randomUUID(), ...payload });
      demoStore.save(d);
    }
    msg($("newMatchMsg"), "Jogo criado!", "ok");
    $("nGroup").value = "";
    $("nLoc").value = "";
    loadAll();
  }

  $("newMatchForm").onsubmit = (e) => {
    e.preventDefault();
    const payload = {
      group_name: $("nGroup").value.trim(),
      date: $("nDate").value, time: $("nTime").value,
      location: $("nLoc").value.trim()
    };
    if (!payload.date || !payload.time) return msg($("newMatchMsg"), "Escolha data e hora.", "err");
    if (!payload.location) return msg($("newMatchMsg"), "Informe o local.", "err");
    openNewMatchConfirm(payload);
  };

  $("cfCancel").onclick = () => closeNewMatchConfirm();
  $("newMatchConfirmModal").addEventListener("click", (e) => {
    if (e.target.id === "newMatchConfirmModal") closeNewMatchConfirm();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("newMatchConfirmModal").classList.contains("hidden")) closeNewMatchConfirm();
  });
  $("cfOk").onclick = async () => {
    const payload = pendingMatch;
    const okBtn = $("cfOk");
    if (!payload || okBtn.disabled) return; // evita duplo clique
    okBtn.disabled = true;
    try {
      await doCreateMatch(payload);
    } finally {
      okBtn.disabled = false;
    }
    closeNewMatchConfirm();
  };
})();
