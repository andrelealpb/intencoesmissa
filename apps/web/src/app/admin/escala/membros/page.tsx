'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { apiAuthFetch } from '@/lib/api';
import type { Member } from '@/lib/escala';

interface MemberForm {
  fullName: string;
  phone: string;
  email: string;
  birthDate: string;
  isActive: boolean;
}

const emptyForm: MemberForm = {
  fullName: '',
  phone: '',
  email: '',
  birthDate: '',
  isActive: true,
};

const PAGE_SIZE = 25;

export default function EscalaMembersPage() {
  const { data: session } = useSession();
  const token = session?.accessToken as string;

  const [members, setMembers] = useState<Member[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [onlyActive, setOnlyActive] = useState(true);

  const [form, setForm] = useState<MemberForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (onlyActive) params.set('active', 'true');
    params.set('page', String(page));
    params.set('pageSize', String(PAGE_SIZE));
    const res = await apiAuthFetch(`/admin/escala/members?${params.toString()}`, token);
    setMembers(res.items);
    setTotal(res.total);
  }, [token, q, onlyActive, page]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  const buildPayload = () => ({
    fullName: form.fullName.trim(),
    phone: form.phone.trim(),
    email: form.email.trim() || undefined,
    birthDate: form.birthDate || undefined,
  });

  const handleSave = async () => {
    if (!token) return;
    setError('');
    setWarning('');
    if (form.fullName.trim().split(/\s+/).length < 2) {
      setError('Informe o nome completo (nome e sobrenome).');
      return;
    }
    if (form.phone.trim().length < 8) {
      setError('Informe um telefone válido.');
      return;
    }
    try {
      if (editingId) {
        await apiAuthFetch(`/admin/escala/members/${editingId}`, token, {
          method: 'PUT',
          body: JSON.stringify({ ...buildPayload(), isActive: form.isActive }),
        });
        setEditingId(null);
      } else {
        const created: Member = await apiAuthFetch('/admin/escala/members', token, {
          method: 'POST',
          body: JSON.stringify(buildPayload()),
        });
        // 201 com aviso de possível duplicata de telefone — não bloqueia.
        if (created?.warning) setWarning(created.warning);
      }
      setForm(emptyForm);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.');
    }
  };

  const handleEdit = (m: Member) => {
    setEditingId(m.id);
    setForm({
      fullName: m.fullName,
      phone: m.phone,
      email: m.email ?? '',
      birthDate: m.birthDate ? m.birthDate.slice(0, 10) : '',
      isActive: m.isActive,
    });
    setError('');
    setWarning('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
    setWarning('');
  };

  const handleDelete = async (id: string) => {
    if (!token || !confirm('Desativar este membro? (mantém o histórico)')) return;
    await apiAuthFetch(`/admin/escala/members/${id}`, token, { method: 'DELETE' });
    if (editingId === id) handleCancelEdit();
    await load();
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Membros da Escala</h1>

      {/* Formulário */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="font-semibold mb-3">{editingId ? 'Editar Membro' : 'Adicionar Membro'}</h2>

        {error && (
          <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {error}
          </div>
        )}
        {warning && (
          <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
            ⚠️ {warning}
          </div>
        )}

        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nome completo</label>
            <input
              className="border rounded px-3 py-2 text-sm"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              placeholder="Nome e sobrenome"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Telefone</label>
            <input
              className="border rounded px-3 py-2 text-sm"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="(00) 00000-0000"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">E-mail (opcional)</label>
            <input
              className="border rounded px-3 py-2 text-sm"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nascimento (opcional)</label>
            <input
              type="date"
              className="border rounded px-3 py-2 text-sm"
              value={form.birthDate}
              onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
            />
          </div>
          {editingId && (
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
          )}
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

      {/* Busca */}
      <div className="flex flex-wrap gap-3 items-end mb-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Buscar por nome</label>
          <input
            className="border rounded px-3 py-2 text-sm"
            value={q}
            onChange={(e) => {
              setPage(1);
              setQ(e.target.value);
            }}
            placeholder="Nome..."
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700 pb-2">
          <input
            type="checkbox"
            checked={onlyActive}
            onChange={(e) => {
              setPage(1);
              setOnlyActive(e.target.checked);
            }}
          />
          Somente ativos
        </label>
      </div>

      {/* Lista */}
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left p-3">Nome</th>
              <th className="text-left p-3">Telefone</th>
              <th className="text-left p-3">E-mail</th>
              <th className="text-center p-3">Equipes</th>
              <th className="text-center p-3">Ativo</th>
              <th className="text-right p-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {members.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-gray-500">
                  Nenhum membro encontrado.
                </td>
              </tr>
            )}
            {members.map((m) => (
              <tr key={m.id} className={`border-b ${editingId === m.id ? 'bg-blue-50' : ''}`}>
                <td className="p-3">{m.fullName}</td>
                <td className="p-3">{m.phone}</td>
                <td className="p-3">{m.email || '—'}</td>
                <td className="p-3 text-center">{m._count?.memberships ?? 0}</td>
                <td className="p-3 text-center">{m.isActive ? '✓' : '✗'}</td>
                <td className="p-3 text-right space-x-3">
                  <button onClick={() => handleEdit(m)} className="text-blue-600 text-xs hover:underline">
                    Editar
                  </button>
                  {m.isActive && (
                    <button
                      onClick={() => handleDelete(m.id)}
                      className="text-red-600 text-xs hover:underline"
                    >
                      Desativar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      <div className="flex items-center justify-between mt-3 text-sm text-gray-600">
        <span>
          {total} membro(s) · página {page} de {totalPages}
        </span>
        <div className="space-x-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1 rounded border disabled:opacity-40"
          >
            Anterior
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1 rounded border disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      </div>
    </div>
  );
}
