import nodemailer, { Transporter } from 'nodemailer';

export class EmailService {
  private transporter: Transporter;
  private from: string;

  constructor() {
    this.from = process.env.SMTP_FROM || 'noreply@missas.com';

    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async sendDispatchEmail(
    to: string[],
    subject: string,
    pdfBuffer: Buffer,
    pdfFilename: string,
  ): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: to.join(', '),
      subject,
      text: 'Segue em anexo o PDF com as intenções da Santa Missa.',
      html: `
        <p>Prezado(a),</p>
        <p>Segue em anexo o PDF com as intenções da Santa Missa.</p>
        <p>Este é um envio automático. Por favor, não responda a este e-mail.</p>
      `,
      attachments: [
        {
          filename: pdfFilename,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    console.log(`[Email] Dispatch email sent to: ${to.join(', ')}`);
  }
}
