import { Test, TestingModule } from "@nestjs/testing";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";

const mockHealthService = {
  check: jest.fn(),
  checkDb: jest.fn(),
  checkS3: jest.fn(),
  checkSmtp: jest.fn(),
};

describe("HealthController", () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: mockHealthService }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("check", () => {
    it("should return overall health status", async () => {
      const expected = {
        status: "healthy",
        timestamp: new Date().toISOString(),
        services: {
          db: { status: "ok" },
          s3: { status: "ok" },
          smtp: { status: "ok" },
        },
      };
      mockHealthService.check.mockResolvedValue(expected);
      const result = await controller.check();
      expect(result).toEqual(expected);
    });
  });

  describe("checkDb", () => {
    it("should return db health status", async () => {
      mockHealthService.checkDb.mockResolvedValue({ status: "ok" });
      const result = await controller.checkDb();
      expect(result).toEqual({ status: "ok" });
    });
  });

  describe("checkS3", () => {
    it("should return S3 health status", async () => {
      mockHealthService.checkS3.mockResolvedValue({ status: "ok" });
      const result = await controller.checkS3();
      expect(result).toEqual({ status: "ok" });
    });
  });

  describe("checkSmtp", () => {
    it("should return SMTP health status", async () => {
      mockHealthService.checkSmtp.mockResolvedValue({ status: "ok" });
      const result = await controller.checkSmtp();
      expect(result).toEqual({ status: "ok" });
    });
  });
});
