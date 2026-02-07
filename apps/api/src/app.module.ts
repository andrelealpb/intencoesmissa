import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { PublicModule } from "./public/public.module";
import { AdminModule } from "./admin/admin.module";
import { SuperAdminModule } from "./super-admin/super-admin.module";

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 30 }]),
    PrismaModule,
    AuthModule,
    PublicModule,
    AdminModule,
    SuperAdminModule,
  ],
})
export class AppModule {}
