'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { apiAuthFetch } from '@/lib/api';

interface Dispatch {
  id: string;
  scope: string;
  massDate: string;
  massTime?: string;
  status: string;
  sentAt: string;
  sentToEmails: string[];
  _count: { intentions: number };
}

export default function DispatchesPage() {
  const { data: session } = useSession();
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const token = session?.accessToken as string;

  useEffect(() => {
    if (!token) return;
    apiAuthFetch('/admin/dispatches', token)
      .then(setDispatches)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token]);

  const handleRunNow = async () => {
    if (!token) return;
    setTriggering(true);
    try {
      await apiAuthFetch('/admin/dispatches/run-now', token, { method: 'POST' });
      alert('Disparo manual solicitado!');
    } catch (e: any) {
      alert('Erro: ' + e.message);
    } finally {
      setTriggering(false);
    }
  };

  const handleDownload = async (id: string) => {
    if (!token) return;
    try {
      const { url } = await apiAuthFetch(`/admin/dispatches/${id}/download`, token);
      window.open(url, '_blank');
    } catch (e: any) {
      alert('Erro: ' + e.message);
    }
  };

  if (loading) return <p className="text-gray-500">Carregando...</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Histórico de Disparos</h1>
        <button
          onClick={handleRunNow}
          disabled={triggering}
          className="bg-green-600 text-white px-4 py-2 rounded-md text-sm hover:bg-green-700 disabled:opacity-50"
        >
          {triggering ? 'Disparando...' : 'Disparar Agora'}
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left p-3">Data</th>
              <th className="text-left p-3">Horário</th>
              <th className="text-left p-3">Escopo</th>
              <th className="text-center p-3">Status</th>
              <th className="text-center p-3">Intenções</th>
              <th className="text-left p-3">Enviado em</th>
              <th className="text-right p-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {dispatches.map((d) => (
              <tr key={d.id} className="border-b hover:bg-gray-50">
                <td className="p-3">{new Date(d.massDate).toLocaleDateString('pt-BR')}</td>
                <td className="p-3">{d.massTime ?? 'Consolidado'}</td>
                <td className="p-3">{d.scope === 'PER_MASS' ? 'Por Missa' : 'Por Dia'}</td>
                <td className="p-3 text-center">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${d.status === 'SENT' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {d.status === 'SENT' ? 'Enviado' : 'Falhou'}
                  </span>
                </td>
                <td className="p-3 text-center">{d._count.intentions}</td>
                <td className="p-3 text-gray-500">{new Date(d.sentAt).toLocaleString('pt-BR')}</td>
                <td className="p-3 text-right">
                  {d.status === 'SENT' && (
                    <button onClick={() => handleDownload(d.id)} className="text-blue-600 text-xs hover:underline">
                      Baixar PDF
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {dispatches.length === 0 && (
          <p className="text-center py-8 text-gray-400">Nenhum disparo realizado ainda.</p>
        )}
      </div>
    </div>
  );
}
