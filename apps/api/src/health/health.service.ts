import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";
import * as nodemailer from "nodemailer";

interface HealthStatus {
  status: "ok" | "error";
  message?: string;
}

@Injectable()
export class HealthService {
  private s3Client: S3Client;
  private s3Bucket: string;

  constructor(private prisma: PrismaService) {
    this.s3Bucket = process.env.S3_BUCKET || "";
    this.s3Client = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
      },
      forcePathStyle: true,
    });
  }

  async check(): Promise<{
    status: string;
    timestamp: string;
    services: Record<string, HealthStatus>;
  }> {
    const [db, s3, smtp] = await Promise.allSettled([
      this.checkDb(),
      this.checkS3(),
      this.checkSmtp(),
    ]);

    const services: Record<string, HealthStatus> = {
      db: db.status === "fulfilled" ? db.value : { status: "error", message: String((db as PromiseRejectedResult).reason) },
      s3: s3.status === "fulfilled" ? s3.value : { status: "error", message: String((s3 as PromiseRejectedResult).reason) },
      smtp: smtp.status === "fulfilled" ? smtp.value : { status: "error", message: String((smtp as PromiseRejectedResult).reason) },
    };

    const allOk = Object.values(services).every((s) => s.status === "ok");

    return {
      status: allOk ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      services,
    };
  }

  async checkDb(): Promise<HealthStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "ok" };
    } catch (error: any) {
      return { status: "error", message: error.message };
    }
  }

  async checkS3(): Promise<HealthStatus> {
    try {
      await this.s3Client.send(
        new HeadBucketCommand({ Bucket: this.s3Bucket }),
      );
      return { status: "ok" };
    } catch (error: any) {
      return { status: "error", message: error.message };
    }
  }

  async checkSmtp(): Promise<HealthStatus> {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
      await transporter.verify();
      return { status: "ok" };
    } catch (error: any) {
      return { status: "error", message: error.message };
    }
  }
}
