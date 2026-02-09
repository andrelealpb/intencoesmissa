import { Test, TestingModule } from "@nestjs/testing";
import { UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AuthService } from "./auth.service";
import { PrismaService } from "../prisma/prisma.service";
import * as bcrypt from "bcryptjs";

jest.mock("bcryptjs");

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
  },
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue("mock-jwt-token"),
};

describe("AuthService", () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("login", () => {
    const mockUser = {
      id: "user-1",
      email: "admin@santanna.com",
      passwordHash: "hashed-password",
      role: "PARISH_ADMIN",
      parishId: "parish-1",
      isActive: true,
    };

    it("should return accessToken and user on valid credentials", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login("admin@santanna.com", "Admin@123");

      expect(result).toHaveProperty("accessToken", "mock-jwt-token");
      expect(result.user).toEqual({
        id: "user-1",
        email: "admin@santanna.com",
        name: "admin",
        role: "PARISH_ADMIN",
        parishId: "parish-1",
      });
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: "user-1",
        email: "admin@santanna.com",
        role: "PARISH_ADMIN",
        parishId: "parish-1",
      });
    });

    it("should throw UnauthorizedException when user not found", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.login("notfound@test.com", "password"),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("should throw UnauthorizedException when user is inactive", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        isActive: false,
      });
      await expect(
        service.login("admin@santanna.com", "Admin@123"),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("should throw UnauthorizedException when password is wrong", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      await expect(
        service.login("admin@santanna.com", "wrong-password"),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
