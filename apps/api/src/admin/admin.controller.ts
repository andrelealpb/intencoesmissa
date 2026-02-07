import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ForbiddenException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { AdminService } from "./admin.service";
import {
  parishProfileSchema,
  parishSettingsSchema,
  massScheduleSchema,
  massExceptionSchema,
  intentionTypeSchema,
  emolumentSchema,
} from "@missas/shared";

interface AuthenticatedRequest {
  user: {
    id: string;
    email: string;
    role: string;
    parishId: string | null;
  };
}

function getParishId(req: AuthenticatedRequest): string {
  const parishId = req.user.parishId;
  if (!parishId) {
    throw new ForbiddenException("Usuario nao vinculado a uma paroquia");
  }
  return parishId;
}

@Controller("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("PARISH_ADMIN")
export class AdminController {
  constructor(private adminService: AdminService) {}

  // ── Parish Profile ─────────────────────────────────────

  @Get("parish/profile")
  getParishProfile(@Req() req: AuthenticatedRequest) {
    return this.adminService.getParishProfile(getParishId(req));
  }

  @Put("parish/profile")
  updateParishProfile(
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    const data = parishProfileSchema.parse(body);
    return this.adminService.updateParishProfile(getParishId(req), data);
  }

  @Post("parish/logo")
  @UseInterceptors(FileInterceptor("file"))
  uploadLogo(
    @Req() req: AuthenticatedRequest,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.adminService.uploadLogo(getParishId(req), file);
  }

  @Delete("parish/logo")
  deleteLogo(@Req() req: AuthenticatedRequest) {
    return this.adminService.deleteLogo(getParishId(req));
  }

  // ── Parish Settings ────────────────────────────────────

  @Get("settings")
  getSettings(@Req() req: AuthenticatedRequest) {
    return this.adminService.getSettings(getParishId(req));
  }

  @Put("settings")
  updateSettings(
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    const data = parishSettingsSchema.parse(body);
    return this.adminService.updateSettings(getParishId(req), data);
  }

  // ── Mass Schedules ─────────────────────────────────────

  @Get("masses/schedules")
  listSchedules(@Req() req: AuthenticatedRequest) {
    return this.adminService.listSchedules(getParishId(req));
  }

  @Post("masses/schedules")
  createSchedule(
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    const data = massScheduleSchema.parse(body);
    return this.adminService.createSchedule(getParishId(req), data);
  }

  @Put("masses/schedules/:id")
  updateSchedule(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const data = massScheduleSchema.parse(body);
    return this.adminService.updateSchedule(getParishId(req), id, data);
  }

  @Delete("masses/schedules/:id")
  deleteSchedule(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
  ) {
    return this.adminService.deleteSchedule(getParishId(req), id);
  }

  // ── Mass Exceptions ────────────────────────────────────

  @Get("masses/exceptions")
  listExceptions(@Req() req: AuthenticatedRequest) {
    return this.adminService.listExceptions(getParishId(req));
  }

  @Post("masses/exceptions")
  createException(
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    const data = massExceptionSchema.parse(body);
    return this.adminService.createException(getParishId(req), data);
  }

  @Put("masses/exceptions/:id")
  updateException(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const data = massExceptionSchema.parse(body);
    return this.adminService.updateException(getParishId(req), id, data);
  }

  @Delete("masses/exceptions/:id")
  deleteException(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
  ) {
    return this.adminService.deleteException(getParishId(req), id);
  }

  // ── Intention Types ────────────────────────────────────

  @Get("intention-types")
  listIntentionTypes(@Req() req: AuthenticatedRequest) {
    return this.adminService.listIntentionTypes(getParishId(req));
  }

  @Post("intention-types")
  createIntentionType(
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    const data = intentionTypeSchema.parse(body);
    return this.adminService.createIntentionType(getParishId(req), data);
  }

  @Put("intention-types/:id")
  updateIntentionType(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const data = intentionTypeSchema.parse(body);
    return this.adminService.updateIntentionType(getParishId(req), id, data);
  }

  @Delete("intention-types/:id")
  deleteIntentionType(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
  ) {
    return this.adminService.deleteIntentionType(getParishId(req), id);
  }

  // ── Emoluments ─────────────────────────────────────────

  @Get("emoluments")
  listEmoluments(@Req() req: AuthenticatedRequest) {
    return this.adminService.listEmoluments(getParishId(req));
  }

  @Post("emoluments")
  createEmolument(
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    const data = emolumentSchema.parse(body);
    return this.adminService.createEmolument(getParishId(req), data);
  }

  @Put("emoluments/:id")
  updateEmolument(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const data = emolumentSchema.parse(body);
    return this.adminService.updateEmolument(getParishId(req), id, data);
  }

  @Delete("emoluments/:id")
  deleteEmolument(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
  ) {
    return this.adminService.deleteEmolument(getParishId(req), id);
  }

  // ── Requests ───────────────────────────────────────────

  @Get("requests")
  listRequests(@Req() req: AuthenticatedRequest) {
    return this.adminService.listRequests(getParishId(req));
  }

  // ── Dispatches ─────────────────────────────────────────

  @Get("dispatches")
  listDispatches(@Req() req: AuthenticatedRequest) {
    return this.adminService.listDispatches(getParishId(req));
  }

  @Get("dispatches/:id/download")
  downloadDispatch(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
  ) {
    return this.adminService.downloadDispatch(getParishId(req), id);
  }

  @Post("dispatches/run-now")
  runDispatchNow(@Req() req: AuthenticatedRequest) {
    return this.adminService.runDispatchNow(getParishId(req));
  }

  // ── Dashboard ──────────────────────────────────────────

  @Get("dashboard")
  getDashboard(
    @Req() req: AuthenticatedRequest,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.adminService.getDashboard(getParishId(req), from, to);
  }
}
