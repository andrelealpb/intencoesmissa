'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { apiAuthFetch } from '@/lib/api';
import {
  buildPersonPanel,
  candidateReasonLabels,
  conflictLabel,
  formatOccurrenceDate,
  gapLabels,
  splitCandidates,
  type GridCandidate,
  type GridOccurrence,
  type GridSlot,
  type ScheduleGrid,
  type Team,
} from '@/lib/escala';

// Mês corrente em YYYY-MM (UTC).
function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

interface SuggestResult {
  created: number;
  gaps: unknown[];
}

// Alvo do modal de resolução de vaga (V2/V3).
interface ResolveTarget {
  occ: GridOccurrence;
  slot: GridSlot;
}

// Alvo do modal de override consciente (escolher um excluído — V2).
interface OverrideTarget {
  occ: GridOccurrence;
  slot: GridSlot;
  candidate: GridCandidate;
}

export default function EscalaMontagemPage() {
  const { data: session } = useSession();
  const token = session?.accessToken as string;

  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState('');
  const [month, setMonth] = useState(currentMonth());

  const [grid, setGrid] = useState<ScheduleGrid | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [suggesting, setSuggesting] = useState(false);
  const [suggestMsg, setSuggestMsg] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState('');
  const [actionError, setActionError] = useState('');

  // Modais.
  const [resolve, setResolve] = useState<ResolveTarget | null>(null);
  const [override, setOverride] = useState<OverrideTarget | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [saving, setSaving] = useState(false);

  // Carrega as equipes (nível paróquia — admin; coordenador veria só as suas,
  // mas esta tela admin usa o token NextAuth). Só ativas.
  useEffect(() => {
    if (!token) return;
    apiAuthFetch('/admin/escala/teams', token)
      .then((list: Team[]) => {
        const actives = list.filter((t) => t.isActive);
        setTeams(actives);
        if (actives.length > 0) setTeamId((prev) => prev || actives[0].id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Erro ao carregar equipes.'));
  }, [token]);

  const loadGrid = useCallback(async () => {
    if (!token || !teamId || !month) return;
    setLoading(true);
    setError('');
    try {
      const data = (await apiAuthFetch(
        `/escala/schedule?month=${month}&teamId=${teamId}`,
        token,
      )) as ScheduleGrid;
      setGrid(data);
    } catch (e) {
      setGrid(null);
      setError(e instanceof Error ? e.message : 'Erro ao carregar a grade.');
    } finally {
      setLoading(false);
    }
  }, [token, teamId, month]);

  useEffect(() => {
    setSuggestMsg('');
    setPublishMsg('');
    setActionError('');
    loadGrid();
  }, [loadGrid]);

  const handleSuggest = async () => {
    if (!token || !teamId) return;
    setSuggesting(true);
    setSuggestMsg('');
    setActionError('');
    try {
      const res = (await apiAuthFetch('/escala/schedule/suggest', token, {
        method: 'POST',
        body: JSON.stringify({ month, teamIds: [teamId] }),
      })) as SuggestResult;
      setSuggestMsg(
        `Sugestão aplicada: ${res.created} vaga(s) preenchida(s); ${res.gaps.length} lacuna(s) restante(s). Só vagas vazias foram preenchidas — seus ajustes manuais foram preservados.`,
      );
      await loadGrid();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Erro ao sugerir distribuição.');
    } finally {
      setSuggesting(false);
    }
  };

  const handlePublish = async () => {
    if (!token || !teamId) return;
    if (
      !confirm(
        'Publicar a escala desta equipe/mês? Ela ficará visível aos voluntários e continuará editável.',
      )
    )
      return;
    setPublishing(true);
    setPublishMsg('');
    setActionError('');
    try {
      const res = (await apiAuthFetch('/escala/schedule/publish', token, {
        method: 'POST',
        body: JSON.stringify({ month, teamId }),
      })) as { published: number; resealed: number };
      setPublishMsg(
        `Escala publicada (${res.published} nova(s), ${res.resealed} re-selada(s)). Continua editável.`,
      );
      await loadGrid();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Erro ao publicar.');
    } finally {
      setPublishing(false);
    }
  };

  const handleRemove = async (assignmentId: string) => {
    if (!token || !confirm('Remover esta atribuição?')) return;
    setActionError('');
    try {
      await apiAuthFetch(`/escala/assignments/${assignmentId}`, token, { method: 'DELETE' });
      await loadGrid();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Erro ao remover atribuição.');
    }
  };

  // Escala um candidato numa vaga. `reason` só quando é override consciente (V2).
  const assignCandidate = async (
    target: ResolveTarget,
    candidate: GridCandidate,
    reason?: string,
  ) => {
    if (!token) return;
    setSaving(true);
    setActionError('');
    try {
      await apiAuthFetch('/escala/assignments', token, {
        method: 'POST',
        body: JSON.stringify({
          occurrenceId: target.occ.occurrenceId,
          functionId: target.slot.functionId,
          memberId: candidate.memberId,
          overrideReason: reason?.trim() || undefined,
        }),
      });
      setResolve(null);
      setOverride(null);
      setOverrideReason('');
      await loadGrid();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Erro ao escalar.');
    } finally {
      setSaving(false);
    }
  };

  // Clique num candidato na lista priorizada: elegível → escala direto;
  // excluído (indisponível/teto) → abre o modal de override consciente (V2);
  // em contenda (já na ocorrência) → desabilitado, não chega aqui.
  const handlePickCandidate = (candidate: GridCandidate) => {
    if (!resolve) return;
    if (candidate.eligible) {
      assignCandidate(resolve, candidate);
    } else {
      setOverride({ occ: resolve.occ, slot: resolve.slot, candidate });
      setOverrideReason('');
    }
  };

  const persons = useMemo(
    () => (grid ? buildPersonPanel(grid.occurrences) : []),
    [grid],
  );

  const pub = grid?.publication;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-2">Montagem da Escala</h1>
      <p className="text-sm text-gray-500 mb-6">
        Veja o rascunho por missa, resolva as lacunas, ajuste à mão e publique. O algoritmo
        sugere; você decide.
      </p>

      {/* Controles */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Equipe</label>
            <select
              className="border rounded px-3 py-2 text-sm min-w-[200px]"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
            >
              {teams.length === 0 && <option value="">Nenhuma equipe</option>}
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Mês</label>
            <input
              type="month"
              className="border rounded px-3 py-2 text-sm"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
          <button
            onClick={handleSuggest}
            disabled={suggesting || !teamId || !grid || grid.occurrences.length === 0}
            className="bg-indigo-600 text-white px-4 py-2 rounded text-sm hover:bg-indigo-700 disabled:opacity-60"
            title="Preenche apenas vagas vazias — não altera nem apaga o que você já ajustou."
          >
            {suggesting ? 'Sugerindo...' : 'Sugerir distribuição'}
          </button>
          <button
            onClick={handlePublish}
            disabled={publishing || !teamId || !grid || grid.occurrences.length === 0}
            className="bg-emerald-600 text-white px-4 py-2 rounded text-sm hover:bg-emerald-700 disabled:opacity-60"
          >
            {publishing ? 'Publicando...' : 'Publicar equipe/mês'}
          </button>

          {pub && (
            <div className="ml-auto text-sm">
              {pub.published ? (
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" /> Publicada
                  {pub.hasUnpublishedChanges && (
                    <span className="ml-2 text-amber-600">• mudanças não publicadas</span>
                  )}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-gray-500">
                  <span className="w-2 h-2 rounded-full bg-gray-400" /> Rascunho (não publicada)
                </span>
              )}
            </div>
          )}
        </div>

        <p className="text-xs text-gray-400 mt-3">
          <strong>Sugerir distribuição</strong> preenche só as vagas vazias (não sobrescreve
          ajustes). <strong>Publicar</strong> torna a escala visível ao voluntário — e ela segue
          editável depois.
        </p>

        {suggestMsg && <p className="mt-3 text-sm text-indigo-700">{suggestMsg}</p>}
        {publishMsg && <p className="mt-3 text-sm text-emerald-700">{publishMsg}</p>}
        {actionError && <p className="mt-3 text-sm text-red-700">{actionError}</p>}
      </div>

      {error && (
        <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && <p className="text-gray-500 text-sm">Carregando grade...</p>}

      {!loading && grid && grid.occurrences.length === 0 && (
        <div className="bg-white rounded-lg shadow p-6 text-sm text-gray-600">
          Nenhuma ocorrência de missa neste mês para esta equipe. Abra o mês
          (materialização) em <em>Equipes → Abrir mês</em> e configure a demanda da equipe.
        </div>
      )}

      {!loading && grid && grid.occurrences.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Grade por missa (V1) */}
          <div className="lg:col-span-2 space-y-4">
            {grid.occurrences.map((occ) => (
              <OccurrenceCard
                key={occ.occurrenceId}
                occ={occ}
                onResolve={(slot) => {
                  setActionError('');
                  setResolve({ occ, slot });
                }}
                onRemove={handleRemove}
              />
            ))}
          </div>

          {/* Painel por pessoa (V1 — conferência da justiça) */}
          <div className="lg:col-span-1">
            <PersonPanel persons={persons} teamName={grid.teamName} />
          </div>
        </div>
      )}

      {/* Modal de resolução de vaga (V2/V3) */}
      {resolve && (
        <ResolveModal
          target={resolve}
          saving={saving}
          onPick={handlePickCandidate}
          onClose={() => setResolve(null)}
        />
      )}

      {/* Modal de override consciente (V2) */}
      {override && (
        <OverrideModal
          target={override}
          reason={overrideReason}
          saving={saving}
          onReason={setOverrideReason}
          onConfirm={() =>
            assignCandidate(
              { occ: override.occ, slot: override.slot },
              override.candidate,
              overrideReason,
            )
          }
          onCancel={() => {
            setOverride(null);
            setOverrideReason('');
          }}
        />
      )}
    </div>
  );
}

// ── Cartão de uma ocorrência (missa) com suas vagas por função ────────────────
function OccurrenceCard({
  occ,
  onResolve,
  onRemove,
}: {
  occ: GridOccurrence;
  onResolve: (slot: GridSlot) => void;
  onRemove: (assignmentId: string) => void;
}) {
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="px-4 py-3 border-b bg-gray-50 flex items-center gap-2">
        <span className="font-semibold text-gray-800">
          {formatOccurrenceDate(occ.date, occ.weekday)}
        </span>
        <span className="text-gray-500">·</span>
        <span className="text-gray-700">{occ.time}</span>
        {occ.isSolemnity && (
          <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
            Solenidade
          </span>
        )}
      </div>
      <div className="divide-y">
        {occ.slots.map((slot) => (
          <div key={slot.functionId} className="px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">{slot.functionName}</span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  slot.missing > 0
                    ? 'bg-red-50 text-red-600'
                    : 'bg-emerald-50 text-emerald-700'
                }`}
              >
                {slot.filled}/{slot.required}
              </span>
            </div>

            {/* Nomes preenchidos */}
            <div className="flex flex-wrap gap-2 mb-2">
              {slot.assignments.map((a) => (
                <span
                  key={a.assignmentId}
                  className={`inline-flex items-center gap-1 text-sm px-2 py-1 rounded border ${
                    a.published
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-blue-50 border-blue-200 text-blue-800'
                  }`}
                  title={
                    (a.published ? 'Publicado' : 'Rascunho') +
                    (a.overrideReason ? ` · override: ${a.overrideReason}` : '')
                  }
                >
                  {a.memberName}
                  {a.overrideReason && <span className="text-amber-600" title={a.overrideReason}>⚠</span>}
                  <button
                    onClick={() => onRemove(a.assignmentId)}
                    className="text-gray-400 hover:text-red-600"
                    aria-label="Remover"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>

            {/* Lacunas destacadas com motivo + botão de resolução */}
            {slot.missing > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {Array.from({ length: slot.missing }).map((_, i) => (
                  <span
                    key={i}
                    className="text-sm px-2 py-1 rounded border border-dashed border-red-300 text-red-500"
                  >
                    vaga aberta
                  </span>
                ))}
                {slot.gap && (
                  <span className="text-xs text-red-500">— {gapLabels[slot.gap]}</span>
                )}
                <button
                  onClick={() => onResolve(slot)}
                  className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                >
                  Resolver vaga
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Painel por pessoa (conferência da justiça — V1) ───────────────────────────
function PersonPanel({
  persons,
  teamName,
}: {
  persons: ReturnType<typeof buildPersonPanel>;
  teamName: string;
}) {
  return (
    <div className="bg-white rounded-lg shadow p-4 sticky top-4">
      <h2 className="font-semibold text-gray-800 mb-1">Por pessoa</h2>
      <p className="text-xs text-gray-500 mb-3">
        Conferência do rodízio de <strong>{teamName}</strong> no mês (nº de serviços + datas).
      </p>
      {persons.length === 0 ? (
        <p className="text-sm text-gray-500">Sem membros qualificados.</p>
      ) : (
        <ul className="space-y-2">
          {persons.map((p) => (
            <li key={p.memberId} className="text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-700">{p.memberName}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    p.count === 0 ? 'bg-gray-100 text-gray-500' : 'bg-blue-50 text-blue-700'
                  }`}
                >
                  {p.count} {p.count === 1 ? 'serviço' : 'serviços'}
                </span>
              </div>
              {p.services.length > 0 && (
                <p className="text-xs text-gray-400 mt-0.5">
                  {p.services
                    .map((s) => `${s.date.slice(8, 10)}/${s.date.slice(5, 7)} ${s.time}`)
                    .join(' · ')}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Modal: lista priorizada de candidatos (V2/V3) ─────────────────────────────
function ResolveModal({
  target,
  saving,
  onPick,
  onClose,
}: {
  target: ResolveTarget;
  saving: boolean;
  onPick: (candidate: GridCandidate) => void;
  onClose: () => void;
}) {
  const { eligible, excluded } = splitCandidates(target.slot.candidates);
  const occTime = target.occ.time;

  return (
    <Modal onClose={onClose}>
      <h3 className="font-semibold text-gray-800 mb-1">
        Resolver vaga — {target.slot.functionName}
      </h3>
      <p className="text-xs text-gray-500 mb-4">
        {formatOccurrenceDate(target.occ.date, target.occ.weekday)} · {occTime}. Elegíveis
        primeiro; excluídos rotulados; em contenda desabilitados.
      </p>

      {eligible.length === 0 && excluded.length === 0 && (
        <p className="text-sm text-gray-500">Nenhum membro qualificado para esta função.</p>
      )}

      {eligible.length > 0 && (
        <>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
            Elegíveis
          </p>
          <ul className="space-y-1 mb-4">
            {eligible.map((c) => (
              <li key={c.memberId}>
                <button
                  disabled={saving}
                  onClick={() => onPick(c)}
                  className="w-full text-left px-3 py-2 rounded border border-gray-200 hover:bg-blue-50 hover:border-blue-300 text-sm flex items-center justify-between disabled:opacity-60"
                >
                  <span className="text-gray-800">{c.memberName}</span>
                  <span className="text-xs text-gray-400">
                    {c.assignmentsInTeamMonth} no mês
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {excluded.length > 0 && (
        <>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
            Excluídos
          </p>
          <ul className="space-y-1">
            {excluded.map((c) => {
              const inContention = c.alreadyInOccurrence && c.conflict;
              return (
                <li key={c.memberId}>
                  <button
                    disabled={saving || Boolean(inContention)}
                    onClick={() => onPick(c)}
                    className="w-full text-left px-3 py-2 rounded border border-gray-200 text-sm flex items-center justify-between disabled:cursor-not-allowed enabled:hover:bg-amber-50 enabled:hover:border-amber-300"
                    title={
                      inContention
                        ? conflictLabel(c.conflict!, occTime)
                        : 'Escolher exige justificativa (override consciente)'
                    }
                  >
                    <span className={inContention ? 'text-gray-400' : 'text-gray-700'}>
                      {c.memberName}
                    </span>
                    <span
                      className={`text-xs ${
                        inContention ? 'text-gray-400' : 'text-amber-600'
                      }`}
                    >
                      {inContention && c.conflict
                        ? conflictLabel(c.conflict, occTime)
                        : c.reason
                          ? candidateReasonLabels[c.reason]
                          : ''}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="mt-6 flex justify-end">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded text-sm bg-gray-200 text-gray-700 hover:bg-gray-300"
        >
          Fechar
        </button>
      </div>
    </Modal>
  );
}

// ── Modal: confirmação de override consciente (V2) ────────────────────────────
function OverrideModal({
  target,
  reason,
  saving,
  onReason,
  onConfirm,
  onCancel,
}: {
  target: OverrideTarget;
  reason: string;
  saving: boolean;
  onReason: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const c = target.candidate;
  return (
    <Modal onClose={onCancel}>
      <h3 className="font-semibold text-gray-800 mb-1">Escalar mesmo assim?</h3>
      <p className="text-sm text-gray-600 mb-3">
        <strong>{c.memberName}</strong> está{' '}
        <span className="text-amber-700">
          {c.reason ? candidateReasonLabels[c.reason] : 'inelegível'}
        </span>{' '}
        para <strong>{target.slot.functionName}</strong> em{' '}
        {formatOccurrenceDate(target.occ.date, target.occ.weekday)} · {target.occ.time}. Escalar
        registra uma justificativa (override consciente).
      </p>
      <label className="block text-xs text-gray-500 mb-1">Justificativa (obrigatória)</label>
      <textarea
        className="border rounded px-3 py-2 text-sm w-full"
        rows={3}
        value={reason}
        onChange={(e) => onReason(e.target.value)}
        placeholder="Ex.: confirmou presença por telefone; cobre a ausência de outro membro."
      />
      <div className="mt-6 flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded text-sm bg-gray-200 text-gray-700 hover:bg-gray-300"
        >
          Cancelar
        </button>
        <button
          onClick={onConfirm}
          disabled={saving || reason.trim().length < 3}
          className="px-4 py-2 rounded text-sm bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60"
        >
          {saving ? 'Escalando...' : 'Escalar com justificativa'}
        </button>
      </div>
    </Modal>
  );
}

// ── Casca de modal reutilizável ───────────────────────────────────────────────
function Modal({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md p-6 max-h-[85vh] overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
