# Escala de Serviço — Documento de Orquestração (Sessão Mestra)

> **Fonte única de verdade do progresso do módulo Escala.**
> Este arquivo vive no repositório em `docs/escala/ESCALA_00_ORQUESTRACAO.md`.
> Toda sessão de execução (S1, S2, …) **termina** atualizando a Seção 6 (Status)
> e a Seção 8 (Changelog) deste arquivo, dentro do próprio PR.

---

## 0. Como usar este documento

Existem dois tipos de sessão de Claude Code na web:

- **Sessão Mestra (esta).** Não escreve código de produção. Lê o Status (Seção 6),
  identifica a próxima sessão *desbloqueada* (prereqs concluídos), e instrui o Leal
  sobre qual doc de sessão abrir. Quando um PR de sessão é mergeado, atualiza o Status.
- **Sessões de Execução (S1…S10).** Cada uma recebe **um** documento de sessão
  (`ESCALA_01_*.md`, etc.) como briefing autocontido e executa só aquele escopo.

**Passo zero (antes de S1):** rodar o `ESCALA_SETUP.md` — versiona os docs em
`docs/escala/` e carrega o contexto persistente no `CLAUDE.md`. Sem ele, sessões
de execução chegam "burras" e podem reabrir decisão travada.

**Protocolo de cada sessão de execução:**
1. Carregar o `CLAUDE.md` do repo (que inclui o bloco da Seção 4 abaixo) + o doc da sessão.
2. Confirmar que os prereqs estão `✅` na Seção 6. Se não estiverem, **parar** e avisar.
3. Executar apenas o escopo do doc. Não invadir escopo de outras sessões.
4. Rodar `pnpm lint && pnpm typecheck && pnpm test` e as migrações localmente/no CI.
5. Atualizar Seção 6 (Status) e Seção 8 (Changelog) **neste arquivo**, no mesmo PR.
6. Abrir PR com título `escala(Sx): <resumo>` e colar o "Relatório de Sessão" do doc.

**Regra de ouro:** se uma sessão descobrir que precisa mudar uma decisão travada
(Seção 2), ela **não muda sozinha** — abre uma nota em "Pendências" (Seção 9) e para.

---

## 1. Visão geral do módulo

Gestão de **escala de serviço litúrgico**: distribuir voluntários (coroinhas, MESC,
leitores, comentaristas, acolhida…) nas missas, respeitando qualificação,
disponibilidade e demanda por celebração.

Encaixa no **mesmo sistema** de Intenções de Missa (mesmo monorepo, mesmo tenant
`Parish`, mesmo banco), porém como **bounded context separado**: tabelas próprias,
área própria (`/admin/escala/*` e portal do membro), e uma **segunda classe de
usuário** (Membro) com autenticação própria. Reusa o ativo compartilhado real —
o calendário de celebrações (`MassSchedule` + `MassException`) — sem tocar no
caminho de despacho das Intenções.

```
INTENÇÕES (existente, intocado)          ESCALA (novo)
  Request / RequestIntention               Member / Team / TeamFunction
  DispatchBatch / Notice                   TeamMembership / MembershipFunction
  Worker de despacho (cron 1min)           MassOccurrence (materializado)
        │                                  StaffingRequirement
        │  ativos compartilhados           AvailabilityEntry / Rule
        ▼                                  Assignment
  Parish · MassSchedule · MassException ◄──┘  MemberAuthToken
```

---

## 1.1 Análise de impacto sobre o que já funciona

**Princípio:** o módulo é **aditivo**. Nenhum endpoint, disparo, PDF, e-mail ou
WhatsApp das Intenções muda de comportamento. Mas "aditivo" ainda toca **superfícies
compartilhadas** — abaixo, onde encosta, o risco e a mitigação. Toda sessão deve
reler isto antes de mexer.

**Superfícies compartilhadas tocadas (de forma aditiva):**

| Superfície | O que acontece | Risco | Mitigação |
|---|---|---|---|
| `prisma/schema.prisma` | Tabelas novas + back-relations em `Parish`/`MassSchedule`/`MassException` | Back-relation **não cria coluna** nessas tabelas; migração é só `CREATE TABLE`/`CREATE TYPE`, **sem `ALTER`** nas tabelas de Intenções | Conferir no diff da migração que não há `ALTER`/`DROP` em tabelas de Intenções |
| `packages/shared` | Enums + schemas Zod novos | Pacote compartilhado (API+web+worker importam); se não compilar, os três quebram no build | `typecheck` verde é inegociável; erro é build-time, o CI pega antes do ar |
| API (mesmo processo das Intenções) | Registro do módulo `admin/escala` na árvore Nest | Módulo mal-registrado (dep. circular/provider quebrado) derruba a API **inteira** no boot | Nest falha rápido no startup → aparece no CI/deploy, não em produção silenciosa |
| Banco compartilhado + `seed.ts` | Migração roda; seed estendido (upsert idempotente) | Escrita no banco tem risco operacional, mas `CREATE TABLE` aditivo é baixíssimo (não trava tabela existente) | Migração aditiva; seed idempotente testado 2x |

**O que definitivamente NÃO é tocado:** worker de despacho e cron de 1min · formulário
público de intenções · geração de PDF das intenções · envio Brevo · disparo Z-API ·
`DispatchBatch` · `Notice` · reabertura. A Escala **lê** `MassSchedule`/`MassException`
(calendário = ativo compartilhado) mas **nunca escreve** em tabela de Intenções.

**O risco real, em uma frase:** não é mudar o que funciona — é, num deploy, um build
ou boot quebrado do módulo novo **indisponibilizar o processo compartilhado** (a API).
Gerenciável com CI verde + revisão de diff antes do merge.

**Opção de blindagem (fora do MVP):** subir a API da Escala como **segundo serviço no
Railway** (processo separado, mesmo banco). Aí nem um boot quebrado encostaria nas
Intenções. Mais robusto, mais complexo/caro. Registrar aqui como escolha consciente;
não fazer sem aprovação do Leal.

## 2. Decisões arquiteturais TRAVADAS

**Não reabrir sem aprovação explícita do Leal.** Estão fechadas de propósito.

| # | Decisão | Motivo |
|---|---------|--------|
| D1 | **Dois realms de auth.** `User` (admin, senha, existente) ≠ `Member` (voluntário, link mágico/OTP, novo). | Públicos e volumes distintos; não poluir o auth atual. |
| D2 | **Coordenador não é role nova.** É `TeamMembership.isCoordinator=true`, escopado à equipe. Pároco/secretário (`PARISH_ADMIN`) transcende. | Mantém o enum `Role` limpo; autorização = "é PARISH_ADMIN da paróquia OU coordenador desta equipe". |
| D3 | **Disponibilidade é nível MEMBRO**, não por equipe. Uma resposta por ocorrência vale p/ todas as equipes da pessoa. | É agenda pessoal; contenda entre equipes é *alocação*, não disponibilidade. |
| D4 | **Regime A:** `@@unique([occurrenceId, memberId])` vale SEMPRE (inclusive rascunho). Primeiro que rascunha tranca. | Zero corrida, trivial. Regime B (índice parcial) fica como upgrade se houver atrito. |
| D5 | **Contenda entre equipes** resolve por: (1) backstop `unique`; (2) `TeamMembership.priority` (menor=mais forte, definido pelo membro, pároco sobrepõe); (3) **visibilidade cruzada** (query mostrando "já escalado em X"); (4) rascunho→publicação (`publishedAt`). | A visibilidade é o que resolve de fato na paróquia. |
| D6 | **Staffing por escopo com prioridade:** `OCCASION > SOLEMNITY > SCHEDULE > WEEKDAY > DEFAULT`. | Espelha o padrão do `Emolument` já existente. |
| D7 | **Solenidade é propriedade da OCORRÊNCIA** (`MassOccurrence.isSolemnity`), não só da exceção — um domingo comum pode ser elevado. Re-materialização **preserva** o flag. | Refletir a realidade da paróquia. |
| D8 | **Teto é por equipe** (`maxAssignmentsPerMonth` no membership). Sem teto global no MVP. | Decisão do Leal. Teto global vira *soft cap* futuro se doer. |
| D9 | **Materialização de ocorrências é da Escala.** NÃO alterar o worker/dispatch das Intenções (que segue calculando on-the-fly). | Proteger o uptime do que já funciona. |
| D10 | **Auth de membro em Postgres puro** (token hasheado + TTL + uso único). Sem migrar para Supabase. OTP entregue por WhatsApp. | Não introduzir 2º sistema de identidade. |
| D11 | **MVP = escala manual assistida**, não automação total. Algoritmo guloso *sugere*; coordenador sobrescreve. | Julgamento humano (dons/experiência) não se codifica de primeira. |

---

## 3. Convenções técnicas (herdadas do sistema)

- **Monorepo pnpm.** Apps: `apps/api` (NestJS, 3001), `apps/web` (Next.js App Router, 3000), `apps/worker` (pg-boss). Compartilhado: `packages/shared` (tipos, schemas Zod, utils).
- **Multi-tenant:** `parishId` em toda tabela nova; toda operação admin verifica ownership da paróquia (padrão dos guards existentes).
- **ORM:** Prisma 5.10 / PostgreSQL 16. **Migrações aditivas** (`pnpm db:migrate:dev --name ...`). Nunca destrutivas sem aprovação.
- **Validação:** schemas Zod em `packages/shared`, espelhando os enums do Prisma em `types.ts`.
- **Auth admin:** JWT via Passport (`JwtAuthGuard` + `RolesGuard`). **Auth membro:** guard novo (S5), realm separado.
- **Rate limiting:** `ThrottlerModule` global (30req/60s); endpoints sensíveis (envio de OTP, submissão pública) recebem limite específico.
- **PDF:** PDFKit (padrão do `PdfService`) para eventuais escalas em PDF.
- **WhatsApp:** Z-API por paróquia (credenciais no banco). ⚠️ ver Risco R1.
- **CI:** `.github/workflows/ci.yml` roda `db:validate`, `db:generate`, `lint`, `typecheck`, `test`. Todo PR passa verde.
- **Guardrail-mor:** nenhuma sessão pode quebrar o fluxo de Intenções. Se um teste de Intenções falhar, a sessão está errada.

---

## 4. Contexto persistente (colar no `CLAUDE.md` do repo)

> Copiar o bloco abaixo para o `CLAUDE.md`. É o que toda sessão de execução carrega.

```md
## Módulo Escala (escala de serviço litúrgico)
- Bounded context separado dentro do mesmo sistema de Intenções. Não tocar no
  caminho de despacho das Intenções (worker/dispatch seguem intocados — D9).
- Duas classes de usuário: User (admin, senha) e Member (voluntário, link
  mágico/OTP — realm separado, D1). Coordenador = TeamMembership.isCoordinator
  (não é role nova — D2).
- Disponibilidade é nível Member, uma resposta por MassOccurrence (D3).
- Assignment: unique(occurrenceId, memberId) sempre (Regime A — D4). Vaga em
  aberto = requiredCount − assignments (não é linha). publishedAt separa
  rascunho de publicado.
- StaffingRequirement resolve por escopo: OCCASION > SOLEMNITY > SCHEDULE >
  WEEKDAY > DEFAULT (D6). Solenidade é flag da ocorrência (D7).
- Teto por equipe (maxAssignmentsPerMonth no membership — D8).
- Auth de membro em Postgres puro, sem Supabase (D10). OTP via WhatsApp.
- MVP: escala manual assistida; algoritmo guloso sugere, humano sobrescreve (D11).
- Convenções: parishId em tudo; Zod em packages/shared; migrações aditivas;
  CI verde (lint/typecheck/test). Fonte de verdade do progresso:
  docs/escala/ESCALA_00_ORQUESTRACAO.md.
```

---

## 5. Mapa de sessões

| ID | Nome | Objetivo | Prereqs | Entregável | Doc |
|----|------|----------|---------|-----------|-----|
| **S1** | Fundação de dados | Mesclar schema Escala, back-relations, migração 12, seed de equipes/funções padrão | — | Migração + Prisma Client | `ESCALA_01_fundacao_dados.md` |
| **S2** | Materialização de ocorrências | Gerar `MassOccurrence` p/ um intervalo, idempotente, preservando `isSolemnity`; endpoint p/ elevar solenidade | S1 | Serviço + endpoints admin | `ESCALA_02_materializacao_ocorrencias.md` |
| **S3** | Cadastro (backend) | CRUD Team/TeamFunction/Member/TeamMembership/MembershipFunction/StaffingRequirement + autorização dupla (admin ∪ coordenador) | S1 | Endpoints `/admin/escala/*` | a escrever |
| **S4** | Cadastro (frontend admin) | Páginas `/admin/escala/*`: equipes, funções, membros, qualificações, demanda | S3 | UI admin | a escrever |
| **S5** | Auth de membro | `MemberAuthToken`, geração/validação de link mágico + OTP (WhatsApp/e-mail), JWT de membro, guard de membro | S1 (Member de S3) | Fluxo de login sem senha | a escrever |
| **S6** | Portal de disponibilidade | Membro loga por link, vê ocorrências do mês, marca disponibilidade; pré-preenchimento por `MemberAvailabilityRule` | S2, S5 | Portal do membro | a escrever |
| **S7** | Motor de sugestão + montagem (backend) | Resolver staffing por ocorrência; gerar rascunho justo (guloso) respeitando qualificação/disponibilidade/teto/priority; endpoints rascunho/override/publish; visibilidade cruzada | S2, S3, S6 | Algoritmo + endpoints de escala | a escrever |
| **S8** | UI de montagem (frontend coordenador) | Grade do mês, "sugerir distribuição", override manual, ver conflitos, publicar | S7 | UI do coordenador | a escrever |
| **S9** | Lembretes + confirmação (worker) | Cron reusando padrão do worker; avisa membro/grupo X horas antes; coleta confirmar/recusar | S8 | Job de lembrete | a escrever |
| **S10** | Extras (backlog) | `.ics` p/ agenda, troca/substituição entre membros, relatórios de participação | S8/S9 | — | a escrever |

**Grafo de dependências (texto):**
```
S1 ──┬─► S2 ──┬──────────────► S6 ──► S7 ──► S8 ──► S9 ──► S10
     │        │                 ▲       ▲
     ├─► S3 ──┴─► S4            │       │
     │        └────────────────┼───────┘
     └─► S5 ─────────────────► S6
```
Sessões paralelizáveis após S1: **S2, S3, S5** podem correr em PRs independentes.

---

## 6. Status (fonte de verdade do progresso)

Legenda: ⬜ doc a escrever · 📝 especificado (doc pronto) · 🚧 em execução · ✅ concluído

| ID | Status | PR | Data | Notas |
|----|--------|----|----|-------|
| S1 | ✅ | #2 | 2026-07-01 | Migração 12 `add_escala_module` (11 modelos, 5 enums, back-relations Parish/MassSchedule/MassException); enums espelhados em `packages/shared`; seed 6 equipes / 15 funções (idempotente, verificado 2x). Purely additive — sem `ALTER`/`DROP` em tabelas de Intenções. |
| M1a | ✅ | #3 | 2026-07-02 | Manutenção — CI ligado (gatilho ampliado p/ toda PR, incl. `claude/**`) + base verde (lint/typecheck/test em web/api/worker/shared). Resolve R5 e R7. **Não** toca schema/migração (drift R6 → PR-M1b). |
| M1b | ✅ | PR-M1b | 2026-07-02 | Drift R6 reconciliado só no `schema.prisma` (sem migração, sem `ALTER` em Intenções): `@default([])` em 4 arrays + `@default(dbgenerated("gen_random_uuid()"))` em `notices.id`. `migrate dev` → "Already in sync"; deploy zerado limpo; seed idempotente + smoke da Prisma Client OK. |
| S2 | 📝 | — | — | Doc pronto. Depende de S1. |
| S3 | 📝 | — | — | Doc pronto. Depende de S1. Admin-only nesta fase (coordenador ativa em S5/S6). |
| S4 | ⬜ | — | — | — |
| S5 | ⬜ | — | — | — |
| S6 | ⬜ | — | — | — |
| S7 | ⬜ | — | — | — |
| S8 | ⬜ | — | — | — |
| S9 | ⬜ | — | — | — |
| S10 | ⬜ | — | — | — |

---

## 7. Definition of Done (genérico, toda sessão)

Uma sessão só está `✅` quando **tudo** abaixo é verdade:
- [ ] Escopo do doc entregue; nada fora do escopo.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` verdes.
- [ ] Migrações aplicam limpo (`db:migrate:deploy` em base zerada) e são aditivas.
- [ ] **Nenhuma regressão nas Intenções** (fluxo pedido→despacho intacto).
- [ ] Novos endpoints com validação Zod e guard de autorização correto.
- [ ] Seção 6 (Status) e Seção 8 (Changelog) atualizadas neste arquivo, no mesmo PR.
- [ ] "Relatório de Sessão" (do doc) colado na descrição do PR.

---

## 8. Changelog / diário de bordo

> Cada sessão concluída adiciona uma entrada aqui (mais recente no topo).

- **2026-07-02 — M1b (Manutenção: drift schema↔migração)** · PR-M1b
  - **Workstream C (drift, R6):** com todas as 12 migrações aplicadas numa base,
    `prisma migrate dev --create-only` propunha `DROP DEFAULT` em 5 colunas de
    **tabelas de Intenções** — o drift que a S1 tirou da migração dela mas que
    seguia no repo. Diagnóstico coluna a coluna (defaults reais conferidos no
    `information_schema`):
    - `parishes.dispatch_phones` (`'{}'::text[]`), `parishes.dispatch_groups`,
      `dispatch_batches.sent_to_phones`, `notices.mass_times` (`ARRAY[]::text[]`):
      default de banco **útil e vivo** (Prisma omite o campo em create parcial →
      banco preenche `[]`). Decisão: **declarar `@default([])` no schema** para
      casar schema↔banco. Zero mudança no banco.
    - `notices.id` (`gen_random_uuid()`): default de banco **redundante** (só o
      `notices` o tinha; os demais `id` geram uuid client-side via `@default(uuid())`).
      Decisão: **`@default(dbgenerated("gen_random_uuid()"))`** — declara o default
      existente no schema em vez de dropá-lo, mantendo o viés de **não `ALTER`ar
      tabela de Intenções**. Banco intocado.
    - `parishes.dispatch_emails` e `dispatch_batches.sent_to_emails` **não** têm
      default no banco e **não** driftam — deixados como estão (adicionar
      `@default([])` neles criaria drift novo).
  - **Resultado:** reconciliação **100% no `schema.prisma`, sem nenhuma migração
    nova e sem um único `ALTER`** em tabela de Intenções. `prisma migrate dev`
    passou a reportar **"Already in sync, no schema change or pending migration
    was found."**; `migrate deploy` em base zerada aplica as 12 migrações limpo.
  - **Intenções sem regressão:** `seed.ts` roda limpo e idempotente (2×: 6 equipes
    / 15 funções / 14 tipos estáveis); smoke pela Prisma Client — `Notice.create`
    sem `id` → banco gera uuid válido; `massTimes`/`dispatchPhones`/`dispatchGroups`
    default `[]`. Caminho de despacho não tocado (D9).
  - Orquestrador: **R6 resolvido**; Status `M1b ✅`; este Changelog.

- **2026-07-02 — M1a (Manutenção: CI + base verde)** · PR #3
  - **Workstream A (CI, R5):** `.github/workflows/ci.yml` — removido o filtro de
    `branches` do gatilho `pull_request` (CI passa a rodar em PR para **qualquer**
    base, inclusive branches `claude/**`; nunca mais fica OFF em silêncio). `on.push`
    mantido restrito a `main`/`develop`. Adicionado o step **Build shared package**
    (`pnpm build:shared`) antes de lint/typecheck/test: `@missas/shared` expõe
    `main`/`types` a partir de `dist/` e a API importa dele — sem o build, o
    typecheck/test da API falhava por não resolver o módulo (lacuna de CI encontrada
    além das 4 falhas catalogadas). Criada a branch `develop` como base do PR.
  - **Workstream B (base verde, R7):** quatro falhas pré-existentes + extras
    reveladas ao rodar o CI de verdade. Fixes mínimos, nenhuma regra silenciada:
    - **B1** — `apps/web` sem `@types/jest`: adicionado `@types/jest` aos devDeps
      do web (sem `types` explícito no tsconfig → auto-incluído). `phone-input.spec.ts` OK.
    - **B2** — mock do worker sem `massExceptions`: `dispatch.service.spec.ts` não
      fornecia `massExceptions`/`massSchedules`; a query real (`dispatch.service.ts:29-33`)
      **sempre** os inclui, então é lacuna de **mock**, não do código. Adicionados
      `massExceptions: []` e `massSchedules: []` ao fixture.
    - **B3** — ESLint do `shared` (e do `worker`): ambos sem `.eslintrc`, então
      `eslint src/` não achava config e falhava. Criados `.eslintrc.cjs` (extends
      `@missas/eslint-config`, como a API; resolve via `shamefully-hoist`). Também
      na API: removido `parserOptions.project` — a config não habilita regra
      type-aware, e o typed-linting só causava erro de parse nos `*.spec.ts`
      (excluídos do tsconfig). Specs seguem lintados sintaticamente.
    - **B4** — `admin.service.spec` da API: **investigado — não é bug de produto.**
      `AdminService` passou a depender de `WhatsappService` (usado no despacho por
      Z-API) e está corretamente provido/exportado em `admin.module.ts`; o spec é que
      estava desatualizado (sem o mock). Adicionado `mockWhatsapp` aos providers.
  - **Verificação:** `lint`, `typecheck`, `test` verdes em todos os apps (web 8/8,
    worker 8/8, api 29/29). Intenções sem regressão (testes do worker de despacho e
    da API verdes). **Não** tocou `prisma/schema.prisma` nem migrações (drift R6 fica
    para PR-M1b).
  - Nota de ambiente: engines do Prisma baixadas manualmente por bloqueio de rede
    do sandbox (não afeta o CI, que tem internet direta).

- **2026-07-01 — S1 (Fundação de dados)** · PR #2
  - Mesclado o modelo Escala em `prisma/schema.prisma`: 11 modelos
    (`Member`, `Team`, `TeamFunction`, `TeamMembership`, `MembershipFunction`,
    `MassOccurrence`, `StaffingRequirement`, `MemberAvailabilityRule`,
    `AvailabilityEntry`, `Assignment`, `MemberAuthToken`) + 5 enums
    (`MinistryCategory`, `StaffingScope`, `AvailabilityStatus`,
    `AssignmentStatus`, `MemberAuthTokenType`).
  - Fragmento adaptado às convenções do schema existente: `@db.Uuid` em toda
    PK/FK (necessário — FK `text→uuid` não é aceita pelo Postgres) e colunas
    `snake_case` via `@map`.
  - Back-relations adicionadas em `Parish`, `MassSchedule`, `MassException`
    (mais `parish` em `StaffingRequirement`/`Assignment` para casar os lados).
  - Enums espelhados em `packages/shared/src/types.ts`.
  - Migração 12 `add_escala_module`: **puramente aditiva** (`CREATE TYPE/TABLE/INDEX`
    + `ADD CONSTRAINT`); removido o drift `DROP DEFAULT` que o Prisma tentou
    embutir em tabelas de Intenções (fora do escopo da S1). Aplica limpo em
    base zerada (12 migrações) e `migrate status` fica sem drift.
  - `prisma/seed.ts` estendido com 6 equipes / 15 funções padrão (upsert por
    chave natural, idempotente — verificado rodando 2x: 0 duplicatas). Corrigido
    também um bug pré-existente no seed (`dispatchTime` → `dispatchMinutesBefore`,
    campo removido pela migração 3) que impedia o seed de rodar.
  - Sem regressão nas Intenções: as falhas de teste/lint remanescentes
    (`apps/web` sem `@types/jest`, `apps/worker` dispatch mock, lint `shared`,
    `apps/api` admin.service.spec) são **idênticas na base**, anteriores à S1.
  - Nota: o workflow `ci.yml` só dispara em PRs para `main`/`develop`; PRs em
    branches `claude/*` não executam CI.

---

## 9. Riscos e pendências abertas

| ID | Item | Situação |
|----|------|----------|
| R1 | **Lembrete individual em massa via Z-API.** Disparo por pessoa p/ centenas de membros é padrão que a Meta flagra em API não-oficial (enforcement 2026). | Decisão pendente em S9: usar **grupo** da equipe (seguro) e/ou planejar **WhatsApp Cloud API oficial** p/ notificação individual. |
| R2 | **Teto global por pessoa** (soma das equipes). Não modelado (D8). | Adicionar *soft cap* no `Member` só se aparecer sobrecarga real. |
| R3 | **Regime B** (rascunhos sobrepostos, `unique` só no publicado via índice parcial). | Só se o atrito entre coordenadores em rascunho incomodar. |
| R4 | **Convergência do calendário.** No futuro, o worker das Intenções poderia ler de `MassOccurrence`. | Opcional, fora do MVP. Não fazer sem aprovação. |
| R5 | **CI desligado.** O gatilho `pull_request` filtrava por base `main`; PRs empilhados fora de `main`/`develop` (e branches `claude/*`) nunca disparavam o CI. | ✅ **Resolvido em PR-M1a (#3)** — filtro de `branches` removido do `pull_request`; CI roda em toda PR. |
| R6 | **Drift schema↔migração.** Prisma quer embutir `DROP DEFAULT` em `parishes`/`notices`/`dispatch_batches` (tabelas de Intenções). | ✅ **Resolvido em PR-M1b.** Reconciliado 100% no `schema.prisma`, **sem migração e sem `ALTER`** em tabela de Intenções: `@default([])` nas 4 colunas de array com default no banco (`parishes.dispatch_phones`/`dispatch_groups`, `dispatch_batches.sent_to_phones`, `notices.mass_times`) e `@default(dbgenerated("gen_random_uuid()"))` em `notices.id` (default de banco redundante). `migrate dev` → "Already in sync"; `deploy` em base zerada limpo; banco intocado. |
| R7 | **Base não-verde.** Falhas pré-existentes de lint/typecheck/test (e lacuna de build do `shared` no CI) impediam o "sem regressão" automatizado. | ✅ **Resolvido em PR-M1a (#3)** — B1–B4 + build do `shared` + configs de ESLint; lint/typecheck/test verdes em todos os apps. |
