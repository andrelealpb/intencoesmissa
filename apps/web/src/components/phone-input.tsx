"use client";

import { forwardRef, ChangeEvent } from "react";
import { Input, InputProps } from "@/components/ui/input";

type PhoneInputProps = Omit<InputProps, "onChange"> & {
  onChange?: (value: string) => void;
};

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

const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ onChange, value, ...props }, ref) => {
    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
      const rawValue = e.target.value;
      const digits = unformatPhone(rawValue);
      onChange?.(digits);
    };

    const displayValue =
      typeof value === "string" ? formatPhone(value) : value;

    return (
      <Input
        ref={ref}
        type="tel"
        inputMode="numeric"
        placeholder="(00) 00000-0000"
        value={displayValue}
        onChange={handleChange as any}
        maxLength={16}
        {...props}
      />
    );
  }
);

PhoneInput.displayName = "PhoneInput";

export { PhoneInput, formatPhone, unformatPhone };
export type { PhoneInputProps };
