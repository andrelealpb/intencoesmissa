# ESCALA — SETUP (Passo Zero)

> Bootstrap do módulo Escala no repositório. **Não escreve código de produção.**
> Roda **uma vez**, antes de qualquer sessão numerada (S1…S10). Prereqs: nenhum.

## Objetivo

Deixar o repositório preparado para que cada sessão de execução chegue "informada":
com os documentos versionados e o `CLAUDE.md` carregando o contexto persistente e as
decisões travadas. Sem isso, uma sessão de execução pode reabrir decisão fechada.

## Passos

### 1. Versionar os documentos
Criar a pasta `docs/escala/` e commitar os arquivos do módulo:

```
docs/escala/
├── ESCALA_00_ORQUESTRACAO.md          # sessão mestra / fonte de verdade
├── ESCALA_SETUP.md                    # este arquivo
├── escala.prisma                      # fragmento de schema (referência da S1)
├── ESCALA_01_fundacao_dados.md
├── ESCALA_02_materializacao_ocorrencias.md
└── ESCALA_03_cadastro_backend.md
```

(Os docs das sessões seguintes entram aqui à medida que forem escritos.)

### 2. Carregar o contexto no `CLAUDE.md`
Abrir o `CLAUDE.md` da raiz do repo (criar se não existir) e colar o bloco da
**Seção 4 do `ESCALA_00_ORQUESTRACAO.md`** ("Contexto persistente"). Acrescentar,
no topo desse bloco, um ponteiro operacional:

```md
> Antes de QUALQUER sessão do módulo Escala (S1…S10), ler
> docs/escala/ESCALA_00_ORQUESTRACAO.md e o doc da sessão correspondente.
> As decisões D1–D11 do orquestrador estão TRAVADAS: não reabrir sem aprovação.
```

Commit.

### 3. Sanidade
- `pnpm install` (se necessário) e `pnpm typecheck` seguem verdes — docs não afetam build.
- CI verde no PR de setup (só arquivos `.md` + `CLAUDE.md`).

## Definition of Done

- [ ] `docs/escala/` versionado com os arquivos existentes do módulo.
- [ ] `CLAUDE.md` da raiz contém o bloco de contexto + ponteiro para o orquestrador.
- [ ] PR de setup **não** altera nenhum arquivo de código/`prisma/schema.prisma`.
- [ ] CI verde.

## Depois deste passo

Sessões desbloqueadas: **S1** (fundação de dados). As demais seguem a Seção 5/6 do
orquestrador. Após S1, **S2, S3 e S5** podem correr em paralelo.

## Relatório de Sessão (colar no PR)

```
ESCALA — SETUP
- docs/escala/ versionado (N arquivos)
- CLAUDE.md atualizado com contexto + ponteiro ✔
- Sem alteração de código ✔ | CI: verde ✔
```
