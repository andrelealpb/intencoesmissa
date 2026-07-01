# S2 — Materialização de Ocorrências

> Documento de sessão de execução. Ler junto com `ESCALA_00_ORQUESTRACAO.md` e o
> `CLAUDE.md` do repo. **Prereqs:** S1 (`✅`).

## Objetivo

Transformar o calendário *calculado on-the-fly* das Intenções em **ocorrências
concretas persistidas** (`MassOccurrence`) para um intervalo (tipicamente um mês),
que servem de âncora para disponibilidade e escalação. A operação é **idempotente**
e **preserva flags manuais** (solenidade/título). Inclui o endpoint que "eleva" um
domingo comum a solenidade.

> **Guardrail (D9):** NÃO alterar o worker/dispatch das Intenções. Esta lógica é
> nova e isolada; o cálculo de missas das Intenções continua como está.

## Escopo

**Inclui:**
- `OccurrenceService` (em `apps/api`) com `materialize(parishId, from, to)`.
- Endpoints admin: materializar intervalo, listar ocorrências, elevar/rebaixar solenidade.
- Reuso da regra de determinação de missas do worker (exceções substituem horários
  regulares; timezone `America/Sao_Paulo`) — **replicada**, não importada do worker.

**NÃO inclui:** disponibilidade, escala, algoritmo, UI rica (a UI de calendário fina
vem com S8). Um endpoint simples de listagem basta aqui.

## Regra de materialização

Para cada dia `d` no intervalo `[from, to]` da paróquia:
1. **Horários regulares:** para cada `MassSchedule` ativo com `weekday == weekday(d)`,
   candidata `(date=d, time=schedule.time, sourceScheduleId=schedule.id)`.
2. **Exceções:** para cada `MassException` ativa com `date == d`, candidata
   `(date=d, time=exception.time, sourceExceptionId=exception.id, title=exception.title)`.
3. **Exceção substitui regular no mesmo horário:** se houver exceção e horário regular
   no mesmo `(d, time)`, a exceção vence (espelha o comportamento do worker atual).

### Upsert idempotente (o ponto crítico — D7)
Chave de conflito: `@@unique([parishId, date, time])`.

- **Se a ocorrência não existe:** criar com os campos da candidata. `isSolemnity`
  começa `false` (a menos que você adote a convenção de exceção-solene; ver abaixo).
- **Se já existe:** atualizar **apenas** a origem (`sourceScheduleId` / `sourceExceptionId`).
  **NUNCA** sobrescrever `isSolemnity`. Só preencher `title` se estiver `null`
  (não pisar num título editado à mão).

> Resultado: rodar `materialize` do mesmo mês duas vezes → mesmas linhas, e uma
> solenidade marcada manualmente **sobrevive** ao recálculo.

### Convenção de solenidade (decidir e documentar no PR)
`MassException` não tem hoje um flag de solenidade. Duas opções, escolher uma:
- **(a)** Toda exceção materializa com `isSolemnity=false`; a elevação é sempre manual
  via endpoint (mais simples, recomendado p/ MVP).
- **(b)** Introduzir depois um flag em `MassException` p/ auto-marcar. **Fora do escopo
  de S2** — se quiser, vira item em Pendências (Seção 9 do orquestrador).

## Endpoints (admin — `JwtAuthGuard` + ownership da paróquia)

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/admin/escala/occurrences/materialize` | Body `{ from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }`. Materializa o intervalo. Retorna `{ created, updated, total }`. |
| GET | `/admin/escala/occurrences?from=&to=` | Lista ocorrências do intervalo (data, hora, título, isSolemnity, origem). |
| PATCH | `/admin/escala/occurrences/:id` | Body `{ isSolemnity?: boolean, title?: string }`. Eleva/rebaixa solenidade ou ajusta título. |

- Validação Zod em `packages/shared` (`materializeRangeSchema`, `updateOccurrenceSchema`).
- Limite de intervalo: rejeitar `to - from > 92 dias` (evita materializar o ano inteiro por acidente).
- Timezone: interpretar datas no fuso da paróquia (`ParishSettings.dispatchTimezone`, default `America/Sao_Paulo`).

## Critérios de aceite

- [ ] Materializar jul/2026 da paróquia semente cria uma ocorrência por missa real do mês.
- [ ] **Idempotência:** rodar de novo → `created=0`, sem duplicatas.
- [ ] **Preservação:** `PATCH isSolemnity=true` num domingo → re-materializar → flag continua `true`.
- [ ] **Preservação de título:** título editado à mão não é sobrescrito pela re-materialização.
- [ ] Exceção no mesmo horário de um regular substitui o regular.
- [ ] Intervalo > 92 dias é rejeitado (400 com mensagem clara).
- [ ] Guards de ownership funcionam (admin de outra paróquia recebe 403/404).
- [ ] Intenções sem regressão; CI verde.

## Testes sugeridos

- Unit do `OccurrenceService`: cenários de idempotência e preservação de flags.
- E2E leve dos três endpoints (feliz + ownership negado + intervalo inválido).

## Relatório de Sessão (colar no PR)

```
S2 — Materialização de Ocorrências
- OccurrenceService: materialize(parishId, from, to) ✔
- Endpoints: POST materialize | GET list | PATCH occurrence ✔
- Convenção de solenidade adotada: (a) manual | (b) ...
- Idempotência + preservação de isSolemnity/title: testado ✔
- Worker de Intenções: intocado (D9) ✔ | CI: verde ✔
- Observações / desvios: <...>
```
