import { Test, TestingModule } from "@nestjs/testing";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

const mockAuthService = {
  login: jest.fn(),
};

describe("AuthController", () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("login", () => {
    it("should call authService.login with parsed credentials", async () => {
      const loginResult = {
        accessToken: "token",
        user: { id: "1", email: "test@test.com", name: "test", role: "PARISH_ADMIN", parishId: "p1" },
      };
      mockAuthService.login.mockResolvedValue(loginResult);

      const result = await controller.login({
        email: "test@test.com",
        password: "Admin@123",
      });

      expect(mockAuthService.login).toHaveBeenCalledWith("test@test.com", "Admin@123");
      expect(result).toEqual(loginResult);
    });

    it("should throw on invalid body (missing email)", async () => {
      await expect(controller.login({ password: "123" })).rejects.toThrow();
    });
  });
});
