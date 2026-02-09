import { Injectable, Logger } from "@nestjs/common";

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private apiToken: string | null = null;
  private fromEmail: string;

  constructor() {
    this.apiToken = process.env.MAILERSEND_API_TOKEN || null;
    this.fromEmail = process.env.SMTP_FROM || "noreply@missas.app";

    if (this.apiToken) {
      this.logger.log(`MailerSend API configurada. from=${this.fromEmail}`);
    } else {
      this.logger.warn("MAILERSEND_API_TOKEN nao configurado. Envio de e-mail desabilitado.");
    }
  }

  isConfigured(): boolean {
    return this.apiToken !== null;
  }

  async sendDispatchEmail(
    to: string[],
    subject: string,
    pdfBuffer: Buffer,
    pdfFilename: string,
  ): Promise<void> {
    if (!this.apiToken) {
      this.logger.warn(`E-mail desabilitado, ignorando envio para: ${to.join(", ")}`);
      return;
    }

    this.logger.log(`Enviando e-mail via MailerSend API: from=${this.fromEmail} to=${to.join(", ")} subject="${subject}"`);

    const body = {
      from: { email: this.fromEmail },
      to: to.map((email) => ({ email })),
      subject,
      text: "Segue em anexo o despacho de intencoes de missa.",
      attachments: [
        {
          filename: pdfFilename,
          content: pdfBuffer.toString("base64"),
          disposition: "attachment",
        },
      ],
    };

    try {
      const response = await fetch("https://api.mailersend.com/v1/email", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`MailerSend API ${response.status}: ${errorText}`);
      }

      const messageId = response.headers.get("x-message-id") || "N/A";
      this.logger.log(`E-mail enviado com sucesso. messageId=${messageId} status=${response.status}`);
    } catch (err: any) {
      this.logger.error(`Falha ao enviar e-mail: ${err.message}`, err.stack);
      throw err;
    }
  }
}
