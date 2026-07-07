# S8 — Tela do Coordenador (Montagem e Publicação)

> Documento de sessão de execução. Ler junto com `ESCALA_00_ORQUESTRACAO.md`
> (decisões D4, D5, D11 e Seção 1.1) e o `CLAUDE.md` do repo.
> **Prereqs:** S7 (`✅` algoritmo/rascunho), S2 (`✅` ocorrências), S3/S4 (`✅` cadastro),
> S6 (`✅` disponibilidade). Dá cara ao rascunho invisível da S7.

## Objetivo

A última peça grande do ciclo: a tela onde o coordenador **vê o rascunho** gerado pela S7,
**resolve as lacunas**, **ajusta à mão** e **publica** a escala — tornando-a visível ao
voluntário e (na S9) disparando lembretes. É onde a confiança na ferramenta se ganha ou se
perde (D11 — o algoritmo sugere, o humano decide).

## Escopo

**Inclui (frontend + endpoints de apoio):**
- Grade do mês por **missa/ocorrência** (área do coordenador/admin).
- Botão "Sugerir distribuição" (chama `POST /escala/schedule/suggest` da S7).
- Resolução de lacunas com **override consciente**.
- **Visibilidade de contenda** entre equipes.
- **Publicação por equipe/mês**, editável depois.
- Endpoints de edição manual de assignment (criar/remover/trocar) e publicar.
- Painel secundário **por pessoa** (conferência da distribuição).

> **Divisão em dois PRs (decisão da sessão):** PR 1 = **backend** (endpoints de
> apoio + migração aditiva — este PR); PR 2 = **frontend** (a UI do coordenador).

**NÃO inclui:** lembrete/confirmação e aviso automático de mudança pós-publicação (S9);
troca/substituição iniciada pelo membro (S10).

## Decisões de UX travadas (confirmadas com o Leal)

| # | Decisão |
|---|---------|
| V1 | **Grade primária por missa/ocorrência** (linha = missa; colunas = funções/vagas). Painel secundário **por pessoa** só p/ conferência (contagem + quando serviu) — não é onde se edita. |
| V2 | Lacuna → lista **priorizada**: elegíveis primeiro; excluídos (indisponível / no teto / não qualificado) **separados e rotulados**. Escolher um excluído = **override consciente** (mostra o motivo + confirma). Nunca bloqueia de vez. |
| V3 | **Contenda visível**: quem já está em outra equipe naquela missa aparece **marcado e desabilitado** ("Ana — já na MESC, 10h") **antes** de tentar. Nada de erro seco. |
| V4 | **Publicação por equipe e por mês**: o coordenador publica a escala da **sua** equipe quando termina, sem esperar as outras. Publicar = torna visível ao voluntário. **Escala publicada continua editável.** |

## Autorização (reusa S5)

Tela e endpoints sob `EscalaAuthGuard` + `EscalaAccessService`: coordenador vê/edita só as
**próprias** equipes; pároco/admin todas. `parishId` sempre do ator.

## Modelo — o mínimo para "editável depois de publicado" (V4)

`Assignment.publishedAt` (da S1) já marca publicado. Para V4 funcionar sem quebrar:
- **Publicar** = setar `publishedAt` em todos os assignments em rascunho daquela (equipe, mês).
- **Editar publicado é permitido**: criar/remover assignment mesmo com `publishedAt` setado.
- Para rastrear que uma escala publicada mudou (base do aviso da S9), adicionar o mínimo:
  `Assignment.overrideReason String?` (por que um excluído foi forçado — V2) e considerar
  um `publishedVersion Int` **por (equipe, mês)** OU um timestamp `republishedAt` — **decisão
  da sessão**: escolher o mais simples que permita a S9 detectar "mudou depois de publicado".
  Preferir o mínimo; **não** construir tabela de auditoria completa agora.

> Migração provavelmente pequena e aditiva (`overrideReason`, talvez um campo de versão).
> Justificar no PR; nada destrutivo; Intenções intocadas (D9).
>
> **Decisão do PR 1:** adotado **`republishedAt`** (timestamp), não um contador de versão —
> é o mais simples que satisfaz V4 **sem** tabela de (equipe, mês): publicar carimba
> `publishedAt` (onde nulo) e `republishedAt` (selo) em todos os assignments vivos do conjunto.
> Um rascunho novo sobre uma escala publicada (`publishedAt = null`) torna a mudança detectável
> para a S9; re-publicar re-sela e zera o "pendente". Sem alteração destrutiva; Intenções
> intocadas (só `ADD COLUMN` em `assignments`).

## Endpoints de apoio (realm coordenador/admin)

| Método | Rota | Notas |
|--------|------|-------|
| GET | `/escala/schedule?month=YYYY-MM&teamId=` | Grade: ocorrências do mês + assignments (rascunho e publicados) + `gaps` recalculados + estado de contenda por candidato. |
| POST | `/escala/schedule/suggest` | (S7) gerar/preencher rascunho. |
| POST | `/escala/assignments` | Manual: `{ occurrenceId, functionId, memberId, overrideReason? }`. Se o membro é inelegível (indisponível/teto), exige `overrideReason` (V2). Respeita `unique(occurrence, member)` (V3) → 409 claro se já alocado. |
| DELETE | `/escala/assignments/:id` | Remove (rascunho ou publicado). |
| POST | `/escala/schedule/publish` | `{ month, teamId }`: publica os assignments daquela equipe/mês (seta `publishedAt`). Coordenador só a própria equipe. |

- **Candidatos para uma vaga** (para a lista de V2/V3): o GET da grade (ou um endpoint
  auxiliar) devolve, por vaga, os membros qualificados com flags: `eligible` /
  `reason` (por que excluído) / `conflict` (já em outra equipe nesta ocorrência). O front
  usa isso para montar a lista priorizada e desabilitar os em contenda.

## Frontend — área do coordenador (mobile-first, mas uso real é desktop)

Reusar o design do painel admin (a S4 já estabeleceu o padrão do módulo). Telas:
- **Grade do mês por missa** (V1): cada ocorrência com suas vagas por função; vaga preenchida
  mostra o nome, vaga aberta destaca a **lacuna** com o motivo (do `gaps`). Selo de solenidade.
- **"Sugerir distribuição"**: chama a S7; preenche só vazio (A5) — deixa claro que não apaga ajuste.
- **Resolver vaga** (V2/V3): clique na vaga → lista priorizada (elegíveis; depois excluídos
  rotulados; em contenda desabilitados). Escolher excluído → modal de confirmação com o motivo
  → grava com `overrideReason`.
- **Publicar** (V4): botão por equipe/mês; confirma; após publicado, a grade mostra "publicada"
  e **continua editável** (com indicação de que houve mudança pós-publicação).
- **Painel por pessoa** (V1, conferência): lista de membros da equipe com nº de serviços no mês
  e datas — para o coordenador **ver se o rodízio ficou justo** (valida J1/J2 visualmente).

## Critérios de aceite

- [ ] Grade por missa mostra vagas, nomes e lacunas (com motivo) do mês/equipe.
- [ ] "Sugerir" preenche só vazio; ajustes manuais anteriores sobrevivem (A5).
- [ ] **V2:** resolver lacuna lista elegíveis primeiro; escolher um excluído exige confirmação
  + `overrideReason`; forçar teto/indisponível funciona **conscientemente** e fica registrado.
- [ ] **V3:** candidato já em outra equipe na mesma missa aparece desabilitado/rotulado; tentativa
  de duplicar → 409 claro (nunca erro seco sem explicação).
- [ ] **V4:** publicar por equipe/mês seta `publishedAt`; escala publicada **continua editável**;
  a mudança pós-publicação é detectável (base p/ S9).
- [ ] Painel por pessoa mostra contagem/datas para conferência da justiça.
- [ ] Autorização: coordenador só as próprias equipes (403 fora); admin todas.
- [ ] Migração (se houver) aditiva; Intenções sem regressão; **CI verde**.

> **Estado (PR 1 — backend):** endpoints de apoio, lógica de candidatos
> (`eligible`/`reason`/`conflict`), override consciente (V2), contenda (V3),
> publicação com detecção de mudança (V4), autorização e migração aditiva —
> **entregues e testados**. Os itens de **UI** (grade, painel por pessoa, modais)
> ficam para o **PR 2 (frontend)**.

## Testes sugeridos

- E2E: suggest → grade com lacunas → override consciente (com reason) → publish → editar publicado.
- E2E V3: candidato em contenda desabilitado; POST duplicado → 409.
- E2E autorização: coordenador não publica/edita equipe alheia.
- Component: lista priorizada de candidatos (elegível/excluído/contenda) monta na ordem certa.

## Relatório de Sessão (colar no PR)

```
S8 — Tela do Coordenador · PR 1 de 2 (backend — endpoints de apoio)
- Migração 15 add_assignment_override_and_republish (aditiva): assignments.override_reason
  (TEXT) + assignments.republished_at (TIMESTAMP). Só ADD COLUMN em `assignments`; nenhum
  ALTER/DROP em Intenções (D9). Aplica limpo em base zerada; sem drift (migrate diff = "No
  difference detected").
- GET /escala/schedule?month&teamId — grade por missa: ocorrências + assignments
  (rascunho/publicados) + gaps recalculados + por vaga a lista priorizada de candidatos
  qualificados com flags eligible/reason/conflict (V2/V3). Núcleo em função pura
  `buildScheduleGrid` (reusa resolveStaffing S3 + resolveAvailability S6). ✔
- POST /escala/assignments {occurrenceId, functionId, memberId, overrideReason?} — override
  consciente: inelegível (indisponível / no teto / não qualificado) sem overrideReason → 422;
  com overrideReason → cria e registra a justificativa (V2). unique(occurrence, member) →
  409 claro, com pré-checagem amigável + backstop P2002 (V3). Cria sempre rascunho
  (publishedAt=null), mesmo sobre escala publicada (V4). ✔
- DELETE /escala/assignments/:id — remove (rascunho ou publicado); ownership por paróquia
  (404 não vaza). ✔
- POST /escala/schedule/publish {month, teamId} — carimba publishedAt (onde nulo) +
  republishedAt (selo) da (equipe, mês); publicado continua editável; rascunho novo por cima
  torna a mudança detectável (base p/ S9 — V4). Coordenador só a própria equipe. ✔
- Autorização coordenador/admin via EscalaAuthGuard + EscalaAccessService.assertCanManageTeam
  (S5): 403 em equipe alheia, 404 em outra paróquia; parishId sempre do ator. ✔
- Zod em packages/shared: scheduleGridQuerySchema, assignmentCreateSchema, schedulePublishSchema.
- CI verde: typecheck (todos), lint 0 erros, api 176 testes (21 novos: buildScheduleGrid +
  ScheduleService), worker 8, web 8. Intenções sem regressão (worker/dispatch intocados — D9).
- Observações / desvios: (1) `republishedAt` escolhido em vez de `publishedVersion` (mais
  simples, sem tabela de (equipe, mês)). (2) Detecção de mudança pós-publicação cobre
  adições (rascunho por cima) e re-selagem; deleção de item publicado usa hard delete
  (preserva o unique p/ re-alocação) e não deixa rastro individual — aceito (sem tabela de
  auditoria, conforme o doc). (3) `overrideReason` exigido também para "não qualificado",
  além de indisponível/teto (superset consciente do V2). (4) UI = PR 2.
```
