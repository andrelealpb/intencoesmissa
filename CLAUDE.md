> Antes de QUALQUER sessão do módulo Escala (S1…S10), ler
> docs/escala/ESCALA_00_ORQUESTRACAO.md e o doc da sessão correspondente.
> As decisões D1–D11 do orquestrador estão TRAVADAS: não reabrir sem aprovação.

## Módulo Escala (escala de serviço litúrgico)
- Bounded context separado dentro do mesmo sistema de Intenções. Não tocar no
  caminho de despacho das Intenções (worker/dispatch seguem intocados — D9).
- Duas classes de usuário: User (admin, senha) e Member (voluntário, link
  mágico/OTP — realm separado, D1). Coordenador = TeamMembership.isCoordinator
  (não é role nova — D2).
- Disponibilidade é nível Member, uma resposta por MassOccurrence (D3).
- Assignment: unique(occurrenceId, memberId) sempre (Regime A — D4). Vaga em
  aberto = requiredCount − assignments (não é linha). publishedAt separa
  rascunho de publicado.
- StaffingRequirement resolve por escopo: OCCASION > SOLEMNITY > SCHEDULE >
  WEEKDAY > DEFAULT (D6). Solenidade é flag da ocorrência (D7).
- Teto por equipe (maxAssignmentsPerMonth no membership — D8).
- Auth de membro em Postgres puro, sem Supabase (D10). OTP via WhatsApp.
- MVP: escala manual assistida; algoritmo guloso sugere, humano sobrescreve (D11).
- Convenções: parishId em tudo; Zod em packages/shared; migrações aditivas;
  CI verde (lint/typecheck/test). Fonte de verdade do progresso:
  docs/escala/ESCALA_00_ORQUESTRACAO.md.
