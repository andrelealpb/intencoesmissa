import { z } from "zod";
import {
  DispatchScope,
  EmolumentScope,
  IntentionGroup,
  MinistryCategory,
  StaffingScope,
} from "./types";

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
  dispatchMinutesBefore: z.number().int().min(5).max(1440),
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
  sendToPastor: z.boolean(),
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
  pastorEmail: z.string().email("E-mail do paroco invalido").nullish().or(z.literal("")),
  dispatchEmails: z.array(z.string().email("E-mail invalido")),
  pixKey: z.string().nullish(),
  zapiInstanceId: z.string().nullish(),
  zapiToken: z.string().nullish(),
  zapiClientToken: z.string().nullish(),
  zapiPhone: z.string().nullish(),
  pastorPhone: z.string().nullish(),
  dispatchPhones: z.array(z.string()).optional(),
  dispatchGroups: z.array(z.string()).optional(),
  dispatchRecipients: z.array(z.object({
    name: z.string(),
    email: z.string(),
    phone: z.string(),
  })).optional(),
});

// ---------------------------------------------------------------------------
// Notice (aviso)
// ---------------------------------------------------------------------------

export const noticeSchema = z.object({
  subject: z.string().min(1, "Assunto e obrigatorio"),
  description: z.string().min(1, "Descricao e obrigatoria"),
  massTimes: z.array(z.string()),
  startDate: z.string().nullish(),
  endDate: z.string().nullish(),
  isActive: z.boolean(),
});

// ---------------------------------------------------------------------------
// Escala — Materializacao de ocorrencias (S2)
// ---------------------------------------------------------------------------

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve estar no formato YYYY-MM-DD");

// Limite de intervalo p/ materializacao (evita materializar o ano inteiro por acidente).
export const MATERIALIZE_MAX_RANGE_DAYS = 92;

export const materializeRangeSchema = z
  .object({
    from: isoDateSchema,
    to: isoDateSchema,
  })
  .superRefine((val, ctx) => {
    const from = new Date(val.from + "T00:00:00Z");
    const to = new Date(val.to + "T00:00:00Z");
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Data invalida" });
      return;
    }
    if (to < from) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["to"],
        message: "A data final deve ser maior ou igual a inicial",
      });
      return;
    }
    const days = Math.round((to.getTime() - from.getTime()) / 86_400_000);
    if (days > MATERIALIZE_MAX_RANGE_DAYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["to"],
        message: `Intervalo maximo e de ${MATERIALIZE_MAX_RANGE_DAYS} dias`,
      });
    }
  });

export const updateOccurrenceSchema = z
  .object({
    isSolemnity: z.boolean().optional(),
    title: z.string().nullish(),
  })
  .refine(
    (d) => d.isSolemnity !== undefined || d.title !== undefined,
    "Informe isSolemnity e/ou title",
  );

// ---------------------------------------------------------------------------
// Escala — Cadastro (S3)
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid("Identificador invalido");

// ── Team ────────────────────────────────────────────────

export const teamSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  category: z.nativeEnum(MinistryCategory),
  description: z.string().nullish(),
});

export const teamUpdateSchema = teamSchema.extend({
  isActive: z.boolean().optional(),
});

// ── TeamFunction ────────────────────────────────────────

export const teamFunctionSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  description: z.string().nullish(),
  sortOrder: z.number().int().min(0, "Ordem deve ser >= 0").optional(),
});

export const teamFunctionUpdateSchema = teamFunctionSchema.extend({
  isActive: z.boolean().optional(),
});

// ── Member ──────────────────────────────────────────────

const birthDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve estar no formato YYYY-MM-DD")
  .refine((value) => {
    const date = new Date(value + "T00:00:00Z");
    return !Number.isNaN(date.getTime()) && date <= new Date();
  }, "Data de nascimento nao pode ser futura");

export const memberSchema = z.object({
  fullName: fullNameSchema,
  phone: phoneSchema,
  email: z.string().email("E-mail invalido").nullish().or(z.literal("")),
  birthDate: birthDateSchema.nullish(),
});

export const memberUpdateSchema = memberSchema.extend({
  isActive: z.boolean().optional(),
});

// ── TeamMembership ──────────────────────────────────────

export const teamMembershipSchema = z.object({
  memberId: uuidSchema,
  isCoordinator: z.boolean().optional(),
  maxAssignmentsPerMonth: z.number().int().min(1, "Teto deve ser >= 1").nullish(),
  priority: z.number().int().min(0, "Prioridade deve ser >= 0").optional(),
});

export const teamMembershipUpdateSchema = z.object({
  isCoordinator: z.boolean().optional(),
  maxAssignmentsPerMonth: z.number().int().min(1, "Teto deve ser >= 1").nullish(),
  priority: z.number().int().min(0, "Prioridade deve ser >= 0").optional(),
  isActive: z.boolean().optional(),
});

// ── MembershipFunction (replace-set) ────────────────────

export const membershipFunctionsSchema = z.object({
  functionIds: z.array(uuidSchema),
});

// ── StaffingRequirement (discriminated union por scope) ──

const staffingBase = {
  requiredCount: z.number().int().min(1, "Quantidade deve ser >= 1"),
  isActive: z.boolean().optional(),
};

export const staffingRequirementSchema = z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal(StaffingScope.DEFAULT),
    ...staffingBase,
  }),
  z.object({
    scope: z.literal(StaffingScope.WEEKDAY),
    weekday: z.number().int().min(0).max(6, "Dia da semana deve ser 0..6"),
    ...staffingBase,
  }),
  z.object({
    scope: z.literal(StaffingScope.SCHEDULE),
    massScheduleId: uuidSchema,
    ...staffingBase,
  }),
  z.object({
    scope: z.literal(StaffingScope.SOLEMNITY),
    ...staffingBase,
  }),
  z.object({
    scope: z.literal(StaffingScope.OCCASION),
    massExceptionId: uuidSchema,
    ...staffingBase,
  }),
]);

// O functionId acompanha a criacao de uma regra (qual funcao ela dimensiona).
export const staffingRequirementCreateSchema = z.intersection(
  staffingRequirementSchema,
  z.object({ functionId: uuidSchema }),
);

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
export type NoticeInput = z.infer<typeof noticeSchema>;
export type MaterializeRangeInput = z.infer<typeof materializeRangeSchema>;
export type UpdateOccurrenceInput = z.infer<typeof updateOccurrenceSchema>;

// Escala — Cadastro (S3)
export type TeamInput = z.infer<typeof teamSchema>;
export type TeamUpdateInput = z.infer<typeof teamUpdateSchema>;
export type TeamFunctionInput = z.infer<typeof teamFunctionSchema>;
export type TeamFunctionUpdateInput = z.infer<typeof teamFunctionUpdateSchema>;
export type MemberInput = z.infer<typeof memberSchema>;
export type MemberUpdateInput = z.infer<typeof memberUpdateSchema>;
export type TeamMembershipInput = z.infer<typeof teamMembershipSchema>;
export type TeamMembershipUpdateInput = z.infer<typeof teamMembershipUpdateSchema>;
export type MembershipFunctionsInput = z.infer<typeof membershipFunctionsSchema>;
export type StaffingRequirementInput = z.infer<typeof staffingRequirementSchema>;
export type StaffingRequirementCreateInput = z.infer<
  typeof staffingRequirementCreateSchema
>;
