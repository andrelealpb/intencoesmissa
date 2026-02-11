export class EmailService {
  private apiKey: string | null;
  private fromEmail: string;
  private fromName: string;

  constructor() {
    this.apiKey = process.env.BREVO_API_KEY || null;
    this.fromEmail = process.env.SMTP_FROM || 'noreply@missas.app';
    this.fromName = process.env.SMTP_FROM_NAME || 'Intencoes de Missa';

    if (this.apiKey) {
      console.log(`[Email] Brevo API configurada. from=${this.fromName} <${this.fromEmail}>`);
    } else {
      console.warn('[Email] BREVO_API_KEY nao configurado. Envio de e-mail desabilitado.');
    }
  }

  async sendDispatchEmail(
    to: string[],
    subject: string,
    pdfBuffer: Buffer,
    pdfFilename: string,
  ): Promise<void> {
    if (!this.apiKey) {
      console.warn(`[Email] E-mail desabilitado, ignorando envio para: ${to.join(', ')}`);
      return;
    }

    console.log(`[Email] Enviando via Brevo API: to=${to.join(', ')} subject="${subject}"`);

    const body = {
      sender: { name: this.fromName, email: this.fromEmail },
      to: to.map((email) => ({ email })),
      subject,
      textContent: 'Segue em anexo o PDF com as intencoes da Santa Missa.',
      htmlContent: `
        <p>Prezado(a),</p>
        <p>Segue em anexo o PDF com as inten&ccedil;&otilde;es da Santa Missa.</p>
        <p>Este &eacute; um envio autom&aacute;tico. Por favor, n&atilde;o responda a este e-mail.</p>
      `,
      attachment: [
        {
          name: pdfFilename,
          content: pdfBuffer.toString('base64'),
        },
      ],
    };

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': this.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Brevo API ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    const messageId = result.messageId || 'N/A';
    console.log(`[Email] E-mail enviado com sucesso. messageId=${messageId}`);
  }
}
