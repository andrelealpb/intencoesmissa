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
  // Grupo de WhatsApp da equipe (Z-API) — destino da convocação (S6.5). Opcional.
  whatsappGroupId: z.string().trim().max(120).nullish(),
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
  // Convite individual por WhatsApp ao vincular (S6.5 — C3). Ausente ⇒ default
  // `true` no serviço. Degradação graciosa: falha de envio não quebra o cadastro.
  sendInvite: z.boolean().optional(),
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

// ── Auth de membro (S5) — link mágico / OTP ─────────────

// Canal de entrega opcional. Ausente ⇒ o backend escolhe pelo que o membro tem
// (telefone → OTP/WhatsApp; senão e-mail → link mágico).
export const memberAuthChannelSchema = z.enum(["whatsapp", "email"]);

// identifier = telefone OU e-mail. Aceita entrada livre (o backend normaliza e
// resolve o Member); validação estrita não cabe aqui (anti-enumeração).
export const memberAuthRequestSchema = z.object({
  parishSlug: z.string().min(1, "parishSlug e obrigatorio"),
  identifier: z.string().trim().min(1, "Informe telefone ou e-mail"),
  channel: memberAuthChannelSchema.optional(),
});

export const memberAuthVerifySchema = z.object({
  parishSlug: z.string().min(1, "parishSlug e obrigatorio"),
  identifier: z.string().trim().min(1, "Informe telefone ou e-mail"),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Codigo deve ter 6 digitos"),
});

// ---------------------------------------------------------------------------
// Escala — Portal de disponibilidade do membro (S6)
// ---------------------------------------------------------------------------

// Mês no formato YYYY-MM (query de /escala/me/occurrences).
export const monthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "Mes deve estar no formato YYYY-MM")
  .refine((value) => {
    const month = Number(value.slice(5, 7));
    return month >= 1 && month <= 12;
  }, "Mes invalido");

// ── Convocação de disponibilidade (S6.5) ────────────────
// Dispara 1 mensagem por grupo de equipe na abertura do mês. `teamIds` = equipes
// alvo (coordenador só a própria; admin escolhe). `deadline` = prazo opcional
// exibido no texto ("informe até ...").
export const convocationSchema = z.object({
  month: monthSchema,
  teamIds: z
    .array(uuidSchema)
    .min(1, "Selecione ao menos uma equipe")
    .max(100, "Numero de equipes excede o limite"),
  deadline: z.string().trim().max(60).optional(),
});

// ── Motor de sugestão de escala (S7) ────────────────────
// Gera um rascunho de escala para o mês, preenchendo só as vagas vazias. Sem
// `teamIds`, o backend usa o conjunto padrão do ator (admin → todas as equipes
// da paróquia; coordenador → as que coordena).
export const scheduleSuggestSchema = z.object({
  month: monthSchema,
  teamIds: z
    .array(uuidSchema)
    .min(1, "Selecione ao menos uma equipe")
    .max(100, "Numero de equipes excede o limite")
    .optional(),
});

// ── Montagem da escala — tela do coordenador (S8) ───────
// GET /escala/schedule — grade do mês de UMA equipe (ocorrências + assignments
// + gaps + candidatos por vaga). `teamId` obrigatório (coordenador só a própria).
export const scheduleGridQuerySchema = z.object({
  month: monthSchema,
  teamId: uuidSchema,
});

// POST /escala/assignments — atribuição manual. `overrideReason` é exigido pelo
// backend (V2) quando o membro é inelegível (indisponível / no teto / não
// qualificado); o unique(occurrence, member) vira 409 claro (V3).
export const assignmentCreateSchema = z.object({
  occurrenceId: uuidSchema,
  functionId: uuidSchema,
  memberId: uuidSchema,
  overrideReason: z.string().trim().min(1).max(280).optional(),
});

// POST /escala/schedule/publish — publica a escala de uma (equipe, mês): carimba
// publishedAt/republishedAt. Coordenador só a própria equipe.
export const schedulePublishSchema = z.object({
  month: monthSchema,
  teamId: uuidSchema,
});

// ── Gestão de ocorrências do mês aberto (S2.1) ──────────
// POST /escala/occurrences/reconcile — recalcula o conjunto esperado do cadastro
// atual, adiciona faltantes, remove órfã VAZIA direto, e órfã com escala/
// disponibilidade vira conflito p/ decisão manual (nunca some sozinha).
export const reconcileMonthSchema = z.object({ month: monthSchema });

// ── Confirmação pelo portal (S9/L3) ─────────────────────
// GET /escala/me/assignments?from=&to= — minhas escalas PUBLICADAS no intervalo.
// `from`/`to` (YYYY-MM-DD) opcionais; o backend aplica um intervalo padrão.
export const memberAssignmentsQuerySchema = z
  .object({
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
  })
  .refine(
    (v) => !(v.from && v.to) || v.from <= v.to,
    "from deve ser anterior ou igual a to",
  );

// PUT /escala/me/assignments/:id — o membro confirma ou recusa a PRÓPRIA escala
// publicada. Só CONFIRMED/DECLINED (SCHEDULED/CANCELLED são estados do sistema).
export const memberAssignmentStatusSchema = z.object({
  status: z.enum(["CONFIRMED", "DECLINED"]),
});

// Horário "HH:mm" (00:00..23:59). Reusado por regra recorrente.
const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horario deve estar no formato HH:mm");

// PUT /escala/me/availability — upsert do desvio explícito. `CLEAR` apaga o
// entry (volta a valer a regra). `MAYBE` não é exposto na UI (U4).
export const memberAvailabilityUpsertSchema = z.object({
  occurrenceId: uuidSchema,
  status: z.enum(["AVAILABLE", "UNAVAILABLE", "CLEAR"]),
});

// PUT /escala/me/rules — replace-set das regras recorrentes do membro.
// `time` ausente/null = qualquer horário do dia (dia inteiro).
export const memberAvailabilityRuleSchema = z.object({
  weekday: z.number().int().min(0).max(6, "Dia da semana deve ser 0..6"),
  time: timeOfDaySchema.nullish(),
  available: z.boolean(),
});

export const memberAvailabilityRulesSchema = z.object({
  rules: z
    .array(memberAvailabilityRuleSchema)
    .max(50, "Numero de regras excede o limite")
    .superRefine((rules, ctx) => {
      // Espelha o @@unique([memberId, weekday, time]) do schema: sem duplicatas.
      const seen = new Set<string>();
      rules.forEach((rule, index) => {
        const key = `${rule.weekday}|${rule.time ?? ""}`;
        if (seen.has(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index],
            message: "Regra duplicada para o mesmo dia/horario",
          });
        }
        seen.add(key);
      });
    }),
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
export type NoticeInput = z.infer<typeof noticeSchema>;
export type MaterializeRangeInput = z.infer<typeof materializeRangeSchema>;
export type UpdateOccurrenceInput = z.infer<typeof updateOccurrenceSchema>;
export type ReconcileMonthInput = z.infer<typeof reconcileMonthSchema>;

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

// Escala — Auth de membro (S5)
export type MemberAuthChannel = z.infer<typeof memberAuthChannelSchema>;
export type MemberAuthRequestInput = z.infer<typeof memberAuthRequestSchema>;
export type MemberAuthVerifyInput = z.infer<typeof memberAuthVerifySchema>;

// Escala — Portal de disponibilidade (S6)
export type MemberAvailabilityUpsertInput = z.infer<
  typeof memberAvailabilityUpsertSchema
>;
export type MemberAvailabilityRuleInput = z.infer<
  typeof memberAvailabilityRuleSchema
>;
export type MemberAvailabilityRulesInput = z.infer<
  typeof memberAvailabilityRulesSchema
>;

// Escala — Convites e Convocação (S6.5)
export type ConvocationInput = z.infer<typeof convocationSchema>;

// Escala — Motor de sugestão (S7)
export type ScheduleSuggestInput = z.infer<typeof scheduleSuggestSchema>;

// Escala — Montagem / tela do coordenador (S8)
export type ScheduleGridQueryInput = z.infer<typeof scheduleGridQuerySchema>;
export type AssignmentCreateInput = z.infer<typeof assignmentCreateSchema>;
export type SchedulePublishInput = z.infer<typeof schedulePublishSchema>;

// Escala — Confirmação pelo portal (S9)
export type MemberAssignmentsQueryInput = z.infer<
  typeof memberAssignmentsQuerySchema
>;
export type MemberAssignmentStatusInput = z.infer<
  typeof memberAssignmentStatusSchema
>;
