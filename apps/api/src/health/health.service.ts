import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";

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
    const [db, s3, email] = await Promise.allSettled([
      this.checkDb(),
      this.checkS3(),
      this.checkEmail(),
    ]);

    const services: Record<string, HealthStatus> = {
      db: db.status === "fulfilled" ? db.value : { status: "error", message: String((db as PromiseRejectedResult).reason) },
      s3: s3.status === "fulfilled" ? s3.value : { status: "error", message: String((s3 as PromiseRejectedResult).reason) },
      email: email.status === "fulfilled" ? email.value : { status: "error", message: String((email as PromiseRejectedResult).reason) },
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

  async checkEmail(): Promise<HealthStatus> {
    const apiKey = process.env.BREVO_API_KEY;
    const from = process.env.SMTP_FROM;

    if (!apiKey) {
      return {
        status: "error",
        message: "BREVO_API_KEY nao configurado",
        details: {
          token: "VAZIO",
          from: from || "VAZIO",
        },
      };
    }

    try {
      // Verify token by fetching account info
      const response = await fetch("https://api.brevo.com/v3/account", {
        headers: { "api-key": apiKey, Accept: "application/json" },
      });
      if (!response.ok) {
        const text = await response.text();
        return {
          status: "error",
          message: `Brevo API ${response.status}: ${text}`,
          details: { from: from || "VAZIO" },
        };
      }
      return {
        status: "ok",
        details: { provider: "Brevo API", from: from || "noreply@missas.app" },
      };
    } catch (error: any) {
      return { status: "error", message: error.message };
    }
  }
}
