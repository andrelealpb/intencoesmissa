'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { apiAuthFetch } from '@/lib/api';

const groupLabels: Record<string, string> = {
  SUFRAGIO: 'Sufrágio',
  SUPLICAS: 'Súplicas',
  ACAO_DE_GRACAS: 'Ação de Graças',
};

interface IntentionType {
  id: string;
  group: string;
  name: string;
  isActive: boolean;
  requiresDeceasedName: boolean;
  requiresFamilyNames: boolean;
  opensOptionalNotes: boolean;
  requiresComplement: boolean;
}

const emptyForm = {
  group: 'SUFRAGIO',
  name: '',
  isActive: true,
  requiresDeceasedName: false,
  requiresFamilyNames: false,
  opensOptionalNotes: false,
  requiresComplement: false,
};

export default function IntentionTypesPage() {
  const { data: session } = useSession();
  const [types, setTypes] = useState<IntentionType[]>([]);
  const [filterGroup, setFilterGroup] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const token = session?.accessToken as string;

  useEffect(() => {
    if (!token) return;
    apiAuthFetch('/admin/intention-types', token).then(setTypes).catch(console.error);
  }, [token]);

  const filtered = filterGroup ? types.filter((t) => t.group === filterGroup) : types;

  const handleSave = async () => {
    if (!token) return;
    if (editing) {
      const updated = await apiAuthFetch(`/admin/intention-types/${editing}`, token, {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      setTypes(types.map((t) => (t.id === editing ? updated : t)));
    } else {
      const created = await apiAuthFetch('/admin/intention-types', token, {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setTypes([...types, created]);
    }
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const handleEdit = (t: IntentionType) => {
    setForm({
      group: t.group,
      name: t.name,
      isActive: t.isActive,
      requiresDeceasedName: t.requiresDeceasedName,
      requiresFamilyNames: t.requiresFamilyNames,
      opensOptionalNotes: t.opensOptionalNotes,
      requiresComplement: t.requiresComplement,
    });
    setEditing(t.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!token || !confirm('Excluir este tipo?')) return;
    await apiAuthFetch(`/admin/intention-types/${id}`, token, { method: 'DELETE' });
    setTypes(types.filter((t) => t.id !== id));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Tipos de Intenção</h1>
        <button
          onClick={() => { setShowForm(true); setEditing(null); setForm(emptyForm); }}
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700"
        >
          Novo Tipo
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        <button onClick={() => setFilterGroup('')} className={`px-3 py-1 rounded text-xs ${!filterGroup ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
          Todos
        </button>
        {Object.entries(groupLabels).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilterGroup(key)}
            className={`px-3 py-1 rounded text-xs ${filterGroup === key ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left p-3">Grupo</th>
              <th className="text-left p-3">Nome</th>
              <th className="text-center p-3">Falecido</th>
              <th className="text-center p-3">Famílias</th>
              <th className="text-center p-3">Obs.</th>
              <th className="text-center p-3">Complemento</th>
              <th className="text-center p-3">Ativo</th>
              <th className="text-right p-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr key={t.id} className="border-b hover:bg-gray-50">
                <td className="p-3">{groupLabels[t.group]}</td>
                <td className="p-3 font-medium">{t.name}</td>
                <td className="p-3 text-center">{t.requiresDeceasedName ? '✓' : ''}</td>
                <td className="p-3 text-center">{t.requiresFamilyNames ? '✓' : ''}</td>
                <td className="p-3 text-center">{t.opensOptionalNotes ? '✓' : ''}</td>
                <td className="p-3 text-center">{t.requiresComplement ? '✓' : ''}</td>
                <td className="p-3 text-center">{t.isActive ? '✓' : '✗'}</td>
                <td className="p-3 text-right space-x-2">
                  <button onClick={() => handleEdit(t)} className="text-blue-600 text-xs hover:underline">Editar</button>
                  <button onClick={() => handleDelete(t.id)} className="text-red-600 text-xs hover:underline">Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal / Form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-bold mb-4">{editing ? 'Editar Tipo' : 'Novo Tipo'}</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Grupo</label>
                <select className="w-full border rounded px-3 py-2 text-sm" value={form.group} onChange={(e) => setForm({ ...form, group: e.target.value })}>
                  {Object.entries(groupLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Nome</label>
                <input className="w-full border rounded px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              {[
                { key: 'requiresDeceasedName', label: 'Exige nome do falecido' },
                { key: 'requiresFamilyNames', label: 'Exige nomes das famílias' },
                { key: 'opensOptionalNotes', label: 'Permite observações' },
                { key: 'requiresComplement', label: 'Exige complemento' },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={(form as any)[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                  />
                  {label}
                </label>
              ))}
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                Ativo
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => { setShowForm(false); setEditing(null); }} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded">
                Cancelar
              </button>
              <button onClick={handleSave} className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
