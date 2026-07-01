# Intenções de Missa — Documentação Completa

Sistema SaaS multi-tenant para gestão de intenções de missa em paróquias católicas, com despacho automatizado de PDFs por e-mail e WhatsApp.

---

## Sumário

1. [Visão Geral](#1-visão-geral)
2. [Arquitetura e Stack](#2-arquitetura-e-stack)
3. [Estrutura do Monorepo](#3-estrutura-do-monorepo)
4. [Banco de Dados](#4-banco-de-dados)
5. [API REST (apps/api)](#5-api-rest-appsapi)
6. [Worker (apps/worker)](#6-worker-appsworker)
7. [Frontend Web (apps/web)](#7-frontend-web-appsweb)
8. [Pacote Compartilhado (packages/shared)](#8-pacote-compartilhado-packagesshared)
9. [Integração WhatsApp (Z-API)](#9-integração-whatsapp-z-api)
10. [Integração E-mail (Brevo)](#10-integração-e-mail-brevo)
11. [Armazenamento S3](#11-armazenamento-s3)
12. [Geração de PDF](#12-geração-de-pdf)
13. [Deploy e Infraestrutura](#13-deploy-e-infraestrutura)
14. [Variáveis de Ambiente](#14-variáveis-de-ambiente)
15. [Fluxo Principal: Pedido → Despacho](#15-fluxo-principal-pedido--despacho)
16. [Plano de Integração WhatsApp](#16-plano-de-integração-whatsapp)

---

## 1. Visão Geral

O sistema permite que fiéis enviem intenções de missa pela internet, e que administradores de paróquias gerenciem horários, tipos de intenção, emolumentos e despachos automatizados.

### Funcionalidades principais

- **Formulário público** para fiéis registrarem intenções de missa
- **Painel administrativo** para gestão da paróquia (missas, tipos de intenção, emolumentos, avisos)
- **Despacho automático** de PDF com as intenções X minutos antes de cada missa
- **Envio multicanal**: e-mail (Brevo) + WhatsApp (Z-API) para destinatários e grupos
- **Resumo para o pároco**: PDF separado com intenções marcadas como "enviar ao pároco"
- **Super Admin**: gestão de múltiplas paróquias e usuários
- **QR Code PIX** para sugestão de oferta

### Perfis de Usuário

| Perfil | Descrição | Acesso |
|--------|-----------|--------|
| **Fiel** | Submete intenções via formulário público | `/p/{slug}/form` |
| **Admin Paroquial** | Gerencia uma paróquia específica | `/admin/*` |
| **Super Admin** | Gerencia todas as paróquias e usuários | `/sa/*` |

---

## 2. Arquitetura e Stack

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│   Frontend   │────▶│   API REST  │────▶│  PostgreSQL   │
│  (Next.js)   │     │  (NestJS)   │     │  (Prisma ORM) │
│  Vercel      │     │  Railway    │     │  Railway       │
└─────────────┘     └──────┬──────┘     └───────┬───────┘
                           │                     │
                    ┌──────┴──────┐              │
                    │   Worker    │──────────────┘
                    │  (pg-boss)  │
                    │  Railway    │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │  Brevo   │ │  Z-API   │ │  AWS S3  │
        │ (E-mail) │ │(WhatsApp)│ │  (PDFs)  │
        └──────────┘ └──────────┘ └──────────┘
```

### Stack Tecnológica

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| Frontend | Next.js (App Router) | 14.1 |
| UI | React + Tailwind CSS | 18.2 / 3.4 |
| Autenticação Frontend | NextAuth (JWT) | 4.24 |
| API | NestJS + Express | 10.3 |
| Autenticação API | Passport JWT | — |
| ORM | Prisma | 5.10 |
| Banco de Dados | PostgreSQL | 16 |
| Fila de Jobs | pg-boss | 9.0 |
| PDF | PDFKit | 0.14 |
| E-mail | Brevo SMTP API | — |
| WhatsApp | Z-API | — |
| Armazenamento | AWS S3 | SDK 3.500 |
| Monorepo | pnpm workspaces | 9.15 |
| Runtime | Node.js | ≥ 20 |
| Linguagem | TypeScript | 5.4 |
| Validação | Zod | 3.22 |

---

## 3. Estrutura do Monorepo

```
intencoesmissa/
├── apps/
│   ├── api/                  # API REST (NestJS, porta 3001)
│   │   └── src/
│   │       ├── admin/        # Endpoints admin paroquial
│   │       ├── auth/         # Autenticação JWT
│   │       ├── health/       # Health checks
│   │       ├── prisma/       # Prisma service
│   │       ├── public/       # Endpoints públicos (sem auth)
│   │       ├── super-admin/  # Endpoints super admin
│   │       ├── app.module.ts
│   │       └── main.ts
│   ├── web/                  # Frontend (Next.js, porta 3000)
│   │   └── src/
│   │       ├── app/
│   │       │   ├── admin/    # Painel admin (14 páginas)
│   │       │   ├── sa/       # Painel super admin (4 páginas)
│   │       │   ├── p/[slug]/ # Formulário público
│   │       │   └── page.tsx  # Landing page
│   │       ├── components/   # Componentes UI reutilizáveis
│   │       └── lib/          # API client, auth config
│   └── worker/               # Worker de despacho (pg-boss)
│       └── src/
│           ├── dispatch.service.ts   # Lógica de despacho
│           ├── pdf.service.ts        # Geração de PDF
│           ├── email.service.ts      # Envio de e-mail
│           ├── whatsapp.service.ts   # Envio WhatsApp
│           ├── storage.service.ts    # Upload S3
│           └── main.ts              # Entry point + cron
├── packages/
│   ├── shared/               # Tipos, schemas Zod, utilitários
│   ├── tsconfig/             # Configurações TypeScript compartilhadas
│   └── eslint-config/        # Regras ESLint compartilhadas
├── prisma/
│   ├── schema.prisma         # Schema do banco
│   ├── seed.ts               # Dados iniciais
│   └── migrations/           # 11 migrações
├── Dockerfile.api
├── Dockerfile.worker
├── .github/workflows/ci.yml
├── pnpm-workspace.yaml
└── package.json
```

### Scripts Principais (raiz)

| Script | Descrição |
|--------|-----------|
| `pnpm dev:api` | Inicia API em modo desenvolvimento |
| `pnpm dev:web` | Inicia frontend em modo desenvolvimento |
| `pnpm dev:worker` | Inicia worker em modo desenvolvimento |
| `pnpm build` | Build de todos os pacotes |
| `pnpm db:migrate:dev` | Cria/aplica migrações (dev) |
| `pnpm db:migrate:deploy` | Aplica migrações (produção) |
| `pnpm db:seed` | Executa seed de dados |
| `pnpm db:generate` | Gera Prisma Client |
| `pnpm lint` | Lint de todos os pacotes |
| `pnpm typecheck` | Verificação de tipos |

---

## 4. Banco de Dados

### Diagrama de Modelos

```
Parish (1) ──── (1) ParishSettings
   │
   ├── (N) User
   ├── (N) MassSchedule
   ├── (N) MassException
   ├── (N) IntentionType ──── (N) Emolument
   │         │
   │         └── (N) RequestIntention
   │                    │
   ├── (N) Request ─────┘
   │
   ├── (N) DispatchBatch ──── (N) RequestIntention
   └── (N) Notice
```

### Enums

| Enum | Valores | Uso |
|------|---------|-----|
| `Role` | `SUPER_ADMIN`, `PARISH_ADMIN` | Perfil do usuário |
| `IntentionGroup` | `SUFRAGIO`, `SUPLICAS`, `ACAO_DE_GRACAS` | Grupo da intenção |
| `DispatchScope` | `PER_MASS`, `PER_DAY` | Escopo do despacho (por missa ou por dia) |
| `EmolumentScope` | `DEFAULT`, `GROUP`, `TYPE` | Escopo do emolumento |
| `RequestStatus` | `SUBMITTED`, `CANCELLED` | Status do pedido |
| `DispatchStatus` | `SENT`, `FAILED` | Status do despacho |

### Modelos

#### Parish (Paróquia)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | Chave primária |
| `slug` | String (unique) | Identificador URL-friendly |
| `parishName` | String | Nome da paróquia |
| `legalName` | String? | Razão social |
| `cnpj` | String? | CNPJ |
| `pastorName` | String? | Nome do pároco |
| `pastorEmail` | String? | E-mail do pároco (recebe resumo) |
| `pastorPhone` | String? | WhatsApp do pároco |
| `addressJson` | JSONB? | Endereço estruturado |
| `phonesJson` | JSONB? | Telefones da paróquia |
| `dispatchEmails` | String[] | E-mails que recebem o despacho |
| `dispatchPhones` | String[] | Telefones WhatsApp para despacho |
| `dispatchGroups` | String[] | IDs de grupos WhatsApp para despacho |
| `dispatchRecipients` | JSONB? | Destinatários estruturados `{name, email, phone}[]` |
| `logoUrl` | String? | URL assinada do logo |
| `logoStorageKey` | String? | Chave S3 do logo |
| `pixKey` | String? | Chave PIX |
| `pixQrCodeUrl` | String? | URL do QR Code PIX |
| `pixQrCodeStorageKey` | String? | Chave S3 do QR Code |
| `zapiInstanceId` | String? | ID da instância Z-API |
| `zapiToken` | String? | Token Z-API |
| `zapiClientToken` | String? | Client-Token Z-API |
| `zapiPhone` | String? | Telefone conectado no WhatsApp |

#### User (Usuário)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | Chave primária |
| `parishId` | UUID? | FK para Parish (null se Super Admin) |
| `email` | String (unique) | E-mail de login |
| `passwordHash` | String | Hash bcrypt da senha |
| `role` | Role | SUPER_ADMIN ou PARISH_ADMIN |
| `isActive` | Boolean | Conta ativa |

#### ParishSettings (Configurações)
| Campo | Tipo | Default | Descrição |
|-------|------|---------|-----------|
| `parishId` | UUID (PK) | — | FK para Parish (1:1) |
| `maxIntentionsPerRequest` | Int | 5 | Máximo de intenções por pedido |
| `dispatchMinutesBefore` | Int | 30 | Minutos antes da missa para despachar |
| `dispatchScope` | DispatchScope | PER_MASS | Um PDF por missa ou consolidado |
| `dispatchTimezone` | String | "America/Sao_Paulo" | Fuso horário |

#### MassSchedule (Horário de Missa Regular)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | Chave primária |
| `parishId` | UUID | FK para Parish |
| `weekday` | Int | 0=Domingo, 6=Sábado |
| `time` | String | Horário "HH:mm" |
| `isActive` | Boolean | Ativo |

#### MassException (Missa Excepcional)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | Chave primária |
| `parishId` | UUID | FK para Parish |
| `date` | Date | Data específica |
| `time` | String | Horário "HH:mm" |
| `title` | String? | Título (ex: "Missa de Natal") |
| `isActive` | Boolean | Ativo |

#### IntentionType (Tipo de Intenção)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | Chave primária |
| `parishId` | UUID | FK para Parish |
| `group` | IntentionGroup | SUFRAGIO, SUPLICAS ou ACAO_DE_GRACAS |
| `name` | String | Nome do tipo |
| `isActive` | Boolean | Ativo |
| `requiresDeceasedName` | Boolean | Exige nome do falecido |
| `requiresFamilyNames` | Boolean | Exige nomes das famílias |
| `opensOptionalNotes` | Boolean | Abre campo de observações |
| `requiresComplement` | Boolean | Exige complemento |
| `sendToPastor` | Boolean | Incluir no resumo do pároco |

#### Emolument (Emolumento / Valor Sugerido)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | Chave primária |
| `parishId` | UUID | FK para Parish |
| `scope` | EmolumentScope | DEFAULT, GROUP ou TYPE |
| `group` | IntentionGroup? | Grupo (quando scope=GROUP) |
| `intentionTypeId` | UUID? | FK para IntentionType (quando scope=TYPE) |
| `suggestedValue` | Decimal(10,2) | Valor sugerido em R$ |
| `isActive` | Boolean | Ativo |

Prioridade de resolução: **TYPE > GROUP > DEFAULT**

#### Request (Pedido de Intenção)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | Chave primária |
| `parishId` | UUID | FK para Parish |
| `protocol` | String | Protocolo único (ex: "santanna-2024-000123") |
| `massDate` | Date | Data da missa |
| `massTime` | String | Horário da missa |
| `faithfulName` | String | Nome do fiel |
| `faithfulPhone` | String | Telefone do fiel |
| `status` | RequestStatus | SUBMITTED ou CANCELLED |

#### RequestIntention (Intenção Individual)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | Chave primária |
| `requestId` | UUID | FK para Request |
| `group` | IntentionGroup | Grupo da intenção |
| `intentionTypeId` | UUID | FK para IntentionType |
| `deceasedName` | String? | Nome do falecido |
| `familyNames` | String? | Nomes das famílias |
| `complement` | String? | Complemento |
| `notes` | String? | Observações |
| `suggestedValue` | Decimal? | Valor sugerido calculado |
| `offeredValue` | Decimal? | Valor oferecido pelo fiel |
| `dispatchedAt` | DateTime? | Data/hora do despacho |
| `dispatchBatchId` | UUID? | FK para DispatchBatch |

#### DispatchBatch (Lote de Despacho)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | Chave primária |
| `parishId` | UUID | FK para Parish |
| `scope` | DispatchScope | PER_MASS ou PER_DAY |
| `massDate` | Date | Data da missa |
| `massTime` | String? | Horário (null se PER_DAY) |
| `pdfStorageKey` | String | Chave S3 do PDF |
| `pdfUrl` | String? | URL assinada do PDF |
| `sentToEmails` | String[] | E-mails para os quais foi enviado |
| `sentToPhones` | String[] | Telefones WhatsApp para os quais foi enviado |
| `sentAt` | DateTime | Timestamp do envio |
| `status` | DispatchStatus | SENT ou FAILED |
| `errorMessage` | String? | Mensagem de erro (se FAILED) |

#### Notice (Aviso)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | Chave primária |
| `parishId` | UUID | FK para Parish |
| `subject` | String | Assunto do aviso |
| `description` | String | Descrição |
| `massTimes` | String[] | Horários de missa (vazio = todas) |
| `startDate` | Date? | Data de início da vigência |
| `endDate` | Date? | Data de fim da vigência |
| `isActive` | Boolean | Ativo |

### Migrações

| # | Nome | Descrição |
|---|------|-----------|
| 1 | `20240301000000_init` | Schema inicial completo |
| 2 | `20240302000000_add_pix_fields` | Campos PIX |
| 3 | `20240303000000_dispatch_minutes_before` | Config de timing do despacho |
| 4 | `20240304000000_add_notices` | Modelo de avisos |
| 5 | `20240305000000_add_pastor_email_and_send_to_pastor` | E-mail do pároco + flag sendToPastor |
| 6 | `20240306000000_cleanup_test_data` | Limpeza de dados de teste |
| 7 | `20240307000000_add_zapi_whatsapp_fields` | Campos Z-API WhatsApp |
| 8 | `20240308000000_add_dispatch_recipients` | Campo dispatchRecipients JSONB |
| 9 | `20240309000000_add_zapi_client_token` | Client-Token Z-API por paróquia |
| 10 | `20240310000000_add_sent_to_phones` | sentToPhones no DispatchBatch |
| 11 | `20240311000000_add_dispatch_groups` | Grupos de WhatsApp por paróquia |

### Seed (Dados Iniciais)

O seed (`prisma/seed.ts`) é idempotente (usa upsert) e cria:
- 1 Paróquia: "Paróquia Sant'Anna e São Joaquim"
- 1 Configuração: max 3 intenções, escopo PER_MASS
- 6 Horários de missa: Dom (8h, 10h, 18h), Qua 19h, Sex 19h, Sáb 18h
- 14 Tipos de intenção: 5 Sufrágio, 5 Súplicas, 4 Ação de Graças
- 3 Emolumentos: DEFAULT R$20, Sufrágio R$30, Súplicas R$15
- 2 Usuários: superadmin@missas.com (SUPER_ADMIN) + admin@santanna.com (PARISH_ADMIN)

---

## 5. API REST (apps/api)

### Configuração

- **Porta**: 3001 (configurável via `PORT`)
- **CORS**: origens configuráveis via `CORS_ORIGINS` (vírgula-separadas)
- **Rate Limiting Global**: 30 requisições / 60 segundos (ThrottlerModule)
- **Filtro de Erros**: ZodExceptionFilter retorna 400 com erros de validação por campo

### Autenticação

- **Estratégia**: JWT via Passport
- **Token**: Bearer token no header `Authorization`
- **Expiração**: 24 horas
- **Payload JWT**: `{ sub: userId, email, role, parishId }`
- **Senha**: bcrypt com 12 rounds

### Endpoints Públicos (`/public`)

Sem autenticação. Rate limiting específico no POST de pedidos (5 req/min).

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/public/parishes/:slug` | Dados da paróquia (nome, logo, PIX) |
| GET | `/public/parishes/:slug/mass-options?date=YYYY-MM-DD` | Horários de missa disponíveis para uma data |
| GET | `/public/parishes/:slug/intention-types?group=` | Tipos de intenção ativos (filtro por grupo opcional) |
| GET | `/public/parishes/:slug/limits` | Max intenções + emolumentos |
| POST | `/public/parishes/:slug/requests` | Registrar pedido de intenção |

**Lógica do POST /requests:**
1. Valida body com `createRequestSchema`
2. Verifica se a missa existe no horário (exceções ou agenda regular)
3. Verifica se a missa ainda não foi despachada
4. Valida contagem de intenções contra `maxIntentionsPerRequest`
5. Gera protocolo único: `{slug}-{ano}-{sequência}`
6. Resolve valor sugerido para cada intenção (TYPE > GROUP > DEFAULT)
7. Cria Request + RequestIntention em transação
8. Retorna `{ protocol }`

### Endpoints de Autenticação (`/auth`)

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/auth/login` | Login (email + senha → JWT) |

### Endpoints Admin Paroquial (`/admin`)

Protegidos por `JwtAuthGuard` + `RolesGuard(PARISH_ADMIN)`. Todas as operações verificam ownership da paróquia.

#### Perfil da Paróquia

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/admin/parish/profile` | Obter perfil da paróquia |
| PUT | `/admin/parish/profile` | Atualizar perfil (nome, contatos, Z-API, destinatários, grupos) |
| POST | `/admin/parish/logo` | Upload de logo (multipart, max 5MB) |
| DELETE | `/admin/parish/logo` | Remover logo |
| POST | `/admin/parish/pix-qrcode` | Upload QR Code PIX (multipart, max 5MB) |
| DELETE | `/admin/parish/pix-qrcode` | Remover QR Code PIX |

#### Configurações

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/admin/settings` | Obter configurações (cria defaults se não existir) |
| PUT | `/admin/settings` | Atualizar configurações |

#### Horários de Missa

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/admin/masses/schedules` | Listar horários regulares |
| POST | `/admin/masses/schedules` | Criar horário |
| PUT | `/admin/masses/schedules/:id` | Atualizar horário |
| DELETE | `/admin/masses/schedules/:id` | Remover horário |

#### Exceções de Missa

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/admin/masses/exceptions` | Listar exceções |
| POST | `/admin/masses/exceptions` | Criar exceção |
| PUT | `/admin/masses/exceptions/:id` | Atualizar exceção |
| DELETE | `/admin/masses/exceptions/:id` | Remover exceção |

#### Tipos de Intenção

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/admin/intention-types` | Listar tipos |
| POST | `/admin/intention-types` | Criar tipo |
| PUT | `/admin/intention-types/:id` | Atualizar tipo |
| DELETE | `/admin/intention-types/:id` | Remover tipo |

#### Emolumentos

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/admin/emoluments` | Listar emolumentos |
| POST | `/admin/emoluments` | Criar emolumento |
| PUT | `/admin/emoluments/:id` | Atualizar emolumento |
| DELETE | `/admin/emoluments/:id` | Remover emolumento |

#### Pedidos e Despachos

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/admin/requests` | Listar pedidos com intenções |
| GET | `/admin/dispatches` | Listar lotes de despacho |
| GET | `/admin/dispatches/next-mass` | Próxima missa com intenções pendentes (7 dias) |
| GET | `/admin/dispatches/:id/details` | Detalhes do lote com intenções |
| GET | `/admin/dispatches/:id/download` | URL assinada do PDF |
| POST | `/admin/dispatches/:id/reopen` | Reabrir despacho (reverter intenções para pendente) |
| POST | `/admin/dispatches/:id/resend` | Reenviar e-mail do despacho |
| POST | `/admin/dispatches/run-now` | Disparar despacho manual |

**Lógica do POST /dispatches/run-now:**
1. Busca intenções pendentes para a missa especificada
2. Gera PDF com PDFKit (cabeçalho + intenções agrupadas + avisos)
3. Upload do PDF para S3
4. Envia e-mail via Brevo para `dispatchEmails`
5. Se pároco com `sendToPastor`: gera PDF resumo, envia por e-mail
6. Se Z-API configurado: envia PDF por WhatsApp para phones + groups
7. Se pároco com WhatsApp: envia resumo por WhatsApp
8. Marca intenções como despachadas (`dispatchedAt` + `dispatchBatchId`)
9. Cria registro DispatchBatch (SENT ou FAILED)

#### Avisos

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/admin/notices` | Listar avisos |
| POST | `/admin/notices` | Criar aviso |
| PUT | `/admin/notices/:id` | Atualizar aviso |
| DELETE | `/admin/notices/:id` | Remover aviso |

#### WhatsApp

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/admin/whatsapp/status` | Status da conexão Z-API + telefone conectado |
| GET | `/admin/whatsapp/groups` | Listar grupos do WhatsApp |

#### Dashboard

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/admin/dashboard?from=&to=` | Estatísticas (total pedidos, intenções por grupo/tipo, horários mais demandados) |

### Endpoints Super Admin (`/sa`)

Protegidos por `JwtAuthGuard` + `RolesGuard(SUPER_ADMIN)`.

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/sa/parishes` | Listar paróquias com contadores |
| GET | `/sa/parishes/:id` | Detalhes de uma paróquia |
| POST | `/sa/parishes` | Criar paróquia (+ settings automáticos) |
| PUT | `/sa/parishes/:id` | Atualizar paróquia |
| DELETE | `/sa/parishes/:id` | Excluir paróquia |
| GET | `/sa/users` | Listar usuários |
| GET | `/sa/users/:id` | Detalhes do usuário |
| POST | `/sa/users` | Criar usuário (hash bcrypt) |
| PUT | `/sa/users/:id` | Atualizar usuário |
| DELETE | `/sa/users/:id` | Excluir usuário |
| GET | `/sa/parishes/:parishId/notices` | Listar avisos de uma paróquia |
| POST | `/sa/parishes/:parishId/notices` | Criar aviso |
| PUT | `/sa/notices/:id` | Atualizar aviso |
| DELETE | `/sa/notices/:id` | Excluir aviso |

### Endpoints de Saúde (`/health`)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/health` | Health check geral (DB + S3 + Email) |
| GET | `/health/db` | Teste de conectividade do banco |
| GET | `/health/s3` | Teste de acesso ao bucket S3 |
| GET | `/health/email` | Validação da API key Brevo |

---

## 6. Worker (apps/worker)

### Visão Geral

O worker é um processo Node.js que roda independentemente da API. Usa **pg-boss** como fila de jobs baseada em PostgreSQL.

### Cron Job: `check-dispatches`

- **Frequência**: A cada 1 minuto (`* * * * *`)
- **Timezone**: America/Sao_Paulo

### Fluxo de Verificação

```
check-dispatches (a cada 1 min)
    │
    ├── Converte hora UTC → São Paulo
    ├── Busca TODAS as paróquias com settings + horários + exceções
    │
    └── Para cada paróquia:
        ├── Lê dispatchMinutesBefore (default 30)
        ├── Determina missas do dia (exceções substituem horários regulares)
        │
        └── Para cada missa:
            ├── Se agora >= (horário - minutos_antes):
            │   ├── Verifica se já existe batch (SENT/FAILED → pula)
            │   └── processParishMass() → createBatch()
            └── Senão: ignora (ainda não é hora)
```

### Lógica do `createBatch()`

1. Busca intenções pendentes (`dispatchedAt = null`) para a missa
2. Se 0 intenções: cria batch SENT vazio (fecha a missa)
3. Download do logo da paróquia do S3 (non-blocking)
4. Busca avisos ativos (filtra por data e horário da missa)
5. **Gera PDF** via PdfService (intenções agrupadas + avisos)
6. **Upload S3** (non-blocking, continua se falhar)
7. **Envia e-mail** via Brevo para `dispatchEmails`
8. Status do batch: SENT se e-mail ok, FAILED se e-mail falhou
9. Atualiza `RequestIntention.dispatchedAt` e `dispatchBatchId`
10. Se `pastorEmail` + intenções com `sendToPastor`:
    - Gera PDF resumo do pároco
    - Envia por e-mail ao pároco
11. **WhatsApp** (non-blocking):
    - Envia PDF para `dispatchPhones` e `dispatchGroups`
    - Envia resumo do pároco para `pastorPhone`
    - Registra `sentToPhones` no batch

### Comportamento de Falha

| Componente | Falha | Impacto |
|-----------|-------|---------|
| E-mail | Falha | Batch marcado como FAILED |
| S3 Upload | Falha | Log de erro, despacho continua |
| WhatsApp | Falha | Log de erro, despacho continua |
| PDF Pastor | Falha | Log de erro, despacho principal não afetado |

---

## 7. Frontend Web (apps/web)

### Configuração

- **Framework**: Next.js 14 (App Router)
- **Porta**: 3000
- **Estilo**: Tailwind CSS com tema customizado (cor primária azul)
- **Autenticação**: NextAuth com Credentials Provider (JWT, 24h)
- **API Client**: `apiAuthFetch(path, token, options)` com Bearer token

### Páginas Públicas

#### Landing Page (`/`)
Página inicial com links para login admin e super admin.

#### Formulário Público (`/p/{slug}/form`)
Formulário multi-step para fiéis registrarem intenções:

**Passo 1 — Dados e Horário:**
- Nome completo (mínimo 2 palavras)
- Telefone (formato (XX) XXXXX-XXXX)
- Data da missa (calendário, mínimo hoje)
- Horário da missa (botões, mostra dias da semana, marca "Encerrada" se já despachada)

**Passo 2 — Intenções:**
- Adicionar até `maxIntentionsPerRequest` intenções
- Para cada intenção:
  - Grupo (Sufrágio, Súplicas, Ação de Graças)
  - Tipo (carregado dinamicamente pelo grupo)
  - Campos dinâmicos conforme configuração do tipo:
    - Nome do falecido (se `requiresDeceasedName`)
    - Nomes das famílias (se `requiresFamilyNames`)
    - Complemento (se `requiresComplement`)
    - Observações (se `opensOptionalNotes`)

**Passo 3 — Confirmação:**
- Mensagem de sucesso com protocolo
- Valor sugerido de oferta (calculado pela hierarquia de emolumentos)
- QR Code PIX + chave copiável
- Botão "Nova Intenção" para recomeçar

#### Sucesso (`/p/{slug}/success`)
Exibe protocolo e link para voltar.

### Painel Admin (`/admin/*`)

Protegido por NextAuth. Sidebar com navegação lateral (azul).

| Página | Rota | Funcionalidade |
|--------|------|---------------|
| Login | `/admin/login` | Autenticação por e-mail e senha |
| Dashboard | `/admin/dashboard` | KPIs, gráficos, tipos populares, horários demandados |
| Paróquia | `/admin/parish` | Perfil, logo, PIX, destinatários, Z-API, grupos WhatsApp |
| Configurações | `/admin/settings` | Max intenções, minutos antes, escopo de despacho |
| Missas | `/admin/masses` | Horários regulares (tabs) + exceções |
| Tipos de Intenção | `/admin/intention-types` | CRUD com filtro por grupo |
| Emolumentos | `/admin/emoluments` | Valores sugeridos por escopo (DEFAULT/GROUP/TYPE) |
| Avisos | `/admin/notices` | Avisos que aparecem no PDF de despacho |
| Pedidos | `/admin/requests` | Lista read-only com linhas expansíveis |
| Despachos | `/admin/dispatches` | Histórico, disparar manual, reenviar, reabrir |
| Link Público | `/admin/public-link` | URL + QR Code para compartilhar com fiéis |

#### Página da Paróquia (`/admin/parish`) — Detalhes

Seções do formulário:
1. **Dados Básicos**: nome, razão social, CNPJ
2. **Pároco**: nome, e-mail, telefone
3. **Logo**: upload/remoção de imagem
4. **Destinatários do Despacho**: lista de pessoas (nome + e-mail + telefone)
5. **PIX**: chave PIX + QR Code
6. **Integração WhatsApp (Z-API)**:
   - Instance ID, Token, Client-Token (campos de texto)
   - Verificação automática de conexão ao entrar na página
   - Alerta se desconectado ou erro
   - Telefone conectado (read-only)
   - Seleção de grupos do WhatsApp (botão "Buscar Grupos")

#### Página de Despachos (`/admin/dispatches`) — Detalhes

- **Tabela**: data, horário, status (Enviado/Falhou), canais (badges Email/WhatsApp), contagem, timestamp
- **Ações**: Visualizar (modal com intenções), Baixar PDF, Reenviar e-mail, Reabrir
- **Disparar Agora**: confirma próxima missa + contagem, gera e envia

### Painel Super Admin (`/sa/*`)

Protegido por NextAuth. Sidebar roxo.

| Página | Rota | Funcionalidade |
|--------|------|---------------|
| Login | `/sa/login` | Autenticação super admin |
| Paróquias | `/sa/parishes` | CRUD de paróquias |
| Usuários | `/sa/users` | CRUD de admins (role + paróquia) |
| Avisos | `/sa/notices` | Avisos por paróquia selecionada |

### Componentes UI

| Componente | Arquivo | Descrição |
|-----------|---------|-----------|
| Button | `components/ui/button.tsx` | Variantes: primary, secondary, danger, ghost. Loading state. |
| Input | `components/ui/input.tsx` | Com label, erro, hint. Focus ring. |
| Select | `components/ui/select.tsx` | Com label, erro, opções tipadas. |
| Card | `components/ui/card.tsx` | Container + StatCard para métricas. |
| PhoneInput | `components/phone-input.tsx` | Máscara (XX) XXXXX-XXXX. |
| Table | `components/ui/table.tsx` | Genérico, render functions por coluna. |

---

## 8. Pacote Compartilhado (packages/shared)

### Tipos (types.ts)

Enums TypeScript que espelham os enums do Prisma:
- `Role`, `IntentionGroup`, `DispatchScope`, `EmolumentScope`, `RequestStatus`, `DispatchStatus`

### Schemas Zod (schemas.ts)

| Schema | Campos Principais | Uso |
|--------|-------------------|-----|
| `phoneSchema` | Regex `(XX) XXXXX-XXXX` | Validação de telefone |
| `fullNameSchema` | Min 1 char, 2+ palavras | Nome completo do fiel |
| `createRequestSchema` | massDate, massTime, faithfulName, faithfulPhone, intentions[] | Criação de pedido |
| `loginSchema` | email, password | Login |
| `parishSettingsSchema` | maxIntentionsPerRequest, dispatchMinutesBefore, dispatchScope | Configurações |
| `intentionTypeSchema` | group, name, isActive, requires*, sendToPastor | Tipo de intenção |
| `massScheduleSchema` | weekday, time, isActive | Horário regular |
| `massExceptionSchema` | date, time, title?, isActive | Exceção de missa |
| `emolumentSchema` | scope, group?, intentionTypeId?, suggestedValue, isActive | Emolumento |
| `parishProfileSchema` | slug, parishName, cnpj?, pastorEmail?, dispatchEmails, zapiInstanceId?, ... | Perfil da paróquia |
| `noticeSchema` | subject, description, massTimes[], startDate?, endDate?, isActive | Aviso |

### Utilitários (utils.ts)

| Função | Descrição |
|--------|-----------|
| `generateProtocol(slug, sequence)` | Formato `AAA-YYYY-000123` |
| `formatPhone(phone)` | Converte para `(XX) XXXXX-XXXX` |
| `isValidPhone(phone)` | Valida regex |
| `isFullName(name)` | Verifica 2+ palavras |
| `truncateText(text, maxLen)` | Trunca com "..." |
| `formatDateBR(date)` | Formato DD/MM/YYYY |
| `formatTimeBR(time)` | Valida formato HH:mm |

---

## 9. Integração WhatsApp (Z-API)

### Configuração por Paróquia

Cada paróquia possui suas próprias credenciais Z-API armazenadas no banco:

| Campo | Descrição |
|-------|-----------|
| `zapiInstanceId` | ID da instância Z-API |
| `zapiToken` | Token de autenticação |
| `zapiClientToken` | Client-Token (header obrigatório) |
| `zapiPhone` | Telefone conectado (preenchido automaticamente) |

### Endpoints Z-API Utilizados

| Endpoint Z-API | Uso no Sistema |
|----------------|---------------|
| `GET /instances/{id}/token/{token}/status` | Verificar conexão |
| `GET /instances/{id}/token/{token}/get-phone-number` | Obter telefone (fallback) |
| `GET /instances/{id}/token/{token}/phone` | Obter telefone (fallback 2) |
| `GET /instances/{id}/token/{token}/groups` | Listar grupos do WhatsApp |
| `POST /instances/{id}/token/{token}/send-document/pdf` | Enviar PDF |
| `POST /instances/{id}/token/{token}/send-text` | Enviar texto |

### Headers

Todas as requisições incluem:
```
Client-Token: {zapiClientToken}
```

### Suporte a Grupos

- IDs de grupo no formato: `120363019502650977-group`
- A função `formatPhone()` detecta IDs com "-" e os envia sem formatação
- Grupos são selecionados na UI via botão "Buscar Grupos" que chama `/groups`

### Fluxo de Despacho WhatsApp

1. PDF principal → enviado para cada telefone em `dispatchPhones` e cada grupo em `dispatchGroups`
2. PDF resumo do pároco → enviado para `pastorPhone` (se configurado)
3. Telefones enviados registrados em `DispatchBatch.sentToPhones`
4. Falhas são logadas mas não bloqueiam o despacho

### Verificação de Conexão

Ao entrar na página `/admin/parish`:
1. Se `zapiInstanceId` e `zapiToken` preenchidos, chama `GET /admin/whatsapp/status`
2. Resposta inclui `connected: boolean` e `phone?: string`
3. Se desconectado: alerta vermelho com erro
4. Se conectado: campo "Telefone Conectado" preenchido (read-only)
5. O backend salva o telefone no campo `zapiPhone` da paróquia

---

## 10. Integração E-mail (Brevo)

### Configuração

| Variável | Descrição |
|----------|-----------|
| `BREVO_API_KEY` | Chave de API Brevo (Sendinblue) |
| `SMTP_FROM` | E-mail remetente |
| `SMTP_FROM_NAME` | Nome do remetente |

### API Utilizada

```
POST https://api.brevo.com/v3/smtp/email
Headers: api-key: {BREVO_API_KEY}
```

### Tipos de E-mail

| Tipo | Destinatários | Assunto | Conteúdo |
|------|--------------|---------|----------|
| Despacho | `dispatchEmails[]` | "Intenções da Missa - {paróquia} - {data} {hora}" | HTML + PDF anexo |
| Resumo Pároco | `pastorEmail` | "Resumo de Intenções - {paróquia} - {data} {hora}" | HTML + PDF resumo anexo |

### Degradação Graciosa

Se `BREVO_API_KEY` não estiver configurada, o serviço loga um warning e pula o envio. Porém, a falha de e-mail marca o batch como `FAILED`.

---

## 11. Armazenamento S3

### Configuração

| Variável | Descrição |
|----------|-----------|
| `S3_REGION` | Região AWS |
| `S3_BUCKET` | Nome do bucket |
| `S3_ACCESS_KEY_ID` | Chave de acesso |
| `S3_SECRET_ACCESS_KEY` | Chave secreta |
| `S3_ENDPOINT` | Endpoint customizado (opcional, para MinIO) |

### Operações

| Operação | Descrição | Expiração URL |
|----------|-----------|---------------|
| `upload(key, buffer, contentType)` | Upload de arquivo | — |
| `getSignedUrl(key)` | URL pré-assinada de download | API: 15min, Worker: 1h |
| `getObject(key)` | Download como Buffer | — |
| `delete(key)` | Remoção de arquivo | — |

### Estrutura de Chaves

```
logos/{parishId}/{timestamp}-{filename}        # Logo da paróquia
pix-qrcodes/{parishId}/{timestamp}-{filename}  # QR Code PIX
dispatches/{parishId}/{YYYYMMDD}/{HHmm}.pdf    # PDFs de despacho
```

### Degradação Graciosa

Se as variáveis S3 não estiverem configuradas, o serviço loga warning e pula upload/download. O despacho continua normalmente.

---

## 12. Geração de PDF

### PDF de Despacho (PdfService.generatePdf)

Documento A4 gerado com PDFKit:

**Estrutura:**
1. **Cabeçalho**: Logo (50×50) + Nome da paróquia (14pt bold) + Data/Hora
2. **Título**: "Intenções da Santa Missa" (12pt) + linha horizontal
3. **Seções por grupo**: SUFRÁGIO → SÚPLICAS → AÇÃO DE GRAÇAS
   - Nome do grupo + contagem
   - Bullets: `• Tipo - Falecido - Famílias - Notas/Complemento`
4. **Avisos** (se houver): título + descrição (max 200 chars)
5. **Rodapé**: Timestamp de geração (timezone São Paulo)

**Ajustes automáticos:**
- `> 45 linhas`: fonte 9pt, máximo 15 itens por seção
- `> 35 linhas`: fonte 10pt
- `≤ 35 linhas`: fonte 11pt
- Textos truncados em 80 caracteres

### PDF Resumo do Pároco (PdfService.generatePastorPdf)

Documento com intenções marcadas `sendToPastor = true`:

**Estrutura:**
1. **Cabeçalho**: Nome da paróquia + "Resumo de Intenções para o Pároco" + Data/Hora + Nome do pároco
2. **Agrupamento**: Por nome do tipo de intenção
3. **Ordenação**: Tipos de Sufrágio primeiro (A-Z), depois outros (A-Z)
4. **Rodapé**: Timestamp

---

## 13. Deploy e Infraestrutura

### Ambientes

| Serviço | Plataforma | Container |
|---------|-----------|-----------|
| Frontend (Web) | Vercel | — (build Next.js) |
| API | Railway | Dockerfile.api |
| Worker | Railway | Dockerfile.worker |
| Banco de Dados | Railway | PostgreSQL 16 |
| Armazenamento | AWS | S3 |

### Dockerfile.api

```dockerfile
FROM node:22-slim
# Instala pnpm, OpenSSL
# Copia: package.json, packages/, prisma/, apps/api/
# pnpm install --frozen-lockfile
# prisma generate
# Build: shared → api
# Entrypoint: migrate deploy → seed → node apps/api/dist/main.js
EXPOSE 3001
```

### Dockerfile.worker

```dockerfile
FROM node:22-slim
# Instala pnpm, OpenSSL
# Copia: package.json, packages/, prisma/, apps/worker/
# pnpm install --frozen-lockfile
# prisma generate
# Build: shared → worker
# CMD: node apps/worker/dist/main.js
```

### CI/CD (GitHub Actions)

**Arquivo**: `.github/workflows/ci.yml`

- **Trigger**: Push para `main`/`develop` ou PR para `main`
- **Database de teste**: PostgreSQL 16 (service container)
- **Steps**:
  1. Checkout
  2. Setup pnpm + Node.js
  3. Install dependencies
  4. `db:validate` (valida schema Prisma)
  5. `db:generate` (gera Prisma Client)
  6. `lint`
  7. `typecheck`
  8. `test`

---

## 14. Variáveis de Ambiente

### API (`apps/api/.env`)

| Variável | Obrigatória | Descrição |
|----------|------------|-----------|
| `DATABASE_URL` | Sim | URL PostgreSQL |
| `JWT_SECRET` | Sim (prod) | Segredo para assinar JWT |
| `PORT` | Não | Porta (default: 3001) |
| `CORS_ORIGINS` | Não | Origens permitidas (vírgula-separadas) |
| `BREVO_API_KEY` | Não* | API key do Brevo (e-mail) |
| `SMTP_FROM` | Não* | E-mail remetente |
| `SMTP_FROM_NAME` | Não* | Nome do remetente |
| `S3_REGION` | Não* | Região AWS |
| `S3_BUCKET` | Não* | Nome do bucket S3 |
| `S3_ACCESS_KEY_ID` | Não* | AWS access key |
| `S3_SECRET_ACCESS_KEY` | Não* | AWS secret key |
| `S3_ENDPOINT` | Não | Endpoint customizado (MinIO) |
| `S3_PUBLIC_BASE_URL` | Não | URL pública base |

*Necessárias para funcionalidade completa. O sistema opera com degradação graciosa sem elas.

### Worker (`apps/worker/.env`)

| Variável | Obrigatória | Descrição |
|----------|------------|-----------|
| `DATABASE_URL` | Sim | URL PostgreSQL |
| `BREVO_API_KEY` | Não* | API key do Brevo |
| `SMTP_FROM` | Não* | E-mail remetente |
| `SMTP_FROM_NAME` | Não* | Nome do remetente |
| `S3_REGION` | Não* | Região AWS |
| `S3_BUCKET` | Não* | Nome do bucket S3 |
| `S3_ACCESS_KEY_ID` | Não* | AWS access key |
| `S3_SECRET_ACCESS_KEY` | Não* | AWS secret key |
| `S3_ENDPOINT` | Não | Endpoint customizado |

### Web (`apps/web/.env`)

| Variável | Obrigatória | Descrição |
|----------|------------|-----------|
| `NEXT_PUBLIC_API_URL` | Sim | URL da API (default: `http://localhost:3001`) |
| `NEXTAUTH_SECRET` | Sim | Segredo NextAuth |
| `NEXTAUTH_URL` | Sim | URL do frontend |

### Credenciais Z-API

As credenciais Z-API (Instance ID, Token, Client-Token) são armazenadas **por paróquia no banco de dados**, não como variáveis de ambiente. Cada paróquia pode ter sua própria instância Z-API.

---

## 15. Fluxo Principal: Pedido → Despacho

```
┌──────────────────────────────────────────────────────────────────────┐
│                        FLUXO COMPLETO                                │
└──────────────────────────────────────────────────────────────────────┘

1. FIEL acessa /p/{slug}/form
   │
   ├── Seleciona data e horário da missa
   ├── Preenche nome e telefone
   ├── Adiciona 1-N intenções com campos dinâmicos
   └── Submete → API gera protocolo → Exibe PIX para oferta
        │
        ▼
2. BANCO registra Request + RequestIntention (status: SUBMITTED)
        │
        ▼
3. WORKER verifica a cada 1 minuto:
   "Há missa nos próximos {dispatchMinutesBefore} minutos?"
        │
   ┌────┴─── SIM ──────────────────────────────────────────────┐
   │                                                            │
   │  4. Busca intenções pendentes (dispatchedAt = null)        │
   │     │                                                      │
   │  5. Gera PDF com:                                         │
   │     ├── Cabeçalho (logo + paróquia + data/hora)           │
   │     ├── Intenções agrupadas (Sufrágio/Súplicas/Ação)      │
   │     └── Avisos ativos do período                          │
   │     │                                                      │
   │  6. Upload PDF → S3                                        │
   │     │                                                      │
   │  7. Envia e-mail → Brevo → dispatchEmails[]               │
   │     │                                                      │
   │  8. Envia WhatsApp → Z-API → dispatchPhones[] + groups[]  │
   │     │                                                      │
   │  9. Se pároco configurado:                                │
   │     ├── Gera PDF resumo (só intenções sendToPastor=true)  │
   │     ├── Envia e-mail ao pároco                            │
   │     └── Envia WhatsApp ao pároco                          │
   │     │                                                      │
   │  10. Marca intenções como despachadas                      │
   │      Cria DispatchBatch (SENT ou FAILED)                  │
   └────────────────────────────────────────────────────────────┘

   OU: Admin acessa /admin/dispatches → "Disparar Agora" (mesma lógica)

11. ADMIN pode:
    ├── Visualizar detalhes do despacho
    ├── Baixar PDF
    ├── Reenviar e-mail
    └── Reabrir despacho (intenções voltam a "pendente")
```

---

## 16. Plano de Integração WhatsApp

### Status das Fases

| Fase | Descrição | Status |
|------|-----------|--------|
| **Fase 1** | Configuração base (Z-API no banco, per parish) | Concluída |
| **Fase 2** | Despacho outbound de PDF via WhatsApp | Concluída |
| **Fase 4** | Admin UI (status, grupos, conexão auto-check) | Concluída |
| **Fase 3** | Chatbot inbound (receber intenções via WhatsApp) | Pendente |

### Fase 1 — Configuração Base
- Campos Z-API no modelo Parish: `zapiInstanceId`, `zapiToken`, `zapiClientToken`
- Client-Token armazenado por paróquia (não como env var global)
- WhatsappService com suporte a `clientToken` em todos os métodos

### Fase 2 — Despacho Outbound
- PDF enviado via `send-document/pdf` para telefones e grupos
- Resumo do pároco enviado separadamente
- `sentToPhones` registrado no DispatchBatch
- `formatPhone()` trata IDs de grupo (contém "-") sem formatação

### Fase 4 — Admin UI
- Verificação automática de conexão ao entrar na página da paróquia
- Alerta visual se desconectado
- Telefone conectado exibido (read-only)
- Listagem e seleção de grupos do WhatsApp
- Badges Email/WhatsApp na tabela de despachos

### Fase 3 — Chatbot Inbound (Pendente)
- Receber mensagens de fiéis via webhook Z-API
- Fluxo conversacional para registrar intenções por WhatsApp
- A ser implementado futuramente
