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
        pixKey: data.pixKey,
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

  async uploadPixQrCode(
    parishId: string,
    file: Express.Multer.File,
  ) {
    const key = `parishes/${parishId}/pix-qrcode-${Date.now()}.${file.originalname.split(".").pop()}`;
    await this.storage.upload(key, file.buffer, file.mimetype);

    const parish = await this.prisma.parish.findUnique({
      where: { id: parishId },
      select: { pixQrCodeStorageKey: true },
    });
    if (parish?.pixQrCodeStorageKey) {
      await this.storage.delete(parish.pixQrCodeStorageKey).catch(() => {});
    }

    const pixQrCodeUrl = await this.storage.getSignedUrl(key);

    return this.prisma.parish.update({
      where: { id: parishId },
      data: { pixQrCodeStorageKey: key, pixQrCodeUrl },
    });
  }

  async deletePixQrCode(parishId: string) {
    const parish = await this.prisma.parish.findUnique({
      where: { id: parishId },
      select: { pixQrCodeStorageKey: true },
    });
    if (parish?.pixQrCodeStorageKey) {
      await this.storage.delete(parish.pixQrCodeStorageKey).catch(() => {});
    }
    return this.prisma.parish.update({
      where: { id: parishId },
      data: { pixQrCodeStorageKey: null, pixQrCodeUrl: null },
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

  async getNextMass(parishId: string) {
    const now = new Date();
    const spNow = new Date(
      now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }),
    );

    // Check today and next 7 days
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const targetDate = new Date(spNow);
      targetDate.setDate(targetDate.getDate() + dayOffset);

      const dateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, "0")}-${String(targetDate.getDate()).padStart(2, "0")}`;
      const dateObj = new Date(dateStr + "T00:00:00.000Z");
      const weekday = targetDate.getDay();

      // Check exceptions for this day
      const exceptions = await this.prisma.massException.findMany({
        where: { parishId, date: dateObj, isActive: true },
        orderBy: { time: "asc" },
      });

      let massTimes: { time: string; title?: string | null }[] = [];
      if (exceptions.length > 0) {
        massTimes = exceptions.map((e) => ({ time: e.time, title: e.title }));
      } else {
        const schedules = await this.prisma.massSchedule.findMany({
          where: { parishId, weekday, isActive: true },
          orderBy: { time: "asc" },
        });
        massTimes = schedules.map((s) => ({ time: s.time, title: null }));
      }

      // Find the next mass that hasn't been dispatched yet
      for (const mass of massTimes) {
        const existingBatch = await this.prisma.dispatchBatch.findFirst({
          where: {
            parishId,
            massDate: dateObj,
            massTime: mass.time,
            status: "SENT",
          },
        });
        if (!existingBatch) {
          const pendingCount = await this.prisma.requestIntention.count({
            where: {
              dispatchedAt: null,
              request: {
                parishId,
                status: "SUBMITTED",
                massDate: dateObj,
                massTime: mass.time,
              },
            },
          });
          return {
            found: true,
            massDate: dateStr,
            massTime: mass.time,
            title: mass.title,
            pendingIntentions: pendingCount,
          };
        }
      }
    }

    return { found: false };
  }

  async runDispatchNow(parishId: string, massTime: string, massDateStr?: string) {
    let todayStr: string;
    if (massDateStr) {
      todayStr = massDateStr;
    } else {
      const now = new Date();
      const spNow = new Date(
        now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }),
      );
      todayStr = `${spNow.getFullYear()}-${String(spNow.getMonth() + 1).padStart(2, "0")}-${String(spNow.getDate()).padStart(2, "0")}`;
    }
    const todayDate = new Date(todayStr + "T00:00:00.000Z");

    const pendingIntentions = await this.prisma.requestIntention.findMany({
      where: {
        dispatchedAt: null,
        request: {
          parishId,
          status: "SUBMITTED",
          massDate: todayDate,
          massTime,
        },
      },
      include: { request: true, intentionType: true },
      orderBy: { createdAt: "asc" },
    });

    if (pendingIntentions.length === 0) {
      // Even with 0 intentions, we create a SENT batch to close the mass
      const parish = await this.prisma.parish.findUnique({ where: { id: parishId } });
      if (!parish) throw new NotFoundException("Paroquia nao encontrada");

      await this.prisma.dispatchBatch.create({
        data: {
          parishId,
          scope: "PER_MASS",
          massDate: todayDate,
          massTime,
          pdfStorageKey: "",
          sentToEmails: parish.dispatchEmails || [],
          sentAt: new Date(),
          status: "SENT",
        },
      });

      return {
        message: "Missa encerrada. Nenhuma intencao pendente.",
        dispatched: true,
        intentionCount: 0,
      };
    }

    const parish = await this.prisma.parish.findUnique({ where: { id: parishId } });
    if (!parish) throw new NotFoundException("Paroquia nao encontrada");

    if (!parish.dispatchEmails || parish.dispatchEmails.length === 0) {
      return {
        message: "Nenhum e-mail de despacho configurado na paroquia.",
        dispatched: false,
      };
    }

    // Group intentions
    const grouped: Record<string, typeof pendingIntentions> = {
      SUFRAGIO: [],
      SUPLICAS: [],
      ACAO_DE_GRACAS: [],
    };
    for (const intention of pendingIntentions) {
      if (grouped[intention.group]) {
        grouped[intention.group].push(intention);
      }
    }

    // Generate PDF
    const PDFDocument = (await import("pdfkit")).default;
    const { PassThrough } = await import("stream");

    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const passThrough = new PassThrough();
    const pdfChunks: Buffer[] = [];
    passThrough.on("data", (chunk: Buffer) => pdfChunks.push(chunk));
    doc.pipe(passThrough);

    const formattedDate = `${todayStr.split("-")[2]}/${todayStr.split("-")[1]}/${todayStr.split("-")[0]}`;
    doc.font("Helvetica-Bold").fontSize(14);
    doc.text(parish.parishName, { align: "center" });
    doc.moveDown(0.5);
    doc.font("Helvetica").fontSize(11);
    doc.text(`Data: ${formattedDate}  Horario: ${massTime}`, { align: "center" });
    doc.moveDown(0.3);
    doc.font("Helvetica-Bold").fontSize(12);
    doc.text("Intencoes da Santa Missa", { align: "center" });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(1).stroke();
    doc.moveDown(0.5);

    const GROUP_LABELS: Record<string, string> = {
      SUFRAGIO: "Sufragio",
      SUPLICAS: "Suplicas",
      ACAO_DE_GRACAS: "Acao de Gracas",
    };

    for (const group of ["SUFRAGIO", "SUPLICAS", "ACAO_DE_GRACAS"]) {
      const items = grouped[group];
      if (items.length === 0) continue;
      doc.font("Helvetica-Bold").fontSize(11);
      doc.text(`${GROUP_LABELS[group]} (${items.length})`);
      doc.moveDown(0.3);
      doc.font("Helvetica").fontSize(10);
      for (const item of items) {
        const parts = [item.intentionType.name];
        if (item.deceasedName) parts.push(item.deceasedName);
        if (item.familyNames) parts.push(item.familyNames);
        if (item.complement) parts.push(item.complement);
        doc.text(`  • ${parts.join(" - ")}`, { width: 475 });
      }
      doc.moveDown(0.5);
    }

    doc.end();
    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      passThrough.on("end", () => resolve(Buffer.concat(pdfChunks)));
      passThrough.on("error", reject);
    });

    // Upload and send
    const storageKey = `dispatches/${parishId}/${todayStr.replace(/-/g, "")}/${massTime.replace(":", "")}.pdf`;
    await this.storage.upload(storageKey, pdfBuffer, "application/pdf");

    const pdfFilename = `intencoes_${todayStr.replace(/-/g, "")}_${massTime.replace(":", "")}.pdf`;
    const subject = `Intencoes da Missa - ${parish.parishName} - ${formattedDate} ${massTime}`;
    await this.email.sendDispatchEmail(parish.dispatchEmails, subject, pdfBuffer, pdfFilename);

    const batch = await this.prisma.dispatchBatch.create({
      data: {
        parishId,
        scope: "PER_MASS",
        massDate: todayDate,
        massTime,
        pdfStorageKey: storageKey,
        sentToEmails: parish.dispatchEmails,
        sentAt: new Date(),
        status: "SENT",
      },
    });

    const intentionIds = pendingIntentions.map((i) => i.id);
    await this.prisma.requestIntention.updateMany({
      where: { id: { in: intentionIds } },
      data: { dispatchedAt: new Date(), dispatchBatchId: batch.id },
    });

    return {
      message: `Despacho realizado! ${pendingIntentions.length} intencao(oes) enviada(s).`,
      dispatched: true,
      intentionCount: pendingIntentions.length,
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
