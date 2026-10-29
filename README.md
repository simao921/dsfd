# Obragoito — quatro sites e uma API

Projeto React com quatro sites independentes: site público, administração, clientes e trabalhadores. Os três portais têm sessões seguras e ligam-se ao mesmo projeto Supabase. As credenciais e a password do primeiro administrador não estão incluídas no ZIP.

## Preparar o Supabase e criar o primeiro administrador

1. Instala as dependências e cria a configuração local:

   ```bash
   pnpm install --frozen-lockfile
   cp .env.example .env
   ```

2. Preenche `.env` com `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`. A chave `SUPABASE_SERVICE_ROLE_KEY` deve permanecer apenas no servidor e no teu computador; nunca a coloques no browser nem num repositório público.

3. No SQL Editor do teu projeto Supabase, executa primeiro `supabase/migrations/20261026174500_secure_project_portal.sql` e depois `supabase/migrations/20261029142831_add_daily_worker_activity_reports.sql`. A primeira migração cria o esquema, permissões RLS e o bucket privado. A segunda guarda o estado declarado nos relatórios e os fechos diários. O SQL não cria utilizadores de autenticação.

   A sintaxe foi validada localmente, mas a migração não foi executada nem comparada com o estado remoto do teu projeto. Antes de executar, confirma que não existem tabelas, tipos, funções ou políticas com os mesmos nomes. A migração é transacional: conflitos provocam rollback; não contém `DROP`, `TRUNCATE` nem eliminação de dados.

4. Depois de a migração terminar, executa este comando na raiz do projeto para criar o administrador. A password forte é gerada na hora, apresentada uma vez no terminal e nunca guardada no código. O primeiro acesso exige a sua alteração.

   ```bash
   node scripts/create-admin.mjs --name "Pedro Patinha" --email "patinhapedro21@gmail.com"
   ```

   Copia a password apresentada e entrega-a ao Pedro por um canal seguro. Se o endereço já existir no Supabase Auth, o comando falha sem mudar a password dessa conta.

## Executar em localhost (macOS)

Requisitos: Node.js 22 ou superior e pnpm 11. Depois de configurares `.env`, inicia a API e os quatro sites:

```bash
pnpm dev
```

- Público: `http://localhost:3000/`
- Administração: `http://localhost:3001/`
- Clientes: `http://localhost:3002/`
- Trabalhadores: `http://localhost:3003/`
- API: `http://localhost:4000/`

No desenvolvimento local, deixa `VITE_API_ORIGIN` vazio para usar o proxy Vite e mantém `COOKIE_SECURE=false`. Em Vercel/HTTPS, define `COOKIE_SECURE=true`.

## Publicar na Vercel

Os sites têm configurações próprias em `apps/public/vercel.json`, `apps/admin/vercel.json`, `apps/clients/vercel.json` e `apps/workers/vercel.json`. A API Express é servida por `api/[...path].ts`, uma função Vercel explícita para todas as rotas `/api/*`. Cria **cinco projetos Vercel separados a partir do mesmo repositório**: quatro estáticos e um para a API. Nos quatro sites, define o Root Directory respetivo (`apps/public`, `apps/admin`, `apps/clients` ou `apps/workers`) e ativa a inclusão dos ficheiros partilhados fora dessa pasta, para que o build possa ler `packages/` e a configuração pnpm da raiz. A pasta de saída de cada site é `dist`.

Para a API, usa a raiz do repositório como Root Directory. Associa os domínios `obragoito.pt`, `gestao.obragoito.pt`, `clientes.obragoito.pt`, `equipa.obragoito.pt` e `api.obragoito.pt` aos projetos correspondentes e aponta o DNS no Vercel. Define `VITE_API_ORIGIN=https://api.obragoito.pt` nas variáveis de build dos quatro sites.

No projeto da API Vercel, adiciona como variáveis **server-side** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` e `CRON_SECRET`. Define `COOKIE_SECURE=true`. Gera `CRON_SECRET` como uma string aleatória com pelo menos 16 caracteres; a Vercel envia-a no cabeçalho das chamadas Cron. Não uses o prefixo `VITE_` em chaves privadas. Para previews `*.vercel.app`, acrescenta as origens permitidas à variável `ALLOWED_ORIGINS` da API.

Os dois Cron Jobs da API representam 23:59 UTC no inverno e 22:59 UTC no horário de verão. A função só cria o fecho quando a hora local é 23 em `Europe/Lisbon`, cobrindo a mudança de hora. No plano Pro a Vercel executa na precisão do minuto; no Hobby a execução pode ocorrer em qualquer minuto da hora 23, por isso o fecho é aproximado e não garantido exatamente às 23:59. Os jobs Cron executam apenas no deploy de produção.

A Vercel limita o corpo de pedidos às Functions a 4,5 MB; os builds Vercel deste projeto limitam documentos a 4 MB para deixar margem ao multipart. Em localhost, o limite é 15 MB. O ditado é tratado pelo browser, sem enviar áudio ao servidor da Obragoito.

Os passos acima preparam o repositório, mas não fazem deploy nem alteram DNS. Confirma as definições de cada projeto e variáveis no Dashboard Vercel antes de publicar. Referências: [Monorepos Vercel](https://vercel.com/docs/monorepos), [Express na Vercel](https://vercel.com/docs/frameworks/backend/express), [vercel.json](https://vercel.com/docs/project-configuration/vercel-json) e [limites das Functions](https://vercel.com/docs/functions/limitations).

## Variáveis locais e validação

- `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`: ligação ao projeto Supabase único; service role apenas no servidor.
- `VITE_API_ORIGIN`: vazio em localhost; origem pública da API, por exemplo `https://api.obragoito.pt`, nos builds dos sites Vercel.
- `CRON_SECRET`: segredo server-side usado para proteger o fecho diário dos trabalhadores.
- `VITE_UPLOAD_LIMIT_MB`: 15 em localhost; os comandos de build Vercel definem 4.

```bash
pnpm typecheck
pnpm build
```

As migrações e testes SQL estão em `supabase/`. Não há clientes, trabalhadores ou obras fictícios.
