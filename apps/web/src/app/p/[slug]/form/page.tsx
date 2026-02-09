"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { PhoneInput, formatPhone } from "@/components/phone-input";
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
}

interface Emolument {
  id: string;
  scope: "DEFAULT" | "GROUP" | "TYPE";
  group: string | null;
  intentionTypeId: string | null;
  suggestedValue: string | number;
  isActive: boolean;
}

interface ParishInfo {
  parishName: string;
  pixKey?: string | null;
  pixQrCodeUrl?: string | null;
}

const GROUP_OPTIONS = [
  { value: "SUFRAGIO", label: "Sufrágio", tooltip: "Intenções aos falecidos e almas do purgatório" },
  { value: "SUPLICAS", label: "Súplicas", tooltip: "Pedidos que devemos elevar ao céu, ex: pela saúde, por uma família..." },
  { value: "ACAO_DE_GRACAS", label: "Ação de Graças", tooltip: "Intenções de agradecimento, por graças alcançadas" },
];

const STEPS = [
  "Dados e Horário",
  "Intenções",
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
  };
}

// ---- Component ----

export default function IntentionFormPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  // Step state
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Step 1: Identification + Date & Time
  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [massDate, setMassDate] = useState("");
  const [massTime, setMassTime] = useState("");
  const [massOptions, setMassOptions] = useState<MassOption[]>([]);
  const [loadingMasses, setLoadingMasses] = useState(false);

  // Step 2: Intentions
  const [intentions, setIntentions] = useState<IntentionEntry[]>([emptyIntention()]);
  const [typesByGroup, setTypesByGroup] = useState<Record<string, IntentionType[]>>({});
  const [maxIntentions, setMaxIntentions] = useState(10);
  const [emoluments, setEmoluments] = useState<Emolument[]>([]);

  // Parish data (for PIX)
  const [parish, setParish] = useState<ParishInfo | null>(null);

  // Fetch parish info
  useEffect(() => {
    apiFetch(`/public/parishes/${slug}`)
      .then(setParish)
      .catch(() => {});
  }, [slug]);

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

  const totalSuggested = intentions.reduce((sum, i) => {
    if (!i.group || !i.intentionTypeId) return sum;
    const val = resolveSuggestedValue(i.group, i.intentionTypeId);
    return sum + (val ?? 0);
  }, 0);

  // ---- Handlers ----

  const submitRequest = async () => {
    setSubmitting(true);
    setError("");

    try {
      const payload = {
        massDate,
        massTime,
        faithfulName: fullName,
        faithfulPhone: formatPhone(phone),
        intentions: intentions.map((i) => ({
          group: i.group,
          intentionTypeId: i.intentionTypeId,
          deceasedName: i.deceasedName || undefined,
          familyNames: i.familyNames || undefined,
          complement: i.complement || undefined,
          notes: i.notes || undefined,
        })),
      };

      await apiFetch(`/public/parishes/${slug}/requests`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setStep(2); // go to confirmation
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao enviar pedido.");
    } finally {
      setSubmitting(false);
    }
  };

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
      if (!massDate) { setError("Selecione uma data."); return; }
      if (!massTime) { setError("Selecione um horário."); return; }
      setStep(1);
      return;
    }
    if (step === 1) {
      const invalid = intentions.some((i) => !i.group || !i.intentionTypeId);
      if (invalid) {
        setError("Preencha o grupo e o tipo de cada intenção.");
        return;
      }
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
      // Validate OK → submit request
      submitRequest();
      return;
    }
  };

  const prevStep = () => {
    setError("");
    setStep((s) => Math.max(s - 1, 0));
  };

  const handleNewRequest = () => {
    setStep(0);
    setPhone("");
    setFullName("");
    setMassDate("");
    setMassTime("");
    setMassOptions([]);
    setIntentions([emptyIntention()]);
    setError("");
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

  // ---- Render ----

  return (
    <main className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        {/* Parish header */}
        {parish && (
          <h2 className="text-center text-lg font-semibold text-gray-800 mb-6">
            {parish.parishName}
          </h2>
        )}

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

        {/* Step 1: Dados e Horário */}
        {step === 0 && (
          <div className="space-y-6">
            <Card title="Identificação">
              <div className="space-y-4">
                <Input
                  label="Nome completo"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Seu nome completo"
                />
                <PhoneInput label="Telefone" value={phone} onChange={setPhone} />
              </div>
            </Card>

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
          </div>
        )}

        {/* Step 2: Intenções */}
        {step === 1 && (
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
                    options={GROUP_OPTIONS}
                    value={intention.group}
                    onChange={(e) => updateIntention(index, "group", e.target.value)}
                    placeholder="Selecione sua intenção"
                  />
                  {intention.group && (() => {
                    const groupInfo = GROUP_OPTIONS.find((g) => g.value === intention.group);
                    return groupInfo?.tooltip ? (
                      <p className="text-xs text-gray-500 -mt-1 ml-1 italic">{groupInfo.tooltip}</p>
                    ) : null;
                  })()}

                  {intention.group && (
                    <Select
                      options={(typesByGroup[intention.group] || []).map((t) => ({
                        value: t.id,
                        label: t.name,
                      }))}
                      value={intention.intentionTypeId}
                      onChange={(e) => updateIntention(index, "intentionTypeId", e.target.value)}
                      placeholder="Intenção por..."
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

        {/* Step 3: Confirmação (post-submit) */}
        {step === 2 && (
          <div className="space-y-6">
            <Card>
              <div className="text-center space-y-3">
                <svg className="w-16 h-16 mx-auto text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="text-xl font-bold text-gray-900">
                  Intenção registrada com sucesso!
                </h3>
                <p className="text-sm text-gray-600">
                  Sua intenção foi recebida pela paróquia.
                </p>
              </div>
            </Card>

            {/* Oferta Sugerida + PIX */}
            {(totalSuggested > 0 || parish?.pixQrCodeUrl || parish?.pixKey) && (
              <Card>
                <div className="text-center space-y-4">
                  {totalSuggested > 0 && (
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Oferta Sugerida</p>
                      <p className="text-3xl font-bold text-primary-700">
                        R$ {totalSuggested.toFixed(2)}
                      </p>
                    </div>
                  )}

                  {/* PIX QR Code */}
                  {parish?.pixQrCodeUrl && (
                    <div className={totalSuggested > 0 ? "border-t pt-4" : ""}>
                      <p className="text-sm font-medium text-gray-700 mb-2">Pague via PIX</p>
                      <img
                        src={parish.pixQrCodeUrl}
                        alt="QR Code PIX"
                        className="w-48 h-48 mx-auto border rounded-lg"
                      />
                      {parish.pixKey && (
                        <p className="text-xs text-gray-500 mt-2">
                          Chave PIX: <span className="font-mono">{parish.pixKey}</span>
                        </p>
                      )}
                    </div>
                  )}

                  {/* PIX key only (no QR code) */}
                  {!parish?.pixQrCodeUrl && parish?.pixKey && (
                    <div className={totalSuggested > 0 ? "border-t pt-4" : ""}>
                      <p className="text-sm font-medium text-gray-700 mb-1">Pague via PIX</p>
                      <p className="text-sm text-gray-600">
                        Chave: <span className="font-mono font-medium">{parish.pixKey}</span>
                      </p>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Nova Intenção */}
            <div className="text-center">
              <Button onClick={handleNewRequest}>
                Nova Intenção
              </Button>
            </div>
          </div>
        )}

        {/* Navigation (only on steps 0 and 1) */}
        {step < 2 && (
          <div className="flex justify-between mt-6">
            {step > 0 ? (
              <Button variant="secondary" onClick={prevStep}>
                Voltar
              </Button>
            ) : (
              <div />
            )}
            <Button onClick={nextStep} loading={submitting}>
              {step === 1 ? "Registrar Intenção" : "Próximo"}
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
