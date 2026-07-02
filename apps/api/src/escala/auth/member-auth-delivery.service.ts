import { Injectable, Logger } from "@nestjs/common";
import type { Member, Parish } from "@prisma/client";
import { WhatsappService } from "../../admin/whatsapp.service";
import { EmailService } from "../../admin/email.service";
import { MemberAuthTokenService } from "./member-auth-token.service";
import { memberAuthConfig } from "./member-auth.config";

export type DeliveryChannel = "whatsapp" | "email";

/**
 * Entrega das mensagens de auth do membro (S5), reusando os serviços do sistema
 * (Z-API por paróquia; Brevo p/ e-mail). **Degradação graciosa** no padrão do
 * sistema: loga e segue, nunca lança para o response (anti-enumeração).
 *
 * - OTP → WhatsApp. Se a paróquia não tem Z-API **e** o membro tem e-mail →
 *   cai para link mágico por e-mail. Se nada é entregável, apenas loga.
 * - Link mágico → e-mail, com URL do portal do membro.
 *
 * Nota R1: envio transacional iniciado pelo usuário (1 por request), volume
 * baixo — distinto do disparo em massa de lembretes (S9).
 */
@Injectable()
export class MemberAuthDeliveryService {
  private readonly logger = new Logger(MemberAuthDeliveryService.name);

  constructor(
    private whatsapp: WhatsappService,
    private email: EmailService,
    private tokens: MemberAuthTokenService,
  ) {}

  /**
   * Decide canal e entrega. Preferência: `channel` explícito; senão telefone →
   * WhatsApp/OTP, com fallback para e-mail/link. Sempre resolve sem lançar.
   */
  async deliver(
    parish: Parish,
    member: Member,
    channel?: DeliveryChannel,
  ): Promise<void> {
    const zapiReady = Boolean(parish.zapiInstanceId && parish.zapiToken);
    const wantsEmail = channel === "email";
    const canWhatsapp = !wantsEmail && zapiReady && Boolean(member.phone);
    const canEmail = Boolean(member.email);

    try {
      if (canWhatsapp) {
        await this.sendOtp(parish, member);
        return;
      }
      // Sem WhatsApp (ou canal e-mail pedido): cai para link mágico por e-mail.
      if (canEmail) {
        await this.sendMagicLink(parish, member);
        return;
      }
      // WhatsApp indisponível e sem e-mail: nada entregável.
      this.logger.warn(
        `Nenhum canal entregavel para member=${member.id} (parish=${parish.id}).`,
      );
    } catch (err) {
      // Degradação graciosa: nunca vaza no response.
      this.logger.error(
        `Falha ao entregar auth de membro (member=${member.id}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async sendOtp(parish: Parish, member: Member): Promise<void> {
    const { raw } = await this.tokens.issueOtp(parish.id, member.id);
    const message =
      `Seu codigo de acesso a escala (${parish.parishName}): ${raw}\n` +
      `Valido por ${memberAuthConfig.otpTtlMin} minutos. Nao compartilhe.`;
    await this.whatsapp.sendText(
      parish.zapiInstanceId as string,
      parish.zapiToken as string,
      member.phone,
      message,
      parish.zapiClientToken,
    );
    this.logger.log(`OTP enviado por WhatsApp para member=${member.id}`);
  }

  private async sendMagicLink(parish: Parish, member: Member): Promise<void> {
    const { raw } = await this.tokens.issueMagicLink(parish.id, member.id);
    const url = this.buildMagicUrl(parish.slug, raw);
    await this.email.sendMemberAuthLink(member.email as string, parish.parishName, url);
    this.logger.log(`Link magico enviado por e-mail para member=${member.id}`);
  }

  private buildMagicUrl(slug: string, rawToken: string): string {
    const base = memberAuthConfig.portalUrl.replace(/\/+$/, "");
    return `${base}/p/${slug}/escala/entrar?token=${encodeURIComponent(rawToken)}`;
  }
}
