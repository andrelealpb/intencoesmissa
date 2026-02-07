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
  id: string;
  time: string;
  label?: string;
}

interface IntentionType {
  id: string;
  name: string;
  group: string;
  hasDeceased: boolean;
  hasEnfermo: boolean;
  hasDate: boolean;
  hasDescription: boolean;
}

interface IntentionEntry {
  group: string;
  typeId: string;
  deceasedName?: string;
  enfermoName?: string;
  date?: string;
  description?: string;
  oferta?: string;
}

interface LimitInfo {
  maxIntentionsPerRequest: number;
}

const GROUP_OPTIONS = [
  { value: "SUFRAGIO", label: "Sufragio" },
  { value: "SUPLICAS", label: "Suplicas" },
  { value: "ACAO_DE_GRACAS", label: "Acao de Gracas" },
];

const STEPS = [
  "Identificacao",
  "Data e Horario",
  "Intencoes",
  "Confirmacao",
];

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
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [massOptions, setMassOptions] = useState<MassOption[]>([]);
  const [loadingMasses, setLoadingMasses] = useState(false);

  // Step 3: Intentions
  const [intentions, setIntentions] = useState<IntentionEntry[]>([
    { group: "", typeId: "" },
  ]);
  const [typesByGroup, setTypesByGroup] = useState<
    Record<string, IntentionType[]>
  >({});
  const [limit, setLimit] = useState<LimitInfo>({
    maxIntentionsPerRequest: 10,
  });

  // Fetch mass options when date changes
  useEffect(() => {
    if (!date) return;
    setLoadingMasses(true);
    setTime("");
    apiFetch(`/public/parishes/${slug}/mass-options?date=${date}`)
      .then((data) => {
        setMassOptions(data);
      })
      .catch(() => {
        setMassOptions([]);
      })
      .finally(() => setLoadingMasses(false));
  }, [date, slug]);

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

  // Fetch limits
  useEffect(() => {
    apiFetch(`/public/parishes/${slug}/limits`)
      .then((data) => setLimit(data))
      .catch(() => {});
  }, [slug]);

  // ---- Handlers ----

  const nextStep = () => {
    setError("");
    if (step === 0) {
      if (!phone || phone.length < 10) {
        setError("Informe um telefone valido.");
        return;
      }
      if (!fullName.trim() || fullName.trim().length < 3) {
        setError("Informe seu nome completo.");
        return;
      }
    }
    if (step === 1) {
      if (!date) {
        setError("Selecione uma data.");
        return;
      }
      if (!time) {
        setError("Selecione um horario.");
        return;
      }
    }
    if (step === 2) {
      const invalid = intentions.some((i) => !i.group || !i.typeId);
      if (invalid) {
        setError("Preencha todos os campos de cada intencao.");
        return;
      }
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const prevStep = () => {
    setError("");
    setStep((s) => Math.max(s - 1, 0));
  };

  const addIntention = () => {
    if (intentions.length >= limit.maxIntentionsPerRequest) {
      setError(
        `Limite de ${limit.maxIntentionsPerRequest} intencoes por pedido.`
      );
      return;
    }
    setIntentions([...intentions, { group: "", typeId: "" }]);
  };

  const removeIntention = (index: number) => {
    if (intentions.length <= 1) return;
    setIntentions(intentions.filter((_, i) => i !== index));
  };

  const updateIntention = (
    index: number,
    field: keyof IntentionEntry,
    value: string
  ) => {
    setIntentions(
      intentions.map((item, i) => {
        if (i !== index) return item;
        const updated = { ...item, [field]: value };
        if (field === "group") {
          updated.typeId = "";
          fetchTypesForGroup(value);
        }
        return updated;
      })
    );
  };

  const getTypeForIntention = (intention: IntentionEntry): IntentionType | undefined => {
    const types = typesByGroup[intention.group] || [];
    return types.find((t) => t.id === intention.typeId);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");

    try {
      const payload = {
        phone,
        faithfulName: fullName,
        date,
        time,
        intentions: intentions.map((i) => ({
          group: i.group,
          typeId: i.typeId,
          deceasedName: i.deceasedName || undefined,
          enfermoName: i.enfermoName || undefined,
          date: i.date || undefined,
          description: i.description || undefined,
          oferta: i.oferta ? parseFloat(i.oferta) : undefined,
        })),
      };

      const result = await apiFetch(`/public/parishes/${slug}/requests`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      router.push(`/p/${slug}/success?protocol=${result.protocol}`);
    } catch (err: any) {
      setError(err.message || "Erro ao enviar pedido.");
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
              <div
                key={label}
                className={`flex items-center ${i < STEPS.length - 1 ? "flex-1" : ""}`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    i <= step
                      ? "bg-primary-600 text-white"
                      : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {i < step ? (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-2 ${
                      i < step ? "bg-primary-600" : "bg-gray-200"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between">
            {STEPS.map((label, i) => (
              <span
                key={label}
                className={`text-xs ${
                  i <= step ? "text-primary-600 font-medium" : "text-gray-400"
                }`}
              >
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
          <Card title="Identificacao">
            <div className="space-y-4">
              <PhoneInput
                label="Telefone"
                value={phone}
                onChange={setPhone}
              />
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
          <Card title="Data e Horario">
            <div className="space-y-4">
              <Input
                label="Data da Missa"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
              />

              {date && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Horario
                  </label>
                  {loadingMasses ? (
                    <p className="text-sm text-gray-500">
                      Carregando horarios...
                    </p>
                  ) : massOptions.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      Nenhuma missa disponivel nesta data.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {massOptions.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setTime(opt.time)}
                          className={`px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                            time === opt.time
                              ? "bg-primary-600 text-white border-primary-600"
                              : "bg-white text-gray-700 border-gray-200 hover:border-primary-300 hover:bg-primary-50"
                          }`}
                        >
                          {opt.time}
                          {opt.label && (
                            <span className="block text-xs opacity-75 mt-0.5">
                              {opt.label}
                            </span>
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
                Intencoes ({intentions.length}/{limit.maxIntentionsPerRequest})
              </h3>
              <Button
                variant="secondary"
                size="sm"
                onClick={addIntention}
                disabled={
                  intentions.length >= limit.maxIntentionsPerRequest
                }
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
                    aria-label="Remover intencao"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                )}

                <div className="space-y-3">
                  <p className="text-sm font-medium text-gray-500">
                    Intencao {index + 1}
                  </p>

                  <Select
                    label="Grupo"
                    options={GROUP_OPTIONS}
                    value={intention.group}
                    onChange={(e) =>
                      updateIntention(index, "group", e.target.value)
                    }
                    placeholder="Selecione o grupo"
                  />

                  {intention.group && (
                    <Select
                      label="Tipo"
                      options={
                        (typesByGroup[intention.group] || []).map((t) => ({
                          value: t.id,
                          label: t.name,
                        }))
                      }
                      value={intention.typeId}
                      onChange={(e) =>
                        updateIntention(index, "typeId", e.target.value)
                      }
                      placeholder="Selecione o tipo"
                    />
                  )}

                  {/* Dynamic fields based on type flags */}
                  {intention.typeId && (() => {
                    const type = getTypeForIntention(intention);
                    if (!type) return null;
                    return (
                      <>
                        {type.hasDeceased && (
                          <Input
                            label="Nome do(a) falecido(a)"
                            value={intention.deceasedName || ""}
                            onChange={(e) =>
                              updateIntention(
                                index,
                                "deceasedName",
                                e.target.value
                              )
                            }
                            placeholder="Nome completo"
                          />
                        )}
                        {type.hasEnfermo && (
                          <Input
                            label="Nome do(a) enfermo(a)"
                            value={intention.enfermoName || ""}
                            onChange={(e) =>
                              updateIntention(
                                index,
                                "enfermoName",
                                e.target.value
                              )
                            }
                            placeholder="Nome completo"
                          />
                        )}
                        {type.hasDate && (
                          <Input
                            label="Data"
                            type="date"
                            value={intention.date || ""}
                            onChange={(e) =>
                              updateIntention(index, "date", e.target.value)
                            }
                          />
                        )}
                        {type.hasDescription && (
                          <Input
                            label="Descricao"
                            value={intention.description || ""}
                            onChange={(e) =>
                              updateIntention(
                                index,
                                "description",
                                e.target.value
                              )
                            }
                            placeholder="Descreva brevemente"
                          />
                        )}
                      </>
                    );
                  })()}

                  <Input
                    label="Oferta (opcional)"
                    type="number"
                    min="0"
                    step="0.01"
                    value={intention.oferta || ""}
                    onChange={(e) =>
                      updateIntention(index, "oferta", e.target.value)
                    }
                    placeholder="R$ 0,00"
                  />
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Step 4: Confirmation */}
        {step === 3 && (
          <Card title="Confirmacao">
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
                  <span className="font-medium text-gray-900">{date}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Horario:</span>
                  <span className="font-medium text-gray-900">{time}</span>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">
                  Intencoes ({intentions.length})
                </h4>
                <div className="space-y-2">
                  {intentions.map((intention, index) => {
                    const groupLabel =
                      GROUP_OPTIONS.find((g) => g.value === intention.group)
                        ?.label || intention.group;
                    const type = getTypeForIntention(intention);
                    return (
                      <div
                        key={index}
                        className="bg-gray-50 rounded-lg p-3 text-sm"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-gray-900">
                            {index + 1}. {type?.name || "—"}
                          </span>
                          <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full">
                            {groupLabel}
                          </span>
                        </div>
                        {intention.deceasedName && (
                          <p className="text-gray-600">
                            Falecido(a): {intention.deceasedName}
                          </p>
                        )}
                        {intention.enfermoName && (
                          <p className="text-gray-600">
                            Enfermo(a): {intention.enfermoName}
                          </p>
                        )}
                        {intention.description && (
                          <p className="text-gray-600">
                            {intention.description}
                          </p>
                        )}
                        {intention.oferta && (
                          <p className="text-gray-600">
                            Oferta: R$ {parseFloat(intention.oferta).toFixed(2)}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-6">
          <Button
            variant="secondary"
            onClick={prevStep}
            disabled={step === 0}
          >
            Voltar
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={nextStep}>Proximo</Button>
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
