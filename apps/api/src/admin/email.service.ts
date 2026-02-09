import { Injectable, Logger } from "@nestjs/common";
import * as nodemailer from "nodemailer";

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (host && user && pass) {
      const port = Number(process.env.SMTP_PORT) || 465;
      const secure = port === 465;
      this.logger.log(`SMTP configurado: host=${host} port=${port} secure=${secure}`);
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      });
    } else {
      this.logger.warn("SMTP nao configurado (SMTP_HOST/SMTP_USER/SMTP_PASS). Envio de e-mail desabilitado.");
    }
  }

  isConfigured(): boolean {
    return this.transporter !== null;
  }

  async sendDispatchEmail(
    to: string[],
    subject: string,
    pdfBuffer: Buffer,
    pdfFilename: string,
  ): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(`SMTP nao configurado, ignorando envio para: ${to.join(", ")}`);
      return;
    }
    const from = process.env.SMTP_FROM || "noreply@missas.app";
    this.logger.log(`Enviando e-mail: from=${from} to=${to.join(", ")} subject="${subject}"`);
    try {
      const info = await this.transporter.sendMail({
        from,
        to: to.join(", "),
        subject,
        text: "Segue em anexo o despacho de intencoes de missa.",
        attachments: [
          {
            filename: pdfFilename,
            content: pdfBuffer,
            contentType: "application/pdf",
          },
        ],
      });
      this.logger.log(`E-mail enviado com sucesso. messageId=${info.messageId} response="${info.response}"`);
    } catch (err: any) {
      this.logger.error(`Falha ao enviar e-mail: ${err.message}`, err.stack);
      throw err;
    }
  }
}
