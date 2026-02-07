'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { apiAuthFetch } from '@/lib/api';

const groupLabels: Record<string, string> = {
  SUFRAGIO: 'Sufrágio',
  SUPLICAS: 'Súplicas',
  ACAO_DE_GRACAS: 'Ação de Graças',
};

interface Intention {
  id: string;
  group: string;
  deceasedName?: string;
  familyNames?: string;
  complement?: string;
  notes?: string;
  dispatchedAt?: string;
  intentionType: { name: string; group: string };
}

interface Request {
  id: string;
  protocol: string;
  massDate: string;
  massTime: string;
  faithfulName: string;
  faithfulPhone: string;
  status: string;
  createdAt: string;
  intentions: Intention[];
}

export default function RequestsPage() {
  const { data: session } = useSession();
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const token = session?.accessToken as string;

  useEffect(() => {
    if (!token) return;
    apiAuthFetch('/admin/requests', token)
      .then(setRequests)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <p className="text-gray-500">Carregando...</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Pedidos</h1>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left p-3">Protocolo</th>
              <th className="text-left p-3">Data</th>
              <th className="text-left p-3">Horário</th>
              <th className="text-left p-3">Fiel</th>
              <th className="text-left p-3">Telefone</th>
              <th className="text-center p-3">Intenções</th>
              <th className="text-center p-3">Status</th>
              <th className="text-left p-3">Criado em</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <>
                <tr
                  key={r.id}
                  className="border-b hover:bg-gray-50 cursor-pointer"
                  onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                >
                  <td className="p-3 font-mono font-medium text-blue-700">{r.protocol}</td>
                  <td className="p-3">{new Date(r.massDate).toLocaleDateString('pt-BR')}</td>
                  <td className="p-3">{r.massTime}</td>
                  <td className="p-3">{r.faithfulName}</td>
                  <td className="p-3">{r.faithfulPhone}</td>
                  <td className="p-3 text-center">{r.intentions.length}</td>
                  <td className="p-3 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${r.status === 'SUBMITTED' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                      {r.status === 'SUBMITTED' ? 'Registrado' : 'Cancelado'}
                    </span>
                  </td>
                  <td className="p-3 text-gray-500">{new Date(r.createdAt).toLocaleString('pt-BR')}</td>
                </tr>
                {expanded === r.id && (
                  <tr key={`${r.id}-detail`}>
                    <td colSpan={8} className="p-4 bg-gray-50">
                      <div className="space-y-2">
                        {r.intentions.map((int) => (
                          <div key={int.id} className="flex items-start gap-3 text-sm">
                            <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs">
                              {groupLabels[int.group]}
                            </span>
                            <div>
                              <span className="font-medium">{int.intentionType.name}</span>
                              {int.deceasedName && <span className="text-gray-600"> - {int.deceasedName}</span>}
                              {int.familyNames && <span className="text-gray-600"> - {int.familyNames}</span>}
                              {int.complement && <span className="text-gray-600"> - {int.complement}</span>}
                              {int.notes && <span className="text-gray-400 italic"> ({int.notes})</span>}
                              {int.dispatchedAt && (
                                <span className="ml-2 text-green-600 text-xs">Disparada</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
        {requests.length === 0 && (
          <p className="text-center py-8 text-gray-400">Nenhum pedido registrado.</p>
        )}
      </div>
    </div>
  );
}
