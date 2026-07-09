# S9 — Lembretes e Confirmação

> Documento de sessão de execução. Ler junto com `ESCALA_00_ORQUESTRACAO.md`
> (decisões D9, D11, R1 e Seção 1.1) e o `CLAUDE.md` do repo.
> **Prereqs:** S8 (`✅` escala publicada + marcador de mudança pós-publicação), S5/S6 (`✅`
> auth/portal — destino da confirmação), S6.5 (`✅` serviço de entrega Z-API). Fecha o ciclo.

## Objetivo

Fechar o loop: avisar o voluntário que ele está escalado (reduzir esquecimento — a dor
original) e coletar "confirmo / não vou poder" **pelo portal** (sem abrir webhook inbound
da Z-API). Recusa vira lacuna que o coordenador vê na S8. Tudo por um **job isolado** no
worker (não toca no dispatch das Intenções — D9).

## Escopo

**Inclui:**
- **Resumo no grupo** da equipe alguns dias antes ("escala publicada: [link]") — 1 msg/equipe.
- **Lembrete individual** próximo da missa (véspera + opcional no dia) — só p/ escalados.
- **Confirmação pelo portal**: o lembrete leva link; a pessoa confirma/recusa no portal (S6).
- **Recusa** → marca o assignment (DECLINED) + notifica o coordenador; **sem re-escalar**.
- Job no **worker** (padrão do cron existente), isolado.

**NÃO inclui:** webhook inbound da Z-API (responder no WhatsApp — fase futura) · re-escala
automática · troca membro↔membro (S10).

## Decisões travadas (confirmadas com o Leal)

| # | Decisão | Nota |
|---|---------|------|
| L1 | **Resumo no grupo** (1 msg/equipe, alguns dias antes) **+ lembrete individual** (véspera, opcional no dia, só escalados). | Grupo = seguro no R1; individual = onde o R1 aperta. |
| L2 | **Duas antecedências configuráveis por paróquia** (véspera + opcional no dia), com padrão sensato. | Reusar padrão de config da paróquia. |
| L3 | **Confirmação pelo PORTAL, não por resposta de WhatsApp.** Lembrete leva link → confirma/recusa no portal (S6). | Evita abrir o webhook inbound da Z-API (trabalho grande, fase futura). |
| L4 | **Recusa marca o assignment (DECLINED) + notifica o coordenador. NÃO re-escala.** | Coordenador resolve na S8 (D11/J3). |
| L5 | **Automático via worker**, job novo isolado. **Não** tocar no dispatch das Intenções. | Guardrail D9. |
| L6 | **Individual é o candidato à WhatsApp Cloud API oficial** (R1). MVP usa Z-API; migração oficial fica sinalizada, não bloqueia. | Decisão consciente, registrada. |

## R1 — a tensão, explícita

- Resumo no grupo (L1): 1 msg por equipe → baixo volume, seguro.
- **Lembrete individual (L1): 1 msg por pessoa escalada por missa** → é exatamente o padrão de
  volume que a Meta flagra em Z-API (WhatsApp não-oficial). É o maior risco do módulo inteiro.
- **Mitigações no MVP:** manter o volume o menor possível (só escalados, só nas antecedências
  configuradas, dedupe — nunca 2 lembretes do mesmo tipo pra mesma pessoa/missa); e desenhar o
  envio **atrás de uma interface de provedor** para trocar Z-API → Cloud API oficial sem
  reescrever a lógica (L6). Documentar o risco no PR; não bloqueia o MVP, mas é o primeiro
  candidato a enforcement.

## Modelo

- `Assignment.status` (da S1: SCHEDULED/CONFIRMED/DECLINED/CANCELLED) — a confirmação/recusa
  usa `CONFIRMED`/`DECLINED` + `confirmedAt`/`declinedAt` (já no modelo).
- **Anti-duplicação de envio:** registrar o que já foi enviado para não reenviar no próximo
  tick do cron. Mínimo: uma tabela `ReminderLog { assignmentId | occurrenceId+teamId, kind
  (GROUP_SUMMARY|INDIVIDUAL_EVE|INDIVIDUAL_DAY), sentAt }` — chave única por (alvo, kind) para
  idempotência. Migração aditiva. **Escolher o grão** (por assignment p/ individual; por
  equipe+ocorrência-dia p/ grupo) e justificar no PR.
- Config por paróquia (L2): antecedências do lembrete em `ParishSettings` (aditivo), com
  padrão. Ex.: `reminderEveHour`, `reminderSameDayHoursBefore?`.

## Worker — job isolado (D9)

- Novo job no worker (padrão do cron de 1 min existente), **separado** do job de despacho das
  Intenções. Nada no fluxo das Intenções muda.
- A cada tick: encontrar assignments **publicados** de ocorrências dentro da janela de
  antecedência; para cada, se não há `ReminderLog` daquele kind → enviar e registrar.
- **Idempotência**: o `ReminderLog` garante que reprocessar o mesmo tick não reenvia.
- **Degradação graciosa** (padrão do sistema): falha de envio loga e segue; não trava o tick.
- **Resumo no grupo** (L1): disparado alguns dias antes por equipe/semana — pode ser passo do
  mesmo worker (chave `GROUP_SUMMARY` por equipe+período) ou acionável na publicação. Escolher e documentar.

## Confirmação pelo portal (L3)

- O lembrete individual leva link para o portal (S6). Lá, o membro vê as missas em que está
  escalado e **confirma** ou **recusa** cada uma.
- Endpoints do realm de membro (`MemberJwtGuard`): `GET /escala/me/assignments?from=&to=`
  (minhas escalas publicadas) e `PUT /escala/me/assignments/:id` `{ status: CONFIRMED|DECLINED }`.
- Só o **próprio** assignment; só o que está **publicado**; nunca de outro membro.

## Recusa → coordenador (L4)

- `DECLINED` marca o assignment (mantém a linha, não apaga — histórico) e **sinaliza a lacuna**
  na S8 (reusa o marcador de mudança pós-publicação da S8; a vaga volta a contar como aberta).
- **Notificar o coordenador** da equipe (canal a definir: idealmente no grupo/priv da equipe
  via Z-API, ou um indicador na tela da S8). **Não** re-escalar automaticamente (D11/J3).

## Critérios de aceite

- [ ] Job de lembrete é **isolado**; dispatch das Intenções intocado (D9).
- [ ] Resumo no grupo: 1 msg por equipe; **nunca** individual em massa disfarçado.
- [ ] Lembrete individual só p/ escalados, nas antecedências configuradas; **dedupe** via `ReminderLog` (reprocessar tick não reenvia).
- [ ] Confirmação/recusa **pelo portal** (endpoints do realm de membro); só o próprio, só publicado.
- [ ] Recusa marca `DECLINED`, reabre a vaga como lacuna na S8 e **notifica o coordenador**; **não** re-escala.
- [ ] Envio atrás de interface de provedor (troca Z-API → Cloud API sem reescrever a lógica) — L6.
- [ ] Config de antecedência por paróquia com padrão.
- [ ] Degradação graciosa (falha de envio não trava o tick).
- [ ] Migração aditiva (`ReminderLog`, config); Intenções sem regressão; **CI verde**.

## Testes sugeridos

- Unit: seleção de quem recebe lembrete na janela; idempotência do `ReminderLog` (2 ticks → 1 envio).
- E2E membro: GET minhas escalas; PUT confirmar/recusar (só próprio/publicado; alheio → 403).
- E2E recusa: DECLINED reabre lacuna (visível como a mudança pós-publicação da S8) + coordenador notificado.
- Worker: job isolado não interfere no job de Intenções.

## Relatório de Sessão (colar no PR)

```
S9 — Lembretes e Confirmação
- Job isolado no worker (D9 — dispatch das Intenções intocado) ✔
- Resumo no grupo (1 msg/equipe) + lembrete individual (véspera + opcional no dia), dedupe via ReminderLog ✔
- Confirmação pelo PORTAL (GET/PUT me/assignments, realm de membro; só próprio/publicado) — sem webhook inbound (L3) ✔
- Recusa → DECLINED + lacuna na S8 + notifica coordenador; sem re-escala (L4) ✔
- Envio atrás de interface de provedor p/ Z-API→Cloud API (L6/R1) ✔
- Config de antecedência por paróquia (L2) | degradação graciosa ✔
- Migração aditiva (ReminderLog/config) | Intenções sem regressão ✔ | CI verde ✔
- Observações / desvios: <...>
```
