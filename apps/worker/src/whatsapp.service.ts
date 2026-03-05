export class WhatsappService {
  /**
   * Send a PDF document via WhatsApp using Z-API.
   */
  async sendDocument(
    instanceId: string,
    token: string,
    phone: string,
    pdfBuffer: Buffer,
    fileName: string,
    caption?: string,
  ): Promise<void> {
    const base64 = pdfBuffer.toString('base64');
    const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-document/pdf`;

    const body = {
      phone: this.formatPhone(phone),
      document: `data:application/pdf;base64,${base64}`,
      fileName,
      caption: caption || '',
    };

    console.log(`[WhatsApp] Enviando documento para ${phone} via Z-API`);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Z-API ${response.status}: ${errorText}`);
    }

    console.log(`[WhatsApp] Documento enviado para ${phone}`);
  }

  /**
   * Send a text message via WhatsApp using Z-API.
   */
  async sendText(
    instanceId: string,
    token: string,
    phone: string,
    message: string,
  ): Promise<void> {
    const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;

    const body = {
      phone: this.formatPhone(phone),
      message,
    };

    console.log(`[WhatsApp] Enviando texto para ${phone} via Z-API`);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Z-API ${response.status}: ${errorText}`);
    }

    console.log(`[WhatsApp] Texto enviado para ${phone}`);
  }

  /**
   * Check Z-API instance connection status.
   */
  async getStatus(instanceId: string, token: string): Promise<{ connected: boolean; phone?: string }> {
    const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/status`;

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      return { connected: false };
    }

    const data = (await response.json()) as { connected?: boolean; smartphoneConnected?: boolean; phone?: string };
    return {
      connected: data.connected === true || data.smartphoneConnected === true,
      phone: data.phone,
    };
  }

  /**
   * Format phone number: remove non-digits, ensure country code.
   */
  private formatPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    // If starts with 55 (Brazil), use as-is; otherwise prepend 55
    if (digits.startsWith('55') && digits.length >= 12) {
      return digits;
    }
    return `55${digits}`;
  }
}
