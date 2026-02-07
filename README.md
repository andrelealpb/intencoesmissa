# Intenções de Missa — SaaS Multi-Paróquia

Sistema para registro e gerenciamento de intenções de missa, com disparo automático de PDF por e-mail.

## Arquitetura

| Componente | Tecnologia | Deploy |
|------------|-----------|--------|
| **Web** | Next.js 14 (App Router) | Vercel |
| **API** | NestJS + TypeScript | Railway |
| **Worker** | Node.js + pg-boss | Railway |
| **Banco** | PostgreSQL | Railway |
| **Storage** | S3 / Cloudflare R2 | Cloud |

```
apps/
  web/        → Frontend (Vercel)
  api/        → Backend REST API (Railway)
  worker/     → Jobs de disparo (Railway)
packages/
  shared/     → Types, Zod schemas, utils
  tsconfig/   → Configs TypeScript compartilhadas
  eslint-config/
prisma/
  schema.prisma
  seed.ts
```

## Pré-requisitos

- Node.js >= 20
- pnpm >= 9
- PostgreSQL 16

## Setup Local

### 1. Clonar e instalar

```bash
git clone <repo-url>
cd missas-intencoes
pnpm install
```

### 2. Configurar variáveis de ambiente

```bash
# Raiz (para Prisma)
cp .env.example .env
# Edite DATABASE_URL

# API
cp apps/api/.env.example apps/api/.env
# Edite JWT_SECRET, SMTP_*, S3_*

# Web
cp apps/web/.env.example apps/web/.env
# Edite NEXT_PUBLIC_API_URL, NEXTAUTH_SECRET
```

### 3. Banco de dados

```bash
# Gerar Prisma Client
pnpm db:generate

# Rodar migrations
pnpm db:migrate:dev

# Seed (paróquia exemplo + admin)
pnpm db:seed
```

### 4. Rodar localmente

```bash
# Em terminais separados:
pnpm dev:api      # API em http://localhost:3001
pnpm dev:web      # Web em http://localhost:3000
pnpm dev:worker   # Worker processando jobs
```

## Usuários do Seed

| Email | Senha | Papel |
|-------|-------|-------|
| `superadmin@missas.com` | `Admin@123` | Super Admin |
| `admin@santanna.com` | `Admin@123` | Admin Paróquia |

## Deploy

### Railway (API + Worker + Postgres)

1. **Criar projeto no Railway**
2. **Adicionar PostgreSQL** como serviço — copiar `DATABASE_URL`
3. **Criar serviço API**:
   - Source: GitHub repo
   - Root directory: `apps/api`
   - Build: `pnpm install && pnpm db:generate && pnpm build:api`
   - Start: `pnpm db:migrate:deploy && node apps/api/dist/main.js`
   - Variáveis de ambiente:

     | Variável | Valor |
     |----------|-------|
     | `DATABASE_URL` | (do Postgres Railway) |
     | `JWT_SECRET` | (gerar string segura) |
     | `CORS_ORIGINS` | `https://seu-app.vercel.app` |
     | `SMTP_HOST` | (seu servidor SMTP) |
     | `SMTP_PORT` | `587` |
     | `SMTP_USER` | (usuário SMTP) |
     | `SMTP_PASS` | (senha SMTP) |
     | `SMTP_FROM` | `noreply@seudominio.com` |
     | `S3_ENDPOINT` | (endpoint S3/R2) |
     | `S3_REGION` | `auto` (R2) ou região AWS |
     | `S3_BUCKET` | `missas-intencoes` |
     | `S3_ACCESS_KEY_ID` | (chave de acesso) |
     | `S3_SECRET_ACCESS_KEY` | (chave secreta) |

4. **Criar serviço Worker**:
   - Source: GitHub repo
   - Root directory: `apps/worker`
   - Build: `pnpm install && pnpm db:generate && pnpm build:worker`
   - Start: `node apps/worker/dist/main.js`
   - Mesmas variáveis de ambiente do API (DATABASE_URL, SMTP_*, S3_*)

### Vercel (Web)

1. **Importar projeto** do GitHub
2. **Root Directory**: `apps/web`
3. **Framework Preset**: Next.js
4. **Variáveis de ambiente**:

   | Variável | Valor |
   |----------|-------|
   | `NEXT_PUBLIC_API_URL` | `https://sua-api.railway.app` |
   | `NEXTAUTH_SECRET` | (gerar string segura) |
   | `NEXTAUTH_URL` | `https://seu-app.vercel.app` |

### Storage (S3 / Cloudflare R2)

1. **Cloudflare R2** (recomendado — grátis até 10GB):
   - Criar bucket `missas-intencoes`
   - Gerar API Token com permissão R2
   - Endpoint: `https://<account-id>.r2.cloudflarestorage.com`
2. **AWS S3**:
   - Criar bucket com nome desejado
   - Criar IAM user com política para o bucket
   - Usar região e endpoint padrão

### Rodar migrations em produção

```bash
# Via Railway CLI ou release command:
npx prisma migrate deploy --schema=prisma/schema.prisma
```

## Testar disparo manualmente

```bash
# Via API (autenticado como admin):
curl -X POST https://sua-api.railway.app/admin/dispatches/run-now \
  -H "Authorization: Bearer <token>"
```

## Estrutura de APIs

### Público (sem auth)
- `GET /public/parishes/:slug`
- `GET /public/parishes/:slug/mass-options?date=YYYY-MM-DD`
- `GET /public/parishes/:slug/intention-types?group=`
- `GET /public/parishes/:slug/limits`
- `POST /public/parishes/:slug/requests`

### Auth
- `POST /auth/login`

### Admin Paróquia (JWT PARISH_ADMIN)
- `GET/PUT /admin/parish/profile`
- `POST/DELETE /admin/parish/logo`
- `GET/PUT /admin/settings`
- `CRUD /admin/masses/schedules`
- `CRUD /admin/masses/exceptions`
- `CRUD /admin/intention-types`
- `CRUD /admin/emoluments`
- `GET /admin/requests`
- `GET /admin/dispatches`
- `GET /admin/dispatches/:id/download`
- `GET /admin/dashboard`
- `POST /admin/dispatches/run-now`

### Super Admin (JWT SUPER_ADMIN)
- `CRUD /sa/parishes`
- `CRUD /sa/users`

## Licença

Proprietário — Todos os direitos reservados.
