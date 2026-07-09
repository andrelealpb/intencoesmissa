"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiAuthFetch } from "@/lib/api";
import { getMemberToken, clearMemberToken } from "@/lib/member-session";
import {
  weekdayAbbrev,
  weekdayNames,
  monthLabel,
  formatRowDay,
  groupIntoWeeks,
  shiftMonth,
  availabilityView,
  availabilityOrigin,
  dayWideAvailableWeekdays,
  isDayWideAvailable,
  type PortalOccurrence,
  type PortalRule,
  type PortalWeek,
} from "@/lib/escala";

// O portal reusa apenas os endpoints `/escala/me/*` da S6 (backend intocado).
// A UI é o que muda: a regra recorrente vira protagonista no topo, o mês é
// navegado semana a semana, e cada missa ocupa uma linha compacta com toggle de
// um toque — distinguindo "sem resposta" × "indisponível" × "disponível".

type SetStatus = "AVAILABLE" | "UNAVAILABLE" | "CLEAR";

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function todayCivil(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

export default function EscalaPortalPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params.slug;

  const [token, setToken] = useState<string | null>(null);
  const [memberName, setMemberName] = useState<string>("");
  const [month, setMonth] = useState<string>(currentMonth());
  const [occurrences, setOccurrences] = useState<PortalOccurrence[]>([]);
  const [rules, setRules] = useState<PortalRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({});
  const [savedTick, setSavedTick] = useState(0);
  const [weekIndex, setWeekIndex] = useState(0);

  // Para onde ir depois que o mês recarregar (navegação atravessa a virada).
  const pendingWeek = useRef<"first" | "last" | "today" | null>("today");

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

  // Nome no cabeçalho.
  useEffect(() => {
    if (!token) return;
    apiAuthFetch(`/escala/me`, token)
      .then((res) => setMemberName(res?.fullName ?? ""))
      .catch((err) => {
        if (String(err?.message).includes("autenticado")) requireAuth();
      });
  }, [token, requireAuth]);

  // Regras recorrentes (protagonista) — carregadas uma vez.
  const loadRules = useCallback(async () => {
    if (!token) return;
    try {
      const res: PortalRule[] = await apiAuthFetch(`/escala/me/rules`, token);
      setRules(res ?? []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("autenticado")) requireAuth();
    }
  }, [token, requireAuth]);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

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

  const weeks = useMemo(() => groupIntoWeeks(occurrences), [occurrences]);

  // Resolve para qual semana ir sempre que a lista muda (após trocar de mês).
  useEffect(() => {
    if (loading) return;
    const want = pendingWeek.current;
    pendingWeek.current = null;
    if (weeks.length === 0) {
      setWeekIndex(0);
      return;
    }
    if (want === "first") setWeekIndex(0);
    else if (want === "last") setWeekIndex(weeks.length - 1);
    else if (want === "today") {
      const t = todayCivil();
      const idx = weeks.findIndex((w) => t >= w.start && t <= w.end);
      setWeekIndex(idx >= 0 ? idx : 0);
    } else {
      setWeekIndex((i) => Math.min(i, weeks.length - 1));
    }
  }, [weeks, loading]);

  const currentWeek: PortalWeek | null = weeks[weekIndex] ?? null;

  function goPrevWeek() {
    if (weekIndex > 0) {
      setWeekIndex((i) => i - 1);
    } else {
      pendingWeek.current = "last";
      setMonth((m) => shiftMonth(m, -1));
    }
  }

  function goNextWeek() {
    if (weeks.length > 0 && weekIndex < weeks.length - 1) {
      setWeekIndex((i) => i + 1);
    } else {
      pendingWeek.current = "first";
      setMonth((m) => shiftMonth(m, 1));
    }
  }

  function jumpToMonth(next: string) {
    if (!next) return;
    pendingWeek.current = "today";
    setMonth(next);
  }

  // Autosave de um toggle de missa (mesmo contrato da S6).
  async function saveOccurrence(occ: PortalOccurrence, status: SetStatus) {
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
        setSavedTick((t) => t + 1);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("autenticado")) requireAuth();
    } finally {
      setSavingIds((s) => ({ ...s, [occ.id]: false }));
    }
  }

  // Salva o conjunto de regras e repõe o mês (o pré-preenchimento reflete). O
  // estado local muda na hora (otimista) e a gravação é coalescida — toques
  // rápidos em vários chips viram um PUT só, sem perder nenhum toque.
  const pendingRules = useRef<PortalRule[] | null>(null);
  const rulesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushRules = useCallback(async () => {
    const payload = pendingRules.current;
    if (!token || payload === null) return;
    pendingRules.current = null;
    try {
      await apiAuthFetch(`/escala/me/rules`, token, {
        method: "PUT",
        body: JSON.stringify({
          rules: payload.map((r) => ({
            weekday: r.weekday,
            time: r.time && r.time.length > 0 ? r.time : null,
            available: r.available,
          })),
        }),
      });
      setSavedTick((t) => t + 1);
      await loadOccurrences();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("autenticado")) requireAuth();
    }
  }, [token, loadOccurrences, requireAuth]);

  function saveRules(next: PortalRule[]) {
    setRules(next); // otimista: chips e ajuste fino respondem na hora
    pendingRules.current = next;
    if (rulesTimer.current) clearTimeout(rulesTimer.current);
    rulesTimer.current = setTimeout(() => {
      void flushRules();
    }, 400);
  }

  useEffect(() => {
    return () => {
      if (rulesTimer.current) clearTimeout(rulesTimer.current);
    };
  }, []);

  function logout() {
    clearMemberToken(slug);
    router.replace(`/p/${slug}/escala/entrar`);
  }

  if (!token) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Redirecionando…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen min-h-[100dvh] bg-gray-50 pb-20">
      {/* Cabeçalho */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-gray-900 leading-tight">
              Minha disponibilidade
            </h1>
            {memberName && (
              <p className="text-xs text-gray-500 truncate">{memberName}</p>
            )}
          </div>
          <button
            onClick={logout}
            className="shrink-0 text-xs font-medium text-gray-400 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded px-1 py-0.5"
          >
            Sair
          </button>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-5">
        {/* Protagonista: a regra de sempre (R1) */}
        <RuleHero rules={rules} onSave={saveRules} />

        {/* Navegação semana a semana (R2) */}
        <section aria-label="Missas por semana">
          <WeekNav
            month={month}
            week={currentWeek}
            weekPosition={
              weeks.length ? { index: weekIndex, total: weeks.length } : null
            }
            onPrev={goPrevWeek}
            onNext={goNextWeek}
            onJumpMonth={jumpToMonth}
          />

          <div className="mt-3">
            {loading ? (
              <ListSkeleton />
            ) : !currentWeek ? (
              <EmptyMonth />
            ) : (
              <>
                <WeekLegend unanswered={currentWeek.unanswered} />
                <ul className="mt-2 space-y-2">
                  {currentWeek.occurrences.map((occ) => (
                    <li key={occ.id}>
                      <OccurrenceRow
                        occ={occ}
                        saving={Boolean(savingIds[occ.id])}
                        onSet={(status) => saveOccurrence(occ, status)}
                      />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </section>
      </div>

      <SavedToast tick={savedTick} />
    </main>
  );
}

// ─── Protagonista: regra de sempre (R1) ──────────────────────────────────────

function RuleHero({
  rules,
  onSave,
}: {
  rules: PortalRule[];
  onSave: (next: PortalRule[]) => void;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const selected = useMemo(() => dayWideAvailableWeekdays(rules), [rules]);
  const timedRules = useMemo(
    () => rules.filter((r) => !isDayWideAvailable(r)),
    [rules],
  );

  function toggleWeekday(weekday: number) {
    const has = selected.has(weekday);
    const next = has
      ? rules.filter((r) => !(isDayWideAvailable(r) && r.weekday === weekday))
      : [...rules, { weekday, time: null, available: true }];
    onSave(next);
  }

  // Edição das regras de horário específico (ajuste fino), com salvamento
  // explícito para não gravar a cada tecla.
  function saveTimed(nextTimed: PortalRule[]) {
    const dayWide = rules.filter(isDayWideAvailable);
    onSave([...dayWide, ...nextTimed]);
  }

  return (
    <section
      aria-label="Sua regra de sempre"
      className="rounded-2xl border border-primary-200 bg-primary-50/60 overflow-hidden"
    >
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start gap-2">
          <span
            aria-hidden
            className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-600 text-white"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3M4 11h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z" />
            </svg>
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-primary-900">
              Sua regra de sempre
            </h2>
            <p className="text-xs text-primary-800/80 leading-snug">
              Marque os dias em que você costuma servir. Isso já preenche o mês
              inteiro — depois é só ajustar as exceções.
            </p>
          </div>
        </div>

        <p className="mt-3 text-sm font-medium text-primary-900">
          Sempre disponível em:
        </p>
        <div
          role="group"
          aria-label="Dias da semana em que você está sempre disponível"
          className="mt-2 grid grid-cols-7 gap-1.5"
        >
          {weekdayAbbrev.map((abbr, wd) => {
            const on = selected.has(wd);
            return (
              <button
                key={wd}
                type="button"
                aria-pressed={on}
                aria-label={`${weekdayNames[wd]}${on ? " (sempre disponível)" : ""}`}
                onClick={() => toggleWeekday(wd)}
                className={`min-h-[44px] rounded-xl text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 ${
                  on
                    ? "bg-primary-600 text-white shadow-sm"
                    : "bg-white text-primary-700 border border-primary-200 hover:bg-primary-100/60"
                }`}
              >
                {abbr}
              </button>
            );
          })}
        </div>
        {selected.size === 0 && timedRules.length === 0 && (
          <p className="mt-2 text-xs text-primary-800/70">
            Nenhum dia marcado ainda. Toque nos dias acima para começar.
          </p>
        )}
      </div>

      {/* Ajuste fino: horário específico (minoria) */}
      <div className="border-t border-primary-200/70 bg-white/40">
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          aria-expanded={advancedOpen}
          className="w-full px-4 py-2.5 flex items-center justify-between text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-b-2xl"
        >
          <span className="text-xs font-medium text-primary-800">
            Preciso de um horário específico
            {timedRules.length > 0 && (
              <span className="ml-1 text-primary-600">
                ({timedRules.length})
              </span>
            )}
          </span>
          <svg
            className={`h-4 w-4 text-primary-500 transition-transform motion-safe:duration-200 ${advancedOpen ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {advancedOpen && (
          <TimedRuleEditor rules={timedRules} onSave={saveTimed} />
        )}
      </div>
    </section>
  );
}

// Editor das regras de horário específico (ex.: "domingo, só às 10h"). Mantém a
// capacidade completa do backend (dia + horário + disponível/indisponível) fora
// do caminho principal. Salvamento explícito.
function TimedRuleEditor({
  rules,
  onSave,
}: {
  rules: PortalRule[];
  onSave: (next: PortalRule[]) => void;
}) {
  const [draft, setDraft] = useState<PortalRule[]>(rules);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    // Reflete atualizações vindas do servidor quando não há edição pendente.
    if (!dirty) setDraft(rules);
  }, [rules, dirty]);

  function update(index: number, patch: Partial<PortalRule>) {
    setDirty(true);
    setDraft((r) => r.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
  }
  function add() {
    setDirty(true);
    setDraft((r) => [...r, { weekday: 0, time: "10:00", available: true }]);
  }
  function remove(index: number) {
    setDirty(true);
    setDraft((r) => r.filter((_, i) => i !== index));
  }
  function commit() {
    onSave(
      draft.map((r) => ({
        weekday: r.weekday,
        time: r.time && r.time.length > 0 ? r.time : null,
        available: r.available,
      })),
    );
    setDirty(false);
  }

  return (
    <div className="px-4 pb-4 pt-1 space-y-3">
      {draft.length === 0 && (
        <p className="text-xs text-gray-500">
          Sem horários específicos. Use isto só quando um dia inteiro não valer —
          por exemplo, disponível no domingo apenas às 10h.
        </p>
      )}
      {draft.map((rule, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <select
            value={rule.weekday}
            onChange={(e) => update(i, { weekday: Number(e.target.value) })}
            aria-label="Dia da semana"
            className="min-h-[40px] rounded-lg border border-gray-300 bg-white px-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          >
            {weekdayNames.map((w, idx) => (
              <option key={idx} value={idx}>
                {w}
              </option>
            ))}
          </select>
          <input
            type="time"
            value={rule.time ?? ""}
            onChange={(e) => update(i, { time: e.target.value || null })}
            aria-label="Horário"
            className="min-h-[40px] rounded-lg border border-gray-300 bg-white px-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          />
          <select
            value={rule.available ? "1" : "0"}
            onChange={(e) => update(i, { available: e.target.value === "1" })}
            aria-label="Disponibilidade da regra"
            className="min-h-[40px] rounded-lg border border-gray-300 bg-white px-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          >
            <option value="1">Disponível</option>
            <option value="0">Indisponível</option>
          </select>
          <button
            type="button"
            onClick={() => remove(i)}
            className="ml-auto text-xs font-medium text-red-500 hover:text-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 rounded px-1 py-0.5"
          >
            Remover
          </button>
        </div>
      ))}
      <div className="flex items-center justify-between gap-3 pt-1">
        <button
          type="button"
          onClick={add}
          className="text-sm font-medium text-primary-600 hover:text-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded px-1 py-0.5"
        >
          + Adicionar horário
        </button>
        <button
          type="button"
          onClick={commit}
          disabled={!dirty}
          className="inline-flex items-center rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
        >
          Salvar horários
        </button>
      </div>
    </div>
  );
}

// ─── Navegação semana a semana (R2) ──────────────────────────────────────────

function WeekNav({
  month,
  week,
  weekPosition,
  onPrev,
  onNext,
  onJumpMonth,
}: {
  month: string;
  week: PortalWeek | null;
  weekPosition: { index: number; total: number } | null;
  onPrev: () => void;
  onNext: () => void;
  onJumpMonth: (month: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <NavArrow direction="prev" onClick={onPrev} />
      <div className="flex-1 min-w-0 text-center">
        <div className="relative inline-block">
          {/* Rótulo da semana; toque abre o seletor de mês do sistema. */}
          <p className="text-sm font-semibold text-gray-900 leading-tight">
            {week ? `Semana de ${week.label}` : monthLabel(month)}
          </p>
          <label className="block cursor-pointer">
            <span className="text-xs text-gray-500 underline decoration-dotted underline-offset-2">
              {monthLabel(month)}
              {weekPosition
                ? ` · semana ${weekPosition.index + 1} de ${weekPosition.total}`
                : ""}
            </span>
            <input
              type="month"
              value={month}
              onChange={(e) => onJumpMonth(e.target.value)}
              aria-label="Escolher o mês"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
        </div>
      </div>
      <NavArrow direction="next" onClick={onNext} />
    </div>
  );
}

function NavArrow({
  direction,
  onClick,
}: {
  direction: "prev" | "next";
  onClick: () => void;
}) {
  const isPrev = direction === "prev";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={isPrev ? "Semana anterior" : "Próxima semana"}
      className="shrink-0 inline-flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-sm transition-colors hover:bg-gray-50 active:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
    >
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d={isPrev ? "M15 19l-7-7 7-7" : "M9 5l7 7-7 7"}
        />
      </svg>
    </button>
  );
}

function WeekLegend({ unanswered }: { unanswered: number }) {
  if (unanswered === 0) {
    return (
      <p className="flex items-center gap-1.5 text-xs font-medium text-green-700">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-green-500" />
        Tudo respondido nesta semana.
      </p>
    );
  }
  return (
    <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-400" />
      {unanswered} {unanswered === 1 ? "missa sem resposta" : "missas sem resposta"}
      {" "}nesta semana.
    </p>
  );
}

// ─── Linha compacta de missa (R3) — toggle de um toque ───────────────────────

function OccurrenceRow({
  occ,
  saving,
  onSet,
}: {
  occ: PortalOccurrence;
  saving: boolean;
  onSet: (status: SetStatus) => void;
}) {
  const { abbr, label } = formatRowDay(occ.date);
  const view = availabilityView(occ.availability);
  const origin = availabilityOrigin(occ.availability.source);
  const source = occ.availability.source;

  const originClass =
    view === "available"
      ? "text-green-700"
      : view === "unavailable"
        ? "text-slate-500"
        : "text-amber-600";

  return (
    <div
      className={`rounded-xl border bg-white px-3 py-2.5 flex items-center gap-3 transition-colors ${
        view === "unanswered"
          ? "border-dashed border-amber-300"
          : "border-gray-200"
      }`}
    >
      {/* Data + hora */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 w-7">
            {abbr}
          </span>
          <span className="text-sm font-semibold text-gray-900">{label}</span>
          <span className="text-sm text-gray-500">{occ.time}</span>
          {occ.isSolemnity && (
            <span
              title="Solenidade"
              aria-label="Solenidade"
              className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-1.5 py-0.5 text-[10px] font-medium text-yellow-700"
            >
              ✦
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 pl-[34px]">
          <span className={`text-[11px] font-medium ${originClass}`}>{origin}</span>
          {occ.title && (
            <span className="text-[11px] text-gray-400 truncate">· {occ.title}</span>
          )}
          {source === "explicit" && (
            <button
              type="button"
              disabled={saving}
              onClick={() => onSet("CLEAR")}
              className="text-[11px] text-gray-400 underline decoration-dotted underline-offset-2 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded disabled:opacity-50"
            >
              seguir a regra
            </button>
          )}
        </div>
      </div>

      {/* Toggle de um toque, binário (R4) */}
      <div
        role="group"
        aria-label={`Disponibilidade — ${abbr} ${label} ${occ.time}`}
        className={`shrink-0 inline-flex overflow-hidden rounded-lg border ${
          view === "unanswered" ? "border-dashed border-amber-300" : "border-gray-200"
        }`}
      >
        <ToggleButton
          active={view === "available"}
          soft={source === "rule"}
          tone="available"
          saving={saving}
          onClick={() => onSet("AVAILABLE")}
        >
          Livre
        </ToggleButton>
        <ToggleButton
          active={view === "unavailable"}
          soft={source === "rule"}
          tone="unavailable"
          saving={saving}
          divider
          onClick={() => onSet("UNAVAILABLE")}
        >
          Não
        </ToggleButton>
      </div>
    </div>
  );
}

// Botão do toggle. O preenchimento codifica a ORIGEM: sólido = você marcou;
// tonalizado = veio da sua regra; apagado = sem resposta.
function ToggleButton({
  active,
  soft,
  tone,
  saving,
  divider,
  onClick,
  children,
}: {
  active: boolean;
  soft: boolean;
  tone: "available" | "unavailable";
  saving: boolean;
  divider?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  let cls: string;
  if (active) {
    if (tone === "available") {
      cls = soft
        ? "bg-green-100 text-green-800 ring-1 ring-inset ring-green-300"
        : "bg-green-600 text-white";
    } else {
      cls = soft
        ? "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-300"
        : "bg-slate-700 text-white";
    }
  } else {
    cls = "bg-white text-gray-400 hover:bg-gray-50";
  }
  return (
    <button
      type="button"
      disabled={saving}
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-[44px] min-w-[52px] px-3 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500 disabled:opacity-60 ${
        divider ? "border-l border-gray-200" : ""
      } ${cls}`}
    >
      {children}
    </button>
  );
}

// ─── Estados auxiliares ──────────────────────────────────────────────────────

function EmptyMonth() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-10 text-center">
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-gray-400">
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3M4 11h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z" />
        </svg>
      </div>
      <p className="text-sm font-medium text-gray-700">
        A escala deste mês ainda não foi aberta pela coordenação.
      </p>
      <p className="mt-1 text-xs text-gray-500">
        Assim que abrir, suas missas aparecem aqui. Sua regra de sempre já fica
        guardada.
      </p>
    </div>
  );
}

function ListSkeleton() {
  return (
    <ul className="space-y-2" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <li
          key={i}
          className="h-[60px] rounded-xl border border-gray-200 bg-white motion-safe:animate-pulse"
        />
      ))}
    </ul>
  );
}

// Confirmação discreta de autosave — reaparece a cada gravação.
function SavedToast({ tick }: { tick: number }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (tick === 0) return;
    setVisible(true);
    const id = setTimeout(() => setVisible(false), 1600);
    return () => clearTimeout(id);
  }, [tick]);

  if (!visible) return null;
  return (
    <div
      role="status"
      className="fixed bottom-5 left-1/2 z-30 -translate-x-1/2"
    >
      <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-900 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
        <svg className="h-3.5 w-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
        Salvo
      </span>
    </div>
  );
}
