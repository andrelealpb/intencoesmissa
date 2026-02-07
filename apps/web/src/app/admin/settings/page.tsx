'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { apiAuthFetch } from '@/lib/api';

interface Settings {
  maxIntentionsPerRequest: number;
  dispatchTime: string;
  dispatchScope: 'PER_MASS' | 'PER_DAY';
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const [settings, setSettings] = useState<Settings>({
    maxIntentionsPerRequest: 5,
    dispatchTime: '18:00',
    dispatchScope: 'PER_MASS',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!session?.accessToken) return;
    apiAuthFetch('/admin/settings', session.accessToken as string)
      .then((data) => setSettings(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [session]);

  const handleSave = async () => {
    if (!session?.accessToken) return;
    setSaving(true);
    try {
      await apiAuthFetch('/admin/settings', session.accessToken as string, {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      alert('Configurações salvas!');
    } catch (e: any) {
      alert('Erro: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-gray-500">Carregando...</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Configurações</h1>
      <div className="bg-white rounded-lg shadow p-6 max-w-md space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Máx. intenções por pedido</label>
          <input
            type="number"
            min={1}
            max={20}
            className="w-full border rounded-md px-3 py-2 text-sm"
            value={settings.maxIntentionsPerRequest}
            onChange={(e) => setSettings({ ...settings, maxIntentionsPerRequest: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Horário de Disparo</label>
          <input
            type="time"
            className="w-full border rounded-md px-3 py-2 text-sm"
            value={settings.dispatchTime}
            onChange={(e) => setSettings({ ...settings, dispatchTime: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Escopo do Disparo</label>
          <select
            className="w-full border rounded-md px-3 py-2 text-sm"
            value={settings.dispatchScope}
            onChange={(e) => setSettings({ ...settings, dispatchScope: e.target.value as 'PER_MASS' | 'PER_DAY' })}
          >
            <option value="PER_MASS">Por Missa (um PDF por horário)</option>
            <option value="PER_DAY">Por Dia (um PDF consolidado)</option>
          </select>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 text-white px-6 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Salvando...' : 'Salvar Configurações'}
        </button>
      </div>
    </div>
  );
}
