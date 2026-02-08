import { z } from "zod";
import { DispatchScope, EmolumentScope, IntentionGroup } from "./types";

// ---------------------------------------------------------------------------
// Reusable field schemas
// ---------------------------------------------------------------------------

export const phoneSchema = z
  .string()
  .regex(/^\(\d{2}\)\s\d{5}-\d{4}$/, "Telefone deve estar no formato (XX) XXXXX-XXXX");

export const fullNameSchema = z
  .string()
  .min(1, "Nome e obrigatorio")
  .refine(
    (value) => value.trim().split(/\s+/).length >= 2,
    "Informe o nome completo (nome e sobrenome)",
  );

// ---------------------------------------------------------------------------
// Request / Intention
// ---------------------------------------------------------------------------

export const createRequestSchema = z.object({
  massDate: z.string().min(1, "Data da missa e obrigatoria"),
  massTime: z.string().min(1, "Horario da missa e obrigatorio"),
  faithfulName: fullNameSchema,
  faithfulPhone: phoneSchema,
  intentions: z
    .array(
      z.object({
        group: z.nativeEnum(IntentionGroup),
        intentionTypeId: z.string().min(1),
        deceasedName: z.string().nullish(),
        familyNames: z.string().nullish(),
        complement: z.string().nullish(),
        notes: z.string().nullish(),
        offeredValue: z.number().positive().nullish(),
      }),
    )
    .min(1, "Adicione pelo menos uma intencao"),
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const loginSchema = z.object({
  email: z.string().email("E-mail invalido"),
  password: z.string().min(1, "Senha e obrigatoria"),
});

// ---------------------------------------------------------------------------
// Parish settings
// ---------------------------------------------------------------------------

export const parishSettingsSchema = z.object({
  maxIntentionsPerRequest: z.number().int().min(1).max(20),
  dispatchTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Horario deve estar no formato HH:mm"),
  dispatchScope: z.nativeEnum(DispatchScope),
});

// ---------------------------------------------------------------------------
// Intention type (admin CRUD)
// ---------------------------------------------------------------------------

export const intentionTypeSchema = z.object({
  group: z.nativeEnum(IntentionGroup),
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  isActive: z.boolean(),
  requiresDeceasedName: z.boolean(),
  requiresFamilyNames: z.boolean(),
  opensOptionalNotes: z.boolean(),
  requiresComplement: z.boolean(),
});

// ---------------------------------------------------------------------------
// Mass schedule
// ---------------------------------------------------------------------------

export const massScheduleSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Horario deve estar no formato HH:mm"),
  isActive: z.boolean(),
});

// ---------------------------------------------------------------------------
// Mass exception
// ---------------------------------------------------------------------------

export const massExceptionSchema = z.object({
  date: z.string().min(1, "Data e obrigatoria"),
  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Horario deve estar no formato HH:mm"),
  title: z.string().nullish(),
  isActive: z.boolean(),
});

// ---------------------------------------------------------------------------
// Emolument
// ---------------------------------------------------------------------------

export const emolumentSchema = z.object({
  scope: z.nativeEnum(EmolumentScope),
  group: z.nativeEnum(IntentionGroup).nullish(),
  intentionTypeId: z.string().nullish(),
  suggestedValue: z.number().positive("Valor deve ser positivo"),
  isActive: z.boolean(),
});

// ---------------------------------------------------------------------------
// Parish profile (admin editing)
// ---------------------------------------------------------------------------

export const parishProfileSchema = z.object({
  slug: z.string().min(1, "Slug e obrigatorio"),
  cnpj: z.string().nullish(),
  legalName: z.string().nullish(),
  parishName: z.string().min(1, "Nome da paroquia e obrigatorio"),
  pastorName: z.string().nullish(),
  dispatchEmails: z.array(z.string().email("E-mail invalido")),
});

// ---------------------------------------------------------------------------
// Inferred types (useful for forms / API handlers)
// ---------------------------------------------------------------------------

export type CreateRequestInput = z.infer<typeof createRequestSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ParishSettingsInput = z.infer<typeof parishSettingsSchema>;
export type IntentionTypeInput = z.infer<typeof intentionTypeSchema>;
export type MassScheduleInput = z.infer<typeof massScheduleSchema>;
export type MassExceptionInput = z.infer<typeof massExceptionSchema>;
export type EmolumentInput = z.infer<typeof emolumentSchema>;
export type ParishProfileInput = z.infer<typeof parishProfileSchema>;
