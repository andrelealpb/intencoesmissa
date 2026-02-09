import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";
import * as nodemailer from "nodemailer";

export interface HealthStatus {
  status: "ok" | "error";
  message?: string;
  details?: Record<string, string>;
}

@Injectable()
export class HealthService {
  private s3Client: S3Client | null = null;
  private s3Bucket: string;

  constructor(private prisma: PrismaService) {
    this.s3Bucket = process.env.S3_BUCKET || "";
    const accessKeyId = process.env.S3_ACCESS_KEY_ID || "";
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || "";

    if (this.s3Bucket && accessKeyId && secretAccessKey) {
      const s3Config: any = {
        region: process.env.S3_REGION || "us-east-1",
        credentials: { accessKeyId, secretAccessKey },
      };
      if (process.env.S3_ENDPOINT) {
        s3Config.endpoint = process.env.S3_ENDPOINT;
        s3Config.forcePathStyle = true;
      }
      this.s3Client = new S3Client(s3Config);
    }
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
    if (!this.s3Client) {
      return {
        status: "error",
        message: "S3 nao configurado",
        details: {
          bucket: this.s3Bucket ? "definido" : "VAZIO",
          accessKey: process.env.S3_ACCESS_KEY_ID ? "definido" : "VAZIO",
          secretKey: process.env.S3_SECRET_ACCESS_KEY ? "definido" : "VAZIO",
          region: process.env.S3_REGION || "us-east-1",
          endpoint: process.env.S3_ENDPOINT || "(nenhum — usando AWS padrao)",
        },
      };
    }
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
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM;

    if (!host || !user || !pass) {
      return {
        status: "error",
        message: "SMTP nao configurado",
        details: {
          host: host ? "definido" : "VAZIO",
          port: process.env.SMTP_PORT || "465 (padrao)",
          user: user ? "definido" : "VAZIO",
          pass: pass ? "definido" : "VAZIO",
          from: from || "VAZIO (usara noreply@missas.app)",
        },
      };
    }
    try {
      const port = Number(process.env.SMTP_PORT) || 465;
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      });
      await transporter.verify();
      return {
        status: "ok",
        details: { host, from: from || "noreply@missas.app" },
      };
    } catch (error: any) {
      return {
        status: "error",
        message: error.message,
        details: { host, from: from || "noreply@missas.app" },
      };
    }
  }
}
