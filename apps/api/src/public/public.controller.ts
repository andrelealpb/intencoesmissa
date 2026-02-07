import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { createRequestSchema } from "@missas/shared";
import { PublicService } from "./public.service";

@Controller("public")
export class PublicController {
  constructor(private publicService: PublicService) {}

  @Get("parishes/:slug")
  getParish(@Param("slug") slug: string) {
    return this.publicService.getParishBySlug(slug);
  }

  @Get("parishes/:slug/mass-options")
  getMassOptions(
    @Param("slug") slug: string,
    @Query("date") date: string,
  ) {
    return this.publicService.getMassOptions(slug, date);
  }

  @Get("parishes/:slug/intention-types")
  getIntentionTypes(
    @Param("slug") slug: string,
    @Query("group") group?: string,
  ) {
    return this.publicService.getIntentionTypes(slug, group);
  }

  @Get("parishes/:slug/limits")
  getLimits(@Param("slug") slug: string) {
    return this.publicService.getLimits(slug);
  }

  @Post("parishes/:slug/requests")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  createRequest(@Param("slug") slug: string, @Body() body: unknown) {
    const parsed = createRequestSchema.parse(body);
    return this.publicService.createRequest(slug, parsed);
  }
}
