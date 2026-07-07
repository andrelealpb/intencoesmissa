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

## Testes sugeridos

- E2E: suggest → grade com lacunas → override consciente (com reason) → publish → editar publicado.
- E2E V3: candidato em contenda desabilitado; POST duplicado → 409.
- E2E autorização: coordenador não publica/edita equipe alheia.
- Component: lista priorizada de candidatos (elegível/excluído/contenda) monta na ordem certa.

## Relatório de Sessão (colar no PR)

```
S8 — Tela do Coordenador
- Grade por missa (V1) + painel por pessoa p/ conferência ✔
- "Sugerir" (S7) preenche só vazio (A5) ✔
- Lacuna: lista priorizada; override consciente com overrideReason (V2) ✔
- Contenda: candidato em outra equipe desabilitado/rotulado; duplicado → 409 (V3) ✔
- Publicar por equipe/mês; publicado editável; mudança pós-publicação detectável (V4) ✔
- Endpoints: GET schedule, POST assignments (override), DELETE assignment, POST publish ✔
- Autorização coordenador/admin (S5) ✔
- Migração aditiva (overrideReason / versão): <descrever> | Intenções sem regressão ✔ | CI verde ✔
- Observações / desvios: <...>
```
