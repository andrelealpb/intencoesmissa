import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException, ForbiddenException } from "@nestjs/common";
import { OccurrenceService } from "./occurrence.service";
import { PrismaService } from "../prisma/prisma.service";

// In-memory fake da tabela mass_occurrences, com a chave unica (parishId,date,time).
class FakeOccurrenceStore {
  rows: any[] = [];
  private seq = 1;

  reset() {
    this.rows = [];
    this.seq = 1;
  }

  private dayKey(date: Date) {
    return new Date(date).toISOString().slice(0, 10);
  }

  create = jest.fn(async ({ data }: any) => {
    const row = {
      id: `occ-${this.seq++}`,
      isSolemnity: false,
      title: null,
      ...data,
      date: new Date(data.date),
    };
    this.rows.push(row);
    return row;
  });

  update = jest.fn(async ({ where, data }: any) => {
    const row = this.rows.find((r) => r.id === where.id);
    Object.assign(row, data);
    return row;
  });

  findMany = jest.fn(async ({ where }: any) => {
    return this.rows
      .filter((r) => {
        if (where.parishId && r.parishId !== where.parishId) return false;
        if (where.date?.gte && r.date < where.date.gte) return false;
        if (where.date?.lte && r.date > where.date.lte) return false;
        return true;
      })
      .map((r) => ({ ...r }));
  });

  findUnique = jest.fn(async ({ where }: any) => {
    const row = this.rows.find((r) => r.id === where.id);
    return row ? { ...row } : null;
  });
}

describe("OccurrenceService", () => {
  let service: OccurrenceService;
  const store = new FakeOccurrenceStore();

  const mockPrisma: any = {
    massSchedule: { findMany: jest.fn() },
    massException: { findMany: jest.fn() },
    massOccurrence: store,
    // $transaction recebe um callback e passa o proprio prisma (tx) — reusa o store.
    $transaction: jest.fn(async (cb: any) => cb(mockPrisma)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OccurrenceService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(OccurrenceService);
    store.reset();
    jest.clearAllMocks();
  });

  const PARISH = "parish-1";

  describe("materialize", () => {
    it("cria uma ocorrencia por missa regular do intervalo", async () => {
      // Domingo 08:00 (weekday 0). Intervalo 2026-07-01 (qua) .. 2026-07-07 (ter)
      // contem um domingo: 2026-07-05.
      mockPrisma.massSchedule.findMany.mockResolvedValue([
        { id: "sch-sun", parishId: PARISH, weekday: 0, time: "08:00", isActive: true },
      ]);
      mockPrisma.massException.findMany.mockResolvedValue([]);

      const res = await service.materialize(PARISH, "2026-07-01", "2026-07-07");

      expect(res).toEqual({ created: 1, updated: 0, total: 1 });
      expect(store.rows).toHaveLength(1);
      expect(store.rows[0].time).toBe("08:00");
      expect(store.rows[0].date.toISOString().slice(0, 10)).toBe("2026-07-05");
      expect(store.rows[0].sourceScheduleId).toBe("sch-sun");
      expect(store.rows[0].isSolemnity).toBe(false);
    });

    it("e idempotente: re-rodar nao cria duplicatas (created=0)", async () => {
      mockPrisma.massSchedule.findMany.mockResolvedValue([
        { id: "sch-sun", parishId: PARISH, weekday: 0, time: "08:00", isActive: true },
      ]);
      mockPrisma.massException.findMany.mockResolvedValue([]);

      await service.materialize(PARISH, "2026-07-01", "2026-07-07");
      const res2 = await service.materialize(PARISH, "2026-07-01", "2026-07-07");

      expect(res2.created).toBe(0);
      expect(res2.updated).toBe(1);
      expect(store.rows).toHaveLength(1);
    });

    it("preserva isSolemnity=true marcado a mao ao re-materializar (D7)", async () => {
      mockPrisma.massSchedule.findMany.mockResolvedValue([
        { id: "sch-sun", parishId: PARISH, weekday: 0, time: "08:00", isActive: true },
      ]);
      mockPrisma.massException.findMany.mockResolvedValue([]);

      await service.materialize(PARISH, "2026-07-01", "2026-07-07");
      // Coordenador eleva o domingo a solenidade.
      store.rows[0].isSolemnity = true;

      await service.materialize(PARISH, "2026-07-01", "2026-07-07");

      expect(store.rows[0].isSolemnity).toBe(true);
    });

    it("nao sobrescreve titulo editado a mao ao re-materializar", async () => {
      mockPrisma.massSchedule.findMany.mockResolvedValue([
        { id: "sch-sun", parishId: PARISH, weekday: 0, time: "08:00", isActive: true },
      ]);
      // Excecao no mesmo slot com um titulo "oficial".
      mockPrisma.massException.findMany.mockResolvedValue([
        { id: "exc-1", parishId: PARISH, date: new Date("2026-07-05T00:00:00.000Z"), time: "08:00", title: "Titulo da excecao", isActive: true },
      ]);

      await service.materialize(PARISH, "2026-07-01", "2026-07-07");
      // Secretaria renomeia a mao.
      store.rows[0].title = "Titulo editado a mao";

      await service.materialize(PARISH, "2026-07-01", "2026-07-07");

      expect(store.rows[0].title).toBe("Titulo editado a mao");
    });

    it("excecao no mesmo horario substitui o regular (excecao vence)", async () => {
      mockPrisma.massSchedule.findMany.mockResolvedValue([
        { id: "sch-sun", parishId: PARISH, weekday: 0, time: "08:00", isActive: true },
      ]);
      mockPrisma.massException.findMany.mockResolvedValue([
        { id: "exc-1", parishId: PARISH, date: new Date("2026-07-05T00:00:00.000Z"), time: "08:00", title: "Missa especial", isActive: true },
      ]);

      const res = await service.materialize(PARISH, "2026-07-01", "2026-07-07");

      expect(res.total).toBe(1);
      expect(store.rows[0].sourceExceptionId).toBe("exc-1");
      expect(store.rows[0].sourceScheduleId).toBeNull();
      expect(store.rows[0].title).toBe("Missa especial");
    });
  });

  describe("update", () => {
    it("eleva solenidade de uma ocorrencia da propria paroquia", async () => {
      store.rows.push({ id: "occ-x", parishId: PARISH, isSolemnity: false, title: null });

      await service.update(PARISH, "occ-x", { isSolemnity: true });

      expect(store.rows[0].isSolemnity).toBe(true);
    });

    it("404 quando a ocorrencia nao existe", async () => {
      await expect(
        service.update(PARISH, "nope", { isSolemnity: true }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("403 quando a ocorrencia e de outra paroquia (ownership)", async () => {
      store.rows.push({ id: "occ-y", parishId: "outra", isSolemnity: false, title: null });

      await expect(
        service.update(PARISH, "occ-y", { isSolemnity: true }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
