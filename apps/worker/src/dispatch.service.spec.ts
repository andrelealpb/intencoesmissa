import { DispatchService } from "./dispatch.service";

const mockPrisma = {
  parish: { findMany: jest.fn() },
  requestIntention: { findMany: jest.fn(), count: jest.fn(), updateMany: jest.fn() },
  dispatchBatch: { findFirst: jest.fn(), create: jest.fn() },
  request: { findMany: jest.fn() },
} as any;

const mockStorage = {
  upload: jest.fn(),
  download: jest.fn(),
  getSignedUrl: jest.fn(),
  delete: jest.fn(),
};

const mockEmail = {
  sendDispatchEmail: jest.fn(),
};

describe("DispatchService", () => {
  let service: DispatchService;

  beforeEach(() => {
    service = new DispatchService(mockPrisma, mockStorage, mockEmail);
    jest.clearAllMocks();
  });

  describe("checkAndDispatch", () => {
    it("should skip parishes without settings", async () => {
      mockPrisma.parish.findMany.mockResolvedValue([
        { id: "p1", parishName: "Test", settings: null },
      ]);

      await service.checkAndDispatch();
      expect(mockPrisma.requestIntention.findMany).not.toHaveBeenCalled();
    });

    it("should skip parishes when dispatch time does not match", async () => {
      mockPrisma.parish.findMany.mockResolvedValue([
        {
          id: "p1",
          parishName: "Test",
          settings: { dispatchTime: "99:99" }, // Will never match current time
          // A query real inclui massExceptions/massSchedules; sem eles o codigo
          // (dispatch.service.ts:47,50) estoura ao ler `.length`/`.filter`.
          massExceptions: [],
          massSchedules: [],
        },
      ]);

      await service.checkAndDispatch();
      expect(mockPrisma.requestIntention.findMany).not.toHaveBeenCalled();
    });
  });
});
