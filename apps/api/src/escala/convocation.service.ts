import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { ConvocationInput } from "@missas/shared";
import { PrismaService } from "../prisma/prisma.service";
import { EscalaAccessService, type EscalaActor } from "./escala-access.service";
import { EscalaNotifyService } from "./escala-notify.service";

const MONTH_NAMES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

export type ConvocationStatus = "sent" | "skipped" | "failed";

export interface ConvocationResult {
  teamId: string;
  teamName: string;
  status: ConvocationStatus;
  reason?: string;
}

export interface ConvocationSummary {
  month: string;
  monthLabel: string;
  results: ConvocationResult[];
  sent: number;
  skipped: number;
  failed: number;
}

/**
 * Convocação de disponibilidade na abertura do mês (S6.5 — Parte 2).
 *
 * **Passo separado da materialização** (S2): abrir o mês nunca depende deste
 * envio. Aqui dispara-se **1 mensagem por grupo de equipe** (C2 — nunca 1 por
 * pessoa; saída desenhada para o R1), reusando a entrega Z-API da S5.
 *
 * Autorização (C4): reusa `EscalaAccessService.assertCanManageTeam` — coordenador
 * só dispara para a **própria** equipe (403 em equipe alheia), pároco/admin para
 * as equipes que escolher. As equipes são autorizadas **antes** de qualquer
 * envio: uma equipe não permitida aborta a operação inteira (403/404).
 *
 * C5: equipe sem `whatsappGroupId` é **pulada** com aviso claro (não é erro); as
 * demais seguem. O resumo lista o que foi enviado, pulado e por quê.
 */
@Injectable()
export class ConvocationService {
  private readonly logger = new Logger(ConvocationService.name);

  constructor(
    private prisma: PrismaService,
    private access: EscalaAccessService,
    private notify: EscalaNotifyService,
  ) {}

  async convoke(
    actor: EscalaActor,
    input: ConvocationInput,
  ): Promise<ConvocationSummary> {
    const parishId = actor.parishId;
    const uniqueTeamIds = [...new Set(input.teamIds)];

    // 1. Autoriza TODAS as equipes antes de enviar nada. `assertCanManageTeam`
    //    lança 404 (equipe de outra paróquia) ou 403 (coordenador em equipe
    //    alheia) — falha rápido, sem convocação parcial.
    const teams: {
      id: string;
      name: string;
      whatsappGroupId: string | null;
    }[] = [];
    for (const teamId of uniqueTeamIds) {
      await this.access.assertCanManageTeam(actor, teamId);
      const team = await this.prisma.team.findUnique({
        where: { id: teamId },
        select: { id: true, name: true, whatsappGroupId: true },
      });
      if (!team) throw new NotFoundException("Equipe nao encontrada");
      teams.push(team);
    }

    const parish = await this.prisma.parish.findUnique({
      where: { id: parishId },
    });
    if (!parish) throw new NotFoundException("Paroquia nao encontrada");

    const monthLabel = this.formatMonth(input.month);
    const zapiReady = this.notify.zapiReady(parish);
    const results: ConvocationResult[] = [];

    // 2. Um envio por equipe. Equipe sem grupo (ou paróquia sem Z-API) é pulada
    //    com aviso; falha de envio é registrada sem derrubar as outras (C5).
    for (const team of teams) {
      if (!team.whatsappGroupId) {
        results.push({
          teamId: team.id,
          teamName: team.name,
          status: "skipped",
          reason: "Grupo de WhatsApp nao configurado para esta equipe",
        });
        continue;
      }
      if (!zapiReady) {
        results.push({
          teamId: team.id,
          teamName: team.name,
          status: "skipped",
          reason: "Z-API nao configurada nesta paroquia",
        });
        continue;
      }
      try {
        await this.notify.sendGroupConvocation(
          parish,
          team.whatsappGroupId,
          monthLabel,
          input.deadline,
        );
        results.push({
          teamId: team.id,
          teamName: team.name,
          status: "sent",
        });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Convocacao falhou para equipe=${team.id} (grupo): ${reason}`,
        );
        results.push({
          teamId: team.id,
          teamName: team.name,
          status: "failed",
          reason: "Falha no envio ao grupo",
        });
      }
    }

    const summary: ConvocationSummary = {
      month: input.month,
      monthLabel,
      results,
      sent: results.filter((r) => r.status === "sent").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      failed: results.filter((r) => r.status === "failed").length,
    };
    this.logger.log(
      `convoke parish=${parishId} month=${input.month} sent=${summary.sent} skipped=${summary.skipped} failed=${summary.failed}`,
    );
    return summary;
  }

  /** "2026-07" → "julho de 2026". */
  private formatMonth(month: string): string {
    const [year, m] = month.split("-");
    const name = MONTH_NAMES[Number(m) - 1] ?? month;
    return `${name} de ${year}`;
  }
}
