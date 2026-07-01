# Intenções de Missa — SaaS Multi-Paróquia

Sistema para registro e gerenciamento de intenções de missa, com despacho automático de PDF por e-mail e WhatsApp.

> **Documentação completa**: [`docs/DOCUMENTATION.md`](docs/DOCUMENTATION.md)

## Arquitetura

| Componente | Tecnologia | Deploy |
|------------|-----------|--------|
| **Web** | Next.js 14 (App Router) | Vercel |
| **API** | NestJS + TypeScript | Railway |
| **Worker** | Node.js + pg-boss | Railway |
| **Banco** | PostgreSQL 16 | Railway |
| **Storage** | AWS S3 | Amazon |
| **E-mail** | Brevo SMTP API | Brevo |
| **WhatsApp** | Z-API | Z-API |

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
  migrations/   → 11 migrações
docs/
  DOCUMENTATION.md  → Documentação completa
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
# Edite JWT_SECRET, BREVO_API_KEY, SMTP_*, S3_*

# Web
cp apps/web/.env.example apps/web/.env
# Edite NEXT_PUBLIC_API_URL, NEXTAUTH_SECRET

# Worker
cp apps/worker/.env.example apps/worker/.env
# Edite DATABASE_URL, BREVO_API_KEY, SMTP_*, S3_*
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

## Funcionalidades

### Formulário Público (`/p/{slug}/form`)
- Formulário multi-step para fiéis registrarem intenções
- Seleção de data, horário, grupo e tipo de intenção
- Campos dinâmicos conforme o tipo (falecido, famílias, complemento, observações)
- Sugestão de oferta com PIX (QR Code + chave copiável)

### Painel Admin (`/admin`)
- Dashboard com estatísticas e gráficos
- Gestão de perfil da paróquia (dados, logo, PIX, destinatários)
- Horários de missa regulares e excepcionais
- Tipos de intenção com campos configuráveis
- Emolumentos (valores sugeridos por escopo)
- Avisos que aparecem no PDF de despacho
- Visualização de pedidos
- Gestão de despachos (disparar, reenviar, reabrir, baixar PDF)
- Link público com QR Code para compartilhar
- Integração WhatsApp (Z-API): status de conexão, grupos, despacho

### Super Admin (`/sa`)
- Gestão multi-tenant de paróquias
- CRUD de usuários com roles (PARISH_ADMIN, SUPER_ADMIN)
- Avisos globais por paróquia

### Despacho Automático (Worker)
- Cron a cada 1 minuto verifica missas próximas
- Gera PDF com intenções agrupadas + avisos
- Envia por e-mail (Brevo) e WhatsApp (Z-API)
- Resumo separado para o pároco (intenções marcadas com `sendToPastor`)
- Suporte a despacho para grupos de WhatsApp

---

## Integrações

### WhatsApp (Z-API)
Credenciais armazenadas por paróquia no banco de dados:
- **Instance ID** + **Token** + **Client-Token** por paróquia
- Verificação automática de conexão na UI
- Envio de PDF para telefones individuais e grupos
- Listagem de grupos para seleção fácil

### E-mail (Brevo)
- API SMTP Brevo para envio transacional
- PDF de intenções como anexo
- Resumo do pároco em e-mail separado

### Armazenamento (AWS S3)
- Upload de logos, QR Codes PIX e PDFs de despacho
- URLs pré-assinadas com expiração
- Suporte a endpoints S3-compatíveis (MinIO)

---

## Deploy em Produção

### 1. Railway (API + Worker + PostgreSQL)

#### 1.1 Criar projeto

1. Acesse [railway.app](https://railway.app) e faça login com GitHub
2. Clique em **"New Project"**

#### 1.2 Adicionar PostgreSQL

1. No projeto, clique **"+ New"** → **"Database"** → **"PostgreSQL"**
2. Após criado, vá em **Variables** → copie o valor de `DATABASE_URL`

#### 1.3 Serviço API (usa Dockerfile)

1. Clique **"+ New"** → **"GitHub Repo"** → selecione `andrelealpb/intencoesmissa`
2. Configurações:
   - **Root Directory**: `.` (raiz do repo — **NÃO** colocar `apps/api`)
   - **Builder**: Docker
   - **Dockerfile Path**: `Dockerfile.api`
3. Variáveis de ambiente:

   | Variável | Valor |
   |----------|-------|
   | `DATABASE_URL` | *(referência ao Postgres do Railway)* |
   | `JWT_SECRET` | *(string segura)* |
   | `PORT` | `3001` |
   | `CORS_ORIGINS` | `https://SEU-APP.vercel.app` |
   | `BREVO_API_KEY` | *(API key do Brevo)* |
   | `SMTP_FROM` | `noreply@seu-dominio-verificado.com` |
   | `SMTP_FROM_NAME` | `Intenções de Missa` |
   | `S3_REGION` | *(região do bucket, ex: sa-east-1)* |
   | `S3_BUCKET` | *(nome do bucket)* |
   | `S3_ACCESS_KEY_ID` | *(chave de acesso IAM)* |
   | `S3_SECRET_ACCESS_KEY` | *(chave secreta IAM)* |

#### 1.4 Serviço Worker (usa Dockerfile)

1. Clique **"+ New"** → **"GitHub Repo"** → mesmo repo
2. Configurações:
   - **Root Directory**: `.` (raiz do repo — **NÃO** colocar `apps/worker`)
   - **Builder**: Docker
   - **Dockerfile Path**: `Dockerfile.worker`
3. Variáveis de ambiente: mesmas de `DATABASE_URL`, `BREVO_*`, `SMTP_*` e `S3_*` da API

> **IMPORTANTE**: Railway com monorepo pnpm requer Dockerfiles porque o Nixpacks padrão
> não detecta pnpm corretamente. Os Dockerfiles na raiz do repo já estão configurados.

#### 1.5 Rodar seed (uma vez)

No serviço da API, abra o terminal (aba "Shell") e execute:
```bash
pnpm db:seed
```

### 2. Vercel (Frontend Web)

1. Acesse [vercel.com](https://vercel.com) e faça login com GitHub
2. Clique **"Add New..."** → **"Project"**
3. Selecione o repo `andrelealpb/intencoesmissa`
4. Configurações:
   - **Root Directory**: `.` (raiz do repo — **NÃO** colocar `apps/web`)
   - **Framework Preset**: Next.js (auto-detectado)
5. Variáveis de ambiente:

   | Variável | Valor |
   |----------|-------|
   | `NEXT_PUBLIC_API_URL` | `https://SUA-API.railway.app` |
   | `NEXTAUTH_SECRET` | *(string segura)* |
   | `NEXTAUTH_URL` | `https://SEU-APP.vercel.app` |

6. Clique **"Deploy"**

### 3. Brevo (E-mail)

1. Criar conta em [brevo.com](https://www.brevo.com)
2. Verificar domínio de envio (DNS: SPF, DKIM, DMARC)
3. Gerar API key em **SMTP & API** → **API Keys**
4. Configurar `SMTP_FROM` como remetente do domínio verificado

### 4. AWS S3 (Storage)

1. Criar bucket no S3 (ex: `missas-intencoes-prod`)
2. Região: `sa-east-1` (São Paulo) recomendado
3. Criar IAM user com política de acesso:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:HeadBucket"],
         "Resource": [
           "arn:aws:s3:::SEU-BUCKET-NAME",
           "arn:aws:s3:::SEU-BUCKET-NAME/*"
         ]
       }
     ]
   }
   ```

4. Gerar Access Key e Secret Key para o IAM user

### 5. Z-API (WhatsApp) — Opcional

Configuração feita por paróquia via painel admin:
1. Criar instância em [z-api.io](https://z-api.io)
2. Obter Instance ID, Token e Client-Token
3. No painel admin da paróquia, preencher os campos Z-API
4. Conectar o WhatsApp via QR Code na plataforma Z-API
5. Verificar conexão no painel admin (verificação automática)

---

## Estrutura de APIs

### Público (sem auth)
- `GET /public/parishes/:slug` — Dados da paróquia
- `GET /public/parishes/:slug/mass-options?date=` — Horários disponíveis
- `GET /public/parishes/:slug/intention-types?group=` — Tipos de intenção
- `GET /public/parishes/:slug/limits` — Limites e emolumentos
- `POST /public/parishes/:slug/requests` — Registrar intenção

### Auth
- `POST /auth/login` — Login (email + senha → JWT)

### Admin Paróquia (JWT PARISH_ADMIN)
- `GET/PUT /admin/parish/profile` — Perfil da paróquia
- `POST/DELETE /admin/parish/logo` — Logo
- `POST/DELETE /admin/parish/pix-qrcode` — QR Code PIX
- `GET/PUT /admin/settings` — Configurações
- `CRUD /admin/masses/schedules` — Horários regulares
- `CRUD /admin/masses/exceptions` — Exceções
- `CRUD /admin/intention-types` — Tipos de intenção
- `CRUD /admin/emoluments` — Emolumentos
- `GET /admin/requests` — Pedidos
- `GET /admin/dispatches` — Despachos
- `GET /admin/dispatches/next-mass` — Próxima missa pendente
- `GET /admin/dispatches/:id/details` — Detalhes do despacho
- `GET /admin/dispatches/:id/download` — Download PDF
- `POST /admin/dispatches/:id/reopen` — Reabrir despacho
- `POST /admin/dispatches/:id/resend` — Reenviar e-mail
- `POST /admin/dispatches/run-now` — Disparar manualmente
- `CRUD /admin/notices` — Avisos
- `GET /admin/whatsapp/status` — Status da conexão WhatsApp
- `GET /admin/whatsapp/groups` — Grupos do WhatsApp
- `GET /admin/dashboard` — Dashboard com estatísticas

### Super Admin (JWT SUPER_ADMIN)
- `CRUD /sa/parishes` — Paróquias
- `CRUD /sa/users` — Usuários
- `CRUD /sa/parishes/:parishId/notices` — Avisos por paróquia

### Health
- `GET /health` — Health check geral
- `GET /health/db` — Banco
- `GET /health/s3` — S3
- `GET /health/email` — Brevo

---

## Testar disparo manualmente

```bash
# Via API (autenticado como admin):
curl -X POST https://SUA-API.railway.app/admin/dispatches/run-now \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"massTime": "08:00"}'
```

## Licença

Proprietário — Todos os direitos reservados.
