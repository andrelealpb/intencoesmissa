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
      .mockReturnValueOnce(okJson([{ phone: "A-group", name: "Nome Amigavel A" }])) // /groups p1
      .mockReturnValueOnce(okJson([])) // /groups p2 -> fim
      .mockReturnValueOnce(
        okJson([
          { phone: "A-group", name: "A-group", isGroup: true }, // duplicado (nome pior)
          { phone: "B-group", name: "Grupo B", isGroup: true }, // grupo novo (só em /chats)
          { phone: "5511", name: "Contato", isGroup: false }, // não-grupo → ignorado
        ]),
      ) // /chats p1
      .mockReturnValueOnce(okJson([])); // /chats p2 -> fim

    const groups = await service.listGroups("inst", "tok");

    expect(groups).toEqual([
      { id: "A-group", name: "Nome Amigavel A" },
      { id: "B-group", name: "Grupo B" },
    ]);
    expect(fetchMock.mock.calls[0][0]).toContain("/groups?");
    expect(fetchMock.mock.calls[2][0]).toContain("/chats?");
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

  it("pagina ate vir vazio — NAO para numa pagina parcial (pageSize capado)", async () => {
    const page = (prefix: string, n: number) =>
      Array.from({ length: n }, (_, i) => ({
        phone: `${prefix}${i}-group`,
        name: `Grupo ${prefix}${i}`,
      }));
    fetchMock
      .mockReturnValueOnce(okJson(page("a", 50))) // /groups p1: parcial (50<100) mas NAO deve parar
      .mockReturnValueOnce(okJson(page("b", 30))) // /groups p2: mais grupos
      .mockReturnValueOnce(okJson([])) // /groups p3: vazio -> fim
      .mockReturnValueOnce(okJson([])); // /chats

    const groups = await service.listGroups("inst", "tok");

    // Se parasse na 1a pagina parcial, traria só 50. Robustez => 80.
    expect(groups).toHaveLength(80);
    expect(fetchMock.mock.calls[1][0]).toContain("page=2");
    expect(fetchMock.mock.calls[2][0]).toContain("page=3");
  });

  it("para quando a Z-API ignora a paginacao (so itens repetidos)", async () => {
    const same = [
      { phone: "A-group", name: "A" },
      { phone: "B-group", name: "B" },
    ];
    fetchMock
      .mockReturnValueOnce(okJson(same)) // /groups p1
      .mockReturnValueOnce(okJson(same)) // /groups p2: mesmos ids -> para
      .mockReturnValueOnce(okJson([])); // /chats

    const groups = await service.listGroups("inst", "tok");

    expect(groups).toEqual([
      { id: "A-group", name: "A" },
      { id: "B-group", name: "B" },
    ]);
    // 2 chamadas em /groups (p1 e p2 que revelou repeticao) + 1 em /chats.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("/groups vazio -> ainda lista grupos vindos de /chats", async () => {
    fetchMock
      .mockReturnValueOnce(okJson([])) // /groups p1 vazio -> fim
      .mockReturnValueOnce(
        okJson([
          { phone: "grp-group", name: "Equipe X", isGroup: true },
          { phone: "5511999", name: "Contato", isGroup: false },
        ]),
      ) // /chats p1
      .mockReturnValueOnce(okJson([])); // /chats p2 -> fim

    const groups = await service.listGroups("inst", "tok");

    expect(groups).toEqual([{ id: "grp-group", name: "Equipe X" }]);
  });

  it("enriquece o nome via group-metadata quando o grupo vem sem nome amigavel", async () => {
    fetchMock
      .mockReturnValueOnce(okJson([])) // /groups p1 vazio
      .mockReturnValueOnce(
        okJson([{ phone: "120363-group", name: "120363-group", isGroup: true }]),
      ) // /chats p1: name == id (sem nome amigável)
      .mockReturnValueOnce(okJson([])) // /chats p2 -> fim
      .mockReturnValueOnce(okJson({ subject: "Liturgia Missa das 11h" })); // group-metadata

    const groups = await service.listGroups("inst", "tok");

    expect(groups).toEqual([
      { id: "120363-group", name: "Liturgia Missa das 11h" },
    ]);
    const metaCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes("group-metadata"),
    );
    expect(metaCall).toBeTruthy();
    expect(String(metaCall?.[0])).toContain("120363-group");
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
      .mockReturnValueOnce(okJson([{ phone: "A-group", name: "A" }])) // /groups p1
      .mockReturnValueOnce(okJson([])) // /groups p2 -> fim
      .mockReturnValueOnce(notOk(500)); // /chats falha -> best-effort

    const groups = await service.listGroups("inst", "tok");
    expect(groups).toEqual([{ id: "A-group", name: "A" }]);
  });

  it("erro no /groups (primario) propaga", async () => {
    fetchMock.mockReturnValueOnce(notOk(401));
    await expect(service.listGroups("inst", "tok")).rejects.toThrow(/Z-API 401/);
  });
});
