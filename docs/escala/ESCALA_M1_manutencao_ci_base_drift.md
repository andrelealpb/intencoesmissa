# M1 — Manutenção: CI, base verde e drift

> Sessão de **manutenção** (não é feature da Escala; é pré-requisito da S2).
> Ler junto com `docs/escala/ESCALA_00_ORQUESTRACAO.md`.
> **Prereqs:** SETUP (#1) e S1 (#2) já mergeados na mainline (`✅`).
> **Resolve:** R5 (CI desligado), R7 (base não-verde), R6 (drift schema↔migração).

## Objetivo

Ligar a rede de segurança automatizada, deixar a base verde e reconciliar o drift
schema↔migração — para que S2–S10 rodem com CI de verdade e migrações limpas.

## Por que ANTES da S2 (não é opcional)

A S2 **gera uma migração nova**. Com o drift R6 em aberto, o `prisma migrate dev` da
S2 vai re-propor os `DROP DEFAULT` em tabelas de Intenções e **sujar** a migração da
feature com mudança que não é dela. E sem CI, o "sem regressão" de toda sessão vira
verificação no olho. Resolver aqui limpa o caminho de todas as sessões seguintes.

## Organização em PRs (não misturar)

- **PR-M1a** — CI + base verde. **Não toca** `prisma/schema.prisma` nem migrações.
- **PR-M1b** — drift. **Só** schema/migração. Isolado por encostar em tabelas de Intenções.

Rodar A primeiro (deixa o CI verde), depois B fecha a base, depois C no PR separado.

---

## Workstream A — Ligar o CI (R5) · PR-M1a

**Contexto:** `.github/workflows/ci.yml` dispara em PR para `main`/`develop` (filtra
pela branch **base** da PR). Como a S1 empilhou PR sobre a branch da SETUP, a base não
era `develop` e o CI nunca rodou.

**Passos:**
1. Abrir o **PR-M1a com base = `develop`** e confirmar, na aba **Actions**, que o
   workflow dispara e roda os steps (`db:validate`, `db:generate`, `lint`, `typecheck`, `test`).
2. **(Robustez — recomendado)** Ampliar o gatilho para o CI **nunca mais ficar OFF
   silenciosamente**: em `on.pull_request`, remover o filtro de `branches` (rodar em
   toda PR, qualquer base) OU adicionar o padrão `claude/**`. Manter `on.push`
   restrito a `main`/`develop` (não rodar em cada push de branch).
3. **Não alterar os steps do job** — só o gatilho.

**Aceite:** Actions verde neste PR; uma PR de branch `claude/*` passa a disparar CI.

---

## Workstream B — Base verde (R7) · PR-M1a

Quatro falhas pré-existentes (idênticas na base, anteriores à S1). Para **cada uma**:
diagnosticar → **fix mínimo** → verificar.

> ⚠️ Regra: se alguma falha revelar **bug de produto real** (não artefato de
> teste/config), **PARAR e reportar** — não mascarar com `skip`/regra desabilitada.

- **B1 — `apps/web` sem `@types/jest`** (19 erros em `phone-input.spec.ts`: `it/describe/expect`
  não resolvem). Fix provável: `pnpm --filter web add -D @types/jest`. Se o `tsconfig`
  do web tiver `"types": [...]` explícito, incluir `"jest"`. Verificar `pnpm --filter web typecheck`.
- **B2 — mock do worker sem `massExceptions`** (`parish.massExceptions.length` estoura).
  O código lê `massExceptions`; o fixture não fornece. Fix: adicionar `massExceptions: []`
  ao mock. **Confirmar que é lacuna de mock, não do código.**
- **B3 — ESLint do `shared`** (erro de config/env). Diagnosticar o erro real e aplicar
  fix **mínimo** de config (`env`/`parserOptions`). **Não** desabilitar regra globalmente.
- **B4 — `admin.service.spec` da api.** Diagnosticar. **Atenção:** spec de service
  falhando pode ser **bug real**. Investigar a causa antes de tocar no teste; se for
  bug de produto, reportar em vez de "consertar o teste".

**Aceite:** `lint` + `typecheck` + `test` verdes em **todos** os apps; nenhuma regra
silenciada; nenhuma correção que esconda bug.

---

## Workstream C — Drift schema↔migração (R6) · PR-M1b

**Contexto:** o Prisma quer embutir `DROP DEFAULT` em `parishes`/`notices`/
`dispatch_batches` (tabelas de **Intenções**). A S1 removeu isso da migração dela para
ficar aditiva, mas o drift **continua no repo**.

**Passos:**
1. Numa base com todas as migrações aplicadas, rodar `prisma migrate dev --create-only`
   para ver **exatamente** quais colunas/defaults driftam.
2. Decidir **por coluna**, com viés a **NÃO mudar o comportamento das Intenções**:
   - Se o default **deve** existir (o banco de produção depende dele) → **declarar o
     default no `schema.prisma`** para casar schema↔banco (drift some, sem migração de dados).
   - Se o default **não** deve existir → gerar **uma** migração intencional e nomeada
     (ex.: `reconcile_intencoes_defaults`) que aplica o `DROP` de forma rastreada.
3. Objetivo final: um `migrate dev` seguinte **não propõe nada** (zero drift); e
   `migrate deploy` em base zerada aplica limpo.

**Guardrail:** só **reconciliar** drift — nenhuma mudança de comportamento das Intenções.
Depois, rodar o seed e os testes do worker (ciclo de despacho) para confirmar intocado.

**Aceite:** zero drift no `migrate dev`; deploy zerado limpo; Intenções sem regressão.

---

## Atualização do orquestrador (no mesmo PR)

- Seção 9 (Riscos): marcar **R5, R6, R7 como resolvidos** (com o nº do PR).
- Seção 8 (Changelog): entrada da manutenção M1.
- Seção 6 (Status): opcional, linha `M1 ✅`.

## Critérios de aceite (consolidado)

- [ ] CI dispara e fica **verde** numa PR (Actions), inclusive de branch `claude/*`.
- [ ] `lint` + `typecheck` + `test` verdes em web, api, worker, shared — sem regra silenciada.
- [ ] Nenhuma das 4 correções escondeu bug de produto (B4 investigado a fundo).
- [ ] `migrate dev` não propõe drift; `migrate deploy` em base zerada limpo.
- [ ] Intenções sem regressão (seed + testes do worker verdes).
- [ ] Orquestrador atualizado (R5/R6/R7, Changelog).

## Relatório de Sessão (colar nos PRs)

```
M1 — Manutenção (PR-M1a: CI+base | PR-M1b: drift)
- CI: gatilho ajustado; Actions verde em PR claude/* ✔ (R5)
- Base verde: B1 @types/jest | B2 mock worker | B3 eslint shared | B4 admin.service.spec
  → fixes mínimos; B4 investigado (bug real? sim/não): <...> (R7)
- Drift: <declarado default no schema | migração reconcile_intencoes_defaults> → zero drift ✔ (R6)
- Intenções sem regressão (seed + worker) ✔
- Orquestrador: R5/R6/R7 resolvidos + Changelog ✔
- Observações / desvios: <...>
```
