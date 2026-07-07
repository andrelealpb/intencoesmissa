# ESCALA — S7 · Motor de sugestão (backend)

> Briefing autocontido da Sessão S7. Ler junto com o orquestrador
> (`ESCALA_00_ORQUESTRACAO.md`) — em especial **D4, D5, D6, D11** e a **Seção 1.1**.
> Prereqs: **S2, S3, S6** `✅`.

## 1. Objetivo

Gerar, para um **mês**, um **rascunho** de escala (`Assignment` com
`publishedAt = null`) preenchendo as vagas vazias de cada ocorrência com um
**algoritmo guloso determinístico**, respeitando qualificação, disponibilidade,
teto e prioridade. O algoritmo **sugere**; o humano sobrescreve (D11). Esta
sessão **não** faz UI nem publicação (é S8) — apenas o endpoint de sugestão.

Reusa **as funções puras já existentes**, sem reimplementar regra:
- `resolveStaffing` (S3) — demanda por função por ocorrência, escopo D6.
- `resolveAvailability` (S6) — disponibilidade efetiva (`explicit > rule > default`).

## 2. Endpoint

```
POST /escala/schedule/suggest
Body: { month: "YYYY-MM", teamIds?: string[] }
→ { created: number, gaps: Gap[] }
```

- **Autorização** (`EscalaAuthGuard` + `EscalaAccessService`): admin da paróquia
  vê qualquer equipe; coordenador **só as próprias** (403 em equipe alheia; 404
  em equipe de outra paróquia). Sem `teamIds`, o conjunto padrão é: **admin →
  todas as equipes ativas da paróquia**; **coordenador → as equipes que
  coordena** (ativo).
- **Mês não materializado** (nenhuma `MassOccurrence` no mês) → **400** com
  mensagem clara. A materialização (S2) é passo separado e pré-requisito.
- `parishId` **sempre do ator** (JWT), nunca do body.

## 3. Regras de justiça (J1–J4)

| # | Regra | Descrição |
|---|-------|-----------|
| **J1** | **Balanceamento da carga total** | Entre os elegíveis para uma vaga, escala primeiro quem tem **menos atribuições no mês inteiro**, somando **todas as equipes** — balanceia a carga *total* da pessoa, não só a de uma equipe. Ninguém "carrega o mês" sozinho. |
| **J2** | **Rodízio — há mais tempo sem servir** | Desempate por `lastServedAt` (data do **último** assignment do membro): quem serviu **há mais tempo** entra primeiro. Inicial = último serviço **antes do mês** (consulta única); **atualizado em memória** a cada alocação da corrida. Quem nunca serviu entra na frente. **Não** usa `TeamMembership.priority` (isso é contenda entre equipes — D5, fora do desempate de justiça). |
| **J3** | **Nunca relaxa regra sozinho** | O algoritmo **jamais** preenche uma vaga violando qualificação, disponibilidade, teto ou exclusividade só para "não deixar buraco". Prefere **deixar a lacuna** e reportá-la. Relaxar é decisão humana (S8). |
| **J4** | **Determinismo** | Mesma entrada → mesma saída. Toda escolha e desempate usa ordenação **total e explícita** (atribuições no mês ↑, `lastServedAt` ↑, `memberId` ↑; ocorrências por data/hora/id; equipes por nome/id; funções por `sortOrder`/id). Nunca aleatório; nunca dependente da ordem do banco. |

## 4. Decisões automáticas (A1–A6)

| # | Decisão | Descrição |
|---|---------|-----------|
| **A1** | **"Não informou" ≠ disponível** | Só entra quem tem disponibilidade **efetiva `AVAILABLE`** (`explicit` ou `rule`). `default` (não respondeu) resolve como indisponível (opt-in — S6/U1/U2) e **nunca** é escalado. |
| **A2** | **Só qualificado** | O membro precisa ter a **função** da vaga qualificada no vínculo (`MembershipFunction`) daquela equipe. |
| **A3** | **Respeita o teto por equipe (D8)** | Conta as atribuições do membro **naquela equipe** no mês (rascunho + publicado, exceto `CANCELLED`). Ao atingir `maxAssignmentsPerMonth`, sai dos candidatos. `null` = sem teto. |
| **A4** | **Uma pessoa por ocorrência (D4 / Regime A)** | `unique(occurrenceId, memberId)` vale sempre. O algoritmo nunca coloca o mesmo membro duas vezes na mesma ocorrência (mesmo em funções ou equipes distintas). Respeita atribuições já existentes. |
| **A5** | **Não sobrescreve rascunho** | Preenche **só vagas vazias** = `requiredCount − atribuições existentes` (por ocorrência/função/equipe). Atribuições já criadas (rascunho ou publicado) são preservadas e **contam** como preenchimento. |
| **A6** | **Só ativo** | Só `Member.isActive` **e** `TeamMembership.isActive`. Revogar o vínculo tira a pessoa da sugestão na hora. |

## 5. Algoritmo (guloso determinístico)

Para cada **ocorrência** (ordenada por data/hora/id), para cada **equipe**
autorizada (nome/id), para cada **função** com demanda (via `resolveStaffing`,
ordenada por `sortOrder`/id):

1. `remaining = requiredCount − jáPreenchido(ocorrência, equipe, função)`. Se
   `≤ 0`, pula (A5).
2. Monta os candidatos em cascata:
   - **qualificados** = vínculos ativos com a função (A2/A6). Vazio →
     lacuna `SEM_QUALIFICADO`.
   - **disponíveis** = qualificados com disponibilidade efetiva `AVAILABLE` (A1).
     Vazio → lacuna `SEM_DISPONIVEL`.
   - **elegíveis** = disponíveis que **não** estão nessa ocorrência (A4) e ainda
     **não** atingiram o teto (A3).
3. Ordena elegíveis por **J1 → J2 → J4** — `(atribuições_no_mês ↑, lastServedAt ↑,
   memberId ↑)` — e escala `min(remaining, elegíveis)`. Cada atribuição atualiza
   a ocupação da ocorrência (A4), a carga total no mês (J1) e a carga na equipe
   (teto/A3), o preenchimento da vaga (A5) e o `lastServedAt` do membro (J2 —
   passa a "ter servido" naquela data). O guloso "enxerga" o que acabou de
   escalar; como as ocorrências correm em ordem de data, o `lastServedAt` só
   avança.
4. Se sobrou vaga (`missing > 0`), registra a lacuna com o **motivo**:
   - `SEM_QUALIFICADO` — nenhum membro qualificado para a função na equipe.
   - `SEM_DISPONIVEL` — havia qualificados, mas **nenhum/insuficientes**
     disponíveis (todos os disponíveis foram escalados e ainda faltou).
   - `TODOS_NO_TETO` — havia disponíveis, mas os que faltaram estão **no teto**
     ou **já servindo** naquela ocorrência (capacidade esgotada).

O algoritmo **não relaxa** nenhuma regra (J3): a lacuna é o resultado honesto.

### `Gap`

```ts
{
  occurrenceId, date, time,
  teamId, teamName,
  functionId, functionName,
  required, filled, missing,
  reason: "SEM_DISPONIVEL" | "SEM_QUALIFICADO" | "TODOS_NO_TETO"
}
```

## 6. Arquitetura

- **`suggest-schedule.ts`** — função **pura** `planSchedule(input)` (sem I/O):
  recebe ocorrências, equipes, atribuições existentes e a disponibilidade, e
  devolve `{ toCreate, gaps }`. Testável sem banco; reusa `resolveStaffing` e
  `resolveAvailability`. É onde vivem J1–J4 e A1–A6.
- **`suggestion.service.ts`** — I/O: autoriza equipes (`EscalaAccessService`),
  rejeita mês não materializado, carrega os dados — incluindo o **histórico de
  serviço anterior ao mês** (consulta única de assignments com `occurrence.date <
  início do mês`, reduzida ao último por membro → `lastServedAt` inicial de J2) —,
  chama o planner, persiste os rascunhos (`status=SCHEDULED`, `publishedAt=null`,
  `assignedByUserId`/`assignedByMemberId` conforme o realm) e devolve
  `{ created, gaps }`. O `priority` **não** é lido para a sugestão (não entra no
  desempate de justiça).
- **`schedule.controller.ts`** — `POST /escala/schedule/suggest`, sob
  `EscalaAuthGuard`, valida o body com `scheduleSuggestSchema` (Zod, `shared`).

## 7. Fora de escopo (respeitado)

- UI de montagem, override manual, visão de conflitos e **publicação** → **S8**.
- Lembrete/confirmação → S9.
- Teto global por pessoa (R2), Regime B (R3) — permanecem fechados.

## 8. Relatório de Sessão (colar no PR)

> Preenchido ao final — ver Changelog do orquestrador (Seção 8).
