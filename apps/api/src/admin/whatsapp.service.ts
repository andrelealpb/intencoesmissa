import { Injectable, Logger } from "@nestjs/common";

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  private getHeaders(clientToken?: string | null): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (clientToken) {
      headers["Client-Token"] = clientToken;
    }
    return headers;
  }

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
    clientToken?: string | null,
  ): Promise<void> {
    const base64 = pdfBuffer.toString("base64");
    const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-document/pdf`;

    const body = {
      phone: this.formatPhone(phone),
      document: `data:application/pdf;base64,${base64}`,
      fileName,
      caption: caption || "",
    };

    this.logger.log(`Enviando documento para ${phone} via Z-API`);

    const response = await fetch(url, {
      method: "POST",
      headers: this.getHeaders(clientToken),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Z-API ${response.status}: ${errorText}`);
    }

    this.logger.log(`Documento enviado para ${phone}`);
  }

  /**
   * Send a text message via WhatsApp using Z-API.
   */
  async sendText(
    instanceId: string,
    token: string,
    phone: string,
    message: string,
    clientToken?: string | null,
  ): Promise<void> {
    const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;

    const body = {
      phone: this.formatPhone(phone),
      message,
    };

    this.logger.log(`Enviando texto para ${phone} via Z-API`);

    const response = await fetch(url, {
      method: "POST",
      headers: this.getHeaders(clientToken),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Z-API ${response.status}: ${errorText}`);
    }

    this.logger.log(`Texto enviado para ${phone}`);
  }

  /**
   * Check Z-API instance connection status.
   */
  async getStatus(
    instanceId: string,
    token: string,
    clientToken?: string | null,
  ): Promise<{ connected: boolean; phone?: string }> {
    const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/status`;

    const response = await fetch(url, {
      method: "GET",
      headers: this.getHeaders(clientToken),
    });

    if (!response.ok) {
      return { connected: false };
    }

    const data = (await response.json()) as {
      connected?: boolean;
      smartphoneConnected?: boolean;
      phone?: string;
    };

    const isConnected = data.connected === true || data.smartphoneConnected === true;
    let phone = data.phone;

    // If connected but no phone in status, try dedicated endpoints
    if (isConnected && !phone) {
      const phoneEndpoints = ['get-phone-number', 'phone'];
      for (const ep of phoneEndpoints) {
        try {
          const phoneUrl = `https://api.z-api.io/instances/${instanceId}/token/${token}/${ep}`;
          const phoneRes = await fetch(phoneUrl, {
            method: "GET",
            headers: this.getHeaders(clientToken),
          });
          if (phoneRes.ok) {
            const phoneData = (await phoneRes.json()) as Record<string, any>;
            phone = phoneData.phone || phoneData.number || phoneData.value;
            if (phone) break;
          }
        } catch {
          // Ignore — phone is optional
        }
      }
    }

    return { connected: isConnected, phone };
  }

  /**
   * List all WhatsApp groups for the connected instance.
   */
  async listGroups(
    instanceId: string,
    token: string,
    clientToken?: string | null,
  ): Promise<Array<{ id: string; name: string }>> {
    const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/groups`;

    const response = await fetch(url, {
      method: "GET",
      headers: this.getHeaders(clientToken),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Z-API ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as Array<Record<string, any>>;
    return data.map((g) => ({
      id: g.phone || g.id || g.groupId,
      name: g.name || g.subject || g.phone || 'Sem nome',
    }));
  }

  /**
   * Format phone number: remove non-digits, ensure country code.
   */
  private formatPhone(phone: string): string {
    // Group IDs contain "-group" suffix — pass through as-is
    if (phone.includes("-group") || phone.includes("-")) {
      return phone;
    }
    const digits = phone.replace(/\D/g, "");
    if (digits.startsWith("55") && digits.length >= 12) {
      return digits;
    }
    return `55${digits}`;
  }
}
