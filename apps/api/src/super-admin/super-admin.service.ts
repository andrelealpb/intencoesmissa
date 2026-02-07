import {
  Injectable,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class SuperAdminService {
  constructor(private prisma: PrismaService) {}

  // ── Parishes ───────────────────────────────────────────

  async listParishes() {
    return this.prisma.parish.findMany({
      include: {
        _count: { select: { users: true, requests: true } },
        settings: true,
      },
      orderBy: { parishName: "asc" },
    });
  }

  async getParish(id: string) {
    const parish = await this.prisma.parish.findUnique({
      where: { id },
      include: {
        settings: true,
        users: {
          select: {
            id: true,
            email: true,
            role: true,
            isActive: true,
            createdAt: true,
          },
        },
      },
    });
    if (!parish) throw new NotFoundException("Paroquia nao encontrada");
    return parish;
  }

  async createParish(data: {
    slug: string;
    parishName: string;
    cnpj?: string;
    legalName?: string;
    pastorName?: string;
    dispatchEmails?: string[];
  }) {
    const existing = await this.prisma.parish.findUnique({
      where: { slug: data.slug },
    });
    if (existing) {
      throw new ConflictException("Slug ja esta em uso");
    }

    return this.prisma.parish.create({
      data: {
        slug: data.slug,
        parishName: data.parishName,
        cnpj: data.cnpj,
        legalName: data.legalName,
        pastorName: data.pastorName,
        dispatchEmails: data.dispatchEmails ?? [],
        settings: {
          create: {},
        },
      },
      include: { settings: true },
    });
  }

  async updateParish(
    id: string,
    data: {
      slug?: string;
      parishName?: string;
      cnpj?: string;
      legalName?: string;
      pastorName?: string;
      dispatchEmails?: string[];
    },
  ) {
    const parish = await this.prisma.parish.findUnique({ where: { id } });
    if (!parish) throw new NotFoundException("Paroquia nao encontrada");

    if (data.slug && data.slug !== parish.slug) {
      const existing = await this.prisma.parish.findUnique({
        where: { slug: data.slug },
      });
      if (existing) {
        throw new ConflictException("Slug ja esta em uso");
      }
    }

    return this.prisma.parish.update({
      where: { id },
      data,
    });
  }

  async deleteParish(id: string) {
    const parish = await this.prisma.parish.findUnique({ where: { id } });
    if (!parish) throw new NotFoundException("Paroquia nao encontrada");
    return this.prisma.parish.delete({ where: { id } });
  }

  // ── Users ──────────────────────────────────────────────

  async listUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        parishId: true,
        createdAt: true,
        parish: { select: { parishName: true, slug: true } },
      },
      orderBy: { email: "asc" },
    });
  }

  async getUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        parishId: true,
        createdAt: true,
        updatedAt: true,
        parish: { select: { parishName: true, slug: true } },
      },
    });
    if (!user) throw new NotFoundException("Usuario nao encontrado");
    return user;
  }

  async createUser(data: {
    email: string;
    password: string;
    role: "SUPER_ADMIN" | "PARISH_ADMIN";
    parishId?: string;
    isActive?: boolean;
  }) {
    const existing = await this.prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existing) {
      throw new ConflictException("E-mail ja esta em uso");
    }

    const passwordHash = await bcrypt.hash(data.password, 12);

    return this.prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        role: data.role,
        parishId: data.parishId ?? null,
        isActive: data.isActive ?? true,
      },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        parishId: true,
        createdAt: true,
      },
    });
  }

  async updateUser(
    id: string,
    data: {
      email?: string;
      password?: string;
      role?: "SUPER_ADMIN" | "PARISH_ADMIN";
      parishId?: string | null;
      isActive?: boolean;
    },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("Usuario nao encontrado");

    if (data.email && data.email !== user.email) {
      const existing = await this.prisma.user.findUnique({
        where: { email: data.email },
      });
      if (existing) {
        throw new ConflictException("E-mail ja esta em uso");
      }
    }

    const updateData: Record<string, unknown> = {};
    if (data.email !== undefined) updateData.email = data.email;
    if (data.role !== undefined) updateData.role = data.role;
    if (data.parishId !== undefined) updateData.parishId = data.parishId;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.password) {
      updateData.passwordHash = await bcrypt.hash(data.password, 12);
    }

    return this.prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        parishId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async deleteUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("Usuario nao encontrado");
    return this.prisma.user.delete({ where: { id } });
  }
}
