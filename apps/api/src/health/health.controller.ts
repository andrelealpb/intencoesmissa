import { Controller, Get } from "@nestjs/common";
import { HealthService } from "./health.service";

@Controller("health")
export class HealthController {
  constructor(private healthService: HealthService) {}

  @Get()
  async check() {
    return this.healthService.check();
  }

  @Get("db")
  async checkDb() {
    return this.healthService.checkDb();
  }

  @Get("s3")
  async checkS3() {
    return this.healthService.checkS3();
  }

  @Get("email")
  async checkEmail() {
    return this.healthService.checkEmail();
  }
}
