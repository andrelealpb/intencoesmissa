import { Injectable, Logger } from "@nestjs/common";
import type { Member, Parish } from "@prisma/client";
import { WhatsappService } from "../admin/whatsapp.service";
import { memberAuthConfig } from "./auth/member-auth.config";

/**
 * Entrega das mensagens de **convite** e **convocação** do módulo Escala (S6.5),
 * reusando o serviço de entrega Z-API da S5 (`WhatsappService`, credenciais por
 * paróquia). Todas as mensagens levam o **link do portal** (`/p/{slug}/escala/entrar`)
 * — o membro pede o código lá; **nunca** embutimos OTP no convite/convocação.
 *
 * - `sendTeamInvite`: 1 mensagem individual ao membro ao ser vinculado a uma
 *   equipe (C1). **Degradação graciosa** no padrão do sistema: sem Z-API, sem
 *   telefone, ou falha de envio → apenas loga, nunca lança (o cadastro conclui).
 * - `sendGroupConvocation`: 1 mensagem ao grupo de WhatsApp da equipe (C2).
 *   Lança em caso de falha real de envio — o `ConvocationService` captura por
 *   equipe para compor o resumo, sem derrubar as outras equipes.
 *
 * Nota R1: são disparos de baixo volume (1 por ação humana / 1 por equipe, nunca
 * 1 por pessoa em lote). Ainda é Z-API (WhatsApp não-oficial); a saída definitiva
 * para notificação individual recorrente é a Cloud API oficial (registrado no R1).
 */
@Injectable()
export class EscalaNotifyService {
  private readonly logger = new Logger(EscalaNotifyService.name);

  constructor(private whatsapp: WhatsappService) {}

  /**
   * Convite individual (C1): informa o membro de que foi incluído numa equipe e
   * aponta o portal para informar disponibilidade. Nunca lança — o convite é
   * acessório, não pré-requisito do cadastro.
   */
  async sendTeamInvite(
    parish: Parish,
    member: Member,
    teamName: string,
  ): Promise<void> {
    if (!this.zapiReady(parish)) {
      this.logger.warn(
        `Convite nao enviado (Z-API nao configurada): member=${member.id} parish=${parish.id}`,
      );
      return;
    }
    if (!member.phone) {
      this.logger.warn(
        `Convite nao enviado (membro sem telefone): member=${member.id}`,
      );
      return;
    }

    const link = this.portalUrl(parish.slug);
    const message =
      `Voce foi incluido(a) na equipe ${teamName} da ${parish.parishName}.\n` +
      `Informe quando pode servir: ${link}`;

    try {
      await this.whatsapp.sendText(
        parish.zapiInstanceId as string,
        parish.zapiToken as string,
        member.phone,
        message,
        parish.zapiClientToken,
      );
      this.logger.log(`Convite enviado por WhatsApp para member=${member.id}`);
    } catch (err) {
      // Degradação graciosa: falha de envio nunca quebra o cadastro nem vaza.
      this.logger.error(
        `Falha ao enviar convite (member=${member.id}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Convocação de grupo (C2): 1 mensagem ao `whatsappGroupId` da equipe avisando
   * que a escala do mês está aberta. Lança em falha de envio (o chamador captura
   * por equipe). O caller garante que `groupId` e a Z-API existem antes.
   */
  async sendGroupConvocation(
    parish: Parish,
    groupId: string,
    monthLabel: string,
    deadline?: string,
  ): Promise<void> {
    const link = this.portalUrl(parish.slug);
    const prazo = deadline ? ` ate ${deadline}` : "";
    const message =
      `A escala de ${monthLabel} esta aberta. ` +
      `Informe sua disponibilidade${prazo} em: ${link}`;

    await this.whatsapp.sendText(
      parish.zapiInstanceId as string,
      parish.zapiToken as string,
      groupId,
      message,
      parish.zapiClientToken,
    );
  }

  /**
   * Aviso de RECUSA ao coordenador (S9/L4): um membro recusou uma escala
   * publicada → a vaga reabre como lacuna na tela do coordenador (S8) e o grupo
   * da equipe é avisado. **Nunca lança** (degradação graciosa) — o indicador na
   * tela da S8 é o canal primário; a mensagem é o reforço. **Não** re-escala.
   *
   * Enviamos ao `whatsappGroupId` da equipe (onde o coordenador está). Sem grupo
   * ou sem Z-API → apenas loga; a lacuna na tela já sinaliza a mudança.
   */
  async sendDeclineNotice(
    parish: Parish,
    team: { name: string; whatsappGroupId: string | null },
    memberName: string,
    occurrenceLabel: string,
    functionName: string,
  ): Promise<void> {
    if (!this.zapiReady(parish) || !team.whatsappGroupId) {
      this.logger.warn(
        `Recusa nao notificada por WhatsApp (sem Z-API/grupo): team=${team.name} parish=${parish.id}`,
      );
      return;
    }

    const message =
      `${memberName} recusou a escala de ${occurrenceLabel} (${functionName}) ` +
      `na equipe ${team.name}. A vaga foi reaberta — verifique na montagem da escala.`;

    try {
      await this.whatsapp.sendText(
        parish.zapiInstanceId as string,
        parish.zapiToken as string,
        team.whatsappGroupId,
        message,
        parish.zapiClientToken,
      );
      this.logger.log(`Aviso de recusa enviado ao grupo da equipe ${team.name}`);
    } catch (err) {
      this.logger.error(
        `Falha ao avisar recusa (team=${team.name}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /** A paróquia tem credenciais Z-API mínimas para enviar? */
  zapiReady(parish: Parish): boolean {
    return Boolean(parish.zapiInstanceId && parish.zapiToken);
  }

  /** URL do portal do membro (sem token — o membro pede o código lá). */
  private portalUrl(slug: string): string {
    const base = memberAuthConfig.portalUrl.replace(/\/+$/, "");
    return `${base}/p/${slug}/escala/entrar`;
  }
}
