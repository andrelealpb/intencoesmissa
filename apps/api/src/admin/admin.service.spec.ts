import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException, ForbiddenException } from "@nestjs/common";
import { AdminService } from "./admin.service";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "./storage.service";
import { EmailService } from "./email.service";

const mockPrisma = {
  parish: { findUnique: jest.fn(), update: jest.fn() },
  parishSettings: { findUnique: jest.fn(), create: jest.fn(), upsert: jest.fn() },
  massSchedule: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), findUnique: jest.fn() },
  massException: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), findUnique: jest.fn() },
  intentionType: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), findUnique: jest.fn() },
  emolument: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), findUnique: jest.fn() },
  request: { findMany: jest.fn(), count: jest.fn(), groupBy: jest.fn() },
  requestIntention: { count: jest.fn(), groupBy: jest.fn() },
  dispatchBatch: { findMany: jest.fn(), findUnique: jest.fn() },
};

const mockStorage = {
  upload: jest.fn().mockResolvedValue(undefined),
  getSignedUrl: jest.fn().mockResolvedValue("https://signed-url.com/file"),
  delete: jest.fn().mockResolvedValue(undefined),
};

const mockEmail = {
  sendDispatchEmail: jest.fn(),
};

describe("AdminService", () => {
  let service: AdminService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorage },
        { provide: EmailService, useValue: mockEmail },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getParishProfile", () => {
    it("should return parish when found", async () => {
      const parish = { id: "p1", parishName: "Sant Anna" };
      mockPrisma.parish.findUnique.mockResolvedValue(parish);
      const result = await service.getParishProfile("p1");
      expect(result).toEqual(parish);
    });

    it("should throw NotFoundException when parish not found", async () => {
      mockPrisma.parish.findUnique.mockResolvedValue(null);
      await expect(service.getParishProfile("unknown")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("updateParishProfile", () => {
    it("should update and return parish", async () => {
      const updated = { id: "p1", parishName: "Updated" };
      mockPrisma.parish.update.mockResolvedValue(updated);
      const result = await service.updateParishProfile("p1", {
        slug: "updated",
        parishName: "Updated",
        dispatchEmails: [],
      });
      expect(result).toEqual(updated);
    });
  });

  describe("getSettings", () => {
    it("should return existing settings", async () => {
      const settings = { parishId: "p1", maxIntentionsPerRequest: 5 };
      mockPrisma.parishSettings.findUnique.mockResolvedValue(settings);
      const result = await service.getSettings("p1");
      expect(result).toEqual(settings);
    });

    it("should create default settings when none exist", async () => {
      const created = { parishId: "p1" };
      mockPrisma.parishSettings.findUnique.mockResolvedValue(null);
      mockPrisma.parishSettings.create.mockResolvedValue(created);
      const result = await service.getSettings("p1");
      expect(result).toEqual(created);
    });
  });

  describe("listSchedules", () => {
    it("should return mass schedules for parish", async () => {
      const schedules = [{ id: "s1", weekday: 0, time: "08:00" }];
      mockPrisma.massSchedule.findMany.mockResolvedValue(schedules);
      const result = await service.listSchedules("p1");
      expect(result).toEqual(schedules);
    });
  });

  describe("deleteSchedule", () => {
    it("should throw NotFoundException when schedule not found", async () => {
      mockPrisma.massSchedule.findUnique.mockResolvedValue(null);
      await expect(service.deleteSchedule("p1", "s1")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should throw ForbiddenException when parish mismatch", async () => {
      mockPrisma.massSchedule.findUnique.mockResolvedValue({
        parishId: "other-parish",
      });
      await expect(service.deleteSchedule("p1", "s1")).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("should delete when ownership is valid", async () => {
      mockPrisma.massSchedule.findUnique.mockResolvedValue({ parishId: "p1" });
      mockPrisma.massSchedule.delete.mockResolvedValue({ id: "s1" });
      const result = await service.deleteSchedule("p1", "s1");
      expect(result).toEqual({ id: "s1" });
    });
  });

  describe("uploadLogo", () => {
    it("should upload logo and update parish", async () => {
      const file = {
        originalname: "logo.png",
        buffer: Buffer.from("test"),
        mimetype: "image/png",
      } as Express.Multer.File;

      mockPrisma.parish.findUnique.mockResolvedValue({ logoStorageKey: null });
      mockPrisma.parish.update.mockResolvedValue({
        id: "p1",
        logoStorageKey: "key",
        logoUrl: "https://signed-url.com/file",
      });

      const result = await service.uploadLogo("p1", file);
      expect(mockStorage.upload).toHaveBeenCalled();
      expect(result.logoUrl).toBe("https://signed-url.com/file");
    });

    it("should delete old logo before uploading new one", async () => {
      const file = {
        originalname: "logo.png",
        buffer: Buffer.from("test"),
        mimetype: "image/png",
      } as Express.Multer.File;

      mockPrisma.parish.findUnique.mockResolvedValue({
        logoStorageKey: "old-key",
      });
      mockPrisma.parish.update.mockResolvedValue({
        id: "p1",
        logoStorageKey: "new-key",
      });

      await service.uploadLogo("p1", file);
      expect(mockStorage.delete).toHaveBeenCalledWith("old-key");
    });
  });

  describe("listRequests", () => {
    it("should return requests for parish", async () => {
      const requests = [{ id: "r1", protocol: "SAN-2026-000001" }];
      mockPrisma.request.findMany.mockResolvedValue(requests);
      const result = await service.listRequests("p1");
      expect(result).toEqual(requests);
    });
  });
});
