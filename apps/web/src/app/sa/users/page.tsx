'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { apiAuthFetch } from '@/lib/api';

interface User {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
  parishId?: string;
  parish?: { parishName: string };
  createdAt: string;
}

interface Parish {
  id: string;
  parishName: string;
}

export default function SAUsersPage() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<User[]>([]);
  const [parishes, setParishes] = useState<Parish[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', role: 'PARISH_ADMIN', parishId: '' });
  const [error, setError] = useState('');
  const token = session?.accessToken as string;

  useEffect(() => {
    if (!token) return;
    Promise.all([
      apiAuthFetch('/sa/users', token),
      apiAuthFetch('/sa/parishes', token),
    ])
      .then(([usersData, parishesData]) => {
        setUsers(usersData);
        setParishes(parishesData);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token]);

  const handleCreate = async () => {
    if (!token) return;
    setError('');
    try {
      const payload: Record<string, string> = {
        email: form.email,
        password: form.password,
        role: form.role,
      };
      if (form.role === 'PARISH_ADMIN' && form.parishId) {
        payload.parishId = form.parishId;
      }
      const created = await apiAuthFetch('/sa/users', token, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setUsers([...users, created]);
      setShowForm(false);
      setForm({ email: '', password: '', role: 'PARISH_ADMIN', parishId: '' });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao criar usuário');
    }
  };

  const handleDelete = async (id: string) => {
    if (!token || !confirm('Excluir usuário?')) return;
    await apiAuthFetch(`/sa/users/${id}`, token, { method: 'DELETE' });
    setUsers(users.filter((u) => u.id !== id));
  };

  if (loading) return <p className="text-gray-500">Carregando...</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Usuários</h1>
        <button onClick={() => setShowForm(true)} className="bg-purple-600 text-white px-4 py-2 rounded-md text-sm hover:bg-purple-700">
          Novo Usuário
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left p-3">E-mail</th>
              <th className="text-left p-3">Papel</th>
              <th className="text-left p-3">Paróquia</th>
              <th className="text-center p-3">Ativo</th>
              <th className="text-right p-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b hover:bg-gray-50">
                <td className="p-3">{u.email}</td>
                <td className="p-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${u.role === 'SUPER_ADMIN' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
                    {u.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin Paróquia'}
                  </span>
                </td>
                <td className="p-3">{u.parish?.parishName ?? '-'}</td>
                <td className="p-3 text-center">{u.isActive ? '✓' : '✗'}</td>
                <td className="p-3 text-right">
                  <button onClick={() => handleDelete(u.id)} className="text-red-600 text-xs hover:underline">Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-bold mb-4">Novo Usuário</h2>
            {error && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>
            )}
            <div className="space-y-3">
              <input className="w-full border rounded px-3 py-2 text-sm" type="email" placeholder="E-mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <input className="w-full border rounded px-3 py-2 text-sm" type="password" placeholder="Senha" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              <select className="w-full border rounded px-3 py-2 text-sm" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="PARISH_ADMIN">Admin Paróquia</option>
                <option value="SUPER_ADMIN">Super Admin</option>
              </select>
              {form.role === 'PARISH_ADMIN' && (
                <select className="w-full border rounded px-3 py-2 text-sm" value={form.parishId} onChange={(e) => setForm({ ...form, parishId: e.target.value })}>
                  <option value="">Selecione a Paróquia</option>
                  {parishes.map((p) => (
                    <option key={p.id} value={p.id}>{p.parishName}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => { setShowForm(false); setError(''); }} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded">Cancelar</button>
              <button onClick={handleCreate} className="bg-purple-600 text-white px-4 py-2 rounded text-sm hover:bg-purple-700">Criar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
