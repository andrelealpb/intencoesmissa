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

    const base64Content = pdfBuffer.toString('base64');
    const errors: string[] = [];

    for (const recipient of to) {
      const body = {
        from: { email: this.fromEmail },
        to: [{ email: recipient }],
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
            content: base64Content,
            disposition: 'attachment',
          },
        ],
      };

      try {
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
          errors.push(`${recipient}: ${response.status} ${errorText}`);
          console.error(`[Email] Falha ao enviar para ${recipient}: ${response.status} ${errorText}`);
        } else {
          const messageId = response.headers.get('x-message-id') || 'N/A';
          console.log(`[Email] E-mail enviado para ${recipient}. messageId=${messageId}`);
        }
      } catch (err: any) {
        errors.push(`${recipient}: ${err.message}`);
        console.error(`[Email] Erro ao enviar para ${recipient}:`, err.message);
      }
    }

    if (errors.length > 0) {
      throw new Error(`Falha em ${errors.length}/${to.length} envios: ${errors.join('; ')}`);
    }

    console.log(`[Email] Todos os ${to.length} e-mails enviados com sucesso.`);
  }
}
