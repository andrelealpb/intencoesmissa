'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { apiAuthFetch } from '@/lib/api';

interface Parish {
  id: string;
  slug: string;
  parishName: string;
  cnpj?: string;
  createdAt: string;
}

export default function SAParishesPage() {
  const { data: session } = useSession();
  const [parishes, setParishes] = useState<Parish[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ slug: '', parishName: '', cnpj: '' });
  const [error, setError] = useState('');
  const token = session?.accessToken as string;

  useEffect(() => {
    if (!token) return;
    apiAuthFetch('/sa/parishes', token).then(setParishes).catch(console.error).finally(() => setLoading(false));
  }, [token]);

  const handleCreate = async () => {
    if (!token) return;
    setError('');
    try {
      const created = await apiAuthFetch('/sa/parishes', token, {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setParishes([...parishes, created]);
      setShowForm(false);
      setForm({ slug: '', parishName: '', cnpj: '' });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao criar paróquia');
    }
  };

  const handleDelete = async (id: string) => {
    if (!token || !confirm('Excluir paróquia? Isso removerá todos os dados associados.')) return;
    await apiAuthFetch(`/sa/parishes/${id}`, token, { method: 'DELETE' });
    setParishes(parishes.filter((p) => p.id !== id));
  };

  if (loading) return <p className="text-gray-500">Carregando...</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Paróquias</h1>
        <button onClick={() => setShowForm(true)} className="bg-purple-600 text-white px-4 py-2 rounded-md text-sm hover:bg-purple-700">
          Nova Paróquia
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left p-3">Nome</th>
              <th className="text-left p-3">Slug</th>
              <th className="text-left p-3">CNPJ</th>
              <th className="text-left p-3">Criado em</th>
              <th className="text-right p-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {parishes.map((p) => (
              <tr key={p.id} className="border-b hover:bg-gray-50">
                <td className="p-3 font-medium">{p.parishName}</td>
                <td className="p-3 font-mono text-xs">{p.slug}</td>
                <td className="p-3">{p.cnpj ?? '-'}</td>
                <td className="p-3 text-gray-500">{new Date(p.createdAt).toLocaleDateString('pt-BR')}</td>
                <td className="p-3 text-right">
                  <button onClick={() => handleDelete(p.id)} className="text-red-600 text-xs hover:underline">Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-bold mb-4">Nova Paróquia</h2>
            {error && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>
            )}
            <div className="space-y-3">
              <input className="w-full border rounded px-3 py-2 text-sm" placeholder="Nome da Paróquia" value={form.parishName} onChange={(e) => setForm({ ...form, parishName: e.target.value })} />
              <input className="w-full border rounded px-3 py-2 text-sm" placeholder="Slug (ex: minha-paroquia)" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
              <input className="w-full border rounded px-3 py-2 text-sm" placeholder="CNPJ (opcional)" value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} />
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
