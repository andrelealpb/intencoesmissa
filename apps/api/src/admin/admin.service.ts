import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "./storage.service";
import { EmailService } from "./email.service";
import type {
  ParishProfileInput,
  ParishSettingsInput,
  MassScheduleInput,
  MassExceptionInput,
  IntentionTypeInput,
  EmolumentInput,
} from "@missas/shared";

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private email: EmailService,
  ) {}

  // ── Parish Profile ─────────────────────────────────────

  async getParishProfile(parishId: string) {
    const parish = await this.prisma.parish.findUnique({
      where: { id: parishId },
    });
    if (!parish) throw new NotFoundException("Paroquia nao encontrada");
    return parish;
  }

  async updateParishProfile(parishId: string, data: ParishProfileInput) {
    return this.prisma.parish.update({
      where: { id: parishId },
      data: {
        slug: data.slug,
        cnpj: data.cnpj,
        legalName: data.legalName,
        parishName: data.parishName,
        pastorName: data.pastorName,
        dispatchEmails: data.dispatchEmails,
      },
    });
  }

  async uploadLogo(
    parishId: string,
    file: Express.Multer.File,
  ) {
    const key = `parishes/${parishId}/logo-${Date.now()}.${file.originalname.split(".").pop()}`;
    await this.storage.upload(key, file.buffer, file.mimetype);

    // Delete old logo if exists
    const parish = await this.prisma.parish.findUnique({
      where: { id: parishId },
      select: { logoStorageKey: true },
    });
    if (parish?.logoStorageKey) {
      await this.storage.delete(parish.logoStorageKey).catch(() => {});
    }

    const logoUrl = await this.storage.getSignedUrl(key);

    return this.prisma.parish.update({
      where: { id: parishId },
      data: { logoStorageKey: key, logoUrl },
    });
  }

  async deleteLogo(parishId: string) {
    const parish = await this.prisma.parish.findUnique({
      where: { id: parishId },
      select: { logoStorageKey: true },
    });
    if (parish?.logoStorageKey) {
      await this.storage.delete(parish.logoStorageKey).catch(() => {});
    }
    return this.prisma.parish.update({
      where: { id: parishId },
      data: { logoStorageKey: null, logoUrl: null },
    });
  }

  // ── Parish Settings ────────────────────────────────────

  async getSettings(parishId: string) {
    let settings = await this.prisma.parishSettings.findUnique({
      where: { parishId },
    });
    if (!settings) {
      settings = await this.prisma.parishSettings.create({
        data: { parishId },
      });
    }
    return settings;
  }

  async updateSettings(parishId: string, data: ParishSettingsInput) {
    return this.prisma.parishSettings.upsert({
      where: { parishId },
      update: data,
      create: { parishId, ...data },
    });
  }

  // ── Mass Schedules ─────────────────────────────────────

  async listSchedules(parishId: string) {
    return this.prisma.massSchedule.findMany({
      where: { parishId },
      orderBy: [{ weekday: "asc" }, { time: "asc" }],
    });
  }

  async createSchedule(parishId: string, data: MassScheduleInput) {
    return this.prisma.massSchedule.create({
      data: { parishId, ...data },
    });
  }

  async updateSchedule(
    parishId: string,
    id: string,
    data: MassScheduleInput,
  ) {
    await this.ensureOwnership("massSchedule", id, parishId);
    return this.prisma.massSchedule.update({
      where: { id },
      data,
    });
  }

  async deleteSchedule(parishId: string, id: string) {
    await this.ensureOwnership("massSchedule", id, parishId);
    return this.prisma.massSchedule.delete({ where: { id } });
  }

  // ── Mass Exceptions ────────────────────────────────────

  async listExceptions(parishId: string) {
    return this.prisma.massException.findMany({
      where: { parishId },
      orderBy: [{ date: "asc" }, { time: "asc" }],
    });
  }

  async createException(parishId: string, data: MassExceptionInput) {
    return this.prisma.massException.create({
      data: {
        parishId,
        date: new Date(data.date + "T00:00:00Z"),
        time: data.time,
        title: data.title,
        isActive: data.isActive,
      },
    });
  }

  async updateException(
    parishId: string,
    id: string,
    data: MassExceptionInput,
  ) {
    await this.ensureOwnership("massException", id, parishId);
    return this.prisma.massException.update({
      where: { id },
      data: {
        date: new Date(data.date + "T00:00:00Z"),
        time: data.time,
        title: data.title,
        isActive: data.isActive,
      },
    });
  }

  async deleteException(parishId: string, id: string) {
    await this.ensureOwnership("massException", id, parishId);
    return this.prisma.massException.delete({ where: { id } });
  }

  // ── Intention Types ────────────────────────────────────

  async listIntentionTypes(parishId: string) {
    return this.prisma.intentionType.findMany({
      where: { parishId },
      orderBy: [{ group: "asc" }, { name: "asc" }],
    });
  }

  async createIntentionType(parishId: string, data: IntentionTypeInput) {
    return this.prisma.intentionType.create({
      data: { parishId, ...data },
    });
  }

  async updateIntentionType(
    parishId: string,
    id: string,
    data: IntentionTypeInput,
  ) {
    await this.ensureOwnership("intentionType", id, parishId);
    return this.prisma.intentionType.update({
      where: { id },
      data,
    });
  }

  async deleteIntentionType(parishId: string, id: string) {
    await this.ensureOwnership("intentionType", id, parishId);
    return this.prisma.intentionType.delete({ where: { id } });
  }

  // ── Emoluments ─────────────────────────────────────────

  async listEmoluments(parishId: string) {
    return this.prisma.emolument.findMany({
      where: { parishId },
      include: { intentionType: { select: { name: true, group: true } } },
      orderBy: { scope: "asc" },
    });
  }

  async createEmolument(parishId: string, data: EmolumentInput) {
    return this.prisma.emolument.create({
      data: {
        parishId,
        scope: data.scope,
        group: data.group,
        intentionTypeId: data.intentionTypeId,
        suggestedValue: data.suggestedValue,
        isActive: data.isActive,
      },
    });
  }

  async updateEmolument(parishId: string, id: string, data: EmolumentInput) {
    await this.ensureOwnership("emolument", id, parishId);
    return this.prisma.emolument.update({
      where: { id },
      data: {
        scope: data.scope,
        group: data.group,
        intentionTypeId: data.intentionTypeId,
        suggestedValue: data.suggestedValue,
        isActive: data.isActive,
      },
    });
  }

  async deleteEmolument(parishId: string, id: string) {
    await this.ensureOwnership("emolument", id, parishId);
    return this.prisma.emolument.delete({ where: { id } });
  }

  // ── Requests ───────────────────────────────────────────

  async listRequests(parishId: string) {
    return this.prisma.request.findMany({
      where: { parishId },
      include: {
        intentions: {
          include: {
            intentionType: { select: { name: true, group: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // ── Dispatches ─────────────────────────────────────────

  async listDispatches(parishId: string) {
    return this.prisma.dispatchBatch.findMany({
      where: { parishId },
      include: {
        _count: { select: { intentions: true } },
      },
      orderBy: { sentAt: "desc" },
    });
  }

  async downloadDispatch(parishId: string, id: string) {
    const batch = await this.prisma.dispatchBatch.findUnique({
      where: { id },
    });
    if (!batch || batch.parishId !== parishId) {
      throw new NotFoundException("Despacho nao encontrado");
    }
    const url = await this.storage.getSignedUrl(batch.pdfStorageKey);
    return { url };
  }

  async runDispatchNow(parishId: string) {
    // This is a manual trigger; in a full system, the worker would handle
    // the heavy lifting. Here we just mark that a manual dispatch was requested.
    // The worker service polls for pending dispatches.
    // For now, return a placeholder response.
    return {
      message:
        "Despacho manual solicitado. O processamento sera feito em breve.",
      parishId,
    };
  }

  // ── Dashboard ──────────────────────────────────────────

  async getDashboard(parishId: string, from?: string, to?: string) {
    const dateFrom = from
      ? new Date(from + "T00:00:00Z")
      : new Date(new Date().getFullYear(), 0, 1);
    const dateTo = to
      ? new Date(to + "T23:59:59Z")
      : new Date();

    // Total requests in period
    const totalRequests = await this.prisma.request.count({
      where: {
        parishId,
        createdAt: { gte: dateFrom, lte: dateTo },
      },
    });

    // Total intentions in period
    const totalIntentions = await this.prisma.requestIntention.count({
      where: {
        request: {
          parishId,
          createdAt: { gte: dateFrom, lte: dateTo },
        },
      },
    });

    // Intentions by group
    const intentionsByGroup = await this.prisma.requestIntention.groupBy({
      by: ["group"],
      where: {
        request: {
          parishId,
          createdAt: { gte: dateFrom, lte: dateTo },
        },
      },
      _count: { id: true },
    });

    // Intentions by mass (date+time)
    const intentionsByMass = await this.prisma.request.findMany({
      where: {
        parishId,
        createdAt: { gte: dateFrom, lte: dateTo },
      },
      select: {
        massDate: true,
        massTime: true,
        _count: { select: { intentions: true } },
      },
      orderBy: [{ massDate: "asc" }, { massTime: "asc" }],
    });

    // Top intention types
    const topTypes = await this.prisma.requestIntention.groupBy({
      by: ["intentionTypeId"],
      where: {
        request: {
          parishId,
          createdAt: { gte: dateFrom, lte: dateTo },
        },
      },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    });

    // Resolve type names
    const typeIds = topTypes.map((t) => t.intentionTypeId);
    const types = await this.prisma.intentionType.findMany({
      where: { id: { in: typeIds } },
      select: { id: true, name: true, group: true },
    });
    const typeMap = new Map(types.map((t) => [t.id, t]));

    const topTypesResolved = topTypes.map((t) => ({
      intentionTypeId: t.intentionTypeId,
      name: typeMap.get(t.intentionTypeId)?.name ?? "Desconhecido",
      group: typeMap.get(t.intentionTypeId)?.group ?? null,
      count: t._count.id,
    }));

    // Average intentions per request
    const avgIntentionsPerRequest =
      totalRequests > 0 ? totalIntentions / totalRequests : 0;

    // Most demanded schedules
    const mostDemandedSchedules = await this.prisma.request.groupBy({
      by: ["massTime"],
      where: {
        parishId,
        createdAt: { gte: dateFrom, lte: dateTo },
      },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 5,
    });

    return {
      totalRequests,
      totalIntentions,
      avgIntentionsPerRequest: Math.round(avgIntentionsPerRequest * 100) / 100,
      intentionsByGroup: intentionsByGroup.map((g) => ({
        group: g.group,
        count: g._count.id,
      })),
      intentionsByMass: intentionsByMass.map((m) => ({
        massDate: m.massDate,
        massTime: m.massTime,
        intentionCount: m._count.intentions,
      })),
      topTypes: topTypesResolved,
      mostDemandedSchedules: mostDemandedSchedules.map((s) => ({
        massTime: s.massTime,
        count: s._count.id,
      })),
    };
  }

  // ── Helpers ────────────────────────────────────────────

  private async ensureOwnership(
    model: "massSchedule" | "massException" | "intentionType" | "emolument",
    id: string,
    parishId: string,
  ) {
    let record: { parishId: string } | null = null;

    switch (model) {
      case "massSchedule":
        record = await this.prisma.massSchedule.findUnique({
          where: { id },
          select: { parishId: true },
        });
        break;
      case "massException":
        record = await this.prisma.massException.findUnique({
          where: { id },
          select: { parishId: true },
        });
        break;
      case "intentionType":
        record = await this.prisma.intentionType.findUnique({
          where: { id },
          select: { parishId: true },
        });
        break;
      case "emolument":
        record = await this.prisma.emolument.findUnique({
          where: { id },
          select: { parishId: true },
        });
        break;
    }

    if (!record) {
      throw new NotFoundException("Registro nao encontrado");
    }

    if (record.parishId !== parishId) {
      throw new ForbiddenException("Acesso negado");
    }
  }
}
