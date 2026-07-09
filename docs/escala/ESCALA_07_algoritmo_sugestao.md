# S7 — Motor de Sugestão de Escala (Algoritmo)

> Documento de sessão de execução. Ler junto com `ESCALA_00_ORQUESTRACAO.md`
> (decisões D4, D5, D6, D11 e Seção 1.1) e o `CLAUDE.md` do repo.
> **Prereqs:** S2 (`✅` ocorrências), S3 (`✅` staffing + `resolveStaffing`), S6 (`✅`
> disponibilidade + `resolveAvailability`). Precisa dos três.

## Objetivo

O clímax do módulo: pegar disponibilidade + demanda + qualificação + prioridade e **montar
um rascunho de escala** para um mês — um algoritmo **guloso, justo e explicável**. Ele
**sugere**; o coordenador revisa/sobrescreve e publica na S8 (D11 — escala manual assistida).

## Escopo

**Inclui (backend apenas):**
- Serviço `SuggestionService` com o algoritmo guloso.
- Endpoint que gera o rascunho para (equipe(s), mês), criando `Assignment` em rascunho
  (`publishedAt = null`).
- Reuso das funções puras `resolveStaffing` (S3) e `resolveAvailability` (S6).
- **Relatório de lacunas** (vagas que ficaram abertas + motivo).

**NÃO inclui:** UI (S8) · publicação da escala (S8) · lembretes (S9). O algoritmo cria
rascunho; a tela e o "publicar" são S8.

**Migração:** provavelmente nenhuma (usa `Assignment`, `AvailabilityEntry`, etc. da S1).
Se precisar de campo auxiliar (ex.: `lastServedAt` cacheado), justificar; preferir calcular.

## Regras de justiça travadas (confirmadas com o Leal)

| # | Regra | Como implementa |
|---|-------|-----------------|
| J1 | **Contagem igual no mês**, desempate por **há mais tempo sem servir**. | Guloso: para cada vaga, entre elegíveis, escolhe o de **menos assignments no mês**; empate → menor `lastServedAt` (quem serviu há mais tempo). |
| J2 | **Espaçamento é preferência, nunca bloqueio.** | Já coberto por J1 (o desempate favorece quem serviu há mais tempo). Não recusa repetir alguém — equipe pequena (7 comentaristas/~30 missas) precisa repetir. |
| J3 | **Vaga sem elegível fica ABERTA e é reportada.** Nunca relaxa regra sozinho. | Se nenhum elegível, não preenche; registra no relatório de lacunas com o motivo. Coordenador decide na S8. |
| J4 | **Preencher da função mais escassa para a mais abundante.** | Ordenar as funções de cada ocorrência por nº de qualificados disponíveis (ascendente) antes de alocar. Cerimoniário (poucos) antes de credência (muitos). |

## Decisões automáticas (decorrem do que já foi travado)

| # | Decisão | Base |
|---|---------|------|
| A1 | Só entra quem está **disponível** (`resolveAvailability` = AVAILABLE, explícito ou por regra). "Não informou" (`default`) **não** é elegível. | Opt-in (U1). |
| A2 | Só entra quem é **qualificado** para a função (`MembershipFunction`) e é membro **ativo** da equipe. | Modelo (S3). |
| A3 | Respeita o **teto por equipe** (`maxAssignmentsPerMonth`): quem atingiu o teto no mês sai da lista de elegíveis. | D8. |
| A4 | Respeita `@@unique(occurrenceId, memberId)`: ninguém em duas funções na mesma missa. Se já alocado naquela ocorrência (qualquer equipe), inelegível para outra vaga da mesma missa. | D4/D5. |
| A5 | **Não sobrescreve rascunho existente.** A sugestão só preenche **vagas vazias** (required − assignments atuais). Rodar "sugerir" 2× não embaralha ajustes manuais do coordenador. | Idempotência de segurança. |
| A6 | Contenda entre equipes: se duas equipes disputam o mesmo membro na mesma missa, vence a de **menor `priority`** do vínculo do membro; o "primeiro que aloca" do guloso respeita isso pela ordem de processamento por prioridade. | D5. |

## O algoritmo (guloso, determinístico)

Para o alvo (equipe(s), mês) — processar equipes por **prioridade** (para A6):

```
1. occurrences ← ocorrências materializadas do mês (S2), ordenadas por data/hora.
2. Para cada equipe (ordenada por prioridade ascendente):
     para cada occurrence:
       required ← resolveStaffing(occurrence, regras da equipe)   // S3, por função
       funções ← ordenar por nº de qualificados-disponíveis ASC   // J4
       para cada função (na ordem escassa→abundante):
         vagas ← required[função] − assignments_atuais(occurrence, função)   // A5
         repetir vagas vezes:
           elegíveis ← membros(equipe) que são:
              qualificados na função (A2) ∧ ativos (A2)
              ∧ resolveAvailability(occurrence)=AVAILABLE (A1)
              ∧ não no teto do mês (A3)
              ∧ não já alocados nesta occurrence (A4)
           se elegíveis vazio: registrar LACUNA (occurrence, função, motivo) e seguir  // J3
           senão:
              escolhido ← min por (assignments_no_mês, depois lastServedAt)  // J1/J2
              criar Assignment(occurrence, equipe, função, escolhido, publishedAt=null)
              atualizar contadores em memória (assignments_no_mês, lastServedAt)
3. retornar { criados, lacunas[] }
```

Notas de implementação:
- **`assignments_no_mês`** e **`lastServedAt`** mantidos **em memória** durante a corrida
  (não reconsultar o banco a cada vaga). `lastServedAt` inicial = data do último assignment
  do membro **antes** do mês (consulta única no começo); atualizado a cada alocação.
- Determinístico: mesmas entradas → mesmo resultado. Desempate final estável (ex.: por
  `memberId`) para não variar entre execuções.
- Complexidade O(vagas × membros) — trivial para os tamanhos reais (dezenas). Não otimizar
  prematuramente; clareza > esperteza (o coordenador precisa entender por que fulano caiu ali).

## Endpoint

| Método | Rota | Notas |
|--------|------|-------|
| POST | `/escala/schedule/suggest` | Body `{ month: 'YYYY-MM', teamIds?: string[] }`. Sem `teamIds` = todas as equipes que o ator pode gerir. Cria assignments em rascunho e retorna `{ created, gaps: [{ occurrenceId, functionId, teamId, reason }] }`. |

- **Autorização** (`EscalaAuthGuard` + `EscalaAccessService`, da S5): coordenador só as
  **próprias** equipes; admin qualquer. Se `teamIds` incluir equipe fora do alcance → 403.
- Idempotente por A5: reexecutar só preenche o que está vazio.
- Rejeitar mês não materializado (sem ocorrências) com mensagem clara ("abra o mês primeiro").

## Relatório de lacunas (`gaps`)

Cada lacuna: `{ occurrenceId, date, time, teamId, functionId, functionName, required, filled, reason }`.
`reason` ∈ { `SEM_DISPONIVEL`, `SEM_QUALIFICADO`, `TODOS_NO_TETO` } — o motivo pelo qual não
houve elegível. É o que a S8 mostra ao coordenador para ele decidir (chamar alguém, relaxar
teto na mão, aceitar a lacuna). **O algoritmo nunca decide por ele** (J3).

## Critérios de aceite

- [ ] Gera rascunho para (mês, equipe) criando `Assignment` com `publishedAt=null`.
- [ ] **J1:** distribuição iguala a contagem; desempate por há-mais-tempo-sem-servir (teste com
  equipe de 7 p/ ~30 vagas → todos com contagem próxima, sem um sobrecarregado).
- [ ] **J3:** vaga sem elegível fica aberta e aparece em `gaps` com o motivo certo; **nada** é
  forçado (teto não estourado, indisponível não escalado).
- [ ] **J4:** função escassa preenchida antes da abundante (teste: poucos cerimoniários não são
  "gastos" antes da vaga de cerimoniário).
- [ ] **A1:** quem "não informou" nunca é escalado.
- [ ] **A3/A4:** teto respeitado; ninguém em duas funções na mesma missa.
- [ ] **A5:** rodar `suggest` 2× não altera assignments já existentes (só preenche vazio).
- [ ] **A6:** contenda entre equipes resolve por `priority`; membro não acaba em duas equipes na mesma missa.
- [ ] Determinístico (mesmas entradas → mesmo resultado).
- [ ] Autorização: coordenador limitado às próprias equipes (403 fora).
- [ ] Mês não materializado → erro claro.
- [ ] Intenções sem regressão; **CI verde**.

## Testes sugeridos

- Unit do `SuggestionService` com fixtures desenhadas: equipe pequena (força repetição, J2),
  função escassa (J4), todos no teto (J3/TODOS_NO_TETO), ninguém disponível (J3/SEM_DISPONIVEL),
  contenda entre duas equipes (A6), reexecução idempotente (A5).
- E2E do endpoint: feliz + gaps + autorização + mês não materializado.

## Relatório de Sessão (colar no PR)

```
S7 — Motor de Sugestão de Escala
- SuggestionService (guloso, determinístico); reusa resolveStaffing + resolveAvailability ✔
- J1 contagem igual + desempate há-mais-tempo | J2 espaçamento-preferência | J3 lacuna aberta+reportada | J4 escassa→abundante ✔
- A1 só disponível | A2 qualificado/ativo | A3 teto | A4 unique-por-missa | A5 não sobrescreve rascunho | A6 priority ✔
- Endpoint POST /escala/schedule/suggest (rascunho publishedAt=null) + relatório de gaps com motivo ✔
- Autorização coordenador/admin (S5) ✔ | mês não materializado rejeitado ✔
- Determinístico; sem migração | Intenções sem regressão ✔ | CI: verde ✔
- Observações / desvios: <...>
```
