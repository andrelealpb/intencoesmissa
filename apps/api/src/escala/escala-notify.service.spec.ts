import { Test, TestingModule } from "@nestjs/testing";
import type { Member, Parish } from "@prisma/client";
import { EscalaNotifyService } from "./escala-notify.service";
import { WhatsappService } from "../admin/whatsapp.service";

const mockWhatsapp = { sendText: jest.fn() };

function parish(overrides: Partial<Parish> = {}): Parish {
  return {
    id: "p1",
    slug: "par",
    parishName: "Paroquia Teste",
    zapiInstanceId: "inst",
    zapiToken: "tok",
    zapiClientToken: null,
    ...overrides,
  } as Parish;
}

function member(overrides: Partial<Member> = {}): Member {
  return {
    id: "m1",
    parishId: "p1",
    fullName: "Joao",
    phone: "(11) 90000-0000",
    ...overrides,
  } as Member;
}

describe("EscalaNotifyService", () => {
  let service: EscalaNotifyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EscalaNotifyService,
        { provide: WhatsappService, useValue: mockWhatsapp },
      ],
    }).compile();
    service = module.get<EscalaNotifyService>(EscalaNotifyService);
  });

  afterEach(() => jest.clearAllMocks());

  describe("sendTeamInvite", () => {
    it("envia 1 mensagem com o link do portal (sem OTP)", async () => {
      await service.sendTeamInvite(parish(), member(), "Coroinhas");
      expect(mockWhatsapp.sendText).toHaveBeenCalledTimes(1);
      const msg = mockWhatsapp.sendText.mock.calls[0][3] as string;
      expect(msg).toContain("/p/par/escala/entrar");
      expect(msg).toContain("Coroinhas");
      // O link não carrega token de OTP.
      expect(msg).not.toContain("token=");
    });

    it("sem Z-API na paroquia: nao envia, nao lanca", async () => {
      await expect(
        service.sendTeamInvite(
          parish({ zapiInstanceId: null, zapiToken: null }),
          member(),
          "Coroinhas",
        ),
      ).resolves.toBeUndefined();
      expect(mockWhatsapp.sendText).not.toHaveBeenCalled();
    });

    it("membro sem telefone: nao envia, nao lanca", async () => {
      await service.sendTeamInvite(parish(), member({ phone: "" }), "Coroinhas");
      expect(mockWhatsapp.sendText).not.toHaveBeenCalled();
    });

    it("falha de envio: degradacao graciosa (nao propaga)", async () => {
      mockWhatsapp.sendText.mockRejectedValueOnce(new Error("z-api down"));
      await expect(
        service.sendTeamInvite(parish(), member(), "Coroinhas"),
      ).resolves.toBeUndefined();
    });
  });

  describe("sendGroupConvocation", () => {
    it("envia ao grupo com o mes e o link (lanca em falha)", async () => {
      await service.sendGroupConvocation(parish(), "g-1", "agosto de 2026", "25/08");
      expect(mockWhatsapp.sendText).toHaveBeenCalledTimes(1);
      const [, , phone, msg] = mockWhatsapp.sendText.mock.calls[0];
      expect(phone).toBe("g-1");
      expect(msg).toContain("agosto de 2026");
      expect(msg).toContain("25/08");
      expect(msg).toContain("/p/par/escala/entrar");
    });

    it("propaga erro de envio (caller compoe o resumo)", async () => {
      mockWhatsapp.sendText.mockRejectedValueOnce(new Error("500"));
      await expect(
        service.sendGroupConvocation(parish(), "g-1", "agosto de 2026"),
      ).rejects.toThrow();
    });
  });
});
