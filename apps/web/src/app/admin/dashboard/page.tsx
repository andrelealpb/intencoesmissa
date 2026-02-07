'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { apiAuthFetch } from '@/lib/api';

interface DashboardData {
  totalRequests: number;
  totalIntentions: number;
  avgIntentionsPerRequest: number;
  intentionsByGroup: { group: string; count: number }[];
  topTypes: { name: string; group: string; count: number }[];
  mostDemandedSchedules: { massTime: string; count: number }[];
}

const groupLabels: Record<string, string> = {
  SUFRAGIO: 'Sufrágio',
  SUPLICAS: 'Súplicas',
  ACAO_DE_GRACAS: 'Ação de Graças',
};

export default function DashboardPage() {
  const { data: session } = useSession();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.accessToken) return;
    apiAuthFetch('/admin/dashboard', session.accessToken as string)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [session]);

  if (loading) return <p className="text-gray-500">Carregando dashboard...</p>;
  if (!data) return <p className="text-red-500">Erro ao carregar dashboard</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Dashboard</h1>

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card title="Total de Pedidos" value={data.totalRequests} />
        <Card title="Total de Intenções" value={data.totalIntentions} />
        <Card title="Média por Pedido" value={data.avgIntentionsPerRequest} />
        <Card title="Horários Populares" value={data.mostDemandedSchedules.length} />
      </div>

      {/* Intentions by group */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="font-semibold text-gray-700 mb-4">Intenções por Grupo</h2>
        <div className="space-y-3">
          {data.intentionsByGroup.map((g) => (
            <div key={g.group} className="flex items-center justify-between">
              <span className="text-sm text-gray-600">{groupLabels[g.group] ?? g.group}</span>
              <div className="flex items-center gap-2">
                <div className="w-32 bg-gray-200 rounded-full h-3">
                  <div
                    className="bg-blue-600 h-3 rounded-full"
                    style={{
                      width: `${Math.min(100, (g.count / Math.max(data.totalIntentions, 1)) * 100)}%`,
                    }}
                  />
                </div>
                <span className="text-sm font-medium w-10 text-right">{g.count}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top Types */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="font-semibold text-gray-700 mb-4">Top Tipos de Intenção</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 text-gray-500">Tipo</th>
                <th className="text-left py-2 text-gray-500">Grupo</th>
                <th className="text-right py-2 text-gray-500">Qtd</th>
              </tr>
            </thead>
            <tbody>
              {data.topTypes.map((t, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-2">{t.name}</td>
                  <td className="py-2 text-gray-500">{groupLabels[t.group] ?? t.group}</td>
                  <td className="py-2 text-right font-medium">{t.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Most demanded schedules */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="font-semibold text-gray-700 mb-4">Horários Mais Demandados</h2>
        <div className="flex flex-wrap gap-3">
          {data.mostDemandedSchedules.map((s, i) => (
            <div key={i} className="bg-blue-50 text-blue-700 rounded-lg px-4 py-2 text-sm">
              <span className="font-semibold">{s.massTime}</span>
              <span className="ml-2 text-blue-500">({s.count} pedidos)</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Card({ title, value }: { title: string; value: number }) {
  return (
    <div className="bg-white rounded-lg shadow p-5">
      <p className="text-sm text-gray-500">{title}</p>
      <p className="text-2xl font-bold text-gray-800 mt-1">{value}</p>
    </div>
  );
}
