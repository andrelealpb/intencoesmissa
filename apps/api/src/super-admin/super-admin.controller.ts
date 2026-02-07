import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { SuperAdminService } from "./super-admin.service";

@Controller("sa")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("SUPER_ADMIN")
export class SuperAdminController {
  constructor(private superAdminService: SuperAdminService) {}

  // ── Parishes ───────────────────────────────────────────

  @Get("parishes")
  listParishes() {
    return this.superAdminService.listParishes();
  }

  @Get("parishes/:id")
  getParish(@Param("id") id: string) {
    return this.superAdminService.getParish(id);
  }

  @Post("parishes")
  createParish(
    @Body()
    body: {
      slug: string;
      parishName: string;
      cnpj?: string;
      legalName?: string;
      pastorName?: string;
      dispatchEmails?: string[];
    },
  ) {
    return this.superAdminService.createParish(body);
  }

  @Put("parishes/:id")
  updateParish(
    @Param("id") id: string,
    @Body()
    body: {
      slug?: string;
      parishName?: string;
      cnpj?: string;
      legalName?: string;
      pastorName?: string;
      dispatchEmails?: string[];
    },
  ) {
    return this.superAdminService.updateParish(id, body);
  }

  @Delete("parishes/:id")
  deleteParish(@Param("id") id: string) {
    return this.superAdminService.deleteParish(id);
  }

  // ── Users ──────────────────────────────────────────────

  @Get("users")
  listUsers() {
    return this.superAdminService.listUsers();
  }

  @Get("users/:id")
  getUser(@Param("id") id: string) {
    return this.superAdminService.getUser(id);
  }

  @Post("users")
  createUser(
    @Body()
    body: {
      email: string;
      password: string;
      role: "SUPER_ADMIN" | "PARISH_ADMIN";
      parishId?: string;
      isActive?: boolean;
    },
  ) {
    return this.superAdminService.createUser(body);
  }

  @Put("users/:id")
  updateUser(
    @Param("id") id: string,
    @Body()
    body: {
      email?: string;
      password?: string;
      role?: "SUPER_ADMIN" | "PARISH_ADMIN";
      parishId?: string | null;
      isActive?: boolean;
    },
  ) {
    return this.superAdminService.updateUser(id, body);
  }

  @Delete("users/:id")
  deleteUser(@Param("id") id: string) {
    return this.superAdminService.deleteUser(id);
  }
}
