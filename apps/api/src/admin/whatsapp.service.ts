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
   *
   * Robusto às armadilhas da Z-API:
   * 1. Os endpoints de listagem **exigem** `page`/`pageSize`; sem eles a API
   *    responde 200 com lista **vazia**. Paginamos até esgotar (teto de segurança).
   * 2. O endpoint dedicado `/groups` costuma trazer **só um subconjunto** (os
   *    grupos "salvos"/recentes). Para listar **todos**, unimos com `/chats`
   *    filtrando `isGroup` — lá aparecem todos os grupos de que o número participa.
   * O `/groups` tem prioridade no nome (mais amigável); a união deduplica por id.
   * Também normaliza a resposta: array direto ou embrulhado (`{groups|chats|...}`).
   */
  async listGroups(
    instanceId: string,
    token: string,
    clientToken?: string | null,
  ): Promise<Array<{ id: string; name: string }>> {
    // 1. Endpoint dedicado (nomes amigáveis). É o primário — se falhar, propaga.
    const fromGroups = await this.fetchZapiPaged(
      instanceId,
      token,
      "groups",
      clientToken,
    );

    // 2. Chats como cobertura complementar (best-effort: se o plano/endpoint
    //    não suportar, seguimos só com /groups em vez de derrubar a busca).
    let fromChats: Array<Record<string, any>> = [];
    try {
      fromChats = await this.fetchZapiPaged(
        instanceId,
        token,
        "chats",
        clientToken,
      );
    } catch {
      fromChats = [];
    }

    // União deduplicada por id. `/groups` entra primeiro (nome amigável vence).
    const byId = new Map<string, { id: string; name: string }>();
    for (const g of fromGroups) {
      const opt = this.toGroupOption(g);
      if (opt.id && !byId.has(opt.id)) byId.set(opt.id, opt);
    }
    for (const c of fromChats) {
      const isGroup =
        c.isGroup === true || String(c.phone ?? "").includes("-group");
      if (!isGroup) continue;
      const opt = this.toGroupOption(c);
      if (opt.id && !byId.has(opt.id)) byId.set(opt.id, opt);
    }

    return [...byId.values()];
  }

  /** Normaliza um item de grupo/chat da Z-API para `{ id, name }`. */
  private toGroupOption(g: Record<string, any>): { id: string; name: string } {
    const id = g.phone || g.id || g.groupId || "";
    return { id, name: g.name || g.subject || g.phone || "Sem nome" };
  }

  /**
   * Busca paginada de um recurso Z-API que devolve lista. Envia `page`/`pageSize`
   * (obrigatórios) e acumula até uma página vir vazia ou parcial. Aceita resposta
   * em array direto ou embrulhada em `{ groups | chats | value | data | result }`.
   */
  private async fetchZapiPaged(
    instanceId: string,
    token: string,
    resource: "groups" | "chats",
    clientToken?: string | null,
  ): Promise<Array<Record<string, any>>> {
    const pageSize = 100;
    const maxPages = 20; // teto de segurança (até 2000 itens)
    const all: Array<Record<string, any>> = [];

    for (let page = 1; page <= maxPages; page++) {
      const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/${resource}?page=${page}&pageSize=${pageSize}`;

      const response = await fetch(url, {
        method: "GET",
        headers: this.getHeaders(clientToken),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Z-API ${response.status}: ${errorText}`);
      }

      const items = this.asArray(await response.json());
      if (items.length === 0) break;

      all.push(...items);
      if (items.length < pageSize) break; // última página
    }

    return all;
  }

  /** Extrai um array da resposta: array direto ou embrulhado numa chave comum. */
  private asArray(body: unknown): Array<Record<string, any>> {
    if (Array.isArray(body)) return body as Array<Record<string, any>>;
    if (body && typeof body === "object") {
      for (const key of ["groups", "chats", "value", "data", "result"]) {
        const nested = (body as Record<string, unknown>)[key];
        if (Array.isArray(nested)) return nested as Array<Record<string, any>>;
      }
    }
    return [];
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
