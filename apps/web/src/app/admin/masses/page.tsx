'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { apiAuthFetch } from '@/lib/api';

const weekdayLabels = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

interface Schedule {
  id: string;
  weekday: number;
  time: string;
  isActive: boolean;
}

interface MassException {
  id: string;
  date: string;
  time: string;
  title?: string;
  isActive: boolean;
}

export default function MassesPage() {
  const { data: session } = useSession();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [exceptions, setExceptions] = useState<MassException[]>([]);
  const [tab, setTab] = useState<'schedules' | 'exceptions'>('schedules');
  const [newSchedule, setNewSchedule] = useState({ weekday: 0, time: '08:00', isActive: true });
  const [newException, setNewException] = useState({ date: '', time: '08:00', title: '', isActive: true });

  const token = session?.accessToken as string;

  useEffect(() => {
    if (!token) return;
    apiAuthFetch('/admin/masses/schedules', token).then(setSchedules).catch(console.error);
    apiAuthFetch('/admin/masses/exceptions', token).then(setExceptions).catch(console.error);
  }, [token]);

  const addSchedule = async () => {
    if (!token) return;
    const created = await apiAuthFetch('/admin/masses/schedules', token, {
      method: 'POST',
      body: JSON.stringify(newSchedule),
    });
    setSchedules([...schedules, created]);
  };

  const deleteSchedule = async (id: string) => {
    if (!token) return;
    await apiAuthFetch(`/admin/masses/schedules/${id}`, token, { method: 'DELETE' });
    setSchedules(schedules.filter((s) => s.id !== id));
  };

  const addException = async () => {
    if (!token || !newException.date) return;
    const created = await apiAuthFetch('/admin/masses/exceptions', token, {
      method: 'POST',
      body: JSON.stringify(newException),
    });
    setExceptions([...exceptions, created]);
  };

  const deleteException = async (id: string) => {
    if (!token) return;
    await apiAuthFetch(`/admin/masses/exceptions/${id}`, token, { method: 'DELETE' });
    setExceptions(exceptions.filter((e) => e.id !== id));
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Horários de Missa</h1>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab('schedules')}
          className={`px-4 py-2 rounded-md text-sm ${tab === 'schedules' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
        >
          Regulares
        </button>
        <button
          onClick={() => setTab('exceptions')}
          className={`px-4 py-2 rounded-md text-sm ${tab === 'exceptions' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
        >
          Exceções
        </button>
      </div>

      {tab === 'schedules' && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex flex-wrap gap-2 mb-4">
            <select
              className="border rounded px-3 py-2 text-sm"
              value={newSchedule.weekday}
              onChange={(e) => setNewSchedule({ ...newSchedule, weekday: Number(e.target.value) })}
            >
              {weekdayLabels.map((label, i) => (
                <option key={i} value={i}>{label}</option>
              ))}
            </select>
            <input
              type="time"
              className="border rounded px-3 py-2 text-sm"
              value={newSchedule.time}
              onChange={(e) => setNewSchedule({ ...newSchedule, time: e.target.value })}
            />
            <button onClick={addSchedule} className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">
              Adicionar
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Dia</th>
                <th className="text-left py-2">Horário</th>
                <th className="text-left py-2">Ativo</th>
                <th className="text-right py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((s) => (
                <tr key={s.id} className="border-b">
                  <td className="py-2">{weekdayLabels[s.weekday]}</td>
                  <td className="py-2">{s.time}</td>
                  <td className="py-2">{s.isActive ? 'Sim' : 'Não'}</td>
                  <td className="py-2 text-right">
                    <button onClick={() => deleteSchedule(s.id)} className="text-red-600 text-xs hover:underline">
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'exceptions' && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex flex-wrap gap-2 mb-4">
            <input
              type="date"
              className="border rounded px-3 py-2 text-sm"
              value={newException.date}
              onChange={(e) => setNewException({ ...newException, date: e.target.value })}
            />
            <input
              type="time"
              className="border rounded px-3 py-2 text-sm"
              value={newException.time}
              onChange={(e) => setNewException({ ...newException, time: e.target.value })}
            />
            <input
              placeholder="Título (opcional)"
              className="border rounded px-3 py-2 text-sm"
              value={newException.title}
              onChange={(e) => setNewException({ ...newException, title: e.target.value })}
            />
            <button onClick={addException} className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">
              Adicionar
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Data</th>
                <th className="text-left py-2">Horário</th>
                <th className="text-left py-2">Título</th>
                <th className="text-right py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {exceptions.map((e) => (
                <tr key={e.id} className="border-b">
                  <td className="py-2">{e.date}</td>
                  <td className="py-2">{e.time}</td>
                  <td className="py-2">{e.title || '-'}</td>
                  <td className="py-2 text-right">
                    <button onClick={() => deleteException(e.id)} className="text-red-600 text-xs hover:underline">
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
