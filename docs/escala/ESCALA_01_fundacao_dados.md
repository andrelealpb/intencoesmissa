# S1 — Fundação de Dados

> Documento de sessão de execução. Ler junto com `ESCALA_00_ORQUESTRACAO.md`
> (decisões travadas) e o `CLAUDE.md` do repo. **Prereqs:** nenhum.

## Objetivo

Introduzir todo o modelo de dados do módulo Escala no schema Prisma, gerar a
migração e um seed idempotente com as equipes/funções padrão de uma paróquia.
Ao final, `prisma generate` produz o Client com os novos modelos e as Intenções
seguem 100% funcionais.

## Escopo

**Inclui:**
- Mesclar o fragmento de schema da Escala em `prisma/schema.prisma`.
- Adicionar as **back-relations** nos modelos existentes `Parish`, `MassSchedule`, `MassException`.
- Espelhar os novos enums em `packages/shared/src/types.ts`.
- Gerar a migração (`add_escala_module`) — será a migração **12**.
- Estender `prisma/seed.ts` (idempotente, via upsert) com equipes/funções padrão.

**NÃO inclui** (outras sessões): endpoints, UI, auth de membro, materialização,
algoritmo. Aqui é **só** modelagem + migração + seed.

## Passo a passo

### 1. Mesclar o schema
Colar o conteúdo de `docs/escala/escala.prisma` (o fragmento já revisado) ao final
de `prisma/schema.prisma`. São 11 modelos e 5 enums novos:
`Member, Team, TeamFunction, TeamMembership, MembershipFunction, MassOccurrence,
StaffingRequirement, MemberAvailabilityRule, AvailabilityEntry, Assignment,
MemberAuthToken` + enums `MinistryCategory, StaffingScope, AvailabilityStatus,
AssignmentStatus, MemberAuthTokenType`.

### 2. Back-relations nos modelos existentes
Adicionar os campos de relação inversa (o Prisma exige os dois lados):

```prisma
// em model Parish { ... }
  members              Member[]
  teams                Team[]
  massOccurrences      MassOccurrence[]
  staffingRequirements StaffingRequirement[]
  assignments          Assignment[]

// em model MassSchedule { ... }
  occurrences          MassOccurrence[]
  staffingRequirements StaffingRequirement[]

// em model MassException { ... }
  occurrences          MassOccurrence[]
  staffingRequirements StaffingRequirement[]
```

⚠️ Conferir os nomes reais das relations do fragmento (`source`, `exception`,
`schedule`, `exception`) para casar os lados. Rodar `pnpm db:validate` até passar.

### 3. Espelhar enums em `packages/shared`
Em `packages/shared/src/types.ts`, adicionar os enums TypeScript espelhando os do
Prisma (mesmo padrão de `Role`, `IntentionGroup` já existentes):
`MinistryCategory, StaffingScope, AvailabilityStatus, AssignmentStatus, MemberAuthTokenType`.

### 4. Gerar a migração
```bash
pnpm db:migrate:dev --name add_escala_module
pnpm db:generate
```
Verificar que a migração é **puramente aditiva** (só `CREATE TABLE`/`CREATE TYPE`/
`CREATE INDEX`; nenhum `DROP`/`ALTER` destrutivo em tabelas de Intenções).

### 5. Seed de equipes/funções padrão (idempotente)
Estender `prisma/seed.ts` para a paróquia semente ("Sant'Anna e São Joaquim"),
via `upsert` por chave natural (`parishId + name` / `teamId + name`). Sugestão de
conjunto padrão (o admin edita depois):

| Team (category) | Funções |
|---|---|
| Coroinhas e Acólitos (`ALTAR_SERVERS`) | Cerimoniário, Cruz, Lecionário, Missal, Tocha, Credência, Líder de Credência, Sineta |
| MESC (`EUCHARISTIC_MINISTERS`) | MESC |
| Leitores (`READERS`) | Leitor, Salmista |
| Comentaristas (`COMMENTATORS`) | Comentarista |
| Acolhida (`WELCOMING`) | Acolhida, Coleta |
| Música/Canto (`MUSIC`) | Ministério de Canto |

Sem membros no seed (entram em S3/cadastro). Sem `StaffingRequirement` no seed
(entra no cadastro de demanda). O seed **não** pode duplicar em reexecução.

## Critérios de aceite

- [ ] `pnpm db:validate` e `pnpm db:generate` passam.
- [ ] Migração aplica limpo em base zerada (`pnpm db:migrate:deploy`).
- [ ] Rodar o seed **duas vezes** não cria duplicatas (idempotência).
- [ ] `pnpm typecheck` verde (enums de `shared` compilando).
- [ ] Testes de Intenções seguem verdes (sem regressão).
- [ ] Nenhuma alteração em tabelas/colunas de Intenções.

## Riscos desta sessão

- **Ciclos de relação / lados faltantes:** o Prisma acusa no `db:validate`. Resolver
  campo a campo; não silenciar com `?`.
- **`onDelete` do calendário:** `MassOccurrence.source`/`exception` usam
  `SetNull` (apagar um horário não apaga o histórico de ocorrência). `StaffingRequirement`
  usa `Cascade` (regra de demanda morre com o horário/exceção). Manter assim.

## Relatório de Sessão (colar no PR)

```
S1 — Fundação de Dados
- Migração: <nome/arquivo>
- Modelos criados: 11 | Enums: 5 | Back-relations: Parish, MassSchedule, MassException
- Seed: <N> equipes, <M> funções (idempotente ✔)
- Intenções: sem regressão ✔ | CI: verde ✔
- Observações / desvios: <...>
```
