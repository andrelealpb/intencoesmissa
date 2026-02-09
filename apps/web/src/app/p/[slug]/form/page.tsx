"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { PhoneInput } from "@/components/phone-input";
import { apiFetch } from "@/lib/api";

// ---- Types ----

interface MassOption {
  time: string;
  title?: string | null;
}

interface IntentionType {
  id: string;
  name: string;
  group: string;
  requiresDeceasedName: boolean;
  requiresFamilyNames: boolean;
  opensOptionalNotes: boolean;
  requiresComplement: boolean;
}

interface IntentionEntry {
  group: string;
  intentionTypeId: string;
  deceasedName: string;
  familyNames: string;
  complement: string;
  notes: string;
  offeredValue: string;
}

interface Emolument {
  id: string;
  scope: "DEFAULT" | "GROUP" | "TYPE";
  group: string | null;
  intentionTypeId: string | null;
  suggestedValue: string | number;
  isActive: boolean;
}

const GROUP_OPTIONS = [
  { value: "SUFRAGIO", label: "Sufrágio", tooltip: "Intenções aos falecidos e almas do purgatório" },
  { value: "SUPLICAS", label: "Súplicas", tooltip: "Pedidos que devemos elevar ao céu, ex: pela saúde, por uma família..." },
  { value: "ACAO_DE_GRACAS", label: "Ação de Graças", tooltip: "Intenções de agradecimento, por graças alcançadas" },
];

const STEPS = [
  "Identificação",
  "Data e Horário",
  "Intenções",
  "Oferta",
  "Confirmação",
];

function emptyIntention(): IntentionEntry {
  return {
    group: "",
    intentionTypeId: "",
    deceasedName: "",
    familyNames: "",
    complement: "",
    notes: "",
    offeredValue: "",
  };
}

// ---- Component ----

export default function IntentionFormPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params.slug;

  // Step state
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Step 1: Identification
  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");

  // Step 2: Date & Time
  const [massDate, setMassDate] = useState("");
  const [massTime, setMassTime] = useState("");
  const [massOptions, setMassOptions] = useState<MassOption[]>([]);
  const [loadingMasses, setLoadingMasses] = useState(false);

  // Step 3: Intentions
  const [intentions, setIntentions] = useState<IntentionEntry[]>([emptyIntention()]);
  const [typesByGroup, setTypesByGroup] = useState<Record<string, IntentionType[]>>({});
  const [maxIntentions, setMaxIntentions] = useState(10);
  const [emoluments, setEmoluments] = useState<Emolument[]>([]);

  // Fetch mass options when date changes
  useEffect(() => {
    if (!massDate) return;
    setLoadingMasses(true);
    setMassTime("");
    apiFetch(`/public/parishes/${slug}/mass-options?date=${massDate}`)
      .then(setMassOptions)
      .catch(() => setMassOptions([]))
      .finally(() => setLoadingMasses(false));
  }, [massDate, slug]);

  // Fetch intention types when a group is selected
  const fetchTypesForGroup = useCallback(
    async (group: string) => {
      if (typesByGroup[group]) return;
      try {
        const data = await apiFetch(
          `/public/parishes/${slug}/intention-types?group=${group}`
        );
        setTypesByGroup((prev) => ({ ...prev, [group]: data }));
      } catch {
        // ignore
      }
    },
    [slug, typesByGroup]
  );

  // Fetch limits and emoluments
  useEffect(() => {
    apiFetch(`/public/parishes/${slug}/limits`)
      .then((data) => {
        setMaxIntentions(data.maxIntentionsPerRequest ?? 10);
        setEmoluments(data.emoluments ?? []);
      })
      .catch(() => {});
  }, [slug]);

  // ---- Helpers ----

  const getTypeForIntention = (intention: IntentionEntry): IntentionType | undefined => {
    const types = typesByGroup[intention.group] || [];
    return types.find((t) => t.id === intention.intentionTypeId);
  };

  const resolveSuggestedValue = (group: string, intentionTypeId: string): number | null => {
    const byType = emoluments.find(
      (e) => e.scope === "TYPE" && e.intentionTypeId === intentionTypeId
    );
    if (byType) return Number(byType.suggestedValue);

    const byGroup = emoluments.find(
      (e) => e.scope === "GROUP" && e.group === group
    );
    if (byGroup) return Number(byGroup.suggestedValue);

    const byDefault = emoluments.find((e) => e.scope === "DEFAULT");
    if (byDefault) return Number(byDefault.suggestedValue);

    return null;
  };

  // ---- Handlers ----

  const nextStep = () => {
    setError("");
    if (step === 0) {
      if (!phone || phone.length < 10) {
        setError("Informe um telefone válido.");
        return;
      }
      if (!fullName.trim() || fullName.trim().split(/\s+/).length < 2) {
        setError("Informe seu nome completo (nome e sobrenome).");
        return;
      }
    }
    if (step === 1) {
      if (!massDate) { setError("Selecione uma data."); return; }
      if (!massTime) { setError("Selecione um horário."); return; }
    }
    if (step === 2) {
      const invalid = intentions.some((i) => !i.group || !i.intentionTypeId);
      if (invalid) {
        setError("Preencha o grupo e o tipo de cada intenção.");
        return;
      }
      // Validate required fields per type
      for (let idx = 0; idx < intentions.length; idx++) {
        const intent = intentions[idx];
        const type = getTypeForIntention(intent);
        if (!type) continue;
        if (type.requiresDeceasedName && !intent.deceasedName.trim()) {
          setError(`Intenção ${idx + 1}: informe o nome do(a) falecido(a).`);
          return;
        }
        if (type.requiresFamilyNames && !intent.familyNames.trim()) {
          setError(`Intenção ${idx + 1}: informe os nomes das famílias.`);
          return;
        }
        if (type.requiresComplement && !intent.complement.trim()) {
          setError(`Intenção ${idx + 1}: informe o complemento (ex: nome da pessoa).`);
          return;
        }
      }
    }
    // When moving to the Oferta step, pre-populate suggested values
    if (step === 2) {
      setIntentions((prev) =>
        prev.map((intent) => {
          if (intent.offeredValue) return intent; // keep user-modified value
          const suggested = resolveSuggestedValue(intent.group, intent.intentionTypeId);
          return {
            ...intent,
            offeredValue: suggested !== null ? suggested.toFixed(2) : "",
          };
        })
      );
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const prevStep = () => {
    setError("");
    setStep((s) => Math.max(s - 1, 0));
  };

  const addIntention = () => {
    if (intentions.length >= maxIntentions) {
      setError(`Limite de ${maxIntentions} intenções por pedido.`);
      return;
    }
    setIntentions([...intentions, emptyIntention()]);
  };

  const removeIntention = (index: number) => {
    if (intentions.length <= 1) return;
    setIntentions(intentions.filter((_, i) => i !== index));
  };

  const updateIntention = (index: number, field: keyof IntentionEntry, value: string) => {
    setIntentions(
      intentions.map((item, i) => {
        if (i !== index) return item;
        const updated = { ...item, [field]: value };
        if (field === "group") {
          updated.intentionTypeId = "";
          updated.deceasedName = "";
          updated.familyNames = "";
          updated.complement = "";
          updated.notes = "";
          fetchTypesForGroup(value);
        }
        if (field === "intentionTypeId") {
          updated.deceasedName = "";
          updated.familyNames = "";
          updated.complement = "";
          updated.notes = "";
        }
        return updated;
      })
    );
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");

    try {
      const payload = {
        massDate,
        massTime,
        faithfulName: fullName,
        faithfulPhone: phone,
        intentions: intentions.map((i) => ({
          group: i.group,
          intentionTypeId: i.intentionTypeId,
          deceasedName: i.deceasedName || undefined,
          familyNames: i.familyNames || undefined,
          complement: i.complement || undefined,
          notes: i.notes || undefined,
          offeredValue: i.offeredValue ? parseFloat(i.offeredValue) : undefined,
        })),
      };

      const result = await apiFetch(`/public/parishes/${slug}/requests`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      router.push(`/p/${slug}/success?protocol=${result.protocol}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao enviar pedido.");
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Render ----

  return (
    <main className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            {STEPS.map((label, i) => (
              <div key={label} className={`flex items-center ${i < STEPS.length - 1 ? "flex-1" : ""}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  i <= step ? "bg-primary-600 text-white" : "bg-gray-200 text-gray-500"
                }`}>
                  {i < step ? (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : (i + 1)}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 ${i < step ? "bg-primary-600" : "bg-gray-200"}`} />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between">
            {STEPS.map((label, i) => (
              <span key={label} className={`text-xs ${i <= step ? "text-primary-600 font-medium" : "text-gray-400"}`}>
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Step 1: Identification */}
        {step === 0 && (
          <Card title="Identificação">
            <div className="space-y-4">
              <PhoneInput label="Telefone" value={phone} onChange={setPhone} />
              <Input
                label="Nome completo"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Seu nome completo"
              />
            </div>
          </Card>
        )}

        {/* Step 2: Date & Time */}
        {step === 1 && (
          <Card title="Data e Horário">
            <div className="space-y-4">
              <Input
                label="Data da Missa"
                type="date"
                value={massDate}
                onChange={(e) => setMassDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
              />
              {massDate && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Horário</label>
                  {loadingMasses ? (
                    <p className="text-sm text-gray-500">Carregando horários...</p>
                  ) : massOptions.length === 0 ? (
                    <p className="text-sm text-gray-500">Nenhuma missa disponível nesta data.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {massOptions.map((opt) => (
                        <button
                          key={opt.time}
                          type="button"
                          onClick={() => setMassTime(opt.time)}
                          className={`px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                            massTime === opt.time
                              ? "bg-primary-600 text-white border-primary-600"
                              : "bg-white text-gray-700 border-gray-200 hover:border-primary-300 hover:bg-primary-50"
                          }`}
                        >
                          {opt.time}
                          {opt.title && (
                            <span className="block text-xs opacity-75 mt-0.5">{opt.title}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Step 3: Intentions */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                Intenções ({intentions.length}/{maxIntentions})
              </h3>
              <Button
                variant="secondary"
                size="sm"
                onClick={addIntention}
                disabled={intentions.length >= maxIntentions}
              >
                + Adicionar
              </Button>
            </div>

            {intentions.map((intention, index) => (
              <Card key={index} className="relative">
                {intentions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeIntention(index)}
                    className="absolute top-3 right-3 text-gray-400 hover:text-red-500 transition-colors"
                    aria-label="Remover intenção"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}

                <div className="space-y-3">
                  <p className="text-sm font-medium text-gray-500">Intenção {index + 1}</p>

                  <Select
                    label="Grupo"
                    options={GROUP_OPTIONS}
                    value={intention.group}
                    onChange={(e) => updateIntention(index, "group", e.target.value)}
                    placeholder="Selecione o grupo"
                  />
                  {intention.group && (() => {
                    const groupInfo = GROUP_OPTIONS.find((g) => g.value === intention.group);
                    return groupInfo?.tooltip ? (
                      <p className="text-xs text-gray-500 -mt-1 ml-1 italic">{groupInfo.tooltip}</p>
                    ) : null;
                  })()}

                  {intention.group && (
                    <Select
                      label="Tipo"
                      options={(typesByGroup[intention.group] || []).map((t) => ({
                        value: t.id,
                        label: t.name,
                      }))}
                      value={intention.intentionTypeId}
                      onChange={(e) => updateIntention(index, "intentionTypeId", e.target.value)}
                      placeholder="Selecione o tipo"
                    />
                  )}

                  {/* Dynamic fields based on intention type configuration */}
                  {intention.intentionTypeId && (() => {
                    const type = getTypeForIntention(intention);
                    if (!type) return null;
                    return (
                      <>
                        {type.requiresDeceasedName && (
                          <Input
                            label="Nome do(a) falecido(a) *"
                            value={intention.deceasedName}
                            onChange={(e) => updateIntention(index, "deceasedName", e.target.value)}
                            placeholder="Nome completo do(a) falecido(a)"
                          />
                        )}
                        {type.requiresFamilyNames && (
                          <Input
                            label="Nomes das famílias *"
                            value={intention.familyNames}
                            onChange={(e) => updateIntention(index, "familyNames", e.target.value)}
                            placeholder="Ex: Família Silva e Família Santos"
                          />
                        )}
                        {type.requiresComplement && (
                          <Input
                            label="Complemento *"
                            value={intention.complement}
                            onChange={(e) => updateIntention(index, "complement", e.target.value)}
                            placeholder="Ex: nome da pessoa, motivo..."
                          />
                        )}
                        {type.opensOptionalNotes && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Observações (opcional)
                            </label>
                            <textarea
                              className="w-full border rounded-md px-3 py-2 text-sm resize-none"
                              rows={3}
                              value={intention.notes}
                              onChange={(e) => updateIntention(index, "notes", e.target.value)}
                              placeholder="Informações adicionais..."
                            />
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Step 4: Oferta */}
        {step === 3 && (
          <Card title="Oferta Sugerida">
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Com base no tipo de cada intenção, segue a oferta sugerida pela paróquia. Você pode alterar os valores se desejar.
              </p>

              <div className="space-y-3">
                {intentions.map((intention, index) => {
                  const type = getTypeForIntention(intention);
                  const suggested = resolveSuggestedValue(intention.group, intention.intentionTypeId);
                  return (
                    <div key={index} className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="text-sm font-medium text-gray-900">
                            {index + 1}. {type?.name || "—"}
                          </span>
                          {intention.deceasedName && (
                            <span className="text-xs text-gray-500 ml-2">({intention.deceasedName})</span>
                          )}
                        </div>
                        {suggested !== null && (
                          <span className="text-xs text-gray-500">
                            Sugerido: R$ {suggested.toFixed(2)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">R$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={intention.offeredValue}
                          onChange={(e) => updateIntention(index, "offeredValue", e.target.value)}
                          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                          placeholder={suggested !== null ? suggested.toFixed(2) : "0.00"}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Total */}
              <div className="border-t pt-3 mt-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-gray-700">Total:</span>
                  <span className="text-lg font-bold text-primary-700">
                    R$ {intentions.reduce((sum, i) => sum + (parseFloat(i.offeredValue) || 0), 0).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Step 5: Confirmation */}
        {step === 4 && (
          <Card title="Confirmação">
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Nome:</span>
                  <span className="font-medium text-gray-900">{fullName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Telefone:</span>
                  <span className="font-medium text-gray-900">{phone}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Data:</span>
                  <span className="font-medium text-gray-900">
                    {new Date(massDate + "T12:00:00").toLocaleDateString("pt-BR")}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Horário:</span>
                  <span className="font-medium text-gray-900">{massTime}</span>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">
                  Intenções ({intentions.length})
                </h4>
                <div className="space-y-2">
                  {intentions.map((intention, index) => {
                    const groupLabel = GROUP_OPTIONS.find((g) => g.value === intention.group)?.label || intention.group;
                    const type = getTypeForIntention(intention);
                    return (
                      <div key={index} className="bg-gray-50 rounded-lg p-3 text-sm">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-gray-900">
                            {index + 1}. {type?.name || "—"}
                          </span>
                          <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full">
                            {groupLabel}
                          </span>
                        </div>
                        {intention.deceasedName && (
                          <p className="text-gray-600">Falecido(a): {intention.deceasedName}</p>
                        )}
                        {intention.familyNames && (
                          <p className="text-gray-600">Famílias: {intention.familyNames}</p>
                        )}
                        {intention.complement && (
                          <p className="text-gray-600">Complemento: {intention.complement}</p>
                        )}
                        {intention.notes && (
                          <p className="text-gray-600">Obs: {intention.notes}</p>
                        )}
                        {intention.offeredValue && (
                          <p className="text-gray-600 font-medium">
                            Oferta: R$ {parseFloat(intention.offeredValue).toFixed(2)}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Total */}
              <div className="border-t pt-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-gray-700">Total da Oferta:</span>
                  <span className="text-lg font-bold text-primary-700">
                    R$ {intentions.reduce((sum, i) => sum + (parseFloat(i.offeredValue) || 0), 0).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-6">
          <Button variant="secondary" onClick={prevStep} disabled={step === 0}>
            Voltar
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={nextStep}>Próximo</Button>
          ) : (
            <Button onClick={handleSubmit} loading={submitting}>
              Enviar Pedido
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}
