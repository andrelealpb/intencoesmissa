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
    this.counts = {};
  }

  private dayKey(date: Date) {
    return new Date(date).toISOString().slice(0, 10);
  }

  // Contadores de dado humano por ocorrencia (populados pelos testes de S2.1).
  counts: Record<string, { assignments: number; availability: number }> = {};

  private withCount(r: any) {
    const c = this.counts[r.id] ?? { assignments: 0, availability: 0 };
    return { ...r, _count: { assignments: c.assignments, availability: c.availability } };
  }

  create = jest.fn(async ({ data }: any) => {
    const row = {
      id: `occ-${this.seq++}`,
      isSolemnity: false,
      title: null,
      sourceScheduleId: null,
      sourceExceptionId: null,
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

  delete = jest.fn(async ({ where }: any) => {
    const idx = this.rows.findIndex((r) => r.id === where.id);
    const [removed] = this.rows.splice(idx, 1);
    return removed;
  });

  findMany = jest.fn(async ({ where, select }: any) => {
    const rows = this.rows
      .filter((r) => {
        if (where.parishId && r.parishId !== where.parishId) return false;
        if (where.date?.gte && r.date < where.date.gte) return false;
        if (where.date?.lte && r.date > where.date.lte) return false;
        return true;
      })
      .map((r) => (select?._count ? this.withCount(r) : { ...r }));
    return rows;
  });

  findUnique = jest.fn(async ({ where, select }: any) => {
    const row = this.rows.find((r) => r.id === where.id);
    if (!row) return null;
    return select?._count ? this.withCount(row) : { ...row };
  });
}

describe("OccurrenceService", () => {
  let service: OccurrenceService;
  const store = new FakeOccurrenceStore();

  const mockPrisma: any = {
    massSchedule: { findMany: jest.fn() },
    massException: { findMany: jest.fn() },
    massOccurrence: store,
    // count de publicados no delete (so chamado quando ha assignments).
    assignment: { count: jest.fn(async () => 0) },
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

  // ── S2.1 — gestao do mes aberto ────────────────────────

  describe("reconcile", () => {
    it("adiciona missa nova do cadastro atual", async () => {
      // Domingo 08:00 no cadastro; julho/2026 tem 4 domingos (5,12,19,26).
      mockPrisma.massSchedule.findMany.mockResolvedValue([
        { id: "sch-sun", parishId: PARISH, weekday: 0, time: "08:00", isActive: true },
      ]);
      mockPrisma.massException.findMany.mockResolvedValue([]);

      const res = await service.reconcile(PARISH, "2026-07");

      expect(res.added).toBe(4);
      expect(res.removedClean).toBe(0);
      expect(res.conflicts).toHaveLength(0);
      expect(store.rows).toHaveLength(4);
    });

    it("remove orfa VAZIA direto (o horario nao existe mais no cadastro)", async () => {
      // Ocorrencia fantasma: quarta 19h ja materializada, sem escala/disponibilidade.
      store.rows.push({
        id: "occ-ghost",
        parishId: PARISH,
        date: new Date("2026-07-08T00:00:00.000Z"), // quarta
        time: "19:00",
        title: null,
        isSolemnity: false,
        sourceScheduleId: "sch-old",
        sourceExceptionId: null,
      });
      // Cadastro atual NAO tem mais a quarta 19h (foi corrigido).
      mockPrisma.massSchedule.findMany.mockResolvedValue([]);
      mockPrisma.massException.findMany.mockResolvedValue([]);

      const res = await service.reconcile(PARISH, "2026-07");

      expect(res.removedClean).toBe(1);
      expect(res.conflicts).toHaveLength(0);
      expect(store.rows).toHaveLength(0); // fantasma some
    });

    it("orfa COM escala vira CONFLITO (nao some sozinha)", async () => {
      store.rows.push({
        id: "occ-ghost",
        parishId: PARISH,
        date: new Date("2026-07-08T00:00:00.000Z"),
        time: "19:00",
        title: null,
        isSolemnity: false,
        sourceScheduleId: "sch-old",
        sourceExceptionId: null,
      });
      store.counts["occ-ghost"] = { assignments: 2, availability: 0 };
      mockPrisma.massSchedule.findMany.mockResolvedValue([]);
      mockPrisma.massException.findMany.mockResolvedValue([]);

      const res = await service.reconcile(PARISH, "2026-07");

      expect(res.removedClean).toBe(0);
      expect(res.conflicts).toHaveLength(1);
      expect(res.conflicts[0]).toMatchObject({
        occurrenceId: "occ-ghost",
        time: "19:00",
        hasAssignments: true,
        hasAvailability: false,
        assignmentCount: 2,
      });
      expect(store.rows).toHaveLength(1); // preservada
    });

    it("orfa COM disponibilidade vira CONFLITO (nao some sozinha)", async () => {
      store.rows.push({
        id: "occ-ghost",
        parishId: PARISH,
        date: new Date("2026-07-08T00:00:00.000Z"),
        time: "19:00",
        title: null,
        isSolemnity: false,
        sourceScheduleId: "sch-old",
        sourceExceptionId: null,
      });
      store.counts["occ-ghost"] = { assignments: 0, availability: 5 };
      mockPrisma.massSchedule.findMany.mockResolvedValue([]);
      mockPrisma.massException.findMany.mockResolvedValue([]);

      const res = await service.reconcile(PARISH, "2026-07");

      expect(res.conflicts).toHaveLength(1);
      expect(res.conflicts[0]).toMatchObject({
        hasAssignments: false,
        hasAvailability: true,
        availabilityCount: 5,
      });
      expect(store.rows).toHaveLength(1);
    });

    it("preserva solenidade/titulo da ocorrencia que continua valida", async () => {
      // Domingo 08:00 valido, ja elevado a solenidade e renomeado a mao.
      store.rows.push({
        id: "occ-sun",
        parishId: PARISH,
        date: new Date("2026-07-05T00:00:00.000Z"),
        time: "08:00",
        title: "Titulo manual",
        isSolemnity: true,
        sourceScheduleId: "sch-sun",
        sourceExceptionId: null,
      });
      store.counts["occ-sun"] = { assignments: 3, availability: 2 };
      mockPrisma.massSchedule.findMany.mockResolvedValue([
        { id: "sch-sun", parishId: PARISH, weekday: 0, time: "08:00", isActive: true },
      ]);
      mockPrisma.massException.findMany.mockResolvedValue([]);

      const res = await service.reconcile(PARISH, "2026-07");

      const preserved = store.rows.find((r) => r.id === "occ-sun");
      expect(preserved.isSolemnity).toBe(true); // NAO rebaixada
      expect(preserved.title).toBe("Titulo manual"); // NAO sobrescrito
      expect(res.conflicts).toHaveLength(0); // valida, nao e orfa
    });

    it("cenario do piloto: corrige cadastro → quarta-19h vazia some, com escala vira conflito", async () => {
      // Duas fantasmas: uma vazia (some), outra com escala (conflito).
      store.rows.push({
        id: "occ-empty",
        parishId: PARISH,
        date: new Date("2026-07-08T00:00:00.000Z"),
        time: "19:00",
        title: null,
        isSolemnity: false,
        sourceScheduleId: "sch-old",
        sourceExceptionId: null,
      });
      store.rows.push({
        id: "occ-withdata",
        parishId: PARISH,
        date: new Date("2026-07-15T00:00:00.000Z"),
        time: "19:00",
        title: null,
        isSolemnity: false,
        sourceScheduleId: "sch-old",
        sourceExceptionId: null,
      });
      store.counts["occ-withdata"] = { assignments: 1, availability: 0 };
      mockPrisma.massSchedule.findMany.mockResolvedValue([]);
      mockPrisma.massException.findMany.mockResolvedValue([]);

      const res = await service.reconcile(PARISH, "2026-07");

      expect(res.removedClean).toBe(1);
      expect(res.conflicts).toHaveLength(1);
      expect(res.conflicts[0].occurrenceId).toBe("occ-withdata");
      expect(store.rows.map((r) => r.id)).toEqual(["occ-withdata"]);
    });
  });

  describe("deleteOccurrence", () => {
    const seedOcc = (id: string, parishId = PARISH) => {
      store.rows.push({
        id,
        parishId,
        date: new Date("2026-07-08T00:00:00.000Z"),
        time: "19:00",
        title: null,
        isSolemnity: false,
      });
    };

    it("remove direto quando nao tem escala nem disponibilidade", async () => {
      seedOcc("occ-1");

      const res = await service.deleteOccurrence(PARISH, "occ-1", false);

      expect(res.deleted).toBe(true);
      expect(store.rows).toHaveLength(0);
    });

    it("com dados e SEM force: nao apaga; devolve o que sera afetado", async () => {
      seedOcc("occ-2");
      store.counts["occ-2"] = { assignments: 3, availability: 5 };

      const res = await service.deleteOccurrence(PARISH, "occ-2", false);

      expect(res.deleted).toBe(false);
      expect(res.requiresConfirmation).toBe(true);
      expect(res.affected).toMatchObject({ assignmentCount: 3, availabilityCount: 5 });
      expect(store.rows).toHaveLength(1); // ainda la
      expect(store.delete).not.toHaveBeenCalled();
    });

    it("com dados e force=true: apaga (cascateia)", async () => {
      seedOcc("occ-3");
      store.counts["occ-3"] = { assignments: 3, availability: 5 };

      const res = await service.deleteOccurrence(PARISH, "occ-3", true);

      expect(res.deleted).toBe(true);
      expect(store.rows).toHaveLength(0);
    });

    it("404 quando a ocorrencia e de outra paroquia (nao vaza)", async () => {
      seedOcc("occ-4", "outra");

      await expect(
        service.deleteOccurrence(PARISH, "occ-4", true),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(store.rows).toHaveLength(1);
    });

    it("404 quando a ocorrencia nao existe", async () => {
      await expect(
        service.deleteOccurrence(PARISH, "nope", false),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("listForManagement", () => {
    it("marca indicadores e inCadastro=false para a orfa", async () => {
      // Uma valida (domingo 08:00) e uma orfa (quarta 19:00 fora do cadastro).
      store.rows.push({
        id: "occ-sun",
        parishId: PARISH,
        date: new Date("2026-07-05T00:00:00.000Z"),
        time: "08:00",
        title: null,
        isSolemnity: true,
        sourceScheduleId: "sch-sun",
        sourceExceptionId: null,
      });
      store.rows.push({
        id: "occ-ghost",
        parishId: PARISH,
        date: new Date("2026-07-08T00:00:00.000Z"),
        time: "19:00",
        title: null,
        isSolemnity: false,
        sourceScheduleId: "sch-old",
        sourceExceptionId: null,
      });
      store.counts["occ-sun"] = { assignments: 2, availability: 3 };
      store.counts["occ-ghost"] = { assignments: 0, availability: 0 };
      mockPrisma.massSchedule.findMany.mockResolvedValue([
        { id: "sch-sun", parishId: PARISH, weekday: 0, time: "08:00", isActive: true },
      ]);
      mockPrisma.massException.findMany.mockResolvedValue([]);

      const list = await service.listForManagement(PARISH, "2026-07");

      const sun = list.find((o) => o.id === "occ-sun")!;
      expect(sun).toMatchObject({
        isSolemnity: true,
        hasAssignments: true,
        assignmentCount: 2,
        hasAvailability: true,
        availabilityCount: 3,
        inCadastro: true,
      });
      const ghost = list.find((o) => o.id === "occ-ghost")!;
      expect(ghost).toMatchObject({
        hasAssignments: false,
        hasAvailability: false,
        inCadastro: false, // horario nao existe mais no cadastro
      });
    });
  });
});
