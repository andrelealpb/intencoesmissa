# S6 — Portal de Disponibilidade do Voluntário

> Documento de sessão de execução. Ler junto com `ESCALA_00_ORQUESTRACAO.md`
> (decisões D3, D5 e Seção 1.1) e o `CLAUDE.md` do repo.
> **Prereqs:** S2 (`✅` — ocorrências) e S5 (`✅` — auth de membro). Precisa dos dois.

## Objetivo

Dar ao voluntário a primeira tela que ele de fato usa: **loga sem senha** (consumindo a
API da S5), vê as missas do mês e **informa quando pode servir**. É o portal que gera o
dado de disponibilidade — sem ele, o algoritmo da S7 roda no vazio. É também onde a API
da S5 finalmente vira alcançável por usuário real.

## Escopo

**Inclui:**
- **Frontend do portal** em `/p/{slug}/escala/*` (público, mobile-first): tela de login
  (OTP + callback do link mágico), visão do mês, marcação de disponibilidade, editor de
  regra recorrente.
- **Endpoints do realm de membro** (`MemberJwtGuard`, tudo escopado a `req.member`):
  ler ocorrências do mês com disponibilidade efetiva, gravar disponibilidade, gerir regras.
- **Resolvedor puro de disponibilidade efetiva** (`resolveAvailability`), consumido aqui e
  pela S7.

**NÃO inclui:** ver escalas/atribuições (não existem até S7/S8) · qualquer tela de
coordenador (S4/S8) · lembretes (S9) · edição de `priority` pelo membro (admin-only no MVP).

**Migração:** nenhuma esperada — `AvailabilityEntry` e `MemberAvailabilityRule` vieram da S1.

## Decisões de UX travadas (confirmadas com o Leal)

| # | Decisão | Implicação |
|---|---------|-----------|
| U1 | **Opt-in:** o voluntário começa **indisponível** e marca quando **pode**. | Só entra na escala quem confirmou; nada de escalar quem não respondeu. |
| U2 | **"Não informou" ≠ "indisponível".** Quem não tocou em nada aparece (pro coordenador, S8) como lacuna de dado, não como recusa. | O resolvedor devolve a **origem** do status (ver abaixo). |
| U3 | **Regra recorrente + ajuste por missa.** "Sirvo domingos 10h" pré-preenche o mês; o membro só mexe nas exceções. | Regra é preferência viva; entry guarda só o **desvio**. |
| U4 | **Binário na UI:** Disponível / Indisponível. `MAYBE` fica no enum, **não** exposto. | Liga depois sem migração, se um dia fizer sentido. |

## Modelo de disponibilidade efetiva (o ponto de design)

**Decisão:** as regras **não** materializam entries. Em vez disso, um resolvedor puro
calcula a disponibilidade efetiva sob demanda. Isso elimina o bug de "mudei a regra e as
entries antigas ficaram velhas".

```ts
resolveAvailability(
  occurrence: { weekday: number; time: string },
  entry: AvailabilityEntry | null,       // desvio explícito do membro, se houver
  rules: MemberAvailabilityRule[],       // preferência recorrente do membro
): { status: 'AVAILABLE' | 'UNAVAILABLE'; source: 'explicit' | 'rule' | 'default' }
```
Precedência:
1. **`entry` existe** → usa `entry.status`, `source='explicit'`.
2. senão, **regra casa** (weekday + time, ou weekday com `time=null`) e é `available` →
   `AVAILABLE`, `source='rule'`.
3. senão → `UNAVAILABLE`, `source='default'` (= **"não informou"**, dado U1/U2).

Consequência no armazenamento: `AvailabilityEntry` guarda **só desvios** — o membro
desmarca um slot que a regra deixava disponível (grava `UNAVAILABLE` explícito) ou marca
um slot sem regra (grava `AVAILABLE`). Slots que seguem a regra **não** geram entry.
`resolveAvailability` é pura e **unit-testada**; a S7 vai reusá-la.

> Refinamento consciente do comentário original do schema (que dizia "regra pré-preenche
> entries"). Aqui a regra é **viva via resolvedor**, não materializada — mais robusto.
> Registrar essa decisão no PR/Changelog.

## Endpoints (realm de membro — `MemberJwtGuard`, escopo `req.member.parishId`)

| Método | Rota | Notas |
|--------|------|-------|
| GET | `/escala/me` | Perfil mínimo do membro (nome) p/ o cabeçalho do portal. |
| GET | `/escala/me/occurrences?month=YYYY-MM` | Ocorrências do mês (data, hora, título, `isSolemnity`) **+ disponibilidade efetiva** (`status` + `source`) por ocorrência. Se o mês não foi materializado → lista vazia (estado vazio no front). |
| PUT | `/escala/me/availability` | `{ occurrenceId, status: 'AVAILABLE'\|'UNAVAILABLE'\|'CLEAR' }`. Upsert do desvio explícito; `CLEAR` **apaga** o entry (volta a valer a regra). |
| GET | `/escala/me/rules` | Regras recorrentes do membro. |
| PUT | `/escala/me/rules` | `{ rules: [{ weekday, time?, available }] }` — **replace-set** do conjunto (padrão das qualificações da S3). |

- **`memberId` nunca vem do path/body** — sempre do JWT. Ocorrências e entries filtrados
  pela paróquia do membro. Um membro não enxerga nem edita dado de outro.
- Materialização do mês **não** é disparada aqui (é ato de planejamento do coordenador via
  S2). O portal só **lê** ocorrências existentes.

## Frontend — portal em `/p/{slug}/escala/*` (mobile-first)

Reusar a linguagem visual da tela pública de intenções (`/p/{slug}/form`) — mesmo tema da
paróquia. Sessão de membro **separada** da sessão NextAuth do admin (guardar o JWT de
membro em cookie próprio; não misturar com o realm admin).

**Telas:**
- **`/p/{slug}/escala/entrar`** — login: campo telefone (ou e-mail) → `request` → campo
  do código OTP → `verify` → guarda o JWT e entra. Estados de erro **genéricos** (respeitar
  anti-enumeração da S5: "se você está cadastrado, enviamos…").
- **`/p/{slug}/escala/entrar?token=…`** — callback do link mágico: valida via `GET magic`,
  guarda o JWT, redireciona pro mês.
- **`/p/{slug}/escala`** (autenticada) — visão do mês:
  - Lista/grade das missas do mês, cada uma com toggle **Disponível/Indisponível**
    pré-marcado pelo resolvedor. Selo de solenidade quando `isSolemnity`.
  - **Autosave por toggle** (PUT a cada mudança) com indicador claro de "salvo" — melhor em
    celular que um botão "salvar" no fim.
  - Seletor de mês (só meses já materializados aparecem com conteúdo).
  - **Editor de regra recorrente** ("sempre disponível em: [dia/horário]") — grava via
    `PUT rules`; ao salvar, o mês reflete o novo pré-preenchimento.
  - **Estado vazio:** mês não materializado → "A escala deste mês ainda não foi aberta pela
    coordenação." (não é erro).

## Segurança / anti-abuso

- Todo endpoint sob `MemberJwtGuard`; `isActive` do membro revalidado (padrão da S5).
- Rate limit padrão nos endpoints de escrita.
- Sem `memberId` em rota; sem vazamento de dado entre membros ou entre paróquias.

## Critérios de aceite

- [ ] Login por OTP e por link mágico funcionam ponta a ponta (consumindo a API da S5).
- [ ] `resolveAvailability` unit-testada nas 3 origens (explicit/rule/default) + casamento de
  regra com `time=null` (dia inteiro) e com hora específica.
- [ ] **Opt-in respeitado:** membro que não tocou em nada resolve `UNAVAILABLE`/`source=default`.
- [ ] Marcar um slot sem regra cria entry `AVAILABLE`; desmarcar slot de regra cria entry
  `UNAVAILABLE`; `CLEAR` apaga o entry e volta a valer a regra.
- [ ] Editar regra recorrente muda o pré-preenchimento do mês (sem reescrever desvios explícitos).
- [ ] Mês não materializado → estado vazio amigável (não erro).
- [ ] Isolamento: membro A não lê/edita disponibilidade de B; nem de outra paróquia.
- [ ] Erros de login genéricos (anti-enumeração da S5 preservada).
- [ ] Portal usável em tela de celular; sessão de membro separada da do admin.
- [ ] Intenções sem regressão; **CI verde**.

## Testes sugeridos

- Unit: `resolveAvailability` (tabela de origens + casamento de regra).
- E2E membro: login → GET occurrences (pré-preenchido por regra) → PUT availability
  (AVAILABLE/UNAVAILABLE/CLEAR) → reflete no GET seguinte.
- E2E isolamento: token de membro A não acessa dados de B; mês de outra paróquia não aparece.

## Relatório de Sessão (colar no PR)

```
S6 — Portal de Disponibilidade
- Frontend /p/{slug}/escala: login (OTP + link mágico), visão do mês, editor de regra ✔
- Endpoints /escala/me/*: occurrences (efetiva), availability (upsert/CLEAR), rules (replace-set) ✔
- resolveAvailability (puro): explicit > rule > default; source exposto p/ "não informou" (U2) ✔
- Opt-in (U1) + binário na UI (U4) + regra viva via resolvedor (U3, refino do schema) — registrado
- Autosave por toggle; sessão de membro separada do admin; mobile-first ✔
- Isolamento entre membros/paróquias testado ✔ | anti-enumeração preservada ✔
- Sem migração | Intenções sem regressão ✔ | CI: verde ✔
- Observações / desvios: <...>
```
