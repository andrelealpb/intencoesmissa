'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { apiAuthFetch } from '@/lib/api';

interface Parish {
  id: string;
  parishName: string;
  slug: string;
}

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

const emptyForm = {
  subject: '',
  description: '',
  massTimes: [] as string[],
  startDate: '',
  endDate: '',
  isActive: true,
};

export default function SANoticesPage() {
  const { data: session } = useSession();
  const [parishes, setParishes] = useState<Parish[]>([]);
  const [selectedParish, setSelectedParish] = useState('');
  const [notices, setNotices] = useState<Notice[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  const token = session?.accessToken as string;

  useEffect(() => {
    if (!token) return;
    apiAuthFetch('/sa/parishes', token).then(setParishes).catch(console.error);
  }, [token]);

  useEffect(() => {
    if (!token || !selectedParish) return;
    apiAuthFetch(`/sa/parishes/${selectedParish}/notices`, token)
      .then(setNotices)
      .catch(console.error);
  }, [token, selectedParish]);

  const handleSave = async () => {
    if (!token || !selectedParish) return;
    setError('');
    try {
      const payload = {
        ...form,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
      };
      if (editing) {
        const updated = await apiAuthFetch(`/sa/notices/${editing}`, token, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setNotices(notices.map((n) => (n.id === editing ? updated : n)));
      } else {
        const created = await apiAuthFetch(`/sa/parishes/${selectedParish}/notices`, token, {
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
    await apiAuthFetch(`/sa/notices/${id}`, token, { method: 'DELETE' });
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
        {selectedParish && (
          <button
            onClick={() => { setShowForm(true); setEditing(null); setForm(emptyForm); setError(''); }}
            className="bg-purple-700 text-white px-4 py-2 rounded-md text-sm hover:bg-purple-800"
          >
            Novo Aviso
          </button>
        )}
      </div>

      {/* Parish selector */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">Selecione a Paroquia</label>
        <select
          className="w-full max-w-md border rounded px-3 py-2 text-sm"
          value={selectedParish}
          onChange={(e) => { setSelectedParish(e.target.value); setNotices([]); }}
        >
          <option value="">-- Selecione --</option>
          {parishes.map((p) => (
            <option key={p.id} value={p.id}>{p.parishName}</option>
          ))}
        </select>
      </div>

      {!selectedParish ? (
        <p className="text-gray-400 text-sm">Selecione uma paroquia para gerenciar os avisos.</p>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left p-3">Assunto</th>
                <th className="text-left p-3 hidden sm:table-cell">Descricao</th>
                <th className="text-left p-3">Missas</th>
                <th className="text-center p-3">Ativo</th>
                <th className="text-right p-3">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {notices.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-gray-400">
                    Nenhum aviso cadastrado para esta paroquia.
                  </td>
                </tr>
              )}
              {notices.map((n) => (
                <tr key={n.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 font-medium">{n.subject}</td>
                  <td className="p-3 hidden sm:table-cell text-gray-600 max-w-xs truncate">{n.description}</td>
                  <td className="p-3">
                    {n.massTimes.length === 0 ? (
                      <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">Todas</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {n.massTimes.map((t) => (
                          <span key={t} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">{t}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-center">{n.isActive ? '✓' : '✗'}</td>
                  <td className="p-3 text-right space-x-2">
                    <button onClick={() => handleEdit(n)} className="text-purple-600 text-xs hover:underline">Editar</button>
                    <button onClick={() => handleDelete(n.id)} className="text-red-600 text-xs hover:underline">Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Horarios das missas (opcional)</label>
                <p className="text-xs text-gray-500 mb-2">
                  Informe os horarios separados por virgula (ex: 08:00, 19:00). Deixe vazio para todas.
                </p>
                <input
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={form.massTimes.join(', ')}
                  onChange={(e) => setForm({
                    ...form,
                    massTimes: e.target.value
                      .split(',')
                      .map((t) => t.trim())
                      .filter((t) => /^\d{2}:\d{2}$/.test(t)),
                  })}
                  placeholder="08:00, 19:00"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Data inicio</label>
                  <input type="date" className="w-full border rounded px-3 py-2 text-sm" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Data fim</label>
                  <input type="date" className="w-full border rounded px-3 py-2 text-sm" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                Ativo
              </label>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => { setShowForm(false); setEditing(null); }} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded">Cancelar</button>
              <button
                onClick={handleSave}
                disabled={!form.subject || !form.description}
                className="bg-purple-700 text-white px-4 py-2 rounded text-sm hover:bg-purple-800 disabled:opacity-50"
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
