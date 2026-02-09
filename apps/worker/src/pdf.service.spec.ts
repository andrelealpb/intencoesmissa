import { PdfService } from "./pdf.service";

describe("PdfService", () => {
  let service: PdfService;

  beforeEach(() => {
    service = new PdfService();
  });

  describe("generatePdf", () => {
    it("should generate a non-empty PDF buffer", async () => {
      const pdfData = {
        parishName: "Paroquia Sant'Anna",
        massDate: "2026-02-09",
        massTime: "08:00",
        logoBuffer: null,
        intentions: {
          SUFRAGIO: [
            {
              id: "i1",
              group: "SUFRAGIO" as const,
              deceasedName: "Joao da Silva",
              familyNames: "Familia Silva",
              complement: null,
              notes: null,
              intentionType: { name: "Missa de 7o dia", group: "SUFRAGIO" as const },
            },
          ],
          SUPLICAS: [],
          ACAO_DE_GRACAS: [],
        },
      };

      const buffer = await service.generatePdf(pdfData);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
      // PDF starts with %PDF
      expect(buffer.toString("utf-8", 0, 5)).toContain("%PDF");
    });

    it("should generate a PDF with consolidated (no massTime)", async () => {
      const pdfData = {
        parishName: "Paroquia Test",
        massDate: "2026-02-09",
        massTime: null,
        logoBuffer: null,
        intentions: {
          SUFRAGIO: [],
          SUPLICAS: [
            {
              id: "i2",
              group: "SUPLICAS" as const,
              deceasedName: null,
              familyNames: null,
              complement: "Pela saude da familia",
              notes: null,
              intentionType: { name: "Suplica", group: "SUPLICAS" as const },
            },
          ],
          ACAO_DE_GRACAS: [],
        },
      };

      const buffer = await service.generatePdf(pdfData);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it("should handle empty intentions gracefully", async () => {
      const pdfData = {
        parishName: "Paroquia Vazia",
        massDate: "2026-01-01",
        massTime: "10:00",
        logoBuffer: null,
        intentions: {
          SUFRAGIO: [],
          SUPLICAS: [],
          ACAO_DE_GRACAS: [],
        },
      };

      const buffer = await service.generatePdf(pdfData);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });
  });
});
