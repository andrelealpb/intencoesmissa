'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { apiAuthFetch } from '@/lib/api';
import { categoryLabels, type Team, type ConvocationSummary } from '@/lib/escala';

interface TeamForm {
  name: string;
  category: string;
  description: string;
  whatsappGroupId: string;
}

const emptyForm: TeamForm = {
  name: '',
  category: 'ALTAR_SERVERS',
  description: '',
  whatsappGroupId: '',
};

// Primeiro/último dia do mês corrente, em YYYY-MM-DD (UTC), p/ o "Abrir mês".
function monthRange(): { from: string; to: string } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const first = new Date(Date.UTC(y, m, 1));
  const last = new Date(Date.UTC(y, m + 1, 0));
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}

// Mês corrente em YYYY-MM (UTC), p/ a convocação.
function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export default function EscalaTeamsPage() {
  const { data: session } = useSession();
  const token = session?.accessToken as string;

  const [teams, setTeams] = useState<Team[]>([]);
  const [form, setForm] = useState<TeamForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  // "Abrir mês" (materialização de ocorrências — S2).
  const [range, setRange] = useState(monthRange());
  const [openingMonth, setOpeningMonth] = useState(false);
  const [monthMsg, setMonthMsg] = useState('');

  // "Convocar equipes" (convocação de disponibilidade — S6.5). Passo separado
  // da materialização.
  const [convMonth, setConvMonth] = useState(currentMonth());
  const [convDeadline, setConvDeadline] = useState('');
  const [convSelected, setConvSelected] = useState<Set<string>>(new Set());
  const [convoking, setConvoking] = useState(false);
  const [convSummary, setConvSummary] = useState<ConvocationSummary | null>(null);
  const [convError, setConvError] = useState('');

  useEffect(() => {
    if (!token) return;
    apiAuthFetch('/admin/escala/teams', token).then(setTeams).catch(console.error);
  }, [token]);

  const buildPayload = () => ({
    name: form.name.trim(),
    category: form.category,
    description: form.description.trim() || undefined,
    whatsappGroupId: form.whatsappGroupId.trim() || null,
  });

  const handleSave = async () => {
    if (!token) return;
    setError('');
    if (form.name.trim().length < 2) {
      setError('Nome deve ter pelo menos 2 caracteres.');
      return;
    }
    try {
      if (editingId) {
        const updated = await apiAuthFetch(`/admin/escala/teams/${editingId}`, token, {
          method: 'PUT',
          body: JSON.stringify(buildPayload()),
        });
        setTeams(teams.map((t) => (t.id === editingId ? { ...t, ...updated } : t)));
        setEditingId(null);
      } else {
        const created = await apiAuthFetch('/admin/escala/teams', token, {
          method: 'POST',
          body: JSON.stringify(buildPayload()),
        });
        setTeams([...teams, { ...created, _count: { memberships: 0, functions: 0 } }]);
      }
      setForm(emptyForm);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.');
    }
  };

  const handleEdit = (t: Team) => {
    setEditingId(t.id);
    setForm({
      name: t.name,
      category: t.category,
      description: t.description ?? '',
      whatsappGroupId: t.whatsappGroupId ?? '',
    });
    setError('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
  };

  const handleDelete = async (id: string) => {
    if (!token || !confirm('Excluir/desativar esta equipe?')) return;
    await apiAuthFetch(`/admin/escala/teams/${id}`, token, { method: 'DELETE' });
    // Pode ser hard-delete (some) ou soft (isActive=false). Recarrega a lista.
    const fresh = await apiAuthFetch('/admin/escala/teams', token);
    setTeams(fresh);
    if (editingId === id) handleCancelEdit();
  };

  const handleOpenMonth = async () => {
    if (!token) return;
    setMonthMsg('');
    setOpeningMonth(true);
    try {
      const res = await apiAuthFetch('/admin/escala/occurrences/materialize', token, {
        method: 'POST',
        body: JSON.stringify({ from: range.from, to: range.to }),
      });
      setMonthMsg(
        `Ocorrências geradas: ${res.created} criadas, ${res.updated} atualizadas (${res.total} no total).`,
      );
    } catch (err) {
      setMonthMsg(err instanceof Error ? err.message : 'Erro ao abrir o mês.');
    } finally {
      setOpeningMonth(false);
    }
  };

  const toggleConvTeam = (id: string) => {
    setConvSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConvoke = async () => {
    if (!token || convSelected.size === 0) return;
    setConvError('');
    setConvSummary(null);
    setConvoking(true);
    try {
      const res = (await apiAuthFetch('/admin/escala/convoke', token, {
        method: 'POST',
        body: JSON.stringify({
          month: convMonth,
          teamIds: [...convSelected],
          deadline: convDeadline.trim() || undefined,
        }),
      })) as ConvocationSummary;
      setConvSummary(res);
    } catch (err) {
      setConvError(err instanceof Error ? err.message : 'Erro ao convocar equipes.');
    } finally {
      setConvoking(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Equipes de Escala</h1>

      {/* Abrir mês (materialização de ocorrências — opcional) */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="font-semibold mb-1">Abrir mês</h2>
        <p className="text-sm text-gray-500 mb-3">
          Gera as ocorrências de missa do intervalo (idempotente — preserva solenidades já marcadas).
        </p>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">De</label>
            <input
              type="date"
              className="border rounded px-3 py-2 text-sm"
              value={range.from}
              onChange={(e) => setRange({ ...range, from: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Até</label>
            <input
              type="date"
              className="border rounded px-3 py-2 text-sm"
              value={range.to}
              onChange={(e) => setRange({ ...range, to: e.target.value })}
            />
          </div>
          <button
            onClick={handleOpenMonth}
            disabled={openingMonth}
            className="bg-emerald-600 text-white px-4 py-2 rounded text-sm hover:bg-emerald-700 disabled:opacity-60"
          >
            {openingMonth ? 'Abrindo...' : 'Abrir mês'}
          </button>
        </div>
        {monthMsg && <p className="mt-3 text-sm text-gray-700">{monthMsg}</p>}
      </div>

      {/* Convocar equipes (convocação de disponibilidade — S6.5) */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="font-semibold mb-1">Convocar equipes</h2>
        <p className="text-sm text-gray-500 mb-3">
          Envia <strong>uma</strong> mensagem ao grupo de WhatsApp de cada equipe selecionada, com o
          link do portal. Passo independente do “Abrir mês”. Equipes sem grupo configurado são
          puladas.
        </p>
        <div className="flex flex-wrap gap-3 items-end mb-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Mês</label>
            <input
              type="month"
              className="border rounded px-3 py-2 text-sm"
              value={convMonth}
              onChange={(e) => setConvMonth(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Prazo (opcional)</label>
            <input
              className="border rounded px-3 py-2 text-sm"
              value={convDeadline}
              onChange={(e) => setConvDeadline(e.target.value)}
              placeholder="Ex.: 25/07"
            />
          </div>
          <button
            onClick={handleConvoke}
            disabled={convoking || convSelected.size === 0}
            className="bg-emerald-600 text-white px-4 py-2 rounded text-sm hover:bg-emerald-700 disabled:opacity-60"
          >
            {convoking ? 'Convocando...' : `Convocar (${convSelected.size})`}
          </button>
        </div>

        {teams.length === 0 ? (
          <p className="text-sm text-gray-500">Cadastre equipes para convocar.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {teams.map((t) => {
              const hasGroup = Boolean(t.whatsappGroupId);
              return (
                <label
                  key={t.id}
                  className={`flex items-center gap-2 text-sm ${
                    hasGroup ? 'text-gray-700' : 'text-gray-400'
                  }`}
                  title={hasGroup ? '' : 'Sem grupo de WhatsApp configurado — será pulada'}
                >
                  <input
                    type="checkbox"
                    checked={convSelected.has(t.id)}
                    onChange={() => toggleConvTeam(t.id)}
                  />
                  {t.name}
                  {!hasGroup && <span className="text-xs">(sem grupo)</span>}
                </label>
              );
            })}
          </div>
        )}

        {convError && <p className="mt-3 text-sm text-red-700">{convError}</p>}
        {convSummary && (
          <div className="mt-3 text-sm">
            <p className="text-gray-700 mb-1">
              Convocação de <strong>{convSummary.monthLabel}</strong>: {convSummary.sent} enviada(s),{' '}
              {convSummary.skipped} pulada(s)
              {convSummary.failed > 0 ? `, ${convSummary.failed} com falha` : ''}.
            </p>
            <ul className="space-y-1">
              {convSummary.results.map((r) => (
                <li key={r.teamId} className="text-gray-600">
                  {r.status === 'sent' && <span className="text-emerald-700">✓ </span>}
                  {r.status === 'skipped' && <span className="text-amber-600">⤳ </span>}
                  {r.status === 'failed' && <span className="text-red-600">✗ </span>}
                  {r.teamName}
                  {r.reason ? ` — ${r.reason}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Formulário de equipe */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="font-semibold mb-3">{editingId ? 'Editar Equipe' : 'Adicionar Equipe'}</h2>

        {error && (
          <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nome</label>
            <input
              className="border rounded px-3 py-2 text-sm"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex.: Coroinhas São Miguel"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Categoria</label>
            <select
              className="border rounded px-3 py-2 text-sm"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {Object.entries(categoryLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-gray-500 mb-1">Descrição (opcional)</label>
            <input
              className="border rounded px-3 py-2 text-sm w-full"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-gray-500 mb-1">Grupo de WhatsApp (opcional)</label>
            <input
              className="border rounded px-3 py-2 text-sm w-full"
              value={form.whatsappGroupId}
              onChange={(e) => setForm({ ...form, whatsappGroupId: e.target.value })}
              placeholder="ID do grupo na Z-API"
            />
          </div>
          <button
            onClick={handleSave}
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
          >
            {editingId ? 'Salvar' : 'Adicionar'}
          </button>
          {editingId && (
            <button
              onClick={handleCancelEdit}
              className="bg-gray-200 text-gray-700 px-4 py-2 rounded text-sm hover:bg-gray-300"
            >
              Cancelar
            </button>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          O ID do grupo de WhatsApp é usado na convocação de disponibilidade. Obtenha-o na tela de
          configuração da Z-API (lista de grupos da instância conectada).
        </p>
      </div>

      {/* Lista de equipes */}
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left p-3">Equipe</th>
              <th className="text-left p-3">Categoria</th>
              <th className="text-center p-3">Funções</th>
              <th className="text-center p-3">Membros</th>
              <th className="text-center p-3">Ativa</th>
              <th className="text-right p-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {teams.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-gray-500">
                  Nenhuma equipe cadastrada.
                </td>
              </tr>
            )}
            {teams.map((t) => (
              <tr key={t.id} className={`border-b ${editingId === t.id ? 'bg-blue-50' : ''}`}>
                <td className="p-3">
                  <Link
                    href={`/admin/escala/equipes/${t.id}`}
                    className="text-blue-600 font-medium hover:underline"
                  >
                    {t.name}
                  </Link>
                  {t.description && <p className="text-xs text-gray-500">{t.description}</p>}
                </td>
                <td className="p-3">{categoryLabels[t.category] ?? t.category}</td>
                <td className="p-3 text-center">{t._count?.functions ?? '—'}</td>
                <td className="p-3 text-center">{t._count?.memberships ?? '—'}</td>
                <td className="p-3 text-center">{t.isActive ? '✓' : '✗'}</td>
                <td className="p-3 text-right space-x-3">
                  <Link
                    href={`/admin/escala/equipes/${t.id}`}
                    className="text-blue-600 text-xs hover:underline"
                  >
                    Gerenciar
                  </Link>
                  <button onClick={() => handleEdit(t)} className="text-blue-600 text-xs hover:underline">
                    Editar
                  </button>
                  <button onClick={() => handleDelete(t.id)} className="text-red-600 text-xs hover:underline">
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
