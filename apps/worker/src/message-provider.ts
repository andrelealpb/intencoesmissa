import { WhatsappService } from './whatsapp.service';

/**
 * Interface de PROVEDOR de mensagem (S9 — L6/R1).
 *
 * A lógica de lembrete (quem recebe, quando, dedupe) depende **só** desta
 * interface, nunca da Z-API diretamente. Trocar a implementação (Z-API →
 * WhatsApp Cloud API oficial) é injetar outra classe no `main.ts` — sem tocar no
 * `ReminderService`. Isso é a mitigação estrutural do R1: o lembrete individual
 * em massa é o primeiro candidato a migrar para a API oficial da Meta.
 *
 * O alvo carrega as credenciais Z-API **por paróquia** (mesmo modelo do
 * despacho das Intenções): o provedor é um singleton, o alvo é por envio.
 */
export interface MessageTarget {
  /** Credenciais Z-API da paróquia (ou o que o provedor futuro exigir). */
  instanceId: string;
  token: string;
  clientToken?: string | null;
  /** Telefone do membro OU id do grupo de WhatsApp da equipe. */
  to: string;
}

export interface MessageProvider {
  /** Nome do provedor, para log/telemetria (ex.: "z-api", "cloud-api"). */
  readonly name: string;
  /** Envia uma mensagem de texto. Lança em falha real (o chamador degrada). */
  sendText(target: MessageTarget, message: string): Promise<void>;
}

/**
 * Implementação ATUAL sobre a Z-API (WhatsApp não-oficial), reusando o
 * `WhatsappService` já usado pelo despacho das Intenções. É só a implementação
 * corrente — a interface acima é o ponto de troca.
 */
export class ZapiMessageProvider implements MessageProvider {
  readonly name = 'z-api';

  constructor(private whatsapp: WhatsappService) {}

  async sendText(target: MessageTarget, message: string): Promise<void> {
    await this.whatsapp.sendText(
      target.instanceId,
      target.token,
      target.to,
      message,
      target.clientToken,
    );
  }
}
