import { WhatsappService } from "./whatsapp.service";

/**
 * Regression: o endpoint `/groups` da Z-API exige `page`/`pageSize`. Sem eles
 * a API devolve lista vazia — o bug que impedia a busca de grupos no admin.
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

  it("envia page e pageSize na query (senao a Z-API volta vazio)", async () => {
    fetchMock.mockReturnValueOnce(
      okJson([{ phone: "123-group", name: "Equipe A" }]),
    );

    const groups = await service.listGroups("inst", "tok", "ctok");

    expect(groups).toEqual([{ id: "123-group", name: "Equipe A" }]);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/groups?");
    expect(calledUrl).toContain("page=1");
    expect(calledUrl).toContain("pageSize=100");
  });

  it("mapeia phone→id e name; usa fallbacks quando faltam", async () => {
    fetchMock.mockReturnValueOnce(
      okJson([
        { phone: "111-group", subject: "Sem name mas com subject" },
        { id: "222-group" },
      ]),
    );

    const groups = await service.listGroups("inst", "tok");

    expect(groups[0]).toEqual({
      id: "111-group",
      name: "Sem name mas com subject",
    });
    // Sem name/subject/phone → cai no rotulo generico.
    expect(groups[1]).toEqual({ id: "222-group", name: "Sem nome" });
  });

  it("pagina ate esgotar (pagina cheia -> busca a proxima)", async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) => ({
      phone: `g${i}-group`,
      name: `Grupo ${i}`,
    }));
    fetchMock
      .mockReturnValueOnce(okJson(fullPage)) // pagina 1 cheia
      .mockReturnValueOnce(okJson([{ phone: "last-group", name: "Ultimo" }])); // pagina 2 parcial

    const groups = await service.listGroups("inst", "tok");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(groups).toHaveLength(101);
    expect((fetchMock.mock.calls[1][0] as string)).toContain("page=2");
  });

  it("para na primeira pagina vazia", async () => {
    fetchMock.mockReturnValueOnce(okJson([]));
    const groups = await service.listGroups("inst", "tok");
    expect(groups).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("lanca em resposta nao-ok", async () => {
    fetchMock.mockReturnValueOnce(
      Promise.resolve({
        ok: false,
        status: 401,
        text: () => Promise.resolve("unauthorized"),
      } as Response),
    );
    await expect(service.listGroups("inst", "tok")).rejects.toThrow(/Z-API 401/);
  });
});
