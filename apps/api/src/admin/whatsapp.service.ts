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
    const chatGroups = fromChats.filter(
      (c) => c.isGroup === true || String(c.phone ?? "").includes("-group"),
    );
    for (const c of chatGroups) {
      const opt = this.toGroupOption(c);
      if (opt.id && !byId.has(opt.id)) byId.set(opt.id, opt);
    }

    // O nome é o que identifica o grupo. Alguns vêm sem nome amigável (ex.: do
    // /chats, onde o `name` do grupo costuma ser o próprio id). Busca o `subject`
    // real via group-metadata — em paralelo, best-effort e com teto de latência.
    const semNome = [...byId.values()].filter((g) => this.nomeEhId(g));
    const MAX_ENRICH = 30;
    await Promise.all(
      semNome.slice(0, MAX_ENRICH).map(async (g) => {
        const subject = await this.fetchGroupSubject(
          instanceId,
          token,
          g.id,
          clientToken,
        );
        if (subject) byId.set(g.id, { id: g.id, name: subject });
      }),
    );

    // Diagnóstico (aparece nos logs da API): de onde vieram os grupos.
    this.logger.log(
      `listGroups: /groups=${fromGroups.length} /chats(total)=${fromChats.length} ` +
        `/chats(grupos)=${chatGroups.length} sem-nome=${semNome.length} total=${byId.size}`,
    );

    return [...byId.values()];
  }

  /** Normaliza um item de grupo/chat da Z-API para `{ id, name }`. */
  private toGroupOption(g: Record<string, any>): { id: string; name: string } {
    const id = g.phone || g.id || g.groupId || "";
    return { id, name: g.name || g.subject || g.phone || "Sem nome" };
  }

  /** O "nome" é na verdade o id/placeholder (grupo sem nome amigável)? */
  private nomeEhId(g: { id: string; name: string }): boolean {
    const n = (g.name ?? "").trim();
    return (
      n === "" ||
      n === "Sem nome" ||
      n === g.id ||
      /(-group$|@g\.us$)/.test(n) ||
      /^\d{10,}$/.test(n)
    );
  }

  /**
   * Busca o nome real (`subject`) de um grupo via group-metadata. Best-effort:
   * qualquer falha devolve `null` (o chamador mantém o nome que já tinha).
   */
  private async fetchGroupSubject(
    instanceId: string,
    token: string,
    groupId: string,
    clientToken?: string | null,
  ): Promise<string | null> {
    try {
      const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/group-metadata/${encodeURIComponent(
        groupId,
      )}`;
      const response = await fetch(url, {
        method: "GET",
        headers: this.getHeaders(clientToken),
      });
      if (!response.ok) return null;
      const data = (await response.json()) as { subject?: string };
      const subject = typeof data?.subject === "string" ? data.subject.trim() : "";
      return subject || null;
    } catch {
      return null;
    }
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
    const maxPages = 40; // teto de segurança (até 4000 itens)
    const all: Array<Record<string, any>> = [];
    const seen = new Set<string>();

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
      if (items.length === 0) break; // esgotou

      // NÃO paramos por `items.length < pageSize`: a Z-API pode limitar o
      // pageSize server-side (devolve menos do que pedimos), e parar aí cortaria
      // grupos. Avançamos as páginas até vir vazio OU não haver item novo
      // (protege contra paginação ignorada, que devolveria sempre a 1ª página).
      let added = 0;
      for (const it of items) {
        const key = String(it.phone ?? it.id ?? it.groupId ?? "");
        if (key && seen.has(key)) continue;
        if (key) seen.add(key);
        all.push(it);
        added++;
      }
      if (added === 0) break;
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
