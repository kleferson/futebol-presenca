# ⚽ Futebol Presença

Confirme presença no futebol da galera em 5 segundos — sem app, sem cadastro, direto no navegador do celular.

🌍 **No ar:** https://kleferson.github.io/futebol-presenca/

![Pages](https://img.shields.io/badge/GitHub_Pages-online-brightgreen)
![Supabase](https://img.shields.io/badge/Supabase-realtime-3FCF8E)
![Mobile](https://img.shields.io/badge/mobile--first-iOS_%2F_Android-5b9cff)

---

## Como funciona

### 🙋 Visitante (sem login)

1. Abre o link e vê a lista de **próximos jogos**, cada um com data, local, observações e número de confirmados
2. Toca em **Entrar →** no jogo da semana (o link `?m=ID` pode ser compartilhado no WhatsApp)
3. Digita o nome, confirma no diálogo — e aparece na lista **em tempo real** ✨
4. A aba **Histórico** guarda os jogos que já passaram

> Um nome por jogo: o sistema barra confirmação duplicada (inclusive maiúsculas/minúsculas).

### 🛡️ Admin (com login)

1. Entra em `admin.html` com email + senha
2. **Passo 1 — Criar novo jogo:** data, hora, local e observações (opcional). Um resumo pede confirmação antes de publicar
3. **Passo 2 — Seus jogos:** por jogo dá para **Abrir** (ver a página), **Editar**, **Limpar lista** (zera presenças) ou **Excluir jogo**
4. Para tirar **1 pessoa** da lista: abra o jogo logado e use **Remover** ao lado do nome

---

## ✨ Recursos

- ⚡ **Tempo real** — presenças e jogos atualizam sozinhos via Supabase Realtime, sem F5
- 📝 **Observações por jogo** — "levar colete", "churrasco depois"... (opcional, pode ficar vazio)
- 📱 **Mobile-first** — tab bar estilo iOS, botões grandes, sem zoom automático
- 🖥️ **Responsivo** — no desktop a home vira 2 colunas
- 🔌 **Modo demo** — sem Supabase configurado, roda em LocalStorage pra testar o layout
- ♿ **Acessível** — navegação por teclado, `Esc` volta pra lista, leitores de tela

---

## 🧱 Tecnologias

| Camada | O quê |
|---|---|
| Front | HTML + CSS + JS puro (ES modules, sem build) |
| Banco + Auth + Realtime | [Supabase](https://supabase.com) (Postgres + RLS) |
| Hospedagem | GitHub Pages (deploy automático a cada push na `main`) |

Sem `npm install`, sem compilação: é só arquivo estático.

---

## 📁 Estrutura

```
├── index.html   → home (lista de jogos) + página do jogo
├── app.js       → lógica do visitante + realtime
├── admin.html   → login + criar/gerenciar jogos
├── admin.js     → lógica do admin
├── config.js    → URL + chave pública do Supabase
├── style.css    → visual mobile-first (tema "noite no estádio")
├── uicons.css + fonts/ → ícones locais (Flaticon UIcons)
└── supabase/
    └── schema.sql → tabelas (match_info, confirmations) + RLS + índices
```

---

## 💻 Rodar local

```bash
python3 -m http.server 8000
# http://localhost:8000
```

> A chave do `config.js` é **pública por design** (igual a `anon key` antiga): quem protege os dados são as políticas RLS — visitante só lê e confirma presença; só usuário logado cria/edita/remove jogos.

---

Feito para o futebol da galera ⚽ — atualiza em tempo real.
