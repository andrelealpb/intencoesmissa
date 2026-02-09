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

interface NextMass {
  massDate: string;
  massTime: string;
  title?: string | null;
  pendingIntentions: number;
}

export default function DispatchesPage() {
  const { data: session } = useSession();
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [nextMass, setNextMass] = useState<NextMass | null>(null);
  const [loadingNext, setLoadingNext] = useState(false);
  const token = session?.accessToken as string;

  const loadDispatches = () => {
    if (!token) return;
    apiAuthFetch('/admin/dispatches', token)
      .then(setDispatches)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDispatches();
  }, [token]);

  const handleDispatchClick = async () => {
    if (!token) return;
    setLoadingNext(true);
    try {
      const data = await apiAuthFetch('/admin/dispatches/next-mass', token);
      if (!data) {
        alert('Nenhuma missa pendente para hoje.');
        return;
      }
      setNextMass(data);
      setShowConfirm(true);
    } catch (e: any) {
      alert('Erro: ' + e.message);
    } finally {
      setLoadingNext(false);
    }
  };

  const handleConfirmDispatch = async () => {
    if (!token || !nextMass) return;
    setTriggering(true);
    try {
      const result = await apiAuthFetch('/admin/dispatches/run-now', token, {
        method: 'POST',
        body: JSON.stringify({ massTime: nextMass.massTime }),
      });
      alert(result.message);
      setShowConfirm(false);
      setNextMass(null);
      setLoading(true);
      loadDispatches();
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
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-gray-800">Historico de Disparos</h1>
        <button
          onClick={handleDispatchClick}
          disabled={loadingNext}
          className="bg-green-600 text-white px-4 py-2 rounded-md text-sm hover:bg-green-700 disabled:opacity-50"
        >
          {loadingNext ? 'Verificando...' : 'Disparar Agora'}
        </button>
      </div>

      {/* Confirmation Modal */}
      {showConfirm && nextMass && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-3">Confirmar Disparo Manual</h2>
            <p className="text-sm text-gray-600 mb-4">
              Deseja encerrar e disparar as intencoes da proxima missa?
            </p>
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <p className="text-sm">
                <strong>Missa:</strong> {nextMass.massTime}
                {nextMass.title && <span className="text-gray-500"> ({nextMass.title})</span>}
              </p>
              <p className="text-sm">
                <strong>Data:</strong> {nextMass.massDate.split('-').reverse().join('/')}
              </p>
              <p className="text-sm">
                <strong>Intencoes pendentes:</strong> {nextMass.pendingIntentions}
              </p>
            </div>
            <p className="text-xs text-amber-600 mb-4">
              Apos o disparo, nao sera mais possivel adicionar intencoes para esta missa.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowConfirm(false); setNextMass(null); }}
                className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDispatch}
                disabled={triggering}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                {triggering ? 'Disparando...' : 'Confirmar Disparo'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left p-3">Data</th>
              <th className="text-left p-3">Horario</th>
              <th className="text-left p-3">Escopo</th>
              <th className="text-center p-3">Status</th>
              <th className="text-center p-3">Intencoes</th>
              <th className="text-left p-3">Enviado em</th>
              <th className="text-right p-3">Acoes</th>
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
                  {d.status === 'SENT' && d._count.intentions > 0 && (
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
