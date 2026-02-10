import { EmailService } from "./email.service";

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe("EmailService", () => {
  let service: EmailService;

  beforeEach(() => {
    process.env.MAILERSEND_API_TOKEN = "test-token";
    process.env.SMTP_FROM = "test@example.com";
    mockFetch.mockReset();
    service = new EmailService();
  });

  it("should be instantiable", () => {
    expect(service).toBeDefined();
  });

  describe("sendDispatchEmail", () => {
    it("should send an email via MailerSend API", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 202,
        headers: { get: () => "test-message-id" },
      });

      await service.sendDispatchEmail(
        ["padre@parish.com"],
        "Test Subject",
        Buffer.from("fake-pdf"),
        "test.pdf",
      );

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.mailersend.com/v1/email",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("should skip sending when API token is not configured", async () => {
      delete process.env.MAILERSEND_API_TOKEN;
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
