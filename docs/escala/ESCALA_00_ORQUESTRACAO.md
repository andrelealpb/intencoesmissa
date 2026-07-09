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
| **S2.1** | Gestão de ocorrências do mês aberto | `DELETE` de ocorrência avulsa (aviso+confirmação se tem escala/disponibilidade — cascateia) + `reconcile` do mês (órfã vazia sai direto; órfã com dado humano vira conflito p/ decisão manual, preservando o válido); UI de gestão do mês | S2, S4, S8 | Endpoints `/escala/occurrences/*` + UI | `ESCALA_S2_1_gestao_ocorrencias.md` |
| **S3** | Cadastro (backend) | CRUD Team/TeamFunction/Member/TeamMembership/MembershipFunction/StaffingRequirement + autorização dupla (admin ∪ coordenador) | S1 | Endpoints `/admin/escala/*` | `ESCALA_03_cadastro_backend.md` |
| **S4** | Cadastro (frontend admin) | Páginas `/admin/escala/*`: equipes, funções, membros, qualificações, demanda | S3 | UI admin | a escrever |
| **S5** | Auth de membro | `MemberAuthToken`, geração/validação de link mágico + OTP (WhatsApp/e-mail), JWT de membro, guard de membro | S1 (Member de S3) | Fluxo de login sem senha | `ESCALA_05_auth_membro.md` |
| **S6** | Portal de disponibilidade | Membro loga por link, vê ocorrências do mês, marca disponibilidade; pré-preenchimento por `MemberAvailabilityRule` | S2, S5 | Portal do membro | a escrever |
| **S6.5** | Convites + convocação | `Team.whatsappGroupId` (migração 14); convite individual no vínculo (`sendInvite` default true, link do portal); convocação por grupo na abertura do mês (1 msg/equipe, coordenador=própria, admin=escolhe), reusando a entrega Z-API — degradação graciosa | S4, S5, S6 | Convite + convocação | `ESCALA_06_5_convites_convocacao.md` |
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
| M1a | ✅ | #3 | 2026-07-02 | Manutenção — CI ligado (gatilho ampliado p/ toda PR, incl. `claude/**`) + base verde (lint/typecheck/test em web/api/worker/shared). Resolve R5 e R7. **Não** toca schema/migração (drift R6 → PR-M1b (#4)). |
| M1b | ✅ | #4 | 2026-07-02 | Drift R6 reconciliado só no `schema.prisma` (sem migração, sem `ALTER` em Intenções): `@default([])` em 4 arrays + `@default(dbgenerated("gen_random_uuid()"))` em `notices.id`. `migrate dev` → "Already in sync"; deploy zerado limpo; seed idempotente + smoke da Prisma Client OK. |
| S2 | ✅ | #6 | 2026-07-02 | `OccurrenceService.materialize(parishId, from, to)` idempotente (upsert por `@@unique([parishId, date, time])`, preserva `isSolemnity`/`title` — D7); endpoints admin `POST materialize` / `GET list` / `PATCH :id`. Regra de missas **replicada** (não importada do worker — D9): exceção vence regular no mesmo horário. Convenção de solenidade: **(a)** — materializa `isSolemnity=false`, elevação manual via PATCH. Sem schema/migração novos. |
| S2.1 | ✅ | #42 | 2026-07-09 | Gestão de ocorrências do mês aberto (correção do piloto). Novo `OccurrenceController` sob `/escala/occurrences` (`EscalaAuthGuard`, **admin ∪ coordenador** via `EscalaAccessService.assertCanManageOccurrences` — nível paróquia, autoridade lida do banco). **`DELETE :id[?force]`**: sem escala/disponibilidade remove direto; com dado humano e **sem `force`** devolve `{requiresConfirmation, affected}` (não apaga) para a UI avisar — a exclusão **cascateia** (`onDelete: Cascade`); `force=true` apaga. **`POST reconcile {month}`**: recalcula o esperado do cadastro atual (reusa `buildCandidates`, regra de S2 — D9), **adiciona** faltantes, **atualiza** preservando `isSolemnity`/título/escala/disponibilidade do válido (D7), órfã **vazia** sai direto (`removedClean`), órfã **com dado humano** vira **conflito** (nunca some sozinha). **`GET ?month`**: lista com indicadores (escala?/disponibilidade?/solenidade?/`inCadastro`). UI `/admin/escala/ocorrencias`: lista + modal de aviso na exclusão + "Reconciliar mês" com resumo e resolução por conflito (manter/excluir). Sem schema/migração (reusa tabelas da S1); Intenções intocadas (D9). CI verde (api 201, web 18, worker 30). |
| S3 | ✅ | #7 | 2026-07-02 | Cadastro backend admin-only sob `/admin/escala/*`: CRUD de Team/TeamFunction/Member/TeamMembership/MembershipFunction/StaffingRequirement no módulo existente `apps/api/src/escala` (`CadastroController`/`CadastroService`, convive com o `EscalaController` de S2). `parishId` sempre do JWT; ownership por paróquia (404 não vaza); P2002→409; qualificação valida função da equipe (400); soft-delete p/ entidades com histórico de assignment. Schemas Zod em `packages/shared` (`staffingRequirementSchema` = discriminated union por escopo). `EscalaAccessService` com gancho de coordenador `TODO(S5)`. Função pura `resolveStaffing` + testes dos 5 escopos e desempate por função (D6). Sem schema/migração novos (reusa tabelas da S1). |
| S4 | ✅ | #10 | 2026-07-02 | Frontend admin do cadastro sob `/admin/escala/*` (Next.js App Router, espelhando o design do painel existente — `useSession` + `apiAuthFetch`, sem UI nova). Páginas: **Equipes** (lista/CRUD + botão opcional **Abrir mês** → materialização da S2), **detalhe da equipe** com abas Funções / Vínculos / Demanda, e **Membros** (nível paróquia, busca + paginação). Vínculos expõem `isCoordinator`, teto por equipe e `priority`; qualificações via replace-set das funções da equipe. Demanda: o alvo acompanha o escopo (WEEKDAY→dia, SCHEDULE→horário, OCCASION→exceção; DEFAULT/SOLEMNITY→nenhum) e combinação inválida fica **não submetível**. Warning de duplicata de telefone (201) exibido sem bloquear. `parishId` nunca no request (vem do JWT). Sem backend novo, sem UI de coordenador (S8). Web verde: typecheck/lint/test + `next build` das 3 rotas. |
| S5 | ✅ | #8 | 2026-07-02 | Realm de auth de membro: fluxo `request→verify` (OTP via WhatsApp) + link mágico (e-mail Brevo) sobre `MemberAuthToken`, hash em repouso, uso único, TTL, invalidação em novo request, teto de 5 tentativas (coluna aditiva `attempts` — migração 13). Anti-enumeração (200 genérico) + rate limit (`ThrottlerGuard`) em request/verify. `MemberJwtStrategy`/`MemberJwtGuard` com `MEMBER_JWT_SECRET` separado; `EscalaAuthGuard` composto (admin ∪ membro → `req.actor`). `EscalaAccessService`: ramo de coordenador **ativado** (autorização lida do banco — `TODO(S5)` fechado); endpoints da S3 refatorados p/ a matriz de permissão (nível paróquia = admin-only; nível equipe = admin ∪ coordenador da equipe; `isCoordinator` continua admin-only). Env novas no `.env.example`. Admin/Intenções intactos (D1). CI verde. |
| S6 | ✅ | #9 · redesign #46 | 2026-07-02 · 2026-07-09 | Portal do voluntário `/p/{slug}/escala/*` (login OTP + callback do link mágico consumindo a API da S5; visão do mês com autosave por toggle; editor de regra recorrente). Endpoints do realm de membro `/escala/me`, `/escala/me/occurrences`, `/escala/me/availability`, `/escala/me/rules` sob `MemberJwtGuard` (`memberId`/`parishId` sempre do JWT). Resolvedor puro `resolveAvailability` (precedência `explicit > rule > default`, devolve `source`) reusado no GET de ocorrências — regra recorrente **não** materializa entries (refino consciente do comentário do schema — U3). Opt-in (U1), binário na UI (U4), anti-enumeração da S5 preservada. Sem schema/migração novos. **Redesign de UI (usabilidade do piloto — PR #46):** regra recorrente protagonista no topo (chips de dia da semana, autosave), navegação **semana a semana** atravessando a virada do mês, **linhas compactas** (dia+hora+toggle de um toque) e distinção visual **sem resposta × indisponível × disponível** (preenchimento codifica a origem: sólido = à mão, tonalizado = pela regra, tracejado âmbar = sem resposta). **Só frontend** — endpoints/`resolveAvailability` intocados; autosave por toggle preservado. |
| S6.5 | ✅ | #16 | 2026-07-06 | Convites e convocação. **Migração 14** `add_team_whatsapp_group` (só `ADD COLUMN whatsapp_group_id` em `teams` — sem `ALTER`/`DROP` em Intenções). **Convite individual** disparado no vínculo (`POST teams/:teamId/members`, `sendInvite` default true): 1 msg WhatsApp com o **link do portal** (`/p/{slug}/escala/entrar`, sem OTP) via `EscalaNotifyService`, reusando a entrega Z-API da S5; **degradação graciosa** (sem Z-API/telefone/falha → cadastro conclui, só loga). **Convocação** (`POST /admin/escala/convoke`, `ConvocationController`/`ConvocationService`) = passo **separado** da materialização: 1 msg por `whatsappGroupId` de equipe; autorização reusa `EscalaAccessService.assertCanManageTeam` (coordenador só a própria equipe → 403 em alheia; admin escolhe equipes); equipe sem grupo → **pulada** com aviso no resumo (C5); resumo `sent/skipped/failed`. UI: campo de grupo na tela de equipe, checkbox "Enviar convite" marcado no vínculo, painel "Convocar equipes". Sem envio individual em massa (R1). CI verde (api 119, web 8, worker 8). |
| S7 | ✅ | #32 | 2026-07-07 | Motor de sugestão (backend). Planner **puro** `planSchedule` (`apps/api/src/escala/suggest-schedule.ts`) reusando `resolveStaffing` (S3) e `resolveAvailability` (S6) — guloso, **determinístico** (J4), **nunca relaxa regra** (J3). Regras J1 (balanceamento da carga **total** no mês, todas as equipes), J2 (rodízio: desempate por `lastServedAt` — quem serviu há mais tempo primeiro; `priority` **não** é desempate de justiça). Decisões A1 (não escala quem "não informou"), A2 (só qualificado), A3 (teto por equipe — D8), A4 (uma pessoa por ocorrência — D4/Regime A, global), A5 (não sobrescreve rascunho — preenche só vaga vazia), A6 (só ativo). Endpoint `POST /escala/schedule/suggest` (`ScheduleController`/`SuggestionService`, `EscalaAuthGuard`): cria `Assignment` rascunho (`publishedAt=null`, `SCHEDULED`) e devolve `{ created, gaps }` com motivo por lacuna (`SEM_DISPONIVEL`/`SEM_QUALIFICADO`/`TODOS_NO_TETO`). Autorização por `EscalaAccessService` (coordenador só as próprias equipes; admin qualquer). Mês não materializado → 400 claro. **Sem UI/publicação (é S8); sem schema/migração novos** (reusa tabelas da S1). Doc `ESCALA_07`. CI verde (api 155). |
| S8 | ✅ | #36 (PR 1/2) · PR 2 (frontend) | 2026-07-07 | **PR 1 de 2 (backend) — #36:** endpoints de apoio da tela do coordenador: `GET /escala/schedule` (grade por missa: ocorrências + assignments rascunho/publicados + gaps recalculados + candidatos por vaga com `eligible`/`reason`/`conflict` via função pura `buildScheduleGrid`, reusando `resolveStaffing`/`resolveAvailability`), `POST /escala/assignments` (override consciente V2 → 422 sem `overrideReason`; unique(occurrence,member) → 409 V3; cria rascunho mesmo sobre publicado V4), `DELETE /escala/assignments/:id`, `POST /escala/schedule/publish` (carimba `publishedAt`+`republishedAt`; publicado editável; mudança pós-publicação detectável V4). **Migração 15** `add_assignment_override_and_republish` (aditiva: `override_reason`+`republished_at`, só `ADD COLUMN` em `assignments`). Autorização coordenador/admin (`EscalaAccessService`). **PR 2 (frontend/UI):** tela `/admin/escala/montagem` reusando o design do painel admin — grade do mês por missa (V1) com vagas por função, nomes preenchidos e lacunas destacadas com motivo; "Sugerir distribuição" (S7, só preenche vazio — A5); resolução de vaga (V2) com lista priorizada (elegíveis, depois excluídos rotulados) + modal de override consciente com `overrideReason`; contenda (V3) com candidato em outra equipe desabilitado/rotulado; publicar por equipe/mês (V4, segue editável); painel por pessoa (contagem + datas) para conferência da justiça. Sem tocar endpoints (são do PR 1). **CI verde** (web 14). |
| S9 | ✅ | #40 | 2026-07-09 | Lembretes + confirmação. **Migração 16** `add_escala_reminders`: `CREATE TYPE ReminderKind` + `CREATE TABLE reminder_logs` (chave única `(kind, target_key)` = idempotência) + `ADD COLUMN` de config de antecedência em `parish_settings` (`reminders_enabled` default **false** = gate de R1, `reminder_eve_hour`, `reminder_same_day_hours_before?`, `reminder_group_summary_days_before`) — só aditivo, sem `ALTER`/`DROP` em Intenções. **Worker:** job **isolado** `check-reminders` (cron 1min, separado do `check-dispatches` — D9); pura `planReminders` (véspera + opcional no dia, só escalados + resumo no grupo 1 msg/equipe/dia) + `ReminderService` (claim-then-send: cria `ReminderLog` **antes** de enviar → reprocessar o tick **não reenvia**; degradação graciosa). Envio atrás de **`MessageProvider`** (`ZapiMessageProvider` hoje → Cloud API sem reescrever a lógica — L6/R1). **Confirmação pelo PORTAL** (L3, sem webhook inbound): `GET /escala/me/assignments` + `PUT /escala/me/assignments/:id {status}` (realm de membro, só o próprio, só publicado; alheio→403, outra paróquia→404, rascunho→400). **Recusa** (L4) marca `DECLINED`, **reabre a vaga como lacuna na S8** (grid ignora DECLINED; reusa o marcador `hasUnpublishedChanges`) e **notifica o coordenador** no grupo da equipe — **sem re-escalar** (D11/J3). Sem re-escala automática, sem webhook inbound (fora do escopo). CI verde (api 185, worker 30, web 14). |
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

- **2026-07-09 — S6-redesign (Portal de Disponibilidade — usabilidade)** · PR #46
  - **Motivo (piloto):** a tela antiga listava as ~30 missas do mês numa coluna
    vertical de cartões grandes — no celular, rolagem interminável e ~30 toques
    para informar um mês; a regra recorrente (que deveria ser o caminho
    principal) ficava escondida e colapsada. O redesign **inverte a hierarquia**.
    **Só a UI muda** — nada nos endpoints `/escala/me/*` nem no resolvedor
    `resolveAvailability` da S6 (backend intocado, D9 respeitado).
  - **Regra recorrente protagonista (R1):** card em destaque no topo, **aberto
    por padrão**, com a frase "Sempre disponível em:" + **chips de dia da semana**
    (Dom…Sáb). Ligar um chip grava uma regra de dia inteiro disponível e
    **pré-preenche o mês** (o pré-preenchimento reflete no recarregamento). Um
    **autosave coalescido** (debounce 400ms) transforma toques rápidos em vários
    chips num único PUT — sem perder toque. Disclosure secundário **"Preciso de um
    horário específico"** preserva a capacidade completa do backend (dia + horário
    + disponível/indisponível) fora do caminho principal (salvamento explícito).
  - **Navegação semana a semana (R2):** as ocorrências do mês são agrupadas em
    semanas (Dom..Sáb, função pura `groupIntoWeeks`); o voluntário vê ~7–10 missas
    por vez com setas anterior/próxima e o rótulo "Semana de 5 a 11 de julho". A
    navegação **atravessa a virada do mês** (chegou na última semana → carrega o
    mês seguinte e cai na 1ª semana; `shiftMonth`), e o rótulo do mês é um atalho
    para o seletor nativo (pulo direto). Abre na semana de **hoje** quando o mês é
    o corrente. **Nunca** a lista vertical do mês inteiro.
  - **Linhas compactas + toggle de um toque (R3/R4):** cada missa é uma linha
    (dia + hora + solenidade), com um segmentado **Livre / Não** de um toque
    (binário — MAYBE não exposto, U4). Alvos de toque ≥44px, mobile-first.
  - **Três estados visualmente distintos (R5 + U1):** `availabilityView` mapeia
    (status + source) para **`available` (verde)** × **`unavailable` (ardósia)** ×
    **`unanswered` (âmbar, tracejado)**. "Sem resposta" (default) resolve
    indisponível (opt-in preservado) mas é **visualmente diferente** do indisponível
    marcado — linha tracejada âmbar + legenda "Sem resposta" + contador
    "N missas sem resposta nesta semana". O **preenchimento do toggle codifica a
    origem**: sólido = "Você marcou", tonalizado (tint + ring) = "Pela sua regra",
    apagado/tracejado = "Sem resposta". Reset "seguir a regra" (CLEAR) quando há
    desvio explícito.
  - **Skill `frontend-design` aplicada:** tema da paróquia reusado (paleta
    `primary` azul + cartões/rounded do formulário público — identidade, não
    default genérico); a estrutura é informação (regra no topo, semana como ritmo,
    origem no preenchimento); copy na voz do produto ("Pela sua regra" / "Você
    marcou" / "Sem resposta"; estado vazio "A escala deste mês ainda não foi aberta
    pela coordenação."); mobile-first, `focus-visible`, `motion-safe`, alvos
    grandes, pouca rolagem.
  - **Helpers puros em `apps/web/src/lib/escala.ts`** (testáveis, precedente da
    S8/S2.1): `groupIntoWeeks`, `weekStartOf`, `weekRangeLabel`, `monthLabel`,
    `formatRowDay`, `shiftMonth`, `availabilityView`, `availabilityOrigin`,
    `isDayWideAvailable`, `dayWideAvailableWeekdays` + tipos do portal.
  - **Backend intocado (respeitado):** endpoints `/escala/me/*` e
    `resolveAvailability` iguais; **autosave por toggle segue funcionando** (mesmo
    contrato `AVAILABLE|UNAVAILABLE|CLEAR`). Sem schema/migração; Intenções sem
    regressão (D9).
  - **Verificação:** `pnpm -r typecheck`/`lint` (0 erros; só warnings
    pré-existentes)/`test` **verdes** — **web 35** (16 novos: `availabilityView`
    três estados/`availabilityOrigin`, `weekStartOf`, `weekRangeLabel` incl. virada
    de mês, `monthLabel`, `formatRowDay`, `shiftMonth` incl. virada de ano,
    `groupIntoWeeks` — agrupa/conta sem-resposta/vazio, chips de regra), **api 201**,
    **worker 30**; `next build` compila `/p/[slug]/escala`. Conferência de UX em
    tela de celular fica para o Leal (o CI não pega usabilidade de tela pequena).

- **2026-07-09 — S2.1 (Gestão de ocorrências do mês aberto)** · PR #42
  - **Correção do piloto:** a materialização (S2) preserva o que existe (upsert —
    D7), então corrigir o cadastro de missas **depois** não removia a ocorrência
    fantasma, e não havia UI para remover uma ocorrência avulsa. S2.1 dá ao
    admin/coordenador as duas capacidades que faltavam, **sem** destruir dado
    humano (escala/disponibilidade) sozinha.
  - **Novo `OccurrenceController` sob `/escala/occurrences`** (`EscalaAuthGuard`),
    **separado** do `EscalaController` de materialização (admin-only, sob
    `/admin/escala/occurrences`, intocado). Autorização por
    **`EscalaAccessService.assertCanManageOccurrences`** (método novo): ocorrência
    é recurso **de nível paróquia** (a exclusão/reconciliação cascateia por todas
    as equipes), então passa **admin** (dono) **ou** qualquer **coordenador ativo**
    da paróquia (D2) — autoridade **lida do banco** a cada request.
  - **`DELETE /escala/occurrences/:id[?force=true]`** — a exclusão **cascateia**
    (`onDelete: Cascade` de `Assignment`/`AvailabilityEntry` → `MassOccurrence`, já
    no schema da S1). Por isso: sem escala **e** sem disponibilidade → **remove
    direto**; com dado humano e **sem `force`** → **não apaga**, devolve
    `{ deleted: false, requiresConfirmation: true, occurrence, affected }` (contagem
    de escalados/publicados/respostas) para a UI **avisar antes**; `force=true` →
    apaga (o coordenador confirmou). Ownership por paróquia (**404 não vaza**).
  - **`POST /escala/occurrences/reconcile { month }`** — recalcula o conjunto
    **esperado** do cadastro **atual** (`MassSchedule` ativos + `MassException`),
    **reusando a mesma regra da S2** (`buildCandidates`, extraída p/ um só lugar —
    replicada, não importada do worker — D9). **Adiciona** faltantes; **atualiza**
    (só a origem, preservando `isSolemnity`/título/escala/disponibilidade — D7) o
    que continua válido; **órfã vazia** (sem escala e sem disponibilidade) → remove
    direto (`removedClean`); **órfã com dado humano** → **NÃO** remove, vira
    **conflito** devolvido p/ decisão manual (`conflicts: [{ occurrenceId, date,
    time, hasAssignments, hasAvailability, assignmentCount, availabilityCount }]`).
    Tudo numa `$transaction`. Resumo: `{ month, added, updated, removedClean,
    conflicts }`.
  - **`GET /escala/occurrences?month=YYYY-MM`** — lista da tela de gestão com
    **indicadores**: `hasAssignments`/`assignmentCount`, `hasAvailability`/
    `availabilityCount`, `isSolemnity` e **`inCadastro`** (`false` = órfã/fantasma —
    o horário não existe mais no cadastro, candidata à reconciliação).
  - **Regra que evita destruir dado (o coração da sessão):** reconciliação e
    exclusão **nunca** apagam escala/disponibilidade sem decisão explícita. Remove
    sozinha **só** o que está claramente **vazio e órfão**; qualquer dado humano
    vira aviso (DELETE) ou conflito (reconcile).
  - **UI `/admin/escala/ocorrencias`** (Next.js App Router, espelhando o painel
    admin — `useSession` + `apiAuthFetch`): seletor de mês, lista com os
    indicadores acima, ação **Excluir** com **modal de aviso** (mostra o que será
    perdido — "N escalado(s) e M resposta(s)") antes de cascatear, e botão
    **"Reconciliar mês"** com **resumo** (adicionadas/removidas/conflitos) e
    **resolução por conflito** (Manter ou Excluir mesmo assim). Item "Ocorrências
    do mês" adicionado à seção Escala da sidebar. Helpers puros em `lib/escala.ts`
    (`weekdayOf`, `affectedLabel`).
  - **Zod em `packages/shared`:** `reconcileMonthSchema` (`{ month }`). Sem novos
    enums/tabelas.
  - **Sem schema/migração novos** — reusa as tabelas da S1 (aditivo puro; nada
    tocado nas Intenções — D9). **Fora de escopo (respeitado):** algoritmo (S7),
    captura de disponibilidade (S6), dispatch das Intenções (D9).
  - **Verificação:** `pnpm -r typecheck`/`lint` (0 erros; só warnings
    pré-existentes)/`test` **verdes** — **api 201** (16 novos: reconcile —
    adiciona/órfã vazia/órfã-com-escala/órfã-com-disponibilidade/preserva
    solenidade+título/cenário do piloto; delete — vazia/aviso-sem-force/force/404
    cross-parish; list — indicadores+`inCadastro`; access —
    `assertCanManageOccurrences` admin ∪ coordenador ∪ 403), **web 18** (5 novos:
    `weekdayOf`, `affectedLabel`), worker 30; `prisma validate` OK (schema
    intocado). Intenções sem regressão (worker/dispatch intocados — D9).

- **2026-07-09 — S9 (Lembretes e Confirmação)** · PR #40
  - **Dados — migração 16** `add_escala_reminders` (puramente aditiva):
    - `CREATE TYPE "ReminderKind"` (`GROUP_SUMMARY`/`INDIVIDUAL_EVE`/`INDIVIDUAL_DAY`);
    - `CREATE TABLE "reminder_logs"` — dedupe do cron, com **`@@unique([kind,
      target_key])`** como garantia de idempotência. **Grão do alvo** (justificado):
      individual → `assignmentId` (1 por escalação e por tipo); grupo →
      `teamId:YYYY-MM-DD` (1 por equipe e por dia). `assignmentId`/`teamId` soltos
      (sem FK) para desacoplar do ciclo de vida do assignment; só `parishId` é FK;
    - `ADD COLUMN` de config por paróquia em `parish_settings` (L2):
      `reminders_enabled` (**default false** — gate consciente do R1),
      `reminder_eve_hour` (18), `reminder_same_day_hours_before?` (null = off),
      `reminder_group_summary_days_before` (3). **Só `ADD COLUMN`** — nenhum
      `ALTER`/`DROP` em tabela de Intenções (D9 / Seção 1.1). `migrate deploy`
      limpo em base zerada (16 migrações) + `migrate diff` **sem drift**.
  - **Worker — job isolado (D9/L5):** novo cron `check-reminders` (1min),
    **separado** do `check-dispatches`; uma falha aqui **não** encosta no despacho
    das Intenções. A cada tick: acha os assignments **publicados** de missas na
    janela, decide o que enviar (`planReminders`, **pura**) e envia.
  - **`planReminders` (pura, testável sem I/O)** — véspera (`INDIVIDUAL_EVE`, a
    partir da hora configurada) + opcional no dia (`INDIVIDUAL_DAY`, N horas antes)
    **só para escalados**; **resumo no grupo** (`GROUP_SUMMARY`, N dias antes, **1
    msg por equipe/dia** — várias missas da equipe no mesmo dia colapsam). Nunca
    lembra missa no passado; propaga destino nulo (sem telefone/grupo) para o
    service pular.
  - **`ReminderService` (I/O) — idempotência claim-then-send:** cria o
    `ReminderLog` **antes** de enviar; colisão `P2002` na chave única → **não
    reenvia** (reprocessar o mesmo tick é no-op). **Degradação graciosa:** falha de
    envio rebaixa o log (`success=false`) e **segue** — nunca trava o tick nem
    derruba outras missas/paróquias. Só paróquias com `remindersEnabled` e Z-API.
  - **Interface de provedor (L6/R1):** o envio depende só de **`MessageProvider`**
    (`sendText(target, message)`); `ZapiMessageProvider` é a implementação atual
    (reusa o `WhatsappService` do worker). Trocar Z-API → **WhatsApp Cloud API
    oficial** é injetar outro provedor no `main.ts` — **sem reescrever** a lógica de
    lembrete. É a mitigação estrutural do R1 (individual em massa é o 1º candidato
    à API oficial).
  - **Confirmação pelo PORTAL (L3 — sem webhook inbound da Z-API):** endpoints do
    realm de membro sob `MemberJwtGuard` — `GET /escala/me/assignments?from=&to=`
    (minhas escalas **publicadas**; default hoje..+60d) e
    `PUT /escala/me/assignments/:id {status: CONFIRMED|DECLINED}`. `memberId`/
    `parishId` **sempre do JWT**: só o **próprio** assignment (alheio → **403**),
    só **publicado** (rascunho → **400**), outra paróquia → **404** (não vaza).
  - **Recusa → coordenador (L4):** `DECLINED` mantém a linha (histórico), marca
    `declinedAt`, e **reabre a vaga como lacuna na S8** — `buildScheduleGrid`
    (via `getGrid`) passa a **ignorar DECLINED**, então `filled` cai, `missing`
    sobe e a lacuna reaparece; **reusa o marcador** `hasUnpublishedChanges` (uma
    recusa de escala publicada acende o aviso, como um rascunho novo). **Notifica o
    coordenador** no grupo da equipe (`EscalaNotifyService.sendDeclineNotice`,
    degradação graciosa). **Não** re-escala (D11/J3) — o coordenador resolve.
  - **Zod em `packages/shared`:** `memberAssignmentsQuerySchema` (from/to YYYY-MM-DD,
    `from<=to`) e `memberAssignmentStatusSchema` (`CONFIRMED`/`DECLINED`); enum
    `ReminderKind` espelhado em `types.ts`.
  - **Fora de escopo (respeitado):** webhook inbound da Z-API (responder no
    WhatsApp) e **re-escala automática** — ambos fase futura; troca membro↔membro
    (S10).
  - **Verificação:** `pnpm -r typecheck`/`lint` (0 erros; só warnings pré-existentes)
    /`test` **verdes** — **api 185** (9 novos: confirmação/recusa, alheio→403,
    rascunho→400, notificação + degradação graciosa; grid reabre lacuna na recusa),
    **worker 30** (14 novos: `planReminders` — janelas/grão/passado; `ReminderService`
    — idempotência 2 ticks→1 envio, claim-then-send, degradação graciosa, gate R1),
    web 14; `prisma validate` OK; `migrate deploy` limpo + `migrate diff` sem drift.
    Intenções sem regressão (worker/dispatch de Intenções intocados — D9).

- **2026-07-07 — S8 · PR 2 de 2 (Tela do coordenador — frontend/UI)**
  - **Tela `/admin/escala/montagem`** (`apps/web`, Next.js App Router) **reusando o
    design do painel admin** (mesmo idioma de S4/S6.5: client component + `useSession`
    + `apiAuthFetch`, cartões/tabelas Tailwind) — nenhuma UI nova inventada. Item
    **"Montagem"** adicionado à seção Escala da sidebar. Consome **apenas** os
    endpoints de apoio do PR 1 (nenhum backend novo, nenhum endpoint alterado).
  - **Grade do mês por missa (V1)** — seletor de equipe + mês; para cada ocorrência,
    um cartão com selo de solenidade e, por função com demanda, uma vaga (`slot`) com
    o contador `preenchidas/necessárias`. Nomes preenchidos aparecem como chips
    (rascunho azul / publicado verde, selo ⚠ + tooltip quando há `overrideReason`, com
    botão de remover). **Lacunas destacadas** com "vaga aberta" e o **motivo** do `gap`
    (`SEM_QUALIFICADO`/`SEM_DISPONIVEL`/`TODOS_NO_TETO`).
  - **"Sugerir distribuição"** — chama `POST /escala/schedule/suggest` da S7 para a
    equipe/mês selecionada; a UI **deixa claro que só preenche vaga vazia (A5)** e não
    apaga ajustes manuais; mostra o resumo `criadas/lacunas` e recarrega a grade.
  - **Resolução de vaga (V2)** — clique em "Resolver vaga" abre o modal com a lista
    **priorizada** vinda do backend: **elegíveis primeiro**, depois **excluídos
    rotulados** (indisponível / no teto / já escalado). Escolher um elegível escala
    direto; escolher um excluído abre o **modal de confirmação com `overrideReason`
    obrigatório** (override consciente) → `POST /escala/assignments` com a
    justificativa. A helper pura `splitCandidates` particiona preservando a ordem.
  - **Contenda (V3)** — candidato já em outra equipe na mesma missa aparece
    **desabilitado e rotulado** ("já na MESC, 10:00") **antes** de tentar; o backstop é
    o 409 do endpoint (nunca erro seco).
  - **Publicar (V4)** — `POST /escala/schedule/publish` por equipe/mês com confirmação;
    a grade mostra o estado de publicação (badge **Publicada** + aviso de **mudanças
    não publicadas** quando `hasUnpublishedChanges`) e **segue editável** depois.
  - **Painel por pessoa (V1 — conferência da justiça)** — coluna secundária tabulando,
    por membro qualificado da equipe, o **nº de serviços no mês + as datas** (helper
    pura `buildPersonPanel`, incluindo os qualificados com 0), para ver de relance se o
    rodízio (J1/J2) ficou justo.
  - **Autorização:** a tela vive no painel admin (token NextAuth); os endpoints de
    apoio (PR 1) já impõem coordenador/admin via `EscalaAuthGuard` +
    `EscalaAccessService`. `parishId` sempre do ator (nunca no request).
  - **Tipos + helpers puros em `apps/web/src/lib/escala.ts`** (espelham o
    `schedule-grid.ts`): `ScheduleGrid`/`GridOccurrence`/`GridSlot`/`GridCandidate`,
    rótulos (`gapLabels`, `candidateReasonLabels`), `formatOccurrenceDate`,
    `conflictLabel`, `splitCandidates`, `buildPersonPanel`.
  - **Verificação:** `pnpm --filter web typecheck`/`lint` (0 erros; só warnings
    pré-existentes) verdes; **web 14 testes** (6 novos: `splitCandidates`,
    `buildPersonPanel`, `formatOccurrenceDate`, `conflictLabel`); `next build` compila
    a rota nova `/admin/escala/montagem`. API/worker/shared **intocados** — nenhum
    endpoint alterado (PR 1). Intenções sem regressão (D9).
  - **Fora de escopo (respeitado):** lembrete/aviso pós-publicação (S9);
    troca/substituição iniciada pelo membro (S10); portal de coordenador no realm de
    membro (a tela reusa o painel admin, como a S4 estabeleceu).

- **2026-07-07 — S8 · PR 1 de 2 (Tela do coordenador — backend/endpoints de apoio)** · PR #36
  - **Migração 15** `add_assignment_override_and_republish`: colunas aditivas
    `Assignment.overrideReason` (`override_reason TEXT`) e `Assignment.republishedAt`
    (`republished_at TIMESTAMP(3)`). **Só `ADD COLUMN`** na tabela da Escala
    `assignments` — nenhum `ALTER`/`DROP` em Intenções (D9). Aplica limpo em base
    zerada (15 migrações) e **sem drift** (`migrate diff` = "No difference detected").
  - **`GET /escala/schedule?month&teamId`** (`ScheduleController.grid` →
    `ScheduleService.getGrid`): a **grade por missa** de uma equipe — ocorrências do
    mês + assignments (rascunho e publicados) + **`gaps` recalculados** (mesma
    taxonomia da S7: `SEM_QUALIFICADO`/`SEM_DISPONIVEL`/`TODOS_NO_TETO`) + por vaga a
    lista **priorizada** de candidatos qualificados. Núcleo em **função pura**
    `buildScheduleGrid` (`schedule-grid.ts`), **reusando** `resolveStaffing` (S3, D6)
    e `resolveAvailability` (S6). Cada candidato leva as flags **`eligible`** /
    **`reason`** (`INDISPONIVEL` A1 / `NO_TETO` A3 / `JA_NA_OCORRENCIA` A4) /
    **`conflict`** (onde já serve nesta ocorrência — visibilidade cruzada D5/V3).
    Elegíveis primeiro (por carga na equipe ↑), excluídos depois — determinístico.
  - **`POST /escala/assignments`** (`AssignmentController` → `createAssignment`):
    atribuição manual `{occurrenceId, functionId, memberId, overrideReason?}`. A
    função identifica a equipe (autorizada via `assertCanManageTeam`). **V2 —
    override consciente:** membro inelegível (indisponível A1 / no teto A3 / não
    qualificado A2) **sem** `overrideReason` → **422** listando os motivos; **com**
    `overrideReason` → cria e registra a justificativa. **V3 —** já escalado na
    ocorrência (qualquer equipe, D4/Regime A global) → **409 claro** (pré-checagem
    amigável + backstop `P2002` do `unique(occurrenceId, memberId)`). Cria **sempre
    rascunho** (`publishedAt=null`), mesmo sobre escala publicada (V4);
    `assignedByUserId`/`assignedByMemberId` conforme o realm.
  - **`DELETE /escala/assignments/:id`** — remove (rascunho **ou** publicado — V4);
    ownership por paróquia (404 não vaza); autorização por equipe. Hard delete
    (preserva o `unique` livre para re-alocação).
  - **`POST /escala/schedule/publish`** `{month, teamId}` — carimba `publishedAt`
    (onde nulo) **e** `republishedAt` (selo) de todos os assignments vivos da
    (equipe, mês), em `$transaction`. **Publicado continua editável** (V4); um
    rascunho novo por cima (`publishedAt=null`) ou a re-selagem tornam a mudança
    **detectável** para a S9 — **sem tabela de auditoria**. Coordenador só a própria
    equipe. O GET devolve `publication: { publishedAt, published, hasUnpublishedChanges }`.
  - **Decisão da sessão (V4):** adotado **`republishedAt`** (timestamp), não
    `publishedVersion` — o mais simples que satisfaz "editável depois de publicado +
    mudança detectável" **sem** uma tabela por (equipe, mês).
  - **Autorização (reusa S5):** tudo sob `EscalaAuthGuard` +
    `EscalaAccessService.assertCanManageTeam` — coordenador só as **próprias**
    equipes (403 fora; 404 em outra paróquia); admin todas; `parishId` sempre do ator.
  - **Zod em `packages/shared`:** `scheduleGridQuerySchema` (month+teamId),
    `assignmentCreateSchema` (+ `overrideReason?`), `schedulePublishSchema`.
  - **Fora de escopo (respeitado):** toda a **UI** (grade, painel por pessoa, modais
    de override) → **PR 2 (frontend)**; lembrete/aviso pós-publicação → S9.
  - **Verificação:** `pnpm -r typecheck`/`lint` (0 erros)/`test` **verdes** — **api
    176** (21 novos: `buildScheduleGrid` — eligible/reason/conflict, gaps, ordenação;
    `ScheduleService` — grade, publicação/V4, override/V2 → 422, contenda/V3 → 409,
    autorização coordenador/admin, publish), worker 8/8, web 8/8; `prisma validate`
    OK; `migrate deploy` limpo em base zerada + `migrate diff` sem drift; migração
    aditiva conferida (só `assignments`). Intenções sem regressão (D9).

- **2026-07-07 — S7 (Motor de sugestão — backend)** · PR #32
  - **Planner puro `planSchedule`** (`apps/api/src/escala/suggest-schedule.ts`),
    sem I/O: dado o mês (ocorrências + equipes), as atribuições existentes e a
    disponibilidade, devolve `{ toCreate, gaps }`. **Reusa as funções puras já
    testadas** — `resolveStaffing` (S3, demanda por escopo D6) e
    `resolveAvailability` (S6, `explicit > rule > default`) — sem reimplementar
    regra. É onde vivem J1–J4 e A1–A6. Testável sem banco.
  - **Regras de justiça:** **J1** balanceamento da carga **total** no mês (escala
    primeiro quem tem menos atribuições **somando todas as equipes**, não só a
    equipe da vaga); **J2** **rodízio** — desempate por `lastServedAt` (data do
    último assignment; quem serviu **há mais tempo** primeiro), semeado do
    histórico **anterior ao mês** (consulta única) e **atualizado em memória** a
    cada alocação; **`TeamMembership.priority` não é desempate de justiça** (é
    contenda entre equipes — D5, fica para S8); **J3** o algoritmo **nunca
    relaxa** qualificação/disponibilidade/teto/exclusividade — prefere a lacuna;
    **J4** **determinístico** (ordenação total: `atribuições_no_mês↑,
    lastServedAt↑, memberId↑`; ocorrências por data/hora/id; equipes por nome/id;
    funções por sortOrder/id; nunca aleatório nem dependente da ordem do banco).
  - **Decisões automáticas:** **A1** quem "não informou" (`default`) resolve
    indisponível e **nunca** é escalado (opt-in S6); **A2** só quem tem a função
    qualificada no vínculo; **A3** respeita o teto por equipe
    (`maxAssignmentsPerMonth` — D8; `null` = sem teto); **A4** uma pessoa por
    ocorrência (`unique(occurrenceId, memberId)` — D4/Regime A, **global** entre
    equipes); **A5** **não sobrescreve rascunho** — preenche só
    `requiredCount − atribuições existentes`, preservando o que já existe; **A6**
    só `Member`/`TeamMembership` ativos.
  - **Lacunas categorizadas** (`gaps`): `SEM_QUALIFICADO` (nenhum qualificado),
    `SEM_DISPONIVEL` (havia qualificados, mas nenhum/insuficientes disponíveis) e
    `TODOS_NO_TETO` (havia disponíveis, mas no teto ou já servindo na ocorrência).
    Cada lacuna leva ocorrência/data/hora, equipe, função, `required`/`filled`/
    `missing` e o motivo.
  - **`SuggestionService` + `ScheduleController`** — `POST /escala/schedule/suggest`
    (body `{ month, teamIds? }`) sob `EscalaAuthGuard`. Autoriza as equipes via
    `EscalaAccessService.assertCanManageTeam` (coordenador só as próprias → 403 em
    alheia, 404 em outra paróquia; admin qualquer). Sem `teamIds`: admin → todas
    as equipes ativas da paróquia; coordenador → as que coordena. **Mês não
    materializado → 400** com mensagem clara (materialização S2 é pré-requisito).
    Cria os `Assignment` em rascunho (`publishedAt=null`, `SCHEDULED`,
    `assignedByUserId`/`assignedByMemberId` conforme o realm) em `createMany`
    (o planner garante zero colisão de A4 → unicidade nunca violada) e devolve
    `{ created, gaps }`. `parishId` sempre do ator.
  - **Zod em `packages/shared`:** `scheduleSuggestSchema` (`month` + `teamIds?`).
  - **Sem schema/migração novos** — reusa as tabelas da S1 (aditivo puro; nada
    tocado nas Intenções — D9). **Fora de escopo (respeitado):** UI de montagem,
    override manual, visão de conflitos e **publicação** (S8); lembrete (S9).
  - **Verificação:** `pnpm -r typecheck`/`lint` (0 erros)/`test` **verdes** —
    **api 155** (26 novos: planner J1–J4/A1–A6, rodízio por lastServedAt e carga total, taxonomia de lacunas, escopo D6,
    A4 global; service — auth admin/coordenador, rejeição de mês não
    materializado, A5, `assignedBy` por realm, conjunto padrão de equipes),
    worker 8/8, web 8/8; `prisma validate` OK (schema intocado). Intenções sem
    regressão (worker/dispatch intocados — D9).

- **2026-07-06 — S6.5 (Convites e Convocação)** · PR #16
  - **Dados — migração 14** `add_team_whatsapp_group`: coluna aditiva
    `Team.whatsappGroupId` (`whatsapp_group_id TEXT`). **Só `ADD COLUMN`** na
    tabela da Escala `teams` — nenhum `ALTER`/`DROP` em tabela de Intenções.
    Cadastrável na tela de equipe (S4), com nota de ajuda de onde obter o ID.
  - **`EscalaNotifyService`** (`apps/api/src/escala/escala-notify.service.ts`):
    centraliza os envios de convite/convocação **reusando a entrega Z-API da S5**
    (`WhatsappService`, credenciais por paróquia). Toda mensagem leva o **link do
    portal** (`/p/{slug}/escala/entrar`) — o membro pede o código lá; **nunca**
    embute OTP.
  - **Convite individual (C1/C3)** disparado no **vínculo**
    (`CadastroService.createMembership`, flag `sendInvite` — **default `true`**;
    checkbox "Enviar convite por WhatsApp" **já marcado** na UI): 1 mensagem citando
    a equipe e a paróquia. **Degradação graciosa** (padrão do sistema): sem Z-API,
    sem telefone, ou falha de envio → o cadastro **conclui** e a falha é **logada**,
    nunca quebra o cadastro nem vaza no response. Disparo no vínculo (e não no
    `POST members`) por ser onde há equipe a citar (nota de decisão do doc).
  - **Convocação de disponibilidade (C2/C4/C5)** — `ConvocationController` +
    `ConvocationService`, endpoint `POST /admin/escala/convoke` sob
    `EscalaAuthGuard`. **Passo separado da materialização** (S2): "Abrir mês" cria
    as ocorrências independentemente; a convocação é uma ação à parte que **não**
    bloqueia a materialização. **1 mensagem por grupo de equipe** (nunca 1 por
    pessoa — saída desenhada para o R1). **Autorização reusa
    `EscalaAccessService.assertCanManageTeam`** (nenhuma regra nova): equipes são
    autorizadas **antes** de qualquer envio — coordenador só a **própria** equipe
    (403 em alheia), pároco/admin escolhe as equipes; equipe de outra paróquia →
    404. **C5:** equipe sem `whatsappGroupId` é **pulada** com aviso no resumo (não
    é erro); paróquia sem Z-API idem; falha de envio vira `failed` sem derrubar as
    outras. Resumo devolvido: `sent`/`skipped`/`failed` + motivo por equipe.
  - **Frontend** (`apps/web`, `/admin/escala/*`): campo **"Grupo de WhatsApp"** na
    tela de equipe; **checkbox "Enviar convite por WhatsApp"** (marcado) no vínculo;
    painel **"Convocar equipes"** na página de equipes (mês + prazo opcional +
    seleção de equipes, marcando as sem grupo, + resumo do envio).
  - **Zod em `packages/shared`:** `whatsappGroupId` em `teamSchema`; `sendInvite`
    em `teamMembershipSchema`; `convocationSchema` (`month`/`teamIds`/`deadline?`).
  - **R1 respeitado:** nenhum envio individual em massa — convite é 1 msg por ação
    humana pontual; convocação é 1 msg por grupo. Ainda é Z-API (WhatsApp
    não-oficial); a saída definitiva para notificação individual recorrente segue
    sendo a Cloud API oficial (registrado no R1; não bloqueia o MVP).
  - **Verificação:** `pnpm -r typecheck`/`lint` (0 erros)/`test` **verdes** — **api
    119** (novos: convite no vínculo, convocação/autorização/C5, degradação
    graciosa do `EscalaNotifyService`), worker 8/8, web 8/8; `next build` compila as
    rotas; `prisma validate` OK; migração aditiva conferida no diff. Intenções sem
    regressão (worker/dispatch intocados — D9).
  - **Fora de escopo (respeitado):** lembrete pré-missa (S9), envio individual em
    massa, algoritmo (S7).

- **2026-07-02 — S4 (Cadastro — Frontend admin)** · PR #10
  - Páginas de administração do módulo Escala sob `/admin/escala/*` no
    `apps/web` (Next.js App Router), consumindo os endpoints da S3. **Espelham
    o design do painel admin existente** (mesmo idioma de `masses`/`emoluments`:
    client component + `useSession` + `apiAuthFetch`, tabelas/cartões Tailwind,
    formulário-em-cima/lista-embaixo) — nenhuma UI nova inventada.
  - **`/admin/escala/equipes`** — lista/CRUD de equipes (nome, categoria,
    descrição, ativa), com contadores de funções/membros e link para o detalhe.
    Inclui o botão opcional **“Abrir mês”**, que chama a materialização da S2
    (`POST /admin/escala/occurrences/materialize`) e exibe o resumo
    `criadas/atualizadas/total`.
  - **`/admin/escala/equipes/[teamId]`** — detalhe da equipe em três abas:
    **Funções** (CRUD, `sortOrder`), **Vínculos** (`TeamMembership` com
    `isCoordinator`, teto/mês — D8 — e `priority` — D5 — mais editor inline de
    **qualificações** em *replace-set* das funções da equipe) e **Demanda**
    (`StaffingRequirement`).
  - **Demanda — alvo acompanha o escopo** (espelha o padrão do `Emolument`):
    `WEEKDAY→dia da semana`, `SCHEDULE→horário` (lista de `MassSchedule`),
    `OCCASION→exceção` (lista de `MassException`); `DEFAULT`/`SOLEMNITY` sem
    alvo. Troca de escopo zera o alvo anterior e **combinação inválida deixa o
    botão de salvar desabilitado** (não submetível) — além da validação Zod do
    backend.
  - **`/admin/escala/membros`** — cadastro de membros no nível paróquia com
    busca (`?q=`), filtro de ativos e paginação. O **aviso de possível
    duplicata de telefone** (resposta 201 com `warning`) é exibido **sem
    bloquear** o cadastro.
  - `parishId` **nunca** vai no request (derivado do JWT no backend). **Sem
    backend novo**, **sem UI de coordenador** (é S8) e sem tocar Intenções.
    Navegação: seção “Escala” adicionada à sidebar do admin.
  - Verificação (apps/web): `typecheck`, `lint` e `test` (8/8) verdes;
    `next build` compila as 3 rotas novas. API/worker/shared **intocados**.

- **2026-07-02 — S6 (Portal de disponibilidade)** · PR #9
  - **Resolvedor puro `resolveAvailability`** (`apps/api/src/escala/resolve-availability.ts`):
    precedência `explicit > rule > default`, devolvendo também a `source`
    (`explicit`/`rule`/`default`). Regra de horário específico vence a de dia
    inteiro (`time=null`); `default` = "não informou" (opt-in U1/U2); status
    binário na UI (U4 — `MAYBE` no enum resolve como `UNAVAILABLE` efetivo).
    Unit-testado nas 3 origens + casamento de regra (hora específica e dia
    inteiro) + precedência entre elas.
  - **Refino consciente do schema (U3):** a regra recorrente **não** materializa
    entries. `AvailabilityEntry` guarda **só desvios** (o membro marca um slot
    sem regra ou desmarca um que a regra deixava disponível); a disponibilidade
    efetiva é calculada pelo resolvedor sob demanda. Elimina o bug de "mudei a
    regra e as entries antigas ficaram velhas". A S7 reusa o mesmo resolvedor.
  - **Endpoints do realm de membro** (`MemberPortalController`, sob
    `MemberJwtGuard`, escopo `req.member`): `GET /escala/me` (perfil),
    `GET /escala/me/occurrences?month=YYYY-MM` (ocorrências + disponibilidade
    efetiva; mês não materializado → lista vazia), `PUT /escala/me/availability`
    (`AVAILABLE`/`UNAVAILABLE`/`CLEAR`; `CLEAR` apaga o entry e volta a valer a
    regra), `GET`/`PUT /escala/me/rules` (replace-set). `memberId`/`parishId`
    **sempre do JWT**, nunca do path/body; ocorrência de outra paróquia → 404
    (isolamento testado). Rate limit nas escritas (`ThrottlerGuard`).
  - **Frontend `/p/{slug}/escala/*`** (mobile-first, sessão de membro em cookie
    próprio, separada do NextAuth do admin): `entrar` (login OTP em dois passos
    + callback do link mágico via `GET /escala/auth/magic`, com erros
    **genéricos** — anti-enumeração da S5 preservada); visão do mês com toggle
    binário Disponível/Indisponível e **autosave por toggle** (indicador
    "Salvo"), selo de solenidade, seletor de mês, estado vazio amigável; editor
    de regra recorrente (replace-set) que ao salvar re-preenche o mês.
  - **Zod em `packages/shared`:** `monthSchema`, `memberAvailabilityUpsertSchema`,
    `memberAvailabilityRuleSchema`/`memberAvailabilityRulesSchema` (replace-set
    sem duplicatas, espelhando o `@@unique([memberId, weekday, time])`).
  - **Sem schema/migração novos** (reusa `AvailabilityEntry`/`MemberAvailabilityRule`
    da S1). Intenções sem regressão; `lint`/`typecheck`/`test` verdes
    (104 testes na API), `web build` OK, `prisma validate` OK.
  - Fora de escopo (não implementado, por design): tela de coordenador,
    visualização de escala/atribuições, edição de `priority` pelo membro.

- **2026-07-02 — S5 (Auth de membro)** · PR #8
  - **Segundo realm de autenticação** (D1), 100% aditivo, em Postgres puro (D10),
    no novo pacote `apps/api/src/escala/auth/`. Admin/Intenções intactos: o
    `JwtAuthGuard`/`JwtStrategy`/`RolesGuard` do admin **não foram tocados**.
  - **Fluxo sem senha** (`MemberAuthController`, público, escopado por `parishSlug`):
    - `POST /escala/auth/request` — **sempre 200 genérico** (anti-enumeração); só
      entrega de fato se a paróquia existe e o `Member` está ativo.
    - `POST /escala/auth/verify` — OTP → `{ token }` (JWT de membro) ou **401 genérico**.
    - `GET /escala/auth/magic?token=…` — link mágico → `{ token }` ou 401 genérico.
  - **Tokens** (`MemberAuthTokenService`, sobre `MemberAuthToken`): OTP de 6 dígitos
    (TTL `OTP_TTL_MIN`, default 10); link mágico de 32 bytes base64url (TTL
    `MAGIC_LINK_TTL_MIN`, default 20). Só `sha256(raw)` em repouso; uso único;
    novo request **invalida** os anteriores não usados do mesmo `(memberId, type)`;
    comparação de OTP em **tempo constante**; **teto de 5 tentativas** por token
    (invalida ao estourar). Coluna aditiva **`attempts`** (migração 13
    `add_member_auth_token_attempts` — só `ADD COLUMN` na tabela da Escala, sem
    `ALTER`/`DROP` em Intenções).
  - **Entrega** (`MemberAuthDeliveryService`, degradação graciosa): OTP→WhatsApp
    (Z-API por paróquia); sem Z-API **e** com e-mail → cai para link mágico por
    e-mail (Brevo, método novo `EmailService.sendMemberAuthLink`). Nunca vaza no
    response. (R1 permanece **só** de S9 — aqui é transacional, volume baixo.)
  - **Realm isolado:** `MemberJwtStrategy`/`MemberJwtGuard` (`member-jwt`) com
    `MEMBER_JWT_SECRET` **separado** do admin (guardrail: recusa boot se igual ao
    `JWT_SECRET`); claims `sub`/`parishId`/`realm:'member'` (+ `coordinatorTeamIds`
    só p/ UI). `JwtModule` local scopeado ao secret de membro. O guard **recarrega
    o Member** e nega `isActive=false` (revogação imediata).
  - **`EscalaAuthGuard` composto** (admin **ou** membro) normaliza `req.actor`
    (`{ kind, userId?/memberId?, parishId }`).
  - **Autorização de coordenador ativada (D2) — `TODO(S5)` fechado:**
    `EscalaAccessService` agora lê **do banco** a cada request
    (`TeamMembership.isCoordinator && isActive`). `assertCanManageParish` = só
    admin; `assertCanManageTeam` = admin **ou** coordenador **daquela** equipe
    (403 em equipe alheia). Revogar `isCoordinator` tira o acesso **na hora**.
  - **Endpoints da S3 refatorados** para a matriz: `CadastroController` passa de
    admin-only para `EscalaAuthGuard`; operações de **nível paróquia** (Team,
    Member) seguem admin-only via `assertCanManageParish`; operações de **equipe**
    (functions/memberships/qualificações/staffing) aceitam o coordenador. Nomear
    coordenador (`isCoordinator`) permanece **admin-only** mesmo em vínculo da
    própria equipe.
  - **Env novas** (`.env.example`): `MEMBER_JWT_SECRET`, `MEMBER_JWT_TTL` (30d),
    `OTP_TTL_MIN` (10), `MAGIC_LINK_TTL_MIN` (20), `MEMBER_PORTAL_URL`.
  - **Testes:** unit de token (geração/validação, uso único, invalidação, teto de
    tentativas, tempo constante), do ramo de coordenador (banco → acesso) e do
    isolamento de realm (rejeição de payload sem `realm`, revogação por
    `isActive`, isolamento criptográfico). Suíte da API: **86 testes verdes**;
    lint/typecheck/test do workspace **verdes**; schema válido.
  - **Fora de escopo (respeitado):** nenhuma UI de membro (S6); worker/dispatch
    das Intenções intocados (D9).

- **2026-07-02 — S3 (Cadastro backend)** · PR #7
  - **`CadastroController` + `CadastroService`** adicionados ao módulo existente
    `apps/api/src/escala/` (`EscalaModule` de S2), sob o prefixo `/admin/escala`
    e convivendo com o `EscalaController` (ocorrências) em sub-rotas distintas.
    Todos os endpoints `JwtAuthGuard` + `RolesGuard` + `@Roles("PARISH_ADMIN")`.
  - **CRUD das 6 entidades:** `Team`, `TeamFunction`, `Member`, `TeamMembership`,
    `MembershipFunction` (qualificações, replace-set) e `StaffingRequirement`.
    - `parishId` **sempre do JWT**, nunca do body (regra transversal 1).
    - **Ownership por paróquia** em todo `:id`; recurso de outra paróquia → 404
      (não vaza existência). A checagem de equipe mora em `assertCanManageTeam`.
    - **Unicidade → 409 amigável** (P2002 traduzido): `Team(parishId,name)`,
      `TeamFunction(teamId,name)`, `TeamMembership(teamId,memberId)`.
    - **Qualificações:** `PUT memberships/:id/functions` substitui o conjunto
      inteiro em `$transaction`, validando que **cada** função pertence à equipe
      do membership (senão 400).
    - **Soft-delete** para entidades com histórico de `Assignment`: `Member`
      sempre; `Team`/`TeamFunction`/`TeamMembership` quando referenciadas
      (hard-delete só quando não há referência); `StaffingRequirement` hard sempre.
    - `POST members` não bloqueia telefone duplicado — devolve o membro com
      `warning` de possível duplicata.
  - **Schemas Zod em `packages/shared`:** `teamSchema`, `teamFunctionSchema`,
    `memberSchema` (reusa `fullNameSchema`/`phoneSchema`; `birthDate ≤ hoje`),
    `teamMembershipSchema`, `membershipFunctionsSchema` e
    `staffingRequirementSchema` — **discriminated union por `scope`** que rejeita
    campos de alvo incompatíveis (ex.: `weekday` em `DEFAULT` → 400). Alvos
    `massScheduleId`/`massExceptionId` validados como pertencentes à paróquia.
  - **`EscalaAccessService` (a costura — D2):** `assertCanManageParish` e
    `assertCanManageTeam`. Só `User PARISH_ADMIN` autoriza hoje; o ramo do
    coordenador (`Member` com `TeamMembership.isCoordinator`) está marcado como
    `TODO(S5)` — interface pronta, sem implementar o realm de membro (é S5).
  - **Função pura `resolveStaffing`** (`apps/api/src/escala/resolve-staffing.ts`),
    sem I/O: dado o descritor da ocorrência + regras, resolve a demanda por
    função pela prioridade `OCCASION > SOLEMNITY > SCHEDULE > WEEKDAY > DEFAULT`
    (D6), **independente por função**. Consumida por S7/S8.
  - **Sem schema/migração novos** — reusa as tabelas da S1 (aditivo puro; zero
    risco de drift, nada tocado nas Intenções — D9).
  - **Verificação:** `pnpm -r typecheck`/`lint`/`test` verdes — **api 64/64**
    (26 testes novos: `resolveStaffing` nos 5 escopos + desempate por função;
    `CadastroService` para ownership/404, P2002→409, qualificação fora da equipe→400,
    soft vs hard delete, aviso de duplicata, alvo de staffing de outra paróquia→400),
    worker 8/8, web 8/8. Intenções sem regressão.
  - **Desvio documentado (não muda decisão travada):** o cadastro entrou no
    `EscalaModule` já criado pela S2 (`apps/api/src/escala/`), não num módulo
    `admin/escala` novo — o doc da S3 sugeria `apps/api/src/admin/escala/`, mas o
    bounded context já existia da S2. `POST members` mantém o 201 padrão do Nest
    (o doc menciona 200) e sinaliza a duplicata via `warning` no corpo.

- **2026-07-02 — S2 (Materialização de ocorrências)** · PR #6
  - **`OccurrenceService`** (`apps/api/src/escala/`, módulo `EscalaModule` próprio —
    bounded context separado, registrado na árvore Nest ao lado de `AdminModule`):
    - `materialize(parishId, from, to)` → `{ created, updated, total }`. Para cada
      dia do intervalo monta candidatas a partir dos `MassSchedule` ativos do
      `weekday` + `MassException` ativas do dia; **merge por horário** com a exceção
      vencendo o regular no mesmo `(date, time)`. **Upsert idempotente** na chave
      `@@unique([parishId, date, time])`: cria quando não existe; quando existe
      atualiza **apenas** a origem (`sourceScheduleId`/`sourceExceptionId`), **nunca**
      toca `isSolemnity` e só preenche `title` se estiver `null` (D7). Escritas dentro
      de `$transaction`.
    - `list(parishId, from, to)` e `update(parishId, id, {isSolemnity?, title?})`
      (eleva/rebaixa solenidade / ajusta título; ownership por paróquia).
  - **Endpoints admin** (`JwtAuthGuard` + `RolesGuard` + `@Roles("PARISH_ADMIN")`,
    `parishId` do token): `POST /admin/escala/occurrences/materialize`,
    `GET /admin/escala/occurrences?from=&to=`, `PATCH /admin/escala/occurrences/:id`.
  - **Validação Zod em `packages/shared`:** `materializeRangeSchema` (formato
    `YYYY-MM-DD`, ordenação `from ≤ to`, teto de **92 dias** → 400) e
    `updateOccurrenceSchema`. Erros caem no `ZodExceptionFilter` global (400).
  - **D9 respeitado:** a regra de determinação de missas foi **replicada** no serviço,
    **sem importar nem tocar** o worker/dispatch das Intenções. `prisma/schema.prisma`,
    migrações e `seed.ts` **intocados** (o modelo `MassOccurrence` já veio da S1) →
    **S2 não adiciona migração**, risco de drift zero.
  - **Convenção de solenidade adotada: (a)** — toda ocorrência materializa com
    `isSolemnity=false`; elevação é sempre manual via `PATCH`. Opção (b)
    (flag em `MassException`) fica fora do escopo.
  - **Verificação:** `pnpm -r typecheck`/`lint`/`test` verdes — **api 37/37** (8 testes
    novos de `OccurrenceService`: idempotência, preservação de `isSolemnity`/`title`,
    exceção-vence-regular, ownership 403/404), worker 8/8, web 8/8. Intenções sem
    regressão (suites do worker de despacho e da API intactas).
  - **Observação (desvio documentado, não muda decisão travada):** a regra do doc
    faz *merge por horário* — numa data com exceção, as missas regulares do mesmo dia
    em **outros** horários **continuam** materializadas (só o slot coincidente é
    substituído). É mais granular que o worker de despacho, que suprime todos os
    regulares do dia quando há qualquer exceção. Seguido conforme o doc da S2; sem
    impacto no caminho das Intenções.

- **2026-07-02 — M1b (Manutenção: drift schema↔migração)** · PR #4
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
    para PR-M1b (#4)).
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
| R6 | **Drift schema↔migração.** Prisma quer embutir `DROP DEFAULT` em `parishes`/`notices`/`dispatch_batches` (tabelas de Intenções). | ✅ **Resolvido em PR-M1b (#4).** Reconciliado 100% no `schema.prisma`, **sem migração e sem `ALTER`** em tabela de Intenções: `@default([])` nas 4 colunas de array com default no banco (`parishes.dispatch_phones`/`dispatch_groups`, `dispatch_batches.sent_to_phones`, `notices.mass_times`) e `@default(dbgenerated("gen_random_uuid()"))` em `notices.id` (default de banco redundante). `migrate dev` → "Already in sync"; `deploy` em base zerada limpo; banco intocado. |
| R7 | **Base não-verde.** Falhas pré-existentes de lint/typecheck/test (e lacuna de build do `shared` no CI) impediam o "sem regressão" automatizado. | ✅ **Resolvido em PR-M1a (#3)** — B1–B4 + build do `shared` + configs de ESLint; lint/typecheck/test verdes em todos os apps. |
