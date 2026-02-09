import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { generateProtocol, CreateRequestInput } from "@missas/shared";

@Injectable()
export class PublicService {
  constructor(private prisma: PrismaService) {}

  async getParishBySlug(slug: string) {
    const parish = await this.prisma.parish.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        parishName: true,
        pastorName: true,
        addressJson: true,
        phonesJson: true,
        logoUrl: true,
        pixKey: true,
        pixQrCodeUrl: true,
      },
    });

    if (!parish) {
      throw new NotFoundException("Paroquia nao encontrada");
    }

    return parish;
  }

  async getMassOptions(slug: string, date: string) {
    const parish = await this.findParishOrFail(slug);
    const parsedDate = new Date(date + "T00:00:00Z");
    const weekday = parsedDate.getUTCDay();

    // Find already-dispatched mass times for this date
    const dispatchedBatches = await this.prisma.dispatchBatch.findMany({
      where: {
        parishId: parish.id,
        massDate: parsedDate,
        status: "SENT",
        massTime: { not: null },
      },
      select: { massTime: true },
    });
    const closedTimes = new Set(dispatchedBatches.map((b) => b.massTime));

    // Check exceptions first for this date
    const exceptions = await this.prisma.massException.findMany({
      where: {
        parishId: parish.id,
        date: parsedDate,
        isActive: true,
      },
      select: { time: true, title: true },
      orderBy: { time: "asc" },
    });

    if (exceptions.length > 0) {
      return exceptions.map((e) => ({
        time: e.time,
        title: e.title,
        isException: true,
        closed: closedTimes.has(e.time),
      }));
    }

    // Fall back to regular schedule for this weekday
    const schedules = await this.prisma.massSchedule.findMany({
      where: {
        parishId: parish.id,
        weekday,
        isActive: true,
      },
      select: { time: true },
      orderBy: { time: "asc" },
    });

    return schedules.map((s) => ({
      time: s.time,
      title: null,
      isException: false,
      closed: closedTimes.has(s.time),
    }));
  }

  async getIntentionTypes(slug: string, group?: string) {
    const parish = await this.findParishOrFail(slug);

    const where: Record<string, unknown> = {
      parishId: parish.id,
      isActive: true,
    };

    if (group) {
      where.group = group;
    }

    return this.prisma.intentionType.findMany({
      where,
      orderBy: { name: "asc" },
    });
  }

  async getLimits(slug: string) {
    const parish = await this.findParishOrFail(slug);

    const settings = await this.prisma.parishSettings.findUnique({
      where: { parishId: parish.id },
    });

    const emoluments = await this.prisma.emolument.findMany({
      where: { parishId: parish.id, isActive: true },
      include: { intentionType: { select: { name: true, group: true } } },
    });

    return {
      maxIntentionsPerRequest: settings?.maxIntentionsPerRequest ?? 5,
      emoluments,
    };
  }

  async createRequest(slug: string, input: CreateRequestInput) {
    const parish = await this.findParishOrFail(slug);

    // Validate intention count
    const settings = await this.prisma.parishSettings.findUnique({
      where: { parishId: parish.id },
    });
    const maxIntentions = settings?.maxIntentionsPerRequest ?? 5;

    if (input.intentions.length > maxIntentions) {
      throw new BadRequestException(
        `Maximo de ${maxIntentions} intencoes por pedido`,
      );
    }

    // Validate mass date/time
    const parsedDate = new Date(input.massDate + "T00:00:00Z");
    const weekday = parsedDate.getUTCDay();

    // Check exceptions first
    const exception = await this.prisma.massException.findFirst({
      where: {
        parishId: parish.id,
        date: parsedDate,
        time: input.massTime,
        isActive: true,
      },
    });

    if (!exception) {
      // Check regular schedule
      const schedule = await this.prisma.massSchedule.findFirst({
        where: {
          parishId: parish.id,
          weekday,
          time: input.massTime,
          isActive: true,
        },
      });

      if (!schedule) {
        throw new BadRequestException(
          "Horario de missa nao disponivel para esta data",
        );
      }
    }

    // Check if this mass has already been dispatched (closed)
    const existingDispatch = await this.prisma.dispatchBatch.findFirst({
      where: {
        parishId: parish.id,
        massDate: parsedDate,
        massTime: input.massTime,
        status: "SENT",
      },
    });

    if (existingDispatch) {
      throw new BadRequestException(
        "As intencoes para esta missa ja foram encerradas.",
      );
    }

    // Generate protocol: count existing requests for this parish this year
    const yearStart = new Date(`${new Date().getFullYear()}-01-01T00:00:00Z`);
    const count = await this.prisma.request.count({
      where: {
        parishId: parish.id,
        createdAt: { gte: yearStart },
      },
    });

    const protocol = generateProtocol(parish.slug, count + 1);

    // Resolve suggested values for each intention
    const emoluments = await this.prisma.emolument.findMany({
      where: { parishId: parish.id, isActive: true },
    });

    const resolveValue = (
      group: string,
      intentionTypeId: string,
    ): number | null => {
      // Priority: TYPE > GROUP > DEFAULT
      const byType = emoluments.find(
        (e) =>
          e.scope === "TYPE" && e.intentionTypeId === intentionTypeId,
      );
      if (byType) return Number(byType.suggestedValue);

      const byGroup = emoluments.find(
        (e) => e.scope === "GROUP" && e.group === group,
      );
      if (byGroup) return Number(byGroup.suggestedValue);

      const byDefault = emoluments.find((e) => e.scope === "DEFAULT");
      if (byDefault) return Number(byDefault.suggestedValue);

      return null;
    };

    // Create request with intentions in a transaction
    const request = await this.prisma.request.create({
      data: {
        parishId: parish.id,
        protocol,
        massDate: parsedDate,
        massTime: input.massTime,
        faithfulName: input.faithfulName,
        faithfulPhone: input.faithfulPhone,
        intentions: {
          create: input.intentions.map((intention) => {
            const suggested = resolveValue(
              intention.group,
              intention.intentionTypeId,
            );
            return {
              group: intention.group,
              intentionTypeId: intention.intentionTypeId,
              deceasedName: intention.deceasedName ?? null,
              familyNames: intention.familyNames ?? null,
              complement: intention.complement ?? null,
              notes: intention.notes ?? null,
              suggestedValue: suggested,
              offeredValue: intention.offeredValue ?? null,
            };
          }),
        },
      },
    });

    return { protocol: request.protocol };
  }

  // ── Helpers ─────────────────────────────────────────────

  private async findParishOrFail(slug: string) {
    const parish = await this.prisma.parish.findUnique({
      where: { slug },
      select: { id: true, slug: true },
    });

    if (!parish) {
      throw new NotFoundException("Paroquia nao encontrada");
    }

    return parish;
  }
}
