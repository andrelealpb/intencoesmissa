export class EmailService {
  private apiToken: string | null;
  private fromEmail: string;

  constructor() {
    this.apiToken = process.env.MAILERSEND_API_TOKEN || null;
    this.fromEmail = process.env.SMTP_FROM || 'noreply@missas.app';

    if (this.apiToken) {
      console.log(`[Email] MailerSend API configurada. from=${this.fromEmail}`);
    } else {
      console.warn('[Email] MAILERSEND_API_TOKEN nao configurado. Envio de e-mail desabilitado.');
    }
  }

  async sendDispatchEmail(
    to: string[],
    subject: string,
    pdfBuffer: Buffer,
    pdfFilename: string,
  ): Promise<void> {
    if (!this.apiToken) {
      console.warn(`[Email] E-mail desabilitado, ignorando envio para: ${to.join(', ')}`);
      return;
    }

    console.log(`[Email] Enviando via MailerSend API: to=${to.join(', ')} subject="${subject}"`);

    const body = {
      from: { email: this.fromEmail },
      to: to.map((email) => ({ email })),
      subject,
      text: 'Segue em anexo o PDF com as intencoes da Santa Missa.',
      html: `
        <p>Prezado(a),</p>
        <p>Segue em anexo o PDF com as intencoes da Santa Missa.</p>
        <p>Este e um envio automatico. Por favor, nao responda a este e-mail.</p>
      `,
      attachments: [
        {
          filename: pdfFilename,
          content: pdfBuffer.toString('base64'),
          disposition: 'attachment',
        },
      ],
    };

    const response = await fetch('https://api.mailersend.com/v1/email', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MailerSend API ${response.status}: ${errorText}`);
    }

    const messageId = response.headers.get('x-message-id') || 'N/A';
    console.log(`[Email] E-mail enviado com sucesso. messageId=${messageId}`);
  }
}
