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
  pdfStorageKey?: string;
  errorMessage?: string;
  _count: { intentions: number };
}

interface NextMass {
  found: boolean;
  massDate?: string;
  massTime?: string;
  title?: string | null;
  pendingIntentions?: number;
}

interface DispatchDetail {
  id: string;
  massDate: string;
  massTime?: string;
  status: string;
  sentAt: string;
  sentToEmails: string[];
  errorMessage?: string;
  intentions: {
    id: string;
    group: string;
    deceasedName?: string;
    familyNames?: string;
    complement?: string;
    intentionType: { name: string; group: string };
    request: { faithfulName: string; faithfulPhone: string };
  }[];
}

const GROUP_LABELS: Record<string, string> = {
  SUFRAGIO: 'Sufragio',
  SUPLICAS: 'Suplicas',
  ACAO_DE_GRACAS: 'Acao de Gracas',
};

export default function DispatchesPage() {
  const { data: session } = useSession();
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [nextMass, setNextMass] = useState<NextMass | null>(null);
  const [loadingNext, setLoadingNext] = useState(false);
  const [detail, setDetail] = useState<DispatchDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
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
      if (!data || !data.found) {
        alert('Nenhuma missa pendente nos proximos 7 dias.');
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
        body: JSON.stringify({ massTime: nextMass.massTime, massDate: nextMass.massDate }),
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

  const handleView = async (id: string) => {
    if (!token) return;
    setLoadingDetail(true);
    try {
      const data = await apiAuthFetch(`/admin/dispatches/${id}/details`, token);
      setDetail(data);
    } catch (e: any) {
      alert('Erro: ' + e.message);
    } finally {
      setLoadingDetail(false);
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

  const handleReopen = async (id: string) => {
    if (!token) return;
    if (!confirm('Tem certeza que deseja reabrir este despacho? As intencoes voltarao ao estado pendente e a missa sera reaberta para novas intencoes.')) return;
    setActionLoading(id);
    try {
      const result = await apiAuthFetch(`/admin/dispatches/${id}/reopen`, token, { method: 'POST' });
      alert(result.message);
      setLoading(true);
      loadDispatches();
    } catch (e: any) {
      alert('Erro: ' + e.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleResend = async (id: string) => {
    if (!token) return;
    if (!confirm('Deseja reenviar o e-mail deste despacho?')) return;
    setActionLoading(id);
    try {
      const result = await apiAuthFetch(`/admin/dispatches/${id}/resend`, token, { method: 'POST' });
      alert(result.message);
    } catch (e: any) {
      alert('Erro: ' + e.message);
    } finally {
      setActionLoading(null);
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

      {/* Dispatch Confirm Modal */}
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
                <strong>Data:</strong> {nextMass.massDate?.split('-').reverse().join('/')}
              </p>
              <p className="text-sm">
                <strong>Intencoes pendentes:</strong> {nextMass.pendingIntentions ?? 0}
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

      {/* Detail Modal */}
      {detail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Detalhes do Despacho</h2>
              <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm space-y-1">
              <p><strong>Data:</strong> {new Date(detail.massDate).toLocaleDateString('pt-BR')}</p>
              <p><strong>Horario:</strong> {detail.massTime ?? 'Consolidado'}</p>
              <p><strong>Enviado em:</strong> {new Date(detail.sentAt).toLocaleString('pt-BR')}</p>
              <p><strong>Emails:</strong> {detail.sentToEmails.join(', ')}</p>
              <p><strong>Total intencoes:</strong> {detail.intentions.length}</p>
              {detail.status === 'FAILED' && detail.errorMessage && (
                <div className="bg-red-50 border border-red-200 rounded p-2 mt-2">
                  <p className="text-red-700 text-xs"><strong>Erro:</strong> {detail.errorMessage}</p>
                </div>
              )}
            </div>

            {detail.intentions.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Nenhuma intencao neste despacho.</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(
                  detail.intentions.reduce<Record<string, typeof detail.intentions>>((acc, i) => {
                    const g = i.group;
                    if (!acc[g]) acc[g] = [];
                    acc[g].push(i);
                    return acc;
                  }, {})
                ).map(([group, items]) => (
                  <div key={group}>
                    <h4 className="text-sm font-semibold text-gray-700 mb-1">
                      {GROUP_LABELS[group] || group} ({items.length})
                    </h4>
                    <ul className="space-y-1">
                      {items.map((item) => (
                        <li key={item.id} className="text-sm text-gray-600 pl-3 border-l-2 border-gray-200">
                          <span className="font-medium">{item.intentionType.name}</span>
                          {item.deceasedName && <span> - {item.deceasedName}</span>}
                          {item.familyNames && <span> - {item.familyNames}</span>}
                          {item.complement && <span> - {item.complement}</span>}
                          <span className="block text-xs text-gray-400">
                            Solicitante: {item.request.faithfulName}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left p-3">Data</th>
              <th className="text-left p-3">Horario</th>
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
                <td className="p-3 text-center">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${d.status === 'SENT' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {d.status === 'SENT' ? 'Enviado' : 'Falhou'}
                  </span>
                  {d.status === 'FAILED' && d.errorMessage && (
                    <p className="text-xs text-red-600 mt-1 max-w-xs truncate" title={d.errorMessage}>
                      {d.errorMessage}
                    </p>
                  )}
                </td>
                <td className="p-3 text-center">{d._count.intentions}</td>
                <td className="p-3 text-gray-500">{new Date(d.sentAt).toLocaleString('pt-BR')}</td>
                <td className="p-3 text-right">
                  <div className="flex items-center justify-end gap-2 flex-wrap">
                    <button
                      onClick={() => handleView(d.id)}
                      disabled={loadingDetail}
                      className="text-blue-600 text-xs hover:underline disabled:opacity-50"
                      title="Visualizar intencoes"
                    >
                      Visualizar
                    </button>
                    {d._count.intentions > 0 && d.pdfStorageKey && (
                      <button
                        onClick={() => handleDownload(d.id)}
                        className="text-blue-600 text-xs hover:underline"
                        title="Baixar PDF"
                      >
                        Baixar PDF
                      </button>
                    )}
                    {d._count.intentions > 0 && d.pdfStorageKey && (
                      <button
                        onClick={() => handleResend(d.id)}
                        disabled={actionLoading === d.id}
                        className="text-amber-600 text-xs hover:underline disabled:opacity-50"
                        title="Reenviar e-mail"
                      >
                        {actionLoading === d.id ? '...' : 'Reenviar'}
                      </button>
                    )}
                    <button
                      onClick={() => handleReopen(d.id)}
                      disabled={actionLoading === d.id}
                      className="text-red-600 text-xs hover:underline disabled:opacity-50"
                      title="Reabrir despacho"
                    >
                      {actionLoading === d.id ? '...' : 'Reabrir'}
                    </button>
                  </div>
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
