import { WhatsappService } from "./whatsapp.service";

/**
 * Cobre as duas correções da busca de grupos:
 * - `/groups` e `/chats` exigem `page`/`pageSize` (sem eles a Z-API volta vazio);
 * - listamos **todos** os grupos unindo `/groups` (nomes amigáveis) com `/chats`
 *   (cobertura completa), deduplicando por id.
 */
describe("WhatsappService.listGroups", () => {
  let service: WhatsappService;
  const fetchMock = jest.fn();

  beforeEach(() => {
    service = new WhatsappService();
    global.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockReset();
  });

  function okJson(body: unknown) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(""),
    } as Response);
  }

  function notOk(status: number) {
    return Promise.resolve({
      ok: false,
      status,
      text: () => Promise.resolve("erro"),
    } as Response);
  }

  it("envia page e pageSize na query (senao a Z-API volta vazio)", async () => {
    fetchMock
      .mockReturnValueOnce(okJson([{ phone: "123-group", name: "Equipe A" }])) // /groups
      .mockReturnValueOnce(okJson([])); // /chats

    const groups = await service.listGroups("inst", "tok", "ctok");

    expect(groups).toEqual([{ id: "123-group", name: "Equipe A" }]);
    const url0 = fetchMock.mock.calls[0][0] as string;
    expect(url0).toContain("/groups?");
    expect(url0).toContain("page=1");
    expect(url0).toContain("pageSize=100");
  });

  it("une /groups e /chats, deduplicando por id (nome do /groups vence)", async () => {
    fetchMock
      .mockReturnValueOnce(
        okJson([{ phone: "A-group", name: "Nome Amigavel A" }]),
      ) // /groups
      .mockReturnValueOnce(
        okJson([
          { phone: "A-group", name: "A-group", isGroup: true }, // duplicado (nome pior)
          { phone: "B-group", name: "Grupo B", isGroup: true }, // grupo novo (só em /chats)
          { phone: "5511", name: "Contato", isGroup: false }, // não-grupo → ignorado
        ]),
      ); // /chats

    const groups = await service.listGroups("inst", "tok");

    expect(groups).toEqual([
      { id: "A-group", name: "Nome Amigavel A" },
      { id: "B-group", name: "Grupo B" },
    ]);
    expect(fetchMock.mock.calls[0][0]).toContain("/groups?");
    expect(fetchMock.mock.calls[1][0]).toContain("/chats?");
  });

  it("mapeia phone→id e name; usa fallbacks quando faltam", async () => {
    fetchMock
      .mockReturnValueOnce(
        okJson([
          { phone: "111-group", subject: "Sem name mas com subject" },
          { id: "222-group" },
        ]),
      )
      .mockReturnValueOnce(okJson([]));

    const groups = await service.listGroups("inst", "tok");

    expect(groups[0]).toEqual({
      id: "111-group",
      name: "Sem name mas com subject",
    });
    expect(groups[1]).toEqual({ id: "222-group", name: "Sem nome" });
  });

  it("pagina /groups ate esgotar (pagina cheia -> proxima)", async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) => ({
      phone: `g${i}-group`,
      name: `Grupo ${i}`,
    }));
    fetchMock
      .mockReturnValueOnce(okJson(fullPage)) // /groups page 1 (cheia)
      .mockReturnValueOnce(okJson([{ phone: "last-group", name: "Ultimo" }])) // /groups page 2 (parcial)
      .mockReturnValueOnce(okJson([])); // /chats

    const groups = await service.listGroups("inst", "tok");

    expect(groups).toHaveLength(101);
    expect(fetchMock.mock.calls[1][0]).toContain("page=2");
    expect(fetchMock.mock.calls[2][0]).toContain("/chats?");
  });

  it("/groups vazio -> ainda lista grupos vindos de /chats", async () => {
    fetchMock
      .mockReturnValueOnce(okJson([])) // /groups
      .mockReturnValueOnce(
        okJson([
          { phone: "grp-group", name: "Equipe X", isGroup: true },
          { phone: "5511999", name: "Contato", isGroup: false },
        ]),
      ); // /chats

    const groups = await service.listGroups("inst", "tok");

    expect(groups).toEqual([{ id: "grp-group", name: "Equipe X" }]);
  });

  it("aceita resposta embrulhada ({ groups: [...] })", async () => {
    fetchMock
      .mockReturnValueOnce(
        okJson({ groups: [{ phone: "w-group", name: "Embrulhado" }] }),
      )
      .mockReturnValueOnce(okJson([]));

    const groups = await service.listGroups("inst", "tok");
    expect(groups).toEqual([{ id: "w-group", name: "Embrulhado" }]);
  });

  it("tudo vazio (/groups e /chats) -> lista vazia", async () => {
    fetchMock.mockReturnValueOnce(okJson([])).mockReturnValueOnce(okJson([]));
    const groups = await service.listGroups("inst", "tok");
    expect(groups).toEqual([]);
  });

  it("erro no /chats nao derruba a busca (usa so /groups)", async () => {
    fetchMock
      .mockReturnValueOnce(okJson([{ phone: "A-group", name: "A" }])) // /groups ok
      .mockReturnValueOnce(notOk(500)); // /chats falha

    const groups = await service.listGroups("inst", "tok");
    expect(groups).toEqual([{ id: "A-group", name: "A" }]);
  });

  it("erro no /groups (primario) propaga", async () => {
    fetchMock.mockReturnValueOnce(notOk(401));
    await expect(service.listGroups("inst", "tok")).rejects.toThrow(/Z-API 401/);
  });
});
