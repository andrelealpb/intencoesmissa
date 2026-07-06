# S6.5 — Convites e Convocação

> Documento de sessão de execução. Ler junto com `ESCALA_00_ORQUESTRACAO.md`
> (decisões D2, D9, R1 e Seção 1.1) e o `CLAUDE.md` do repo.
> **Prereqs:** S4 (`✅` — cadastro/tela de equipe), S5 (`✅` — auth/entrega + autorização de
> coordenador), S6 (`✅` — portal, destino do link). Sessão **nova** (não estava no mapa original).

## Objetivo

Fechar o buraco entre "membro cadastrado" e "membro sabe que foi convocado". Duas coisas:
1. **Convite individual** no momento do cadastro (WhatsApp direto pro membro).
2. **Convocação de disponibilidade** na abertura do mês (mensagem **única** no grupo de
   WhatsApp da equipe).

Sem isso, o voluntário nunca fica sabendo que existe um portal esperando disponibilidade —
e o algoritmo da S7 roda no vazio.

## Escopo

**Inclui:**
- Campo novo `whatsappGroupId` em `Team` (migração aditiva) + cadastro dele na tela de equipe (S4).
- **Convite individual** ao adicionar membro: opcional, **padrão ligado**.
- **Convocação no grupo** ao "Abrir mês": coordenador só a **própria** equipe; admin todas.
- Reuso do serviço de entrega da S5 (Z-API por paróquia) — degradação graciosa.

**NÃO inclui:** lembrete pré-missa (S9, é outra coisa) · algoritmo (S7) · qualquer envio que
não seja estes dois.

## Decisões travadas (confirmadas com o Leal)

| # | Decisão | Motivo |
|---|---------|--------|
| C1 | **Convite no cadastro = individual** (1 msg pro membro). | Evento pontual, volume baixo → seguro quanto ao R1. |
| C2 | **Convocação na abertura do mês = grupo** (1 msg por equipe, não por pessoa). | Evento em lote → grupo é a saída segura do R1 (não 40 msgs individuais). |
| C3 | **Convite individual: opcional, padrão ligado** (checkbox "enviar convite" no cadastro, já marcado). | Admin cadastra em lote ou confere telefone sem disparar indevido. |
| C4 | **Convocação: coordenador só a própria equipe; pároco/admin todas.** | Reusa a autorização de coordenador da S5 (`EscalaAccessService`); nenhuma regra nova. |
| C5 | **Convocação depende de `whatsappGroupId` cadastrado.** Equipe sem grupo → convocação **pulada** com aviso claro, não erro. | Não travar a abertura do mês por falta de config. |

## Dados — migração aditiva

Adicionar a `Team`:
- `whatsappGroupId String?` — identificador do grupo na Z-API (formato conforme a Z-API usa).

Migração aditiva (nº 14). Cadastrável na tela de equipe (S4): campo opcional "Grupo de
WhatsApp da equipe" com uma nota de ajuda de onde obter o ID.

## Parte 1 — Convite individual (no cadastro)

- No `POST /escala/members` (ou no fluxo de vínculo — ver nota), aceitar uma flag
  `sendInvite?: boolean` (**default `true`** — C3). A tela (S4) mostra checkbox "Enviar
  convite por WhatsApp", já marcado.
- Se `sendInvite` e o membro tem telefone: enviar **1 mensagem** via Z-API da paróquia com
  o link do portal — a URL `MEMBER_PORTAL_URL/p/{slug}/escala/entrar` (o membro pede o
  código lá; **não** embutir OTP no convite). Texto do tipo: "Você foi incluído na equipe
  {equipe} da {paróquia}. Informe quando pode servir: {link}".
- **Degradação graciosa** (padrão do sistema): sem Z-API na paróquia, ou sem telefone, ou
  falha de envio → o cadastro **conclui normalmente** e a falha é **logada**, nunca quebra
  o cadastro nem vaza no response. O convite é acessório, não pré-requisito do cadastro.

> Nota de decisão p/ a sessão: o "convite" faz sentido quando a pessoa é vinculada a uma
> **equipe** (a mensagem cita a equipe). Se o membro é criado sem equipe, ou o convite vai
> no primeiro vínculo, ou o texto omite a equipe. Escolher e **documentar no PR**; preferir
> disparar no **vínculo** (`POST teams/:teamId/members`), pois é aí que há equipe pra citar.

## Parte 2 — Convocação de disponibilidade (na abertura do mês)

- Estender o fluxo de "Abrir mês" (materialização da S2, botão da S4): **após** materializar,
  oferecer/disparar a convocação no grupo.
- **Autorização (C4):** coordenador só dispara pro grupo da **própria** equipe; pároco/admin
  pode disparar pras equipes que escolher (uma, várias, todas). Reusar `EscalaAccessService`
  — não criar regra nova.
- **Envio (C2):** para cada equipe alvo, **1 mensagem** ao `whatsappGroupId` daquela equipe,
  via Z-API da paróquia. Texto: "A escala de {mês} está aberta. Informe sua disponibilidade
  até {prazo?} em {link}". Link = URL do portal (mesma da Parte 1).
- **C5:** equipe sem `whatsappGroupId` → **pular** aquela equipe e reportar no resultado
  ("Convocação não enviada para {equipe}: grupo não configurado"). Não é erro; as outras seguem.
- Retornar um resumo: quais grupos receberam, quais foram pulados e por quê.

> **Materialização e convocação são passos distintos.** Abrir o mês (criar ocorrências) NÃO
> deve depender do envio. Se a convocação falhar, as ocorrências já estão criadas. Idealmente
> a convocação é uma ação separada ("Abrir mês" primeiro; depois um botão "Convocar equipes"),
> ou um passo opcional dentro do fluxo — nunca um bloqueio da materialização.

## R1 — nota obrigatória (não confundir escopos)

- Convite individual (C1): 1 msg por ação humana pontual → baixo risco.
- Convocação no grupo (C2): 1 msg **por equipe** (não por pessoa) → volume baixo, saída
  desenhada pro R1.
- **Ainda é Z-API (WhatsApp não-oficial).** Muitas equipes × todo mês = envios automatizados
  recorrentes; se a Meta apertar, a saída definitiva (aqui e na S9) é a **Cloud API oficial**.
  Registrar; não bloqueia o MVP.

## Critérios de aceite

- [ ] `whatsappGroupId` em `Team` (migração aditiva) + campo na tela de equipe (S4).
- [ ] Cadastro/vínculo com `sendInvite` default `true`; checkbox na UI já marcado; desmarcar não envia.
- [ ] Convite individual envia 1 msg com link do portal; **cadastro conclui mesmo se o envio falhar** (degradação graciosa).
- [ ] "Abrir mês" materializa **independente** do envio; convocação é passo separado/opcional.
- [ ] Convocação: coordenador só a própria equipe (403 em equipe alheia); admin escolhe equipes.
- [ ] Equipe sem grupo → convocação pulada com aviso, demais equipes seguem; resumo retornado.
- [ ] Nenhum envio individual em massa (convocação é 1 msg por grupo, não por membro).
- [ ] Intenções sem regressão; **CI verde**.

## Testes sugeridos

- E2E: cadastro com `sendInvite=true` chama a entrega 1×; com `false` não chama; falha de
  entrega não quebra o cadastro.
- E2E autorização: coordenador convoca própria equipe (ok) × alheia (403); admin múltiplas.
- E2E C5: equipe sem `whatsappGroupId` é pulada; resultado lista pulados.

## Relatório de Sessão (colar no PR)

```
S6.5 — Convites e Convocação
- Team.whatsappGroupId (migração aditiva) + campo na tela de equipe (S4) ✔
- Convite individual no vínculo: sendInvite default true (checkbox marcado); degradação graciosa ✔
- Convocação na abertura do mês: 1 msg por grupo; coordenador=própria equipe, admin=escolhe (C4) ✔
- Materialização independente do envio; equipe sem grupo pulada com aviso (C5) ✔
- Sem envio individual em massa (R1 respeitado) ✔
- Intenções sem regressão ✔ | CI: verde ✔
- Observações / desvios: <...>
```
