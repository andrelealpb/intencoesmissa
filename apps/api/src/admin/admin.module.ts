import { Module } from "@nestjs/common";
import { MulterModule } from "@nestjs/platform-express";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { StorageService } from "./storage.service";
import { EmailService } from "./email.service";

@Module({
  imports: [
    MulterModule.register({
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    }),
  ],
  controllers: [AdminController],
  providers: [AdminService, StorageService, EmailService],
  exports: [StorageService, EmailService],
})
export class AdminModule {}
