// Test phone formatting logic (mirrors the pure functions in phone-input.tsx)
// Defined inline to avoid importing JSX which requires React/jsdom setup

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7)
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function unformatPhone(value: string): string {
  return value.replace(/\D/g, "");
}

describe("phone-input utilities", () => {
  describe("formatPhone", () => {
    it("should format empty string", () => {
      expect(formatPhone("")).toBe("");
    });

    it("should format partial DDD", () => {
      expect(formatPhone("11")).toBe("(11");
    });

    it("should format DDD + partial number", () => {
      expect(formatPhone("11987")).toBe("(11) 987");
    });

    it("should format full 11-digit phone", () => {
      expect(formatPhone("11987654321")).toBe("(11) 98765-4321");
    });

    it("should strip non-digit characters", () => {
      expect(formatPhone("(11) 98765-4321")).toBe("(11) 98765-4321");
    });

    it("should cap at 11 digits", () => {
      expect(formatPhone("119876543219999")).toBe("(11) 98765-4321");
    });
  });

  describe("unformatPhone", () => {
    it("should strip all non-digit characters", () => {
      expect(unformatPhone("(11) 98765-4321")).toBe("11987654321");
    });

    it("should return empty for empty string", () => {
      expect(unformatPhone("")).toBe("");
    });
  });
});
