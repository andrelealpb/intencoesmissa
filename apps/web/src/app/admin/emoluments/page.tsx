'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { apiAuthFetch } from '@/lib/api';

const scopeLabels: Record<string, string> = { DEFAULT: 'Padrão', GROUP: 'Por Grupo', TYPE: 'Por Tipo' };
const groupLabels: Record<string, string> = { SUFRAGIO: 'Sufrágio', SUPLICAS: 'Súplicas', ACAO_DE_GRACAS: 'Ação de Graças' };

interface Emolument {
  id: string;
  scope: string;
  group?: string;
  intentionTypeId?: string;
  suggestedValue: number;
  isActive: boolean;
  intentionType?: { name: string; group: string };
}

export default function EmolumentsPage() {
  const { data: session } = useSession();
  const [emoluments, setEmoluments] = useState<Emolument[]>([]);
  const [form, setForm] = useState({ scope: 'DEFAULT', group: '', intentionTypeId: '', suggestedValue: 0, isActive: true });
  const token = session?.accessToken as string;

  useEffect(() => {
    if (!token) return;
    apiAuthFetch('/admin/emoluments', token).then(setEmoluments).catch(console.error);
  }, [token]);

  const handleAdd = async () => {
    if (!token) return;
    const created = await apiAuthFetch('/admin/emoluments', token, {
      method: 'POST',
      body: JSON.stringify({
        scope: form.scope,
        group: form.scope === 'GROUP' ? form.group : undefined,
        intentionTypeId: form.scope === 'TYPE' ? form.intentionTypeId : undefined,
        suggestedValue: form.suggestedValue,
        isActive: form.isActive,
      }),
    });
    setEmoluments([...emoluments, created]);
  };

  const handleDelete = async (id: string) => {
    if (!token || !confirm('Excluir?')) return;
    await apiAuthFetch(`/admin/emoluments/${id}`, token, { method: 'DELETE' });
    setEmoluments(emoluments.filter((e) => e.id !== id));
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Emolumentos</h1>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="font-semibold mb-3">Adicionar Emolumento</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Escopo</label>
            <select className="border rounded px-3 py-2 text-sm" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>
              <option value="DEFAULT">Padrão</option>
              <option value="GROUP">Por Grupo</option>
              <option value="TYPE">Por Tipo</option>
            </select>
          </div>
          {form.scope === 'GROUP' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Grupo</label>
              <select className="border rounded px-3 py-2 text-sm" value={form.group} onChange={(e) => setForm({ ...form, group: e.target.value })}>
                <option value="">Selecione</option>
                {Object.entries(groupLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Valor Sugerido (R$)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="border rounded px-3 py-2 text-sm w-32"
              value={form.suggestedValue}
              onChange={(e) => setForm({ ...form, suggestedValue: Number(e.target.value) })}
            />
          </div>
          <button onClick={handleAdd} className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">
            Adicionar
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left p-3">Escopo</th>
              <th className="text-left p-3">Grupo/Tipo</th>
              <th className="text-right p-3">Valor (R$)</th>
              <th className="text-center p-3">Ativo</th>
              <th className="text-right p-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {emoluments.map((e) => (
              <tr key={e.id} className="border-b">
                <td className="p-3">{scopeLabels[e.scope]}</td>
                <td className="p-3">
                  {e.scope === 'GROUP' && groupLabels[e.group ?? '']}
                  {e.scope === 'TYPE' && (e.intentionType?.name ?? e.intentionTypeId)}
                  {e.scope === 'DEFAULT' && '-'}
                </td>
                <td className="p-3 text-right font-mono">{Number(e.suggestedValue).toFixed(2)}</td>
                <td className="p-3 text-center">{e.isActive ? '✓' : '✗'}</td>
                <td className="p-3 text-right">
                  <button onClick={() => handleDelete(e.id)} className="text-red-600 text-xs hover:underline">Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
