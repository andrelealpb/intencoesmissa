import { EmailService } from "./email.service";

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe("EmailService", () => {
  let service: EmailService;

  beforeEach(() => {
    process.env.BREVO_API_KEY = "test-api-key";
    process.env.SMTP_FROM = "test@example.com";
    process.env.SMTP_FROM_NAME = "Test Sender";
    mockFetch.mockReset();
    service = new EmailService();
  });

  it("should be instantiable", () => {
    expect(service).toBeDefined();
  });

  describe("sendDispatchEmail", () => {
    it("should send an email via Brevo API", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ messageId: "test-message-id" }),
      });

      await service.sendDispatchEmail(
        ["padre@parish.com"],
        "Test Subject",
        Buffer.from("fake-pdf"),
        "test.pdf",
      );

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.brevo.com/v3/smtp/email",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("should skip sending when API key is not configured", async () => {
      delete process.env.BREVO_API_KEY;
      service = new EmailService();

      await service.sendDispatchEmail(
        ["padre@parish.com"],
        "Test",
        Buffer.from("pdf"),
        "test.pdf",
      );

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
