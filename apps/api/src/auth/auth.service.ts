import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException("Credenciais invalidas");
    }

    if (!user.isActive) {
      throw new UnauthorizedException("Usuario inativo");
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException("Credenciais invalidas");
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      parishId: user.parishId,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.email.split("@")[0],
        role: user.role,
        parishId: user.parishId,
      },
    };
  }
}
