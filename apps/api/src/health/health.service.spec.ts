import { Test, TestingModule } from "@nestjs/testing";
import { HealthService } from "./health.service";
import { PrismaService } from "../prisma/prisma.service";

const mockPrisma = {
  $queryRaw: jest.fn(),
};

describe("HealthService", () => {
  let service: HealthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("checkDb", () => {
    it("should return ok when database is reachable", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
      const result = await service.checkDb();
      expect(result).toEqual({ status: "ok" });
    });

    it("should return error when database is unreachable", async () => {
      mockPrisma.$queryRaw.mockRejectedValue(new Error("Connection refused"));
      const result = await service.checkDb();
      expect(result.status).toBe("error");
      expect(result.message).toContain("Connection refused");
    });
  });

  describe("check", () => {
    it("should return aggregated health status", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
      const result = await service.check();
      expect(result).toHaveProperty("status");
      expect(result).toHaveProperty("timestamp");
      expect(result).toHaveProperty("services");
      expect(result.services).toHaveProperty("db");
      expect(result.services).toHaveProperty("s3");
      expect(result.services).toHaveProperty("email");
    });
  });
});
