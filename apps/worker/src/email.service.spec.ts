import { EmailService } from "./email.service";

jest.mock("nodemailer", () => ({
  default: {
    createTransport: jest.fn().mockReturnValue({
      sendMail: jest.fn().mockResolvedValue({ messageId: "test-id" }),
    }),
  },
  createTransport: jest.fn().mockReturnValue({
    sendMail: jest.fn().mockResolvedValue({ messageId: "test-id" }),
  }),
}));

describe("EmailService", () => {
  let service: EmailService;

  beforeEach(() => {
    service = new EmailService();
  });

  it("should be instantiable", () => {
    expect(service).toBeDefined();
  });

  describe("sendDispatchEmail", () => {
    it("should send an email with PDF attachment", async () => {
      const to = ["padre@parish.com"];
      const subject = "Test Subject";
      const pdfBuffer = Buffer.from("fake-pdf");
      const pdfFilename = "test.pdf";

      await service.sendDispatchEmail(to, subject, pdfBuffer, pdfFilename);
      // If it doesn't throw, it's successful (mocked transporter)
    });
  });
});
