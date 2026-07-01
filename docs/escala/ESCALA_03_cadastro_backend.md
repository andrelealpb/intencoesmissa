# S3 — Cadastro (Backend)

> Documento de sessão de execução. Ler junto com `ESCALA_00_ORQUESTRACAO.md`
> (decisões D1–D11) e o `CLAUDE.md` do repo. **Prereqs:** S1 (`✅`).
> Pode correr em paralelo com S2 e S5.

## Objetivo

Expor a API administrativa de cadastro do módulo Escala: equipes, funções, membros,
vínculos (membership), qualificações e demanda (staffing). Tudo sob `/admin/escala/*`,
multi-tenant, com validação Zod e a **costura de autorização** que, no futuro (S5/S6),
admitirá o coordenador de equipe além do admin paroquial.

## Escopo

**Inclui (backend apenas):**
- Módulo `apps/api/src/admin/escala/` (controllers + services).
- CRUD de `Team`, `TeamFunction`, `Member`, `TeamMembership`, `MembershipFunction`, `StaffingRequirement`.
- Schemas Zod em `packages/shared`.
- `EscalaAccessService` — helper de autorização com ponto de extensão para coordenador.
- Função **pura** de resolução de staffing (unit-testável), sem depender de S2.

**NÃO inclui:** UI (S4), auth/login de membro (S5), materialização (S2), algoritmo (S7).
Em S3 **todos os endpoints são admin-only** (`PARISH_ADMIN`); a via de coordenador é
*preparada* mas só entra em vigor quando o realm de membro existir.

## Regras transversais (valem para todos os endpoints)

1. **`parishId` vem do JWT, nunca do body.** Toda criação injeta o `parishId` do ator.
2. **Ownership em todo `:id`.** Buscar sempre com `where: { id, parishId }`; recurso de
   outra paróquia responde 404 (não vaza existência).
3. **Unicidade → 409 amigável:** `Team(parishId,name)`, `TeamFunction(teamId,name)`,
   `TeamMembership(teamId,memberId)`. Traduzir o erro do Prisma (P2002) em 409 com mensagem.
4. **Exclusão segura (soft por padrão):** entidades referenciadas por `Assignment`
   (histórico) **não** são apagadas fisicamente — vira `isActive=false`. Hard-delete só
   quando não há nenhuma referência. Ver detalhe por entidade abaixo.
5. **Validação Zod** em `packages/shared`; o `ZodExceptionFilter` já existente formata os 400.

## Autorização — a costura (D2)

Criar `EscalaAccessService` com o método central:

```ts
// pseudo-assinatura
assertCanManageTeam(actor: AdminActor, teamId: string): Promise<void>
// e uma variante de paróquia p/ recursos não ligados a equipe (ex.: Member):
assertCanManageParish(actor: AdminActor): void
```

Implementação em S3:
- **Ator = `User` `PARISH_ADMIN`** dono da paróquia → autorizado (única via ativa agora).
- **Ponto de extensão marcado** (`// TODO(S5): coordenador`) onde, no futuro, um
  `Member` com `TeamMembership.isCoordinator=true` naquela equipe será autorizado
  **apenas** para a própria equipe. Não implementar o ramo de coordenador agora —
  só deixar a interface pronta para não exigir refatoração depois.

> Consequência: os controllers chamam `assertCanManageTeam`/`assertCanManageParish`
> em vez de embutir a regra. Quando S5/S6 trouxerem o membro, só o service muda.

## Endpoints

### Equipes — `Team`
| Método | Rota | Notas |
|--------|------|-------|
| GET | `/admin/escala/teams` | Lista (filtro `?active=`), com contadores de membros/funções. |
| POST | `/admin/escala/teams` | `{ name, category, description? }`. |
| GET | `/admin/escala/teams/:id` | Detalhe + funções + nº de membros. |
| PUT | `/admin/escala/teams/:id` | Atualiza nome/categoria/descrição/isActive. |
| DELETE | `/admin/escala/teams/:id` | **Soft** se houver memberships/assignments; hard só se vazia. |

### Funções — `TeamFunction`
| Método | Rota | Notas |
|--------|------|-------|
| GET | `/admin/escala/teams/:teamId/functions` | Lista ordenada por `sortOrder`. |
| POST | `/admin/escala/teams/:teamId/functions` | `{ name, description?, sortOrder? }`. |
| PUT | `/admin/escala/functions/:id` | Atualiza; valida ownership via a equipe. |
| DELETE | `/admin/escala/functions/:id` | **Soft** se referenciada por qualificação/staffing/assignment. |

### Membros — `Member` (nível paróquia)
| Método | Rota | Notas |
|--------|------|-------|
| GET | `/admin/escala/members` | Lista com busca `?q=` (nome), `?teamId=`, `?active=`. Paginar. |
| POST | `/admin/escala/members` | `{ fullName, phone, email?, birthDate? }`. Sem unique em phone; se já existir membro com mesmo phone na paróquia, retornar 200 com **aviso de possível duplicata** (não bloquear). |
| GET | `/admin/escala/members/:id` | Detalhe + memberships + qualificações. |
| PUT | `/admin/escala/members/:id` | Atualiza dados/isActive. |
| DELETE | `/admin/escala/members/:id` | **Soft** (`isActive=false`) — membros têm histórico de assignment. |

### Vínculos — `TeamMembership` (inscrever membro numa equipe)
| Método | Rota | Notas |
|--------|------|-------|
| GET | `/admin/escala/teams/:teamId/members` | Memberships da equipe (+ dados do membro, coordenador, teto, prioridade). |
| POST | `/admin/escala/teams/:teamId/members` | `{ memberId, isCoordinator?, maxAssignmentsPerMonth?, priority? }`. 409 se já vinculado. |
| PUT | `/admin/escala/memberships/:id` | Atualiza `isCoordinator`, `maxAssignmentsPerMonth`, `priority`, `isActive`. |
| DELETE | `/admin/escala/memberships/:id` | **Soft** se houver assignments; hard se nunca escalado. |

> Nota sobre `priority` (D5): é preferência do **membro**; o admin/pároco pode ajustar
> aqui, mas o design prevê que o próprio membro edite no portal (S6). Em S3 é editável só pelo admin.

### Qualificações — `MembershipFunction` (replace-set)
| Método | Rota | Notas |
|--------|------|-------|
| GET | `/admin/escala/memberships/:id/functions` | IDs de função qualificados. |
| PUT | `/admin/escala/memberships/:id/functions` | Body `{ functionIds: string[] }`. **Substitui o conjunto inteiro.** Valida que **cada** função pertence à equipe do membership (senão 400). |

### Demanda — `StaffingRequirement`
| Método | Rota | Notas |
|--------|------|-------|
| GET | `/admin/escala/teams/:teamId/staffing` | Regras da equipe, agrupadas por função. |
| POST | `/admin/escala/teams/:teamId/staffing` | Ver schema abaixo. |
| PUT | `/admin/escala/staffing/:id` | Atualiza `requiredCount`/escopo/isActive. |
| DELETE | `/admin/escala/staffing/:id` | Hard-delete ok (regra de demanda não tem histórico próprio). |

## Schemas Zod (em `packages/shared`)

- `teamSchema`: `name` (min 2), `category` (enum `MinistryCategory`), `description?`.
- `teamFunctionSchema`: `name` (min 2), `description?`, `sortOrder?` (int ≥ 0).
- `memberSchema`: `fullName` (2+ palavras, reusar `fullNameSchema`), `phone` (reusar `phoneSchema`), `email?` (email válido), `birthDate?` (ISO date, ≤ hoje).
- `teamMembershipSchema`: `memberId` (uuid), `isCoordinator?` (bool), `maxAssignmentsPerMonth?` (int ≥ 1), `priority?` (int ≥ 0).
- `membershipFunctionsSchema`: `functionIds` (array de uuid, pode ser vazio).
- `staffingRequirementSchema`: **discriminated union por `scope`** — este é o ponto que mais erra, então travar na validação:

```
scope = DEFAULT   → { requiredCount>=1 }                      (sem alvo)
scope = WEEKDAY   → { requiredCount>=1, weekday: 0..6 }
scope = SCHEDULE  → { requiredCount>=1, massScheduleId: uuid }
scope = SOLEMNITY → { requiredCount>=1 }                      (sem alvo)
scope = OCCASION  → { requiredCount>=1, massExceptionId: uuid }
```
Rejeitar campos de alvo incompatíveis com o escopo (ex.: `weekday` em `DEFAULT` → 400).
Validar que `massScheduleId`/`massExceptionId` pertencem à paróquia do ator.

## Função pura de resolução de staffing (recomendada em S3)

Implementar **função pura**, sem I/O, unit-testável, que será consumida por S7/S8:

```ts
// dado o descritor de uma ocorrência e as regras da equipe, retorna required por função
resolveStaffing(
  occurrence: { weekday: number; scheduleId: string | null;
                exceptionId: string | null; isSolemnity: boolean },
  rules: StaffingRequirement[],
): Map<functionId, number>
```
Regra de prioridade (mais específico vence, **para cada função**):
`OCCASION > SOLEMNITY > SCHEDULE > WEEKDAY > DEFAULT` (D6). A ligação com
`MassOccurrence` real acontece onde é consumida (S7) — aqui só a lógica pura + testes.

## Critérios de aceite

- [ ] CRUD completo das 6 entidades sob `/admin/escala/*`, todos com ownership por paróquia.
- [ ] `parishId` nunca aceito do body; sempre do JWT.
- [ ] Unicidade viola → 409 com mensagem clara (Team/Function/Membership).
- [ ] `PUT .../functions` (qualificações) rejeita função de outra equipe (400).
- [ ] `staffingRequirementSchema` rejeita combinações escopo×alvo inválidas.
- [ ] `resolveStaffing` unit-testada nos 5 escopos + desempate de prioridade por função.
- [ ] Soft-delete respeitado para entidades com histórico de assignment.
- [ ] `EscalaAccessService` com o `TODO(S5)` de coordenador claramente marcado.
- [ ] Intenções sem regressão; `pnpm lint/typecheck/test` verdes.

## Testes sugeridos

- Unit: `resolveStaffing` (tabela de casos por escopo/prioridade).
- E2E por entidade: feliz + ownership negado (403/404) + unicidade (409) + validação (400).
- E2E de qualificação: função fora da equipe é rejeitada.

## Relatório de Sessão (colar no PR)

```
S3 — Cadastro (Backend)
- Módulo apps/api/src/admin/escala: controllers + services ✔
- CRUD: Team, TeamFunction, Member, TeamMembership, MembershipFunction, StaffingRequirement ✔
- Schemas Zod em packages/shared ✔ | EscalaAccessService com gancho de coordenador (TODO S5) ✔
- resolveStaffing (puro) + testes dos 5 escopos ✔
- Admin-only nesta fase (coordenador ativa em S5/S6) — decisão registrada
- Intenções sem regressão ✔ | CI: verde ✔
- Observações / desvios: <...>
```
