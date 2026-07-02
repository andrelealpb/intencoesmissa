import { NotFoundException } from "@nestjs/common";
import { AvailabilityStatus } from "@missas/shared";
import { AvailabilityService } from "./availability.service";

/**
 * Fake Prisma em memória — só o suficiente para exercer o serviço. Cobre o
 * upsert/CLEAR de disponibilidade, o replace-set de regras e o isolamento por
 * paróquia (ocorrência de outra paróquia é invisível).
 */
function makePrisma(seed: {
  members?: any[];
  occurrences?: any[];
  entries?: any[];
  rules?: any[];
}) {
  const db = {
    members: seed.members ?? [],
    occurrences: seed.occurrences ?? [],
    entries: seed.entries ?? [],
    rules: seed.rules ?? [],
  };
  let seq = 1;

  const prisma: any = {
    _db: db,
    member: {
      findFirst: jest.fn(async ({ where }: any) =>
        db.members.find(
          (m) => m.id === where.id && m.parishId === where.parishId,
        ) ?? null,
      ),
    },
    massOccurrence: {
      findMany: jest.fn(async ({ where }: any) =>
        db.occurrences
          .filter(
            (o) =>
              o.parishId === where.parishId &&
              o.date >= where.date.gte &&
              o.date <= where.date.lte,
          )
          .sort(
            (a, b) =>
              a.date.getTime() - b.date.getTime() ||
              a.time.localeCompare(b.time),
          ),
      ),
      findFirst: jest.fn(async ({ where }: any) =>
        db.occurrences.find(
          (o) => o.id === where.id && o.parishId === where.parishId,
        ) ?? null,
      ),
    },
    availabilityEntry: {
      findMany: jest.fn(async ({ where }: any) =>
        db.entries.filter((e) => e.memberId === where.memberId),
      ),
      findUnique: jest.fn(async ({ where }: any) => {
        const { memberId, occurrenceId } = where.memberId_occurrenceId;
        return (
          db.entries.find(
            (e) => e.memberId === memberId && e.occurrenceId === occurrenceId,
          ) ?? null
        );
      }),
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const { memberId, occurrenceId } = where.memberId_occurrenceId;
        const existing = db.entries.find(
          (e) => e.memberId === memberId && e.occurrenceId === occurrenceId,
        );
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row = { id: `entry-${seq++}`, ...create };
        db.entries.push(row);
        return row;
      }),
      deleteMany: jest.fn(async ({ where }: any) => {
        const before = db.entries.length;
        db.entries = db.entries.filter(
          (e) =>
            !(
              e.memberId === where.memberId &&
              e.occurrenceId === where.occurrenceId
            ),
        );
        return { count: before - db.entries.length };
      }),
    },
    memberAvailabilityRule: {
      findMany: jest.fn(async ({ where }: any) =>
        db.rules
          .filter((r) => r.memberId === where.memberId)
          .sort(
            (a, b) =>
              a.weekday - b.weekday ||
              String(a.time ?? "").localeCompare(String(b.time ?? "")),
          ),
      ),
      deleteMany: jest.fn(async ({ where }: any) => {
        db.rules = db.rules.filter((r) => r.memberId !== where.memberId);
        return { count: 0 };
      }),
      createMany: jest.fn(async ({ data }: any) => {
        for (const d of data) db.rules.push({ id: `rule-${seq++}`, ...d });
        return { count: data.length };
      }),
    },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };
  return prisma;
}

// UTC-midnight de uma data civil YYYY-MM-DD (como o @db.Date armazena).
const d = (iso: string) => new Date(iso + "T00:00:00.000Z");

describe("AvailabilityService", () => {
  const member = { id: "mem-1", parishId: "par-1" };

  it("getMonthOccurrences pre-preenche pela regra e devolve source", async () => {
    // 2026-07-05 é domingo. Regra: domingo disponivel (dia inteiro).
    const prisma = makePrisma({
      occurrences: [
        { id: "occ-1", parishId: "par-1", date: d("2026-07-05"), time: "10:00", title: null, isSolemnity: false },
        { id: "occ-2", parishId: "par-1", date: d("2026-07-07"), time: "19:00", title: null, isSolemnity: false },
      ],
      rules: [{ memberId: "mem-1", weekday: 0, time: null, available: true }],
    });
    const service = new AvailabilityService(prisma as any);

    const result = await service.getMonthOccurrences(member, "2026-07");
    expect(result).toHaveLength(2);
    // Domingo casa a regra → AVAILABLE/rule.
    expect(result[0]).toMatchObject({
      id: "occ-1",
      date: "2026-07-05",
      availability: { status: "AVAILABLE", source: "rule" },
    });
    // Terça sem regra/entry → default (opt-in).
    expect(result[1].availability).toEqual({
      status: "UNAVAILABLE",
      source: "default",
    });
  });

  it("mes nao materializado → lista vazia (nao erro)", async () => {
    const prisma = makePrisma({});
    const service = new AvailabilityService(prisma as any);
    await expect(service.getMonthOccurrences(member, "2026-09")).resolves.toEqual(
      [],
    );
  });

  it("marcar slot sem regra cria entry AVAILABLE explicit", async () => {
    const prisma = makePrisma({
      occurrences: [
        { id: "occ-1", parishId: "par-1", date: d("2026-07-05"), time: "10:00" },
      ],
    });
    const service = new AvailabilityService(prisma as any);

    const res = await service.upsertAvailability(member, {
      occurrenceId: "occ-1",
      status: "AVAILABLE",
    });
    expect(res.availability).toEqual({ status: "AVAILABLE", source: "explicit" });
    expect(prisma._db.entries).toHaveLength(1);
    expect(prisma._db.entries[0]).toMatchObject({
      parishId: "par-1",
      memberId: "mem-1",
      status: AvailabilityStatus.AVAILABLE,
    });
  });

  it("desmarcar slot de regra grava UNAVAILABLE explicit (sobrescreve a regra)", async () => {
    const prisma = makePrisma({
      occurrences: [
        { id: "occ-1", parishId: "par-1", date: d("2026-07-05"), time: "10:00" },
      ],
      rules: [{ memberId: "mem-1", weekday: 0, time: null, available: true }],
    });
    const service = new AvailabilityService(prisma as any);

    const res = await service.upsertAvailability(member, {
      occurrenceId: "occ-1",
      status: "UNAVAILABLE",
    });
    expect(res.availability).toEqual({
      status: "UNAVAILABLE",
      source: "explicit",
    });
  });

  it("CLEAR apaga o entry e volta a valer a regra", async () => {
    const prisma = makePrisma({
      occurrences: [
        { id: "occ-1", parishId: "par-1", date: d("2026-07-05"), time: "10:00" },
      ],
      entries: [
        {
          id: "entry-1",
          parishId: "par-1",
          memberId: "mem-1",
          occurrenceId: "occ-1",
          status: AvailabilityStatus.UNAVAILABLE,
        },
      ],
      rules: [{ memberId: "mem-1", weekday: 0, time: null, available: true }],
    });
    const service = new AvailabilityService(prisma as any);

    const res = await service.upsertAvailability(member, {
      occurrenceId: "occ-1",
      status: "CLEAR",
    });
    expect(prisma._db.entries).toHaveLength(0);
    // Sem entry, volta a valer a regra (AVAILABLE/rule).
    expect(res.availability).toEqual({ status: "AVAILABLE", source: "rule" });
  });

  it("isolamento: ocorrencia de outra paroquia → NotFound", async () => {
    const prisma = makePrisma({
      occurrences: [
        { id: "occ-x", parishId: "par-2", date: d("2026-07-05"), time: "10:00" },
      ],
    });
    const service = new AvailabilityService(prisma as any);
    await expect(
      service.upsertAvailability(member, {
        occurrenceId: "occ-x",
        status: "AVAILABLE",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("replaceRules substitui o conjunto sem tocar nos desvios explicitos", async () => {
    const prisma = makePrisma({
      rules: [{ id: "rule-old", memberId: "mem-1", weekday: 3, time: null, available: true }],
      entries: [
        { id: "entry-1", parishId: "par-1", memberId: "mem-1", occurrenceId: "occ-1", status: AvailabilityStatus.AVAILABLE },
      ],
    });
    const service = new AvailabilityService(prisma as any);

    const res = await service.replaceRules(member, {
      rules: [{ weekday: 0, time: "10:00", available: true }],
    });
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ weekday: 0, time: "10:00", available: true });
    // Desvios explícitos intactos.
    expect(prisma._db.entries).toHaveLength(1);
  });
});
