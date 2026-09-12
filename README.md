# ⚽ Futebol Presença

Página para confirmar presença no futebol. Visitantes confirmam com o nome, admin gerencia tudo.

## Regras
- **Visitante (sem login):** abre `index.html`, vê próximos jogos com confirmados, entra no jogo (`?m=ID`) e confirma presença.
- **ADMIN:** abre `admin.html` em 2 passos — 1) cria novo jogo, 2) gerencia a lista (Abrir / Editar / Limpar / Excluir). Para tirar 1 pessoa, abra o jogo e use “Remover”.

## Setup (5 min, grátis)

1. Crie um projeto em https://supabase.com
2. No **SQL Editor**, rode o arquivo `supabase/schema.sql`
3. Em **Authentication > Users > Add user**, crie o admin (email + senha)
4. Em **Project Settings > API**, copie `URL` + `anon key`
5. Cole em `config.js`:
```js
window.FUTEBOL_CONFIG = {
  SUPABASE_URL: "https://xyz.supabase.co",
  SUPABASE_ANON_KEY: "eyJ..."
};
```
6. Hospede:
   - **Vercel/Netlify:** arraste a pasta ou conecte o repo
   - **Local:** `python3 -m http.server` na pasta e abra `http://localhost:8000`

> Sem configurar o Supabase, o site roda em **modo demo local** (LocalStorage) para testar o layout.

## Arquivos
- `index.html` + `app.js` — home + página do jogo (jogador)
- `admin.html` + `admin.js` — página exclusiva do admin (2 passos)
- `style.css` — visual mobile-first
- `config.js` — chaves do Supabase
- `supabase/schema.sql` — tabelas + RLS
