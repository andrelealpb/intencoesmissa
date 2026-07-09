# S6-redesign — Portal de Disponibilidade (Usabilidade)

> Sessão de **redesign** (feedback do piloto: tela extensa e ineficiente). Ler junto com
> `ESCALA_00_ORQUESTRACAO.md` (decisões U1–U4, Seção 1.1) e o `CLAUDE.md`. Ler também a
> skill `frontend-design` antes de codar a UI.
> **Prereqs:** S6 (`✅` — backend/endpoints de disponibilidade já existem; isto é só a UI).

## Problema (do piloto)

A tela atual (`/p/{slug}/escala`) lista as missas do mês numa **coluna vertical** — ~30
cartões, cada um grande, um por missa. No celular vira rolagem interminável, e informar um mês
exige tocar em ~30 botões. A **regra recorrente** — que deveria ser o caminho principal — está
escondida e colapsada no topo, como se fosse detalhe.

## Objetivo

Refazer a UI do portal para o voluntário informar disponibilidade **rápido e no celular**,
invertendo a hierarquia: **regra recorrente como protagonista**, missas individuais como ajuste
fino, e o mês navegável **semana a semana** em vez de uma lista infinita. **Sem** tocar no
backend (endpoints `/escala/me/*` e o resolvedor `resolveAvailability` da S6 ficam iguais).

## Escopo

**Inclui (frontend do portal apenas):** reestruturação de `/p/{slug}/escala` e telas de
disponibilidade. Aplicar a skill `frontend-design` (usabilidade + identidade), mobile-first.

**NÃO inclui:** backend (nada nos endpoints/resolvedor da S6) · login (já existe) · nada de
outras sessões.

## Diretrizes de UX travadas

| # | Diretriz |
|---|---------|
| R1 | **Regra recorrente é o protagonista, no topo, aberta por padrão.** "Sempre disponível em: [dias/horários]". Definir a regra pré-preenche o mês (já suportado pelo backend). Missas individuais viram **ajuste de exceção**, não a via principal. |
| R2 | **Navegação semana a semana**, não lista do mês inteiro. O voluntário vê ~7–10 missas por vez, com navegação anterior/próxima e indicação da semana. Bem menos rolagem no celular. |
| R3 | **Densidade:** cada missa ocupa uma linha compacta (dia+hora+toggle), não um cartão grande. Toggle Disponível/Indisponível de um toque, cor clara (verde/neutro). Mostrar a **origem** de forma sutil: "pela sua regra" vs marcado à mão vs "sem resposta". |
| R4 | **Binário** (Disponível/Indisponível) — mantém U4; `MAYBE` não exposto. |
| R5 | **Opt-in preservado (U1):** "sem resposta" resolve indisponível, mas a UI distingue visualmente "sem resposta" de "indisponível marcado" (para o voluntário perceber o que ainda não respondeu). |

## Notas de aplicação da skill `frontend-design`

- Mobile-first de verdade (o voluntário usa no celular): alvos de toque grandes, pouca
  rolagem, navegação por semana com gesto/botão.
- **Estrutura é informação:** o agrupamento por semana e o destaque da regra recorrente
  refletem como a pessoa **pensa** disponibilidade (padrões, não missa-a-missa).
- Copy na voz do produto (a skill enfatiza): "Sem resposta" / "Pela sua regra" / "Você marcou".
  Estado vazio de mês não aberto: "A escala deste mês ainda não foi aberta pela coordenação."
- Reusar o tema visual da paróquia (como a tela pública de intenções). Uma escolha de
  identidade, não os defaults genéricos que a skill alerta.
- **Não** reinventar o backend nem os estados — só a forma. O resolvedor já devolve status +
  source; a UI só apresenta melhor.

## Critérios de aceite

- [ ] Regra recorrente em destaque no topo, aberta; definir/editar pré-preenche o mês.
- [ ] Navegação semana a semana; nada de lista vertical do mês inteiro.
- [ ] Linhas compactas; marcar disponibilidade de um mês exige poucos toques (regra + exceções), não ~30.
- [ ] Distingue visualmente "sem resposta" × "indisponível" × "disponível (regra/manual)".
- [ ] Usável e confortável em tela de celular (alvos grandes, pouca rolagem).
- [ ] Mês não aberto → estado vazio amigável.
- [ ] Backend intocado (endpoints/resolvedor da S6 iguais); persistência por autosave segue funcionando.
- [ ] Intenções sem regressão; **CI verde**.

## Testes sugeridos

- Component: render por semana; toggle chama o PUT certo; estados (sem resposta/regra/manual) distintos.
- E2E: definir regra → semana pré-preenchida → ajustar uma exceção → persiste.
- Conferência manual **no celular** (o CI não pega UX de tela pequena).

## Relatório de Sessão (colar no PR)

```
S6-redesign — Portal de Disponibilidade
- Regra recorrente protagonista no topo (R1) + navegação semana a semana (R2) ✔
- Linhas compactas, toggle de um toque; mês em poucos toques, não ~30 (R3) ✔
- Distingue sem-resposta × indisponível × disponível (R5); binário (R4) ✔
- Skill frontend-design aplicada; mobile-first; tema da paróquia ✔
- Backend intocado (endpoints/resolvedor da S6) ✔ | Intenções sem regressão ✔ | CI verde ✔
- Observações / desvios: <...>
```
