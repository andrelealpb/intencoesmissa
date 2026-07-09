# S2.1 — Gestão de Ocorrências do Mês Aberto (correção)

> Sessão de **correção** (lacuna revelada no piloto). Ler junto com
> `ESCALA_00_ORQUESTRACAO.md` (decisões D7, D9, D11 e Seção 1.1) e o `CLAUDE.md`.
> **Prereqs:** S2 (`✅` materialização), S4 (`✅` tela admin), S8 (`✅` — pode haver escala publicada).

## Problema (do piloto)

A materialização (S2) cria as ocorrências do mês, mas **preserva** o que já existe (upsert,
para não apagar solenidades marcadas à mão — D7). Efeito colateral: se uma missa foi cadastrada
**errada** (ex.: quarta 19h que não existe) e materializada, corrigir o cadastro de missas
**depois** NÃO remove a ocorrência fantasma — re-materializar só adiciona/atualiza, nunca apaga.
E não há UI para remover uma ocorrência avulsa. Resultado: o coordenador fica **de mãos atadas**
com um mês aberto que contém erro e não pode ser corrigido.

## Objetivo

Dar ao admin/coordenador duas capacidades sobre um mês já aberto: **excluir uma ocorrência
avulsa** e **reconciliar o mês** com o cadastro de missas atual — sem destruir disponibilidade,
escala ou solenidade do que continua válido.

## Escopo

**Inclui:**
- Endpoint + UI para **excluir uma ocorrência** individual (com aviso se há escala/disponibilidade).
- Modo **reconciliar** da materialização: remove ocorrências órfãs (horário não existe mais no
  cadastro), adiciona faltantes, **preserva** o que continua válido.
- UI de listagem de ocorrências do mês com as ações (na tela de gestão do mês / "Abrir mês").

**NÃO inclui:** mudança no algoritmo (S7), na captura de disponibilidade (S6), no dispatch das
Intenções (D9).

## Regras (o cuidado que evita destruir dado)

### Excluir uma ocorrência
- `DELETE /escala/occurrences/:id` (admin/coordenador; `parishId` do ator).
- Se a ocorrência tem **assignments** (rascunho ou publicado) ou **availability entries**:
  **não** apagar silenciosamente. Retornar o que será afetado e exigir confirmação explícita
  (`?force=true` ou 2 passos). A UI mostra "Esta missa tem 3 escalados e 5 respostas de
  disponibilidade. Excluir mesmo assim?".
- Apagar a ocorrência **cascateia** (o schema já tem `onDelete: Cascade` de `Assignment`/
  `AvailabilityEntry` para `MassOccurrence`) — por isso o aviso é obrigatório antes.

### Reconciliar o mês (o modo novo da materialização)
`POST /escala/occurrences/reconcile` `{ month }` — para o intervalo do mês:
1. Recalcular o conjunto **esperado** de ocorrências a partir do cadastro atual
   (`MassSchedule` ativos + `MassException`), como a S2 faz.
2. **Adicionar** as que faltam (missa nova no cadastro).
3. **Remover** as **órfãs**: ocorrências cujo horário/dia **não existe mais** no cadastro
   (a quarta-19h fantasma). ⚠️ Aqui está o cuidado:
   - Órfã **sem** assignment e **sem** availability → remover direto.
   - Órfã **com** assignment/availability → **NÃO** remover automático; **listar** para o
     coordenador decidir (pode ser erro real, mas pode ser uma missa que ele quer manter).
     Retornar como "conflitos de reconciliação" para decisão manual (excluir via o DELETE acima).
4. **Preservar** intocado tudo que continua válido: `isSolemnity`, `title` manual (D7),
   assignments, disponibilidade.
5. Retornar resumo: `{ added, removedClean, conflicts: [{ occurrenceId, date, time, hasAssignments, hasAvailability }] }`.

> Princípio: reconciliação **nunca** destrói dado humano (escala/disponibilidade) sem decisão
> explícita. Remove sozinha só o que está claramente vazio e órfão.

## UI (na tela de gestão do mês / "Abrir mês", admin)

- **Listar ocorrências do mês** com data/hora/origem e indicadores (tem escala? tem
  disponibilidade? é solenidade?).
- Ação **excluir** por ocorrência (com o modal de aviso acima).
- Botão **"Reconciliar mês"** (ou "Atualizar mês com o cadastro"): roda o reconcile, mostra o
  resumo (adicionadas, removidas, e **conflitos** que precisam de decisão manual), e permite
  resolver cada conflito (manter ou excluir).
- Texto claro, na voz do produto: "Atualiza as missas deste mês conforme o cadastro atual.
  Missas removidas do cadastro que já têm escala/respostas ficam para você decidir."

## Critérios de aceite

- [ ] Excluir ocorrência **sem** dados → remove direto; **com** dados → exige confirmação e avisa o que será perdido.
- [ ] Reconciliar: adiciona missa nova; remove órfã **vazia** direto; órfã **com dados** vira conflito (não some sozinha).
- [ ] Reconciliar **preserva** solenidade, título manual, assignments e disponibilidade do que continua válido.
- [ ] O cenário do piloto: cadastro corrige (remove quarta-19h) → reconciliar → a quarta-19h
  vazia some; se tivesse escala, viraria conflito para decisão.
- [ ] Autorização admin/coordenador; `parishId` do ator.
- [ ] Sem migração (reusa tabelas); Intenções sem regressão; **CI verde**.

## Testes sugeridos

- Unit reconcile: órfã vazia removida; órfã com assignment vira conflito; solenidade preservada; missa nova adicionada.
- E2E: DELETE ocorrência com/sem dados; reconcile com resumo e conflitos.

## Relatório de Sessão (colar no PR)

```
S2.1 — Gestão de Ocorrências do Mês Aberto
- DELETE /escala/occurrences/:id: sem dados remove; com dados exige confirmação + aviso ✔
- POST /escala/occurrences/reconcile: adiciona faltantes, remove órfã vazia, órfã-com-dados vira conflito ✔
- Preserva solenidade/título/assignments/disponibilidade do que continua válido (D7) ✔
- UI: listar ocorrências + excluir + "Reconciliar mês" com resolução de conflitos ✔
- Cenário do piloto (quarta-19h fantasma) resolvido ✔
- Sem migração | Intenções sem regressão ✔ | CI verde ✔
- Observações / desvios: <...>
```
