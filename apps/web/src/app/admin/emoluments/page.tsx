'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { apiAuthFetch } from '@/lib/api';

const scopeLabels: Record<string, string> = { DEFAULT: 'Padrão', GROUP: 'Por Grupo', TYPE: 'Por Tipo' };
const groupLabels: Record<string, string> = { SUFRAGIO: 'Sufrágio', SUPLICAS: 'Súplicas', ACAO_DE_GRACAS: 'Ação de Graças' };

interface IntentionType {
  id: string;
  name: string;
  group: string;
}

interface Emolument {
  id: string;
  scope: string;
  group?: string;
  intentionTypeId?: string;
  suggestedValue: number;
  isActive: boolean;
  intentionType?: { name: string; group: string };
}

interface FormState {
  scope: string;
  group: string;
  intentionTypeId: string;
  suggestedValue: number;
  isActive: boolean;
}

const emptyForm: FormState = { scope: 'DEFAULT', group: '', intentionTypeId: '', suggestedValue: 0, isActive: true };

export default function EmolumentsPage() {
  const { data: session } = useSession();
  const [emoluments, setEmoluments] = useState<Emolument[]>([]);
  const [intentionTypes, setIntentionTypes] = useState<IntentionType[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const token = session?.accessToken as string;

  useEffect(() => {
    if (!token) return;
    apiAuthFetch('/admin/emoluments', token).then(setEmoluments).catch(console.error);
    apiAuthFetch('/admin/intention-types', token).then(setIntentionTypes).catch(console.error);
  }, [token]);

  const buildPayload = () => ({
    scope: form.scope,
    group: form.scope === 'GROUP' ? form.group : undefined,
    intentionTypeId: form.scope === 'TYPE' ? form.intentionTypeId : undefined,
    suggestedValue: form.suggestedValue,
    isActive: form.isActive,
  });

  const handleSave = async () => {
    if (!token) return;
    setError('');

    if (form.scope === 'GROUP' && !form.group) {
      setError('Selecione um grupo.'); return;
    }
    if (form.scope === 'TYPE' && !form.intentionTypeId) {
      setError('Selecione um tipo de intenção.'); return;
    }
    if (form.suggestedValue <= 0) {
      setError('Valor deve ser maior que zero.'); return;
    }

    try {
      if (editingId) {
        const updated = await apiAuthFetch(`/admin/emoluments/${editingId}`, token, {
          method: 'PUT',
          body: JSON.stringify(buildPayload()),
        });
        setEmoluments(emoluments.map((e) => (e.id === editingId ? updated : e)));
        setEditingId(null);
      } else {
        const created = await apiAuthFetch('/admin/emoluments', token, {
          method: 'POST',
          body: JSON.stringify(buildPayload()),
        });
        setEmoluments([...emoluments, created]);
      }
      setForm(emptyForm);
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar.');
    }
  };

  const handleEdit = (e: Emolument) => {
    setEditingId(e.id);
    setForm({
      scope: e.scope,
      group: e.group ?? '',
      intentionTypeId: e.intentionTypeId ?? '',
      suggestedValue: Number(e.suggestedValue),
      isActive: e.isActive,
    });
    setError('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
  };

  const handleDelete = async (id: string) => {
    if (!token || !confirm('Excluir este emolumento?')) return;
    await apiAuthFetch(`/admin/emoluments/${id}`, token, { method: 'DELETE' });
    setEmoluments(emoluments.filter((e) => e.id !== id));
    if (editingId === id) handleCancelEdit();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Emolumentos</h1>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="font-semibold mb-3">
          {editingId ? 'Editar Emolumento' : 'Adicionar Emolumento'}
        </h2>

        {error && (
          <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Escopo</label>
            <select
              className="border rounded px-3 py-2 text-sm"
              value={form.scope}
              onChange={(e) => setForm({ ...form, scope: e.target.value, group: '', intentionTypeId: '' })}
            >
              <option value="DEFAULT">Padrão</option>
              <option value="GROUP">Por Grupo</option>
              <option value="TYPE">Por Tipo</option>
            </select>
          </div>

          {form.scope === 'GROUP' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Grupo</label>
              <select
                className="border rounded px-3 py-2 text-sm"
                value={form.group}
                onChange={(e) => setForm({ ...form, group: e.target.value })}
              >
                <option value="">Selecione</option>
                {Object.entries(groupLabels).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          )}

          {form.scope === 'TYPE' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tipo de Intenção</label>
              <select
                className="border rounded px-3 py-2 text-sm"
                value={form.intentionTypeId}
                onChange={(e) => setForm({ ...form, intentionTypeId: e.target.value })}
              >
                <option value="">Selecione</option>
                {intentionTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({groupLabels[t.group] || t.group})
                  </option>
                ))}
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

          <div>
            <label className="block text-xs text-gray-500 mb-1">Ativo</label>
            <select
              className="border rounded px-3 py-2 text-sm"
              value={form.isActive ? 'true' : 'false'}
              onChange={(e) => setForm({ ...form, isActive: e.target.value === 'true' })}
            >
              <option value="true">Sim</option>
              <option value="false">Não</option>
            </select>
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
            {emoluments.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-gray-500">
                  Nenhum emolumento cadastrado.
                </td>
              </tr>
            )}
            {emoluments.map((e) => (
              <tr key={e.id} className={`border-b ${editingId === e.id ? 'bg-blue-50' : ''}`}>
                <td className="p-3">{scopeLabels[e.scope]}</td>
                <td className="p-3">
                  {e.scope === 'GROUP' && groupLabels[e.group ?? '']}
                  {e.scope === 'TYPE' && (e.intentionType?.name ?? e.intentionTypeId)}
                  {e.scope === 'DEFAULT' && '—'}
                </td>
                <td className="p-3 text-right font-mono">{Number(e.suggestedValue).toFixed(2)}</td>
                <td className="p-3 text-center">{e.isActive ? '✓' : '✗'}</td>
                <td className="p-3 text-right space-x-3">
                  <button
                    onClick={() => handleEdit(e)}
                    className="text-blue-600 text-xs hover:underline"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(e.id)}
                    className="text-red-600 text-xs hover:underline"
                  >
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
