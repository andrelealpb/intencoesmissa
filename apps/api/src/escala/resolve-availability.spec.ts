import { AvailabilityStatus } from "@missas/shared";
import {
  resolveAvailability,
  type AvailabilityRuleInput,
} from "./resolve-availability";

// Domingo (weekday=0) às 10:00 — slot padrão dos casos.
const SUNDAY_10 = { weekday: 0, time: "10:00" };

describe("resolveAvailability", () => {
  describe("origem: explicit (desvio do membro manda)", () => {
    it("entry AVAILABLE → AVAILABLE / explicit", () => {
      expect(
        resolveAvailability(SUNDAY_10, { status: AvailabilityStatus.AVAILABLE }, []),
      ).toEqual({ status: "AVAILABLE", source: "explicit" });
    });

    it("entry UNAVAILABLE → UNAVAILABLE / explicit", () => {
      expect(
        resolveAvailability(
          SUNDAY_10,
          { status: AvailabilityStatus.UNAVAILABLE },
          [],
        ),
      ).toEqual({ status: "UNAVAILABLE", source: "explicit" });
    });

    it("entry MAYBE (nao exposto na UI) resolve como UNAVAILABLE / explicit", () => {
      expect(
        resolveAvailability(SUNDAY_10, { status: AvailabilityStatus.MAYBE }, []),
      ).toEqual({ status: "UNAVAILABLE", source: "explicit" });
    });

    it("entry vence a regra que diria o contrario", () => {
      const rules: AvailabilityRuleInput[] = [
        { weekday: 0, time: "10:00", available: true },
      ];
      expect(
        resolveAvailability(
          SUNDAY_10,
          { status: AvailabilityStatus.UNAVAILABLE },
          rules,
        ),
      ).toEqual({ status: "UNAVAILABLE", source: "explicit" });
    });
  });

  describe("origem: rule", () => {
    it("regra de horario especifico casa (weekday + time)", () => {
      const rules: AvailabilityRuleInput[] = [
        { weekday: 0, time: "10:00", available: true },
      ];
      expect(resolveAvailability(SUNDAY_10, null, rules)).toEqual({
        status: "AVAILABLE",
        source: "rule",
      });
    });

    it("regra de dia inteiro casa (time=null) para qualquer horario do dia", () => {
      const rules: AvailabilityRuleInput[] = [
        { weekday: 0, time: null, available: true },
      ];
      expect(
        resolveAvailability({ weekday: 0, time: "19:00" }, null, rules),
      ).toEqual({ status: "AVAILABLE", source: "rule" });
    });

    it("regra available=false casa e resolve UNAVAILABLE / rule (nao e 'nao informou')", () => {
      const rules: AvailabilityRuleInput[] = [
        { weekday: 6, time: null, available: false },
      ];
      expect(
        resolveAvailability({ weekday: 6, time: "18:00" }, null, rules),
      ).toEqual({ status: "UNAVAILABLE", source: "rule" });
    });

    it("horario especifico vence dia inteiro no mesmo weekday", () => {
      const rules: AvailabilityRuleInput[] = [
        { weekday: 0, time: null, available: true }, // dia inteiro disponivel
        { weekday: 0, time: "10:00", available: false }, // menos na das 10h
      ];
      expect(resolveAvailability(SUNDAY_10, null, rules)).toEqual({
        status: "UNAVAILABLE",
        source: "rule",
      });
    });

    it("regra de outro weekday nao casa", () => {
      const rules: AvailabilityRuleInput[] = [
        { weekday: 3, time: "10:00", available: true },
      ];
      expect(resolveAvailability(SUNDAY_10, null, rules)).toEqual({
        status: "UNAVAILABLE",
        source: "default",
      });
    });

    it("regra de outro horario (mesmo dia, sem dia-inteiro) nao casa", () => {
      const rules: AvailabilityRuleInput[] = [
        { weekday: 0, time: "19:00", available: true },
      ];
      expect(resolveAvailability(SUNDAY_10, null, rules)).toEqual({
        status: "UNAVAILABLE",
        source: "default",
      });
    });
  });

  describe("origem: default (opt-in U1/U2 — 'nao informou')", () => {
    it("sem entry e sem regra → UNAVAILABLE / default", () => {
      expect(resolveAvailability(SUNDAY_10, null, [])).toEqual({
        status: "UNAVAILABLE",
        source: "default",
      });
    });
  });
});
