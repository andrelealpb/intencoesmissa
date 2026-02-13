import { Injectable, Logger } from "@nestjs/common";

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private apiKey: string | null = null;
  private fromEmail: string;
  private fromName: string;

  constructor() {
    this.apiKey = process.env.BREVO_API_KEY || null;
    this.fromEmail = process.env.SMTP_FROM || "noreply@missas.app";
    this.fromName = process.env.SMTP_FROM_NAME || "Intencoes de Missa";

    if (this.apiKey) {
      this.logger.log(`Brevo API configurada. from=${this.fromName} <${this.fromEmail}>`);
    } else {
      this.logger.warn("BREVO_API_KEY nao configurado. Envio de e-mail desabilitado.");
    }
  }

  isConfigured(): boolean {
    return this.apiKey !== null;
  }

  async sendDispatchEmail(
    to: string[],
    subject: string,
    pdfBuffer: Buffer,
    pdfFilename: string,
  ): Promise<void> {
    if (!this.apiKey) {
      this.logger.warn(`E-mail desabilitado, ignorando envio para: ${to.join(", ")}`);
      return;
    }

    this.logger.log(`Enviando e-mail via Brevo API: from=${this.fromName} <${this.fromEmail}> to=${to.join(", ")} subject="${subject}"`);

    const body = {
      sender: { name: this.fromName, email: this.fromEmail },
      to: to.map((email) => ({ email })),
      subject,
      textContent: "Segue em anexo o despacho de intencoes de missa.",
      htmlContent: `
        <p>Prezado(a),</p>
        <p>Segue em anexo o PDF com as inten&ccedil;&otilde;es da Santa Missa.</p>
        <p>Este &eacute; um envio autom&aacute;tico. Por favor, n&atilde;o responda a este e-mail.</p>
      `,
      attachment: [
        {
          name: pdfFilename,
          content: pdfBuffer.toString("base64"),
        },
      ],
    };

    try {
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": this.apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Brevo API ${response.status}: ${errorText}`);
      }

      const result = (await response.json()) as { messageId?: string };
      const messageId = result.messageId || "N/A";
      this.logger.log(`E-mail enviado com sucesso. messageId=${messageId}`);
    } catch (err: any) {
      this.logger.error(`Falha ao enviar e-mail: ${err.message}`, err.stack);
      throw err;
    }
  }

  async sendPastorSummary(
    to: string,
    subject: string,
    textContent: string,
    htmlContent: string,
  ): Promise<void> {
    if (!this.apiKey) {
      this.logger.warn(`E-mail desabilitado, ignorando resumo para paroco: ${to}`);
      return;
    }

    this.logger.log(`Enviando resumo ao paroco: to=${to} subject="${subject}"`);

    const body = {
      sender: { name: this.fromName, email: this.fromEmail },
      to: [{ email: to }],
      subject,
      textContent,
      htmlContent,
    };

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": this.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Brevo API ${response.status}: ${errorText}`);
    }

    this.logger.log(`Resumo ao paroco enviado com sucesso.`);
  }
}
