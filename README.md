# Intenções de Missa — SaaS Multi-Paróquia

Sistema para registro e gerenciamento de intenções de missa, com disparo automático de PDF por e-mail.

## Arquitetura

| Componente | Tecnologia | Deploy |
|------------|-----------|--------|
| **Web** | Next.js 14 (App Router) | Vercel |
| **API** | NestJS + TypeScript | Railway |
| **Worker** | Node.js + pg-boss | Railway |
| **Banco** | PostgreSQL | Railway |
| **Storage** | AWS S3 | Amazon |
| **E-mail** | SMTP | MailerSend |

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
git clone https://github.com/andrelealpb/intencoesmissa.git
cd intencoesmissa
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

---

## Deploy em Produção

### 1. Railway (API + Worker + PostgreSQL)

#### 1.1 Criar projeto

1. Acesse [railway.app](https://railway.app) e faça login com GitHub
2. Clique em **"New Project"**

#### 1.2 Adicionar PostgreSQL

1. No projeto, clique **"+ New"** → **"Database"** → **"PostgreSQL"**
2. Após criado, vá em **Variables** → copie o valor de `DATABASE_URL`

#### 1.3 Serviço API

1. Clique **"+ New"** → **"GitHub Repo"** → selecione `andrelealpb/intencoesmissa`
2. Configurações:
   - **Root Directory**: `apps/api`
   - **Build Command**: `cd ../.. && pnpm install && pnpm db:generate && pnpm build:api`
   - **Start Command**: `cd ../.. && pnpm db:migrate:deploy && node apps/api/dist/main.js`
3. Variáveis de ambiente:

   | Variável | Valor |
   |----------|-------|
   | `DATABASE_URL` | *(referência ao Postgres do Railway)* |
   | `JWT_SECRET` | *(string segura — configurada nas variáveis do Railway)* |
   | `PORT` | `3001` |
   | `CORS_ORIGINS` | `https://SEU-APP.vercel.app` |
   | `SMTP_HOST` | `smtp.mailersend.net` |
   | `SMTP_PORT` | `587` |
   | `SMTP_USER` | *(usuário SMTP do MailerSend)* |
   | `SMTP_PASS` | *(senha SMTP do MailerSend)* |
   | `SMTP_FROM` | `noreply@seu-dominio-verificado.com` |
   | `S3_ENDPOINT` | `https://s3.REGIAO.amazonaws.com` |
   | `S3_REGION` | *(região do seu bucket, ex: us-east-1)* |
   | `S3_BUCKET` | *(nome do bucket)* |
   | `S3_ACCESS_KEY_ID` | *(chave de acesso IAM)* |
   | `S3_SECRET_ACCESS_KEY` | *(chave secreta IAM)* |

#### 1.4 Serviço Worker

1. Clique **"+ New"** → **"GitHub Repo"** → mesmo repo
2. Configurações:
   - **Root Directory**: `apps/worker`
   - **Build Command**: `cd ../.. && pnpm install && pnpm db:generate && pnpm build:worker`
   - **Start Command**: `node apps/worker/dist/main.js`
3. Variáveis de ambiente: mesmas de `DATABASE_URL`, `SMTP_*` e `S3_*` da API

#### 1.5 Rodar seed (uma vez)

No serviço da API, abra o terminal (aba "Shell") e execute:
```bash
cd ../.. && pnpm db:seed
```

### 2. Vercel (Frontend Web)

1. Acesse [vercel.com](https://vercel.com) e faça login com GitHub
2. Clique **"Add New..."** → **"Project"**
3. Selecione o repo `andrelealpb/intencoesmissa`
4. Configurações:
   - **Root Directory**: `apps/web`
   - **Framework Preset**: Next.js (auto-detectado)
5. Variáveis de ambiente:

   | Variável | Valor |
   |----------|-------|
   | `NEXT_PUBLIC_API_URL` | `https://SUA-API.railway.app` |
   | `NEXTAUTH_SECRET` | *(mesma string segura usada no JWT ou outra)* |
   | `NEXTAUTH_URL` | `https://SEU-APP.vercel.app` |

6. Clique **"Deploy"**

### 3. MailerSend (SMTP)

Plataforma utilizada: [MailerSend](https://www.mailersend.com)

1. Criar conta em mailersend.com
2. Verificar domínio de envio (DNS: SPF, DKIM, DMARC)
3. Em **Domains** → selecionar domínio → aba **SMTP**
4. Copiar credenciais:
   - Host: `smtp.mailersend.net`
   - Port: `587`
   - Username e Password gerados pelo MailerSend
5. Configurar `SMTP_FROM` como um remetente do domínio verificado

### 4. AWS S3 (Storage)

Plataforma utilizada: [Amazon S3](https://aws.amazon.com/s3/)

1. Criar bucket no S3 (ex: `missas-intencoes-prod`)
2. Região: escolher a mais próxima (ex: `sa-east-1` para São Paulo)
3. Criar IAM user com política de acesso ao bucket:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "s3:PutObject",
           "s3:GetObject",
           "s3:DeleteObject"
         ],
         "Resource": "arn:aws:s3:::SEU-BUCKET-NAME/*"
       }
     ]
   }
   ```

4. Gerar Access Key e Secret Key para o IAM user
5. Endpoint S3: `https://s3.REGIAO.amazonaws.com`

### Estrutura de armazenamento no S3

```
SEU-BUCKET/
  parishes/{parishId}/logo.png          # Logomarca da paróquia
  dispatches/{parishId}/{YYYYMMDD}/{HHmm}.pdf  # PDFs dos disparos
```

---

## Testar disparo manualmente

```bash
# Via API (autenticado como admin):
curl -X POST https://SUA-API.railway.app/admin/dispatches/run-now \
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
