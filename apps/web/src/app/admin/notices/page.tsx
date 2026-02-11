'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { apiAuthFetch } from '@/lib/api';

interface Notice {
  id: string;
  subject: string;
  description: string;
  massTimes: string[];
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  createdAt: string;
}

interface MassSchedule {
  id: string;
  weekday: number;
  time: string;
  isActive: boolean;
}

const weekdayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

const emptyForm = {
  subject: '',
  description: '',
  massTimes: [] as string[],
  startDate: '',
  endDate: '',
  isActive: true,
};

export default function NoticesPage() {
  const { data: session } = useSession();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [schedules, setSchedules] = useState<MassSchedule[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  const token = session?.accessToken as string;

  useEffect(() => {
    if (!token) return;
    apiAuthFetch('/admin/notices', token).then(setNotices).catch(console.error);
    apiAuthFetch('/admin/masses/schedules', token).then(setSchedules).catch(console.error);
  }, [token]);

  // Get unique times from active schedules
  const availableTimes = [...new Set(schedules.filter((s) => s.isActive).map((s) => s.time))].sort();

  // Get schedule info for a time (which weekdays)
  const getWeekdaysForTime = (time: string) => {
    const weekdays = schedules
      .filter((s) => s.time === time && s.isActive)
      .map((s) => weekdayLabels[s.weekday]);
    return weekdays.join(', ');
  };

  const toggleMassTime = (time: string) => {
    setForm((prev) => ({
      ...prev,
      massTimes: prev.massTimes.includes(time)
        ? prev.massTimes.filter((t) => t !== time)
        : [...prev.massTimes, time],
    }));
  };

  const handleSave = async () => {
    if (!token) return;
    setError('');
    try {
      const payload = {
        ...form,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
      };
      if (editing) {
        const updated = await apiAuthFetch(`/admin/notices/${editing}`, token, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setNotices(notices.map((n) => (n.id === editing ? updated : n)));
      } else {
        const created = await apiAuthFetch('/admin/notices', token, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setNotices([created, ...notices]);
      }
      setShowForm(false);
      setEditing(null);
      setForm(emptyForm);
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar');
    }
  };

  const handleEdit = (n: Notice) => {
    setForm({
      subject: n.subject,
      description: n.description,
      massTimes: n.massTimes,
      startDate: n.startDate ? n.startDate.split('T')[0] : '',
      endDate: n.endDate ? n.endDate.split('T')[0] : '',
      isActive: n.isActive,
    });
    setEditing(n.id);
    setShowForm(true);
    setError('');
  };

  const handleDelete = async (id: string) => {
    if (!token || !confirm('Excluir este aviso?')) return;
    await apiAuthFetch(`/admin/notices/${id}`, token, { method: 'DELETE' });
    setNotices(notices.filter((n) => n.id !== id));
  };

  const formatDate = (d: string | null) => {
    if (!d) return '-';
    const [y, m, day] = d.split('T')[0].split('-');
    return `${day}/${m}/${y}`;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Avisos</h1>
        <button
          onClick={() => { setShowForm(true); setEditing(null); setForm(emptyForm); setError(''); }}
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700"
        >
          Novo Aviso
        </button>
      </div>

      <p className="text-sm text-gray-500 mb-4">
        Os avisos cadastrados aparecem no rodape do PDF de intencoes enviado no despacho.
      </p>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left p-3">Assunto</th>
              <th className="text-left p-3 hidden sm:table-cell">Descricao</th>
              <th className="text-left p-3">Missas</th>
              <th className="text-center p-3 hidden sm:table-cell">Periodo</th>
              <th className="text-center p-3">Ativo</th>
              <th className="text-right p-3">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {notices.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-gray-400">
                  Nenhum aviso cadastrado.
                </td>
              </tr>
            )}
            {notices.map((n) => (
              <tr key={n.id} className="border-b hover:bg-gray-50">
                <td className="p-3 font-medium">{n.subject}</td>
                <td className="p-3 hidden sm:table-cell text-gray-600 max-w-xs truncate">
                  {n.description}
                </td>
                <td className="p-3">
                  {n.massTimes.length === 0 ? (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Todas</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {n.massTimes.map((t) => (
                        <span key={t} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="p-3 text-center text-xs hidden sm:table-cell">
                  {n.startDate || n.endDate ? (
                    <span>{formatDate(n.startDate)} - {formatDate(n.endDate)}</span>
                  ) : (
                    <span className="text-gray-400">Sem periodo</span>
                  )}
                </td>
                <td className="p-3 text-center">{n.isActive ? '✓' : '✗'}</td>
                <td className="p-3 text-right space-x-2">
                  <button onClick={() => handleEdit(n)} className="text-blue-600 text-xs hover:underline">Editar</button>
                  <button onClick={() => handleDelete(n.id)} className="text-red-600 text-xs hover:underline">Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal Form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-4">{editing ? 'Editar Aviso' : 'Novo Aviso'}</h2>

            {error && (
              <div className="bg-red-50 text-red-700 px-3 py-2 rounded text-sm mb-3">{error}</div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Assunto *</label>
                <input
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  placeholder="Ex: Proclamas"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Detalhes do Aviso *</label>
                <textarea
                  className="w-full border rounded px-3 py-2 text-sm"
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Ex: Querem se casar: Joao e Maria..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Missas que devem ler este aviso
                </label>
                {availableTimes.length === 0 ? (
                  <p className="text-sm text-gray-500">Nenhum horario de missa cadastrado.</p>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs text-gray-500">
                        {form.massTimes.length === 0
                          ? 'Nenhum selecionado = todas as missas'
                          : `${form.massTimes.length} horario(s) selecionado(s)`}
                      </p>
                      <button
                        type="button"
                        onClick={() => setForm((prev) => ({
                          ...prev,
                          massTimes: prev.massTimes.length === availableTimes.length ? [] : [...availableTimes],
                        }))}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        {form.massTimes.length === availableTimes.length ? 'Limpar selecao' : 'Selecionar todas'}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {availableTimes.map((time) => {
                        const selected = form.massTimes.includes(time);
                        return (
                          <button
                            key={time}
                            type="button"
                            onClick={() => toggleMassTime(time)}
                            className={`px-3 py-3 rounded-lg border text-sm font-medium transition-colors min-h-[48px] ${
                              selected
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300 active:bg-blue-50'
                            }`}
                          >
                            <div className="text-base font-semibold">{time}</div>
                            <div className={`text-xs mt-0.5 ${selected ? 'text-blue-100' : 'text-gray-400'}`}>
                              {getWeekdaysForTime(time)}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Data inicio (opcional)</label>
                  <input
                    type="date"
                    className="w-full border rounded px-3 py-2 text-sm"
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Data fim (opcional)</label>
                  <input
                    type="date"
                    className="w-full border rounded px-3 py-2 text-sm"
                    value={form.endDate}
                    onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
                Ativo
              </label>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => { setShowForm(false); setEditing(null); }}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={!form.subject || !form.description}
                className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
