import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import type { MemberAssignmentStatusInput } from "@missas/shared";
import { PrismaService } from "../prisma/prisma.service";
import { EscalaNotifyService } from "./escala-notify.service";

/**
 * Escala — Confirmação pelo PORTAL (S9/L3), realm de MEMBRO.
 *
 * O lembrete leva o membro ao portal; aqui ele **confirma** ou **recusa** cada
 * escala — nunca por resposta de WhatsApp (sem webhook inbound). Tudo escopado a
 * `member` (do JWT): só o **próprio** assignment, só o que está **publicado**.
 *
 * Recusa (L4): marca `DECLINED` (mantém a linha — histórico), o que **reabre a
 * vaga como lacuna** na tela do coordenador (S8, `buildScheduleGrid` ignora
 * DECLINED) e **notifica o coordenador** (via grupo da equipe, degradação
 * graciosa). **Não** re-escala (D11/J3) — o coordenador resolve.
 */

interface MemberContext {
  id: string;
  parishId: string;
}

@Injectable()
export class MemberAssignmentService {
  private readonly logger = new Logger(MemberAssignmentService.name);

  constructor(
    private prisma: PrismaService,
    private notify: EscalaNotifyService,
  ) {}

  /**
   * Minhas escalas **publicadas** no intervalo [from, to] (default: hoje..+60d).
   * Só o próprio membro; recusa/confirmação aparecem com o status atual.
   */
  async listMine(
    member: MemberContext,
    range: { from?: string; to?: string },
  ) {
    const from = range.from ? utcMidnight(range.from) : startOfToday();
    const to = range.to ? utcMidnight(range.to) : addDays(startOfToday(), 60);

    const rows = await this.prisma.assignment.findMany({
      where: {
        memberId: member.id,
        parishId: member.parishId,
        publishedAt: { not: null }, // só publicado (L3)
        status: { not: "CANCELLED" },
        occurrence: { date: { gte: from, lte: to } },
      },
      orderBy: [{ occurrence: { date: "asc" } }, { occurrence: { time: "asc" } }],
      select: {
        id: true,
        status: true,
        confirmedAt: true,
        declinedAt: true,
        occurrence: {
          select: { id: true, date: true, time: true, title: true, isSolemnity: true },
        },
        team: { select: { id: true, name: true } },
        function: { select: { id: true, name: true } },
      },
    });

    return rows.map((a) => ({
      id: a.id,
      status: a.status,
      confirmedAt: a.confirmedAt,
      declinedAt: a.declinedAt,
      occurrence: {
        id: a.occurrence.id,
        date: dayKey(a.occurrence.date),
        time: a.occurrence.time,
        title: a.occurrence.title,
        isSolemnity: a.occurrence.isSolemnity,
      },
      team: a.team,
      function: a.function,
    }));
  }

  /**
   * Confirma/recusa a PRÓPRIA escala publicada. Alheio → 403; inexistente ou de
   * outra paróquia → 404; ainda em rascunho → 400 (só publicado).
   */
  async setStatus(
    member: MemberContext,
    assignmentId: string,
    input: MemberAssignmentStatusInput,
  ) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      select: {
        id: true,
        parishId: true,
        memberId: true,
        publishedAt: true,
        occurrence: { select: { date: true, time: true } },
        team: { select: { id: true, name: true, whatsappGroupId: true } },
        function: { select: { name: true } },
      },
    });

    // Isolamento de paróquia primeiro (não vaza existência entre paróquias).
    if (!assignment || assignment.parishId !== member.parishId) {
      throw new NotFoundException("Atribuicao nao encontrada");
    }
    // Só o próprio membro (escala de outro → 403, conforme S9).
    if (assignment.memberId !== member.id) {
      throw new ForbiddenException("Esta escala nao e sua");
    }
    // Só o que está publicado (rascunho não é visível/confirmável).
    if (assignment.publishedAt == null) {
      throw new BadRequestException("Escala ainda nao publicada");
    }

    const now = new Date();
    if (input.status === "CONFIRMED") {
      const updated = await this.prisma.assignment.update({
        where: { id: assignmentId },
        data: { status: "CONFIRMED", confirmedAt: now, declinedAt: null },
        select: { id: true, status: true, confirmedAt: true, declinedAt: true },
      });
      this.logger.log(`assignment confirmed member=${member.id} id=${assignmentId}`);
      return updated;
    }

    // DECLINED — mantém a linha (histórico); a vaga reabre na S8 (grid ignora
    // DECLINED) e o coordenador é avisado. Sem re-escala.
    const updated = await this.prisma.assignment.update({
      where: { id: assignmentId },
      data: { status: "DECLINED", declinedAt: now, confirmedAt: null },
      select: { id: true, status: true, confirmedAt: true, declinedAt: true },
    });
    this.logger.log(`assignment declined member=${member.id} id=${assignmentId}`);

    // Notifica o coordenador (degradação graciosa — nunca quebra a recusa).
    await this.notifyDecline(member, assignment);

    return updated;
  }

  private async notifyDecline(
    member: MemberContext,
    assignment: {
      team: { name: string; whatsappGroupId: string | null };
      function: { name: string };
      occurrence: { date: Date; time: string };
    },
  ): Promise<void> {
    try {
      const [parish, self] = await Promise.all([
        this.prisma.parish.findUnique({ where: { id: member.parishId } }),
        this.prisma.member.findUnique({
          where: { id: member.id },
          select: { fullName: true },
        }),
      ]);
      if (!parish) return;
      const label = `${dayKey(assignment.occurrence.date)
        .split("-")
        .reverse()
        .slice(0, 2)
        .join("/")} ${assignment.occurrence.time}`;
      await this.notify.sendDeclineNotice(
        parish,
        assignment.team,
        self?.fullName ?? "Um voluntario",
        label,
        assignment.function.name,
      );
    } catch (err) {
      // Degradação graciosa: o aviso é acessório; a lacuna na S8 já sinaliza.
      this.logger.error(
        `Falha ao notificar recusa (member=${member.id}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

/** Chave de dia civil (YYYY-MM-DD) a partir de uma Date @db.Date (UTC-midnight). */
function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfToday(): Date {
  return utcMidnight(new Date().toISOString().slice(0, 10));
}

function utcMidnight(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}
