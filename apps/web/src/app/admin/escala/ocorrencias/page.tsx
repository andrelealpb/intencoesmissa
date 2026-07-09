'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { apiAuthFetch } from '@/lib/api';
import {
  formatOccurrenceDate,
  weekdayOf,
  affectedLabel,
  type ManagedOccurrence,
  type OccurrenceDeleteResult,
  type OccurrenceAffected,
  type ReconcileResult,
  type ReconcileConflict,
} from '@/lib/escala';

// Mês corrente em YYYY-MM (UTC).
function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

// Alvo do modal de aviso de exclusão (ocorrência com escala/disponibilidade).
interface DeleteTarget {
  id: string;
  label: string; // "Dom 05/07 · 08:00"
  affected: OccurrenceAffected;
}

export default function EscalaOccurrencesPage() {
  const { data: session } = useSession();
  const token = session?.accessToken as string;

  const [month, setMonth] = useState(currentMonth());
  const [occurrences, setOccurrences] = useState<ManagedOccurrence[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Exclusão (modal de aviso quando há dado humano).
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Reconciliação.
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<ReconcileResult | null>(null);
  const [conflicts, setConflicts] = useState<ReconcileConflict[]>([]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const res = (await apiAuthFetch(
        `/escala/occurrences?month=${month}`,
        token,
      )) as ManagedOccurrence[];
      setOccurrences(res ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar ocorrências.');
    } finally {
      setLoading(false);
    }
  }, [token, month]);

  useEffect(() => {
    load();
  }, [load]);

  const labelOf = (o: { date: string; time: string }) =>
    `${formatOccurrenceDate(o.date, weekdayOf(o.date))} · ${o.time}`;

  // Passo 1 da exclusão: DELETE sem force. Vazia → apaga direto; com dado →
  // volta requiresConfirmation e abre o modal de aviso.
  const handleDelete = async (o: ManagedOccurrence) => {
    if (!token) return;
    setError('');
    setBusyId(o.id);
    try {
      const res = (await apiAuthFetch(
        `/escala/occurrences/${o.id}`,
        token,
        { method: 'DELETE' },
      )) as OccurrenceDeleteResult;
      if (res.deleted) {
        setOccurrences((prev) => prev.filter((x) => x.id !== o.id));
      } else if (res.requiresConfirmation) {
        setDeleteTarget({ id: o.id, label: labelOf(o), affected: res.affected });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir.');
    } finally {
      setBusyId(null);
    }
  };

  // Passo 2: confirmação explícita → DELETE com force=true (cascateia).
  const confirmDelete = async () => {
    if (!token || !deleteTarget) return;
    const id = deleteTarget.id;
    setBusyId(id);
    try {
      await apiAuthFetch(`/escala/occurrences/${id}?force=true`, token, {
        method: 'DELETE',
      });
      setOccurrences((prev) => prev.filter((x) => x.id !== id));
      setConflicts((prev) => prev.filter((c) => c.occurrenceId !== id));
      setDeleteTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir.');
    } finally {
      setBusyId(null);
    }
  };

  const handleReconcile = async () => {
    if (!token) return;
    setError('');
    setReconciling(true);
    setReconcileResult(null);
    try {
      const res = (await apiAuthFetch('/escala/occurrences/reconcile', token, {
        method: 'POST',
        body: JSON.stringify({ month }),
      })) as ReconcileResult;
      setReconcileResult(res);
      setConflicts(res.conflicts);
      await load(); // reflete adicionadas/removidas
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao reconciliar o mês.');
    } finally {
      setReconciling(false);
    }
  };

  // Resolução de um conflito: "Manter" (só dispensa) ou "Excluir" (force).
  const keepConflict = (occurrenceId: string) =>
    setConflicts((prev) => prev.filter((c) => c.occurrenceId !== occurrenceId));

  const deleteConflict = async (c: ReconcileConflict) => {
    if (!token) return;
    setBusyId(c.occurrenceId);
    try {
      await apiAuthFetch(`/escala/occurrences/${c.occurrenceId}?force=true`, token, {
        method: 'DELETE',
      });
      setConflicts((prev) => prev.filter((x) => x.occurrenceId !== c.occurrenceId));
      setOccurrences((prev) => prev.filter((x) => x.id !== c.occurrenceId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir o conflito.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-2">Ocorrências do mês</h1>
      <p className="text-sm text-gray-500 mb-6">
        Gerencie as missas materializadas do mês. Exclua uma ocorrência avulsa ou{' '}
        <strong>reconcilie</strong> o mês com o cadastro atual — missas removidas do cadastro que já
        têm escala/respostas ficam para você decidir.
      </p>

      {/* Controles: mês + reconciliar */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex flex-wrap gap-3 items-end">
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
            onClick={handleReconcile}
            disabled={reconciling}
            className="bg-emerald-600 text-white px-4 py-2 rounded text-sm hover:bg-emerald-700 disabled:opacity-60"
            title="Atualiza as missas deste mês conforme o cadastro atual"
          >
            {reconciling ? 'Reconciliando...' : 'Reconciliar mês'}
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="bg-gray-100 text-gray-700 px-4 py-2 rounded text-sm hover:bg-gray-200 disabled:opacity-60"
          >
            Atualizar
          </button>
        </div>

        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

        {/* Resumo da reconciliação */}
        {reconcileResult && (
          <div className="mt-4 text-sm bg-gray-50 border rounded p-3">
            <p className="text-gray-700">
              Reconciliação de <strong>{reconcileResult.month}</strong>:{' '}
              <span className="text-emerald-700">{reconcileResult.added} adicionada(s)</span>,{' '}
              <span className="text-emerald-700">{reconcileResult.removedClean} removida(s)</span> e{' '}
              <span className={reconcileResult.conflicts.length > 0 ? 'text-amber-700' : 'text-gray-600'}>
                {reconcileResult.conflicts.length} conflito(s)
              </span>{' '}
              para decisão.
            </p>
          </div>
        )}
      </div>

      {/* Conflitos de reconciliação — decisão manual */}
      {conflicts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 mb-6">
          <h2 className="font-semibold text-amber-800 mb-1">
            Conflitos de reconciliação ({conflicts.length})
          </h2>
          <p className="text-sm text-amber-700 mb-4">
            Estas missas não existem mais no cadastro, mas já têm escala ou respostas de
            disponibilidade. Não foram removidas automaticamente — decida cada uma.
          </p>
          <ul className="space-y-2">
            {conflicts.map((c) => (
              <li
                key={c.occurrenceId}
                className="flex flex-wrap items-center justify-between gap-3 bg-white rounded border border-amber-200 px-3 py-2"
              >
                <div className="text-sm">
                  <span className="font-medium text-gray-800">
                    {formatOccurrenceDate(c.date, weekdayOf(c.date))} · {c.time}
                  </span>
                  {c.title && <span className="text-gray-500"> — {c.title}</span>}
                  <span className="ml-2 text-xs text-gray-500">
                    {affectedLabel({
                      assignmentCount: c.assignmentCount,
                      publishedAssignmentCount: 0,
                      availabilityCount: c.availabilityCount,
                    })}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => keepConflict(c.occurrenceId)}
                    className="text-xs px-3 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
                  >
                    Manter
                  </button>
                  <button
                    onClick={() => deleteConflict(c)}
                    disabled={busyId === c.occurrenceId}
                    className="text-xs px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    Excluir mesmo assim
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Lista de ocorrências */}
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left p-3">Data</th>
              <th className="text-left p-3">Horário</th>
              <th className="text-left p-3">Indicadores</th>
              <th className="text-right p-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {occurrences.length === 0 && (
              <tr>
                <td colSpan={4} className="p-4 text-center text-gray-500">
                  {loading
                    ? 'Carregando...'
                    : 'Nenhuma ocorrência neste mês. Abra o mês em Equipes → "Abrir mês".'}
                </td>
              </tr>
            )}
            {occurrences.map((o) => (
              <tr key={o.id} className="border-b">
                <td className="p-3">
                  <span className="font-medium text-gray-800">
                    {formatOccurrenceDate(o.date, weekdayOf(o.date))}
                  </span>
                  {o.title && <p className="text-xs text-gray-500">{o.title}</p>}
                </td>
                <td className="p-3 text-gray-700">{o.time}</td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1">
                    {o.isSolemnity && (
                      <Badge className="bg-amber-100 text-amber-700">Solenidade</Badge>
                    )}
                    {o.hasAssignments && (
                      <Badge className="bg-blue-100 text-blue-700">
                        Escala ({o.assignmentCount})
                      </Badge>
                    )}
                    {o.hasAvailability && (
                      <Badge className="bg-emerald-100 text-emerald-700">
                        Disponibilidade ({o.availabilityCount})
                      </Badge>
                    )}
                    {!o.inCadastro && (
                      <Badge className="bg-red-100 text-red-700" title="Este horário não existe mais no cadastro de missas">
                        Fora do cadastro
                      </Badge>
                    )}
                    {!o.isSolemnity &&
                      !o.hasAssignments &&
                      !o.hasAvailability &&
                      o.inCadastro && <span className="text-xs text-gray-400">—</span>}
                  </div>
                </td>
                <td className="p-3 text-right">
                  <button
                    onClick={() => handleDelete(o)}
                    disabled={busyId === o.id}
                    className="text-red-600 text-xs hover:underline disabled:opacity-60"
                  >
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal de aviso de exclusão (cascateia) */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="font-semibold text-gray-800 mb-2">Excluir ocorrência</h3>
            <p className="text-sm text-gray-600 mb-4">
              A missa <strong>{deleteTarget.label}</strong> tem{' '}
              <strong>{affectedLabel(deleteTarget.affected)}</strong>. Excluir a ocorrência{' '}
              <strong>remove também</strong> essas escalas e respostas (a exclusão cascateia). Esta
              ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded text-sm bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                disabled={busyId === deleteTarget.id}
                className="px-4 py-2 rounded text-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
              >
                Excluir mesmo assim
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Badge({
  children,
  className,
  title,
}: {
  children: React.ReactNode;
  className: string;
  title?: string;
}) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${className}`} title={title}>
      {children}
    </span>
  );
}
