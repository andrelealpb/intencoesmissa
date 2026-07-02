# S5 — Autenticação de Membro (link mágico / OTP)

> Documento de sessão de execução. Ler junto com `ESCALA_00_ORQUESTRACAO.md`
> (decisões D1, D2, D10 e Seção 1.1) e o `CLAUDE.md` do repo.
> **Prereqs:** S1 (`✅`) e S3 (`✅` — precisa do modelo `Member` e do `EscalaAccessService`).
> Pode correr em paralelo com S4.

## Objetivo

Criar o **segundo realm de autenticação** do sistema: o voluntário (`Member`) faz
login **sem senha**, por OTP (WhatsApp) ou link mágico (e-mail), em Postgres puro
(sem Supabase — D10). Emitir um **JWT de membro** isolado do JWT de admin, com um
**guard próprio**, e **fechar o `TODO(S5)`** do `EscalaAccessService`: ativar a
autorização de coordenador sobre a própria equipe (D2).

> **Não há auto-cadastro.** S5 só autentica `Member` **já criado e ativo** pelo admin
> na S3. Identificador desconhecido ⇒ resposta genérica, nada é enviado (anti-enumeração).

## Escopo

**Inclui (backend/API apenas):**
- Fluxo `request → verify` de OTP e link mágico, usando o modelo `MemberAuthToken` (S1).
- Entrega por WhatsApp (Z-API por paróquia) e e-mail (Brevo), com degradação graciosa.
- Realm de membro: `MemberJwtStrategy` + `MemberJwtGuard` (secret/audience separados do admin).
- `EscalaAuthGuard` composto (aceita admin **ou** membro) e ativação do ramo de
  coordenador no `EscalaAccessService`, com refactor dos endpoints de cadastro da S3.
- Schemas Zod + variáveis de ambiente novas.

**NÃO inclui:** qualquer UI de membro (tela de login, callback do link) — isso é **S6**.
Portal, ocorrências, disponibilidade — **S6**. Lembretes — **S9**.

## Onde vive (realidade pós-S3)

O módulo Escala está em `apps/api/src/escala/` (`EscalaModule`), **não** em `admin/escala/`.
O código de auth entra em `apps/api/src/escala/auth/`. Os endpoints de cadastro da S3
(no `CadastroController`) serão **refatorados** para usar o `EscalaAuthGuard` +
`EscalaAccessService` no lugar do guard admin-only.

---

## Fluxo e segurança (o coração da sessão)

### Endpoints (públicos, escopados por paróquia via slug)

| Método | Rota | Corpo | Resposta |
|--------|------|-------|----------|
| POST | `/escala/auth/request` | `{ parishSlug, identifier, channel? }` | **Sempre 200 genérico** (ver anti-enumeração). |
| POST | `/escala/auth/verify` | `{ parishSlug, identifier, code }` | 200 `{ token }` (JWT de membro) ou 401 genérico. |
| GET | `/escala/auth/magic?token=…` | — | 200 `{ token }` (JWT) ou 401 genérico. |

- `identifier` = telefone (canal primário) **ou** e-mail. Resolve para `Member` ativo
  daquela paróquia.
- `channel` opcional: `whatsapp` (default, entrega OTP) ou `email` (entrega link mágico).
  Se ausente, escolher pelo que o membro tem: telefone→OTP/WhatsApp; senão e-mail→link.

### Geração de token (`MemberAuthToken`)
- **OTP:** código de **6 dígitos**. TTL curto (`OTP_TTL_MIN`, default **10 min**).
- **Link mágico:** token opaco de **32 bytes aleatórios** (base64url). TTL `MAGIC_LINK_TTL_MIN` (default **20 min**).
- Armazenar **apenas `sha256(raw)`** em `tokenHash` (nunca o valor bruto — já previsto no modelo).
- Vincular sempre a `parishId` + `memberId` + `type`.
- **Ao emitir um novo token, invalidar os anteriores não usados** do mesmo `(memberId, type)`
  (marca `usedAt`/expira) — só o último vale.

### Validação
- **Link mágico:** hashear o token recebido, buscar por `tokenHash` (não vaza existência),
  checar não-expirado e `usedAt == null`. Ao validar, marcar `usedAt` (uso único) e emitir JWT.
- **OTP:** buscar o token vigente por `(memberId, type=OTP)`; comparar hashes em **tempo
  constante**. Como 6 dígitos têm baixa entropia, a segurança vem do **limite de
  tentativas + rate limit**, não da força do hash:
  - Máximo **5 tentativas** por token; ao estourar, invalidar o token (obriga novo request).
  - Registrar tentativas (campo de contador; se precisar, adicionar coluna via migração aditiva).

### Anti-enumeração (obrigatório)
- `POST /request` **sempre** responde 200 com mensagem genérica ("Se você está cadastrado,
  enviamos um código/link"). Só envia de fato se o `Member` existe e está ativo.
- `verify`/`magic` com falha respondem **401 genérico** ("código inválido ou expirado"),
  sem distinguir "não existe" de "expirou".

### Anti-abuso (rate limiting — reusar `ThrottlerModule`)
- `POST /request`: limite por **identifier** e por **IP** (ex.: 3/min, 10/hora).
- `POST /verify`: limite por **IP** (ex.: 10/min), além do teto de 5 tentativas por token.

---

## JWT de membro (realm isolado)

- **Secret separado** `MEMBER_JWT_SECRET` (nunca o mesmo do admin) — realms
  criptograficamente distintos, para o `JwtStrategy` do admin **nunca** aceitar token de
  membro e vice-versa. Registrar segunda estratégia Passport nomeada `member-jwt`.
- **Claims:** `sub = memberId`, `parishId`, `realm: 'member'`. (Opcional p/ conveniência
  de UI: `coordinatorTeamIds` — **não** é a fonte de autorização; ver abaixo.)
- **Expiração:** `MEMBER_JWT_TTL` (default **30 dias** — sessão de baixo privilégio, re-login
  sem senha é chato; sem refresh token no MVP).
- **`MemberJwtGuard`:** valida o token, **recarrega o `Member` do banco** e exige `isActive`
  (revogação imediata), anexa `req.member`.

> **Guardrail:** não tocar no `JwtAuthGuard`/`JwtStrategy`/`RolesGuard` do admin. O login
> de admin das Intenções fica intacto (D1). O realm de membro é 100% aditivo.

---

## Autorização de coordenador — fechar o `TODO(S5)` (D2)

### `EscalaAccessService` (atualizar)
`assertCanManageTeam(actor, teamId)` passa a aceitar **dois tipos de ator**:
- **Admin** (`User` `PARISH_ADMIN` dono da paróquia) → autorizado em tudo.
- **Membro** cujo vínculo satisfaz, **verificado no banco no momento do request**:
  `TeamMembership { memberId, teamId, isCoordinator: true, isActive: true }`.
  → autorizado **apenas** para aquela equipe.

> A checagem é **no banco**, não no JWT — se o pároco revogar `isCoordinator`, o efeito é
> imediato. `coordinatorTeamIds` no JWT serve só à UI (S6), nunca à decisão de acesso.

### `EscalaAuthGuard` (novo, composto)
Autentica **admin OU membro**, normaliza para um `actor`
(`{ kind: 'admin'|'member', userId?|memberId?, parishId }`) em `req.actor`. Os controllers
chamam `escalaAccess.assertCanManageTeam(actor, teamId)` / `assertCanManageParish(actor)`.

### Matriz de permissão (refatorar os endpoints da S3)
Coordenador age **só na própria equipe**; operações de **nível paróquia** seguem admin-only.

| Operação | Admin | Coordenador (da equipe) |
|---|:---:|:---:|
| Criar/editar/excluir **Team** | ✔ | ✘ (nível paróquia) |
| Definir quem é **coordenador** (`isCoordinator`) | ✔ | ✘ |
| Criar/editar **Member** (registro na paróquia) | ✔ | ✘ (parish) |
| `TeamFunction` da **sua** equipe | ✔ | ✔ |
| `TeamMembership` (inscrever membro existente) na **sua** equipe | ✔ | ✔ |
| `MembershipFunction` (qualificações) na **sua** equipe | ✔ | ✔ |
| `StaffingRequirement` da **sua** equipe | ✔ | ✔ |
| `maxAssignmentsPerMonth` / `priority` de vínculo da **sua** equipe | ✔ | ✔ |

> Operações de nível paróquia (criar Team, criar Member, nomear coordenador) **permanecem
> admin-only**. Um coordenador não cria equipes nem cria pessoas — só gere a própria equipe.

---

## Entrega das mensagens (`MemberAuthDeliveryService`)

Reusar os serviços existentes (WhatsApp Z-API por paróquia; Brevo p/ e-mail). Degradação
graciosa no padrão do sistema (loga e segue; nunca vaza no response):
- **OTP → WhatsApp:** se a paróquia não tem Z-API configurada **e** o membro tem e-mail →
  cair para link por e-mail. Se nada é entregável, `request` ainda responde 200 genérico
  e loga a falha.
- **Link mágico:** montar URL `MEMBER_PORTAL_URL/p/{slug}/escala/entrar?token=…`.

> **Nota sobre R1:** este envio é **transacional e iniciado pelo usuário** (um OTP/link por
> request), volume baixo — distinto do disparo **em massa** de lembretes da S9. Não confundir
> os dois; R1 continua pendente **só** para S9.

---

## Configuração (variáveis de ambiente novas)

Adicionar ao schema de validação de env: `MEMBER_JWT_SECRET` (obrigatória),
`MEMBER_JWT_TTL` (default `30d`), `OTP_TTL_MIN` (default `10`), `MAGIC_LINK_TTL_MIN`
(default `20`), `MEMBER_PORTAL_URL`. Documentar no `.env.example`.

## Critérios de aceite

- [ ] `request` responde **200 genérico** para identificador conhecido **e** desconhecido
  (nada é enviado no segundo caso).
- [ ] OTP: válido → JWT; expirado, usado, ou >5 tentativas → 401 genérico + token invalidado.
- [ ] Link mágico: token de 32 bytes, uso único, TTL respeitado; hash em repouso (nunca o bruto).
- [ ] Novo `request` invalida tokens anteriores não usados do mesmo tipo.
- [ ] **Isolamento de realm:** JWT de membro é **rejeitado** por endpoint de admin, e JWT de
  admin **não** passa no `MemberJwtGuard`. (Teste explícito.)
- [ ] `MemberJwtGuard` recarrega o `Member` e nega se `isActive=false`.
- [ ] **Coordenador** gere a **própria** equipe (functions/memberships/qualificações/staffing)
  e recebe **403** em equipe alheia; **admin** gere todas.
- [ ] Operações de nível paróquia seguem **admin-only** (coordenador recebe 403).
- [ ] Revogar `isCoordinator` no banco tira o acesso **imediatamente** (autorização lê do banco).
- [ ] Rate limiting em `request` e `verify` ativo.
- [ ] Login de **admin** das Intenções intacto (D1); Intenções sem regressão; **CI verde**.

## Testes sugeridos

- Unit: geração/validação de token (expiry, uso único, invalidação em novo request,
  teto de tentativas do OTP, compare em tempo constante).
- E2E auth: request→verify (OTP) e request→magic (link) → JWT válido; anti-enumeração;
  rate limit; realm cruzado rejeitado.
- E2E authz: coordenador na própria equipe (200) × equipe alheia (403); admin (200);
  operação de paróquia por coordenador (403); revogação de coordenador tira acesso.

## Relatório de Sessão (colar no PR)

```
S5 — Autenticação de Membro
- Fluxo request→verify: OTP (WhatsApp) + link mágico (e-mail) ✔
- Token hasheado, uso único, TTL, invalidação em novo request, teto de 5 tentativas (OTP) ✔
- Anti-enumeração (200 genérico) + rate limit em request/verify ✔
- Realm isolado: MEMBER_JWT_SECRET separado, MemberJwtStrategy/Guard; cross-realm rejeitado ✔
- EscalaAccessService: ramo de coordenador ATIVADO (autorização lida do banco) — TODO(S5) fechado ✔
- EscalaAuthGuard composto + refactor dos endpoints de cadastro da S3 (matriz de permissão) ✔
- Env novas: MEMBER_JWT_SECRET, TTLs, MEMBER_PORTAL_URL (.env.example) ✔
- Admin/Intenções intactos (D1) ✔ | CI: verde ✔
- Observações / desvios: <...>
```
