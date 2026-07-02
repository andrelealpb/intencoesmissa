"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiAuthFetch } from "@/lib/api";
import {
  getMemberToken,
  clearMemberToken,
} from "@/lib/member-session";

// ---- Types (espelham a API do realm de membro) ----

type EffectiveStatus = "AVAILABLE" | "UNAVAILABLE";
type Source = "explicit" | "rule" | "default";

interface Availability {
  status: EffectiveStatus;
  source: Source;
}

interface Occurrence {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  title: string | null;
  isSolemnity: boolean;
  availability: Availability;
}

interface Rule {
  id?: string;
  weekday: number;
  time: string | null;
  available: boolean;
}

const WEEKDAYS = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatDay(iso: string): { weekday: string; label: string } {
  const d = new Date(iso + "T00:00:00.000Z");
  const weekday = WEEKDAYS[d.getUTCDay()];
  const label = `${String(d.getUTCDate()).padStart(2, "0")}/${String(
    d.getUTCMonth() + 1,
  ).padStart(2, "0")}`;
  return { weekday, label };
}

export default function EscalaPortalPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params.slug;

  const [token, setToken] = useState<string | null>(null);
  const [memberName, setMemberName] = useState<string>("");
  const [month, setMonth] = useState<string>(currentMonth());
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({});
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);

  // Redireciona pro login se não há sessão de membro.
  const requireAuth = useCallback(() => {
    clearMemberToken(slug);
    router.replace(`/p/${slug}/escala/entrar`);
  }, [slug, router]);

  useEffect(() => {
    const t = getMemberToken(slug);
    if (!t) {
      router.replace(`/p/${slug}/escala/entrar`);
      return;
    }
    setToken(t);
  }, [slug, router]);

  // Perfil (nome no cabeçalho).
  useEffect(() => {
    if (!token) return;
    apiAuthFetch(`/escala/me`, token)
      .then((res) => setMemberName(res?.fullName ?? ""))
      .catch((err) => {
        if (String(err?.message).includes("autenticado")) requireAuth();
      });
  }, [token, requireAuth]);

  // Ocorrências do mês.
  const loadOccurrences = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await apiAuthFetch(
        `/escala/me/occurrences?month=${month}`,
        token,
      );
      setOccurrences(res ?? []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("autenticado")) {
        requireAuth();
        return;
      }
      setOccurrences([]);
    } finally {
      setLoading(false);
    }
  }, [token, month, requireAuth]);

  useEffect(() => {
    loadOccurrences();
  }, [loadOccurrences]);

  // Autosave de um toggle. `status` = AVAILABLE | UNAVAILABLE | CLEAR.
  async function save(occ: Occurrence, status: "AVAILABLE" | "UNAVAILABLE" | "CLEAR") {
    if (!token) return;
    setSavingIds((s) => ({ ...s, [occ.id]: true }));
    try {
      const res = await apiAuthFetch(`/escala/me/availability`, token, {
        method: "PUT",
        body: JSON.stringify({ occurrenceId: occ.id, status }),
      });
      if (res?.availability) {
        setOccurrences((list) =>
          list.map((o) =>
            o.id === occ.id ? { ...o, availability: res.availability } : o,
          ),
        );
        setSavedAt(Date.now());
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("autenticado")) requireAuth();
    } finally {
      setSavingIds((s) => ({ ...s, [occ.id]: false }));
    }
  }

  function logout() {
    clearMemberToken(slug);
    router.replace(`/p/${slug}/escala/entrar`);
  }

  if (!token) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-gray-500">Redirecionando…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-16">
      {/* Cabeçalho */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-gray-900">
              Minha disponibilidade
            </h1>
            {memberName && (
              <p className="text-xs text-gray-500">{memberName}</p>
            )}
          </div>
          <button
            onClick={logout}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Sair
          </button>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* Seletor de mês + estado de salvo */}
        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <span>Mês</span>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </label>
          {savedAt && (
            <span className="text-xs text-green-600 flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Salvo
            </span>
          )}
        </div>

        {/* Editor de regra recorrente */}
        <RuleEditor
          token={token}
          open={rulesOpen}
          onToggle={() => setRulesOpen((v) => !v)}
          onSaved={loadOccurrences}
        />

        {/* Lista do mês */}
        {loading ? (
          <p className="text-center text-sm text-gray-500 py-8">Carregando…</p>
        ) : occurrences.length === 0 ? (
          <Card>
            <p className="text-center text-sm text-gray-500 py-6">
              A escala deste mês ainda não foi aberta pela coordenação.
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {occurrences.map((occ) => (
              <OccurrenceRow
                key={occ.id}
                occ={occ}
                saving={Boolean(savingIds[occ.id])}
                onSet={(status) => save(occ, status)}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

// ---- Linha de ocorrência com toggle binário (U4) ----

function OccurrenceRow({
  occ,
  saving,
  onSet,
}: {
  occ: Occurrence;
  saving: boolean;
  onSet: (status: "AVAILABLE" | "UNAVAILABLE" | "CLEAR") => void;
}) {
  const { weekday, label } = formatDay(occ.date);
  const available = occ.availability.status === "AVAILABLE";

  return (
    <Card noPadding>
      <div className="px-4 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">
              {weekday} {label}
            </span>
            <span className="text-sm text-gray-500">{occ.time}</span>
            {occ.isSolemnity && <Badge variant="warning">Solenidade</Badge>}
          </div>
          {occ.title && (
            <p className="text-xs text-gray-500 truncate">{occ.title}</p>
          )}
          {occ.availability.source === "default" && (
            <p className="text-xs text-gray-400">Sem resposta</p>
          )}
          {occ.availability.source === "rule" && (
            <p className="text-xs text-gray-400">Pela sua regra</p>
          )}
        </div>

        <div className="flex-shrink-0 flex items-center gap-1">
          <div
            className="inline-flex rounded-lg border border-gray-200 overflow-hidden"
            role="group"
            aria-label="Disponibilidade"
          >
            <button
              type="button"
              disabled={saving}
              onClick={() => onSet("AVAILABLE")}
              className={`px-3 py-2 text-xs font-medium transition-colors ${
                available
                  ? "bg-green-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              Disponível
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => onSet("UNAVAILABLE")}
              className={`px-3 py-2 text-xs font-medium transition-colors border-l border-gray-200 ${
                !available
                  ? "bg-gray-700 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              Indisponível
            </button>
          </div>
        </div>
      </div>
      {occ.availability.source === "explicit" && (
        <div className="px-4 pb-2 text-right">
          <button
            type="button"
            disabled={saving}
            onClick={() => onSet("CLEAR")}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Seguir a regra
          </button>
        </div>
      )}
    </Card>
  );
}

// ---- Editor de regra recorrente (replace-set) ----

function RuleEditor({
  token,
  open,
  onToggle,
  onSaved,
}: {
  token: string;
  open: boolean;
  onToggle: () => void;
  onSaved: () => void;
}) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const loadedFor = useRef(false);

  useEffect(() => {
    if (!open || loadedFor.current) return;
    loadedFor.current = true;
    apiAuthFetch(`/escala/me/rules`, token)
      .then((res: Rule[]) => setRules(res ?? []))
      .catch(() => setRules([]))
      .finally(() => setLoaded(true));
  }, [open, token]);

  function addRule() {
    setRules((r) => [...r, { weekday: 0, time: null, available: true }]);
  }

  function updateRule(index: number, patch: Partial<Rule>) {
    setRules((r) => r.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
  }

  function removeRule(index: number) {
    setRules((r) => r.filter((_, i) => i !== index));
  }

  async function save() {
    setSaving(true);
    try {
      await apiAuthFetch(`/escala/me/rules`, token, {
        method: "PUT",
        body: JSON.stringify({
          rules: rules.map((r) => ({
            weekday: r.weekday,
            time: r.time && r.time.length > 0 ? r.time : null,
            available: r.available,
          })),
        }),
      });
      onSaved();
    } catch {
      /* mantém o editor aberto; usuário pode tentar de novo */
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card noPadding>
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between text-left"
      >
        <div>
          <span className="text-sm font-semibold text-gray-900">
            Regras recorrentes
          </span>
          <p className="text-xs text-gray-500">
            Ex.: &quot;sempre disponível aos domingos às 10h&quot;.
          </p>
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
          {!loaded ? (
            <p className="text-sm text-gray-500">Carregando…</p>
          ) : (
            <>
              {rules.length === 0 && (
                <p className="text-sm text-gray-500">
                  Nenhuma regra. Adicione para pré-preencher o mês.
                </p>
              )}
              {rules.map((rule, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <select
                    value={rule.weekday}
                    onChange={(e) =>
                      updateRule(i, { weekday: Number(e.target.value) })
                    }
                    className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                  >
                    {WEEKDAYS.map((w, idx) => (
                      <option key={idx} value={idx}>
                        {w}
                      </option>
                    ))}
                  </select>
                  <input
                    type="time"
                    value={rule.time ?? ""}
                    onChange={(e) =>
                      updateRule(i, { time: e.target.value || null })
                    }
                    className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                    aria-label="Horário (vazio = dia inteiro)"
                  />
                  <select
                    value={rule.available ? "1" : "0"}
                    onChange={(e) =>
                      updateRule(i, { available: e.target.value === "1" })
                    }
                    className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                  >
                    <option value="1">Disponível</option>
                    <option value="0">Indisponível</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => removeRule(i)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Remover
                  </button>
                </div>
              ))}
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={addRule}
                  className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                >
                  + Adicionar regra
                </button>
                <Button size="sm" loading={saving} onClick={save}>
                  Salvar regras
                </Button>
              </div>
              <p className="text-xs text-gray-400">
                Horário vazio = dia inteiro. As regras pré-preenchem o mês; você
                ainda pode ajustar cada missa.
              </p>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
