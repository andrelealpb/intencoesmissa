'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { apiAuthFetch } from '@/lib/api';
import {
  categoryLabels,
  scopeLabels,
  scopeOrder,
  scopeTargetKind,
  weekdayLabels,
  type Team,
  type TeamFunction,
  type Membership,
  type Member,
  type StaffingRequirement,
  type Schedule,
  type MassException,
} from '@/lib/escala';

type Tab = 'functions' | 'members' | 'staffing';

export default function TeamDetailPage() {
  const params = useParams<{ teamId: string }>();
  const teamId = params.teamId;
  const { data: session } = useSession();
  const token = session?.accessToken as string;

  const [team, setTeam] = useState<Team | null>(null);
  const [tab, setTab] = useState<Tab>('functions');

  useEffect(() => {
    if (!token) return;
    apiAuthFetch(`/admin/escala/teams/${teamId}`, token).then(setTeam).catch(console.error);
  }, [token, teamId]);

  return (
    <div>
      <div className="mb-6">
        <Link href="/admin/escala/equipes" className="text-sm text-blue-600 hover:underline">
          ← Voltar às equipes
        </Link>
        <h1 className="text-2xl font-bold text-gray-800 mt-2">{team?.name ?? 'Equipe'}</h1>
        {team && (
          <p className="text-sm text-gray-500">
            {categoryLabels[team.category] ?? team.category}
            {team.description ? ` · ${team.description}` : ''}
            {!team.isActive && ' · (inativa)'}
          </p>
        )}
      </div>

      <div className="flex gap-2 mb-4">
        {(
          [
            ['functions', 'Funções'],
            ['members', 'Vínculos'],
            ['staffing', 'Demanda'],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-md text-sm ${
              tab === key ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'functions' && <FunctionsTab teamId={teamId} token={token} />}
      {tab === 'members' && <MembersTab teamId={teamId} token={token} />}
      {tab === 'staffing' && <StaffingTab teamId={teamId} token={token} />}
    </div>
  );
}

// ── Funções ───────────────────────────────────────────────

interface FunctionForm {
  name: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
}
const emptyFunctionForm: FunctionForm = { name: '', description: '', sortOrder: 0, isActive: true };

function FunctionsTab({ teamId, token }: { teamId: string; token: string }) {
  const [functions, setFunctions] = useState<TeamFunction[]>([]);
  const [form, setForm] = useState<FunctionForm>(emptyFunctionForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (!token) return;
    apiAuthFetch(`/admin/escala/teams/${teamId}/functions`, token)
      .then(setFunctions)
      .catch(console.error);
  }, [token, teamId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    if (!token) return;
    setError('');
    if (form.name.trim().length < 2) {
      setError('Nome deve ter pelo menos 2 caracteres.');
      return;
    }
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      sortOrder: form.sortOrder,
    };
    try {
      if (editingId) {
        await apiAuthFetch(`/admin/escala/functions/${editingId}`, token, {
          method: 'PUT',
          body: JSON.stringify({ ...payload, isActive: form.isActive }),
        });
        setEditingId(null);
      } else {
        await apiAuthFetch(`/admin/escala/teams/${teamId}/functions`, token, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setForm(emptyFunctionForm);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.');
    }
  };

  const handleEdit = (f: TeamFunction) => {
    setEditingId(f.id);
    setForm({
      name: f.name,
      description: f.description ?? '',
      sortOrder: f.sortOrder,
      isActive: f.isActive,
    });
    setError('');
  };

  const handleDelete = async (id: string) => {
    if (!token || !confirm('Excluir/desativar esta função?')) return;
    await apiAuthFetch(`/admin/escala/functions/${id}`, token, { method: 'DELETE' });
    if (editingId === id) {
      setEditingId(null);
      setForm(emptyFunctionForm);
    }
    load();
  };

  return (
    <div>
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="font-semibold mb-3">{editingId ? 'Editar Função' : 'Adicionar Função'}</h2>
        {error && (
          <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {error}
          </div>
        )}
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nome</label>
            <input
              className="border rounded px-3 py-2 text-sm"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex.: Turíbulo"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-gray-500 mb-1">Descrição (opcional)</label>
            <input
              className="border rounded px-3 py-2 text-sm w-full"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Ordem</label>
            <input
              type="number"
              min="0"
              className="border rounded px-3 py-2 text-sm w-24"
              value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
            />
          </div>
          {editingId && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Ativa</label>
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
              onClick={() => {
                setEditingId(null);
                setForm(emptyFunctionForm);
                setError('');
              }}
              className="bg-gray-200 text-gray-700 px-4 py-2 rounded text-sm hover:bg-gray-300"
            >
              Cancelar
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left p-3">Ordem</th>
              <th className="text-left p-3">Função</th>
              <th className="text-center p-3">Ativa</th>
              <th className="text-right p-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {functions.length === 0 && (
              <tr>
                <td colSpan={4} className="p-4 text-center text-gray-500">
                  Nenhuma função cadastrada.
                </td>
              </tr>
            )}
            {functions.map((f) => (
              <tr key={f.id} className={`border-b ${editingId === f.id ? 'bg-blue-50' : ''}`}>
                <td className="p-3">{f.sortOrder}</td>
                <td className="p-3">
                  {f.name}
                  {f.description && <p className="text-xs text-gray-500">{f.description}</p>}
                </td>
                <td className="p-3 text-center">{f.isActive ? '✓' : '✗'}</td>
                <td className="p-3 text-right space-x-3">
                  <button onClick={() => handleEdit(f)} className="text-blue-600 text-xs hover:underline">
                    Editar
                  </button>
                  <button onClick={() => handleDelete(f.id)} className="text-red-600 text-xs hover:underline">
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Vínculos (memberships) + Qualificações ────────────────

interface MembershipForm {
  memberId: string;
  isCoordinator: boolean;
  maxAssignmentsPerMonth: string; // string p/ permitir vazio = sem teto
  priority: number;
}
const emptyMembershipForm: MembershipForm = {
  memberId: '',
  isCoordinator: false,
  maxAssignmentsPerMonth: '',
  priority: 0,
};

function MembersTab({ teamId, token }: { teamId: string; token: string }) {
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [functions, setFunctions] = useState<TeamFunction[]>([]);
  const [parishMembers, setParishMembers] = useState<Member[]>([]);
  const [form, setForm] = useState<MembershipForm>(emptyMembershipForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [qualifyingId, setQualifyingId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    apiAuthFetch(`/admin/escala/teams/${teamId}/members`, token)
      .then(setMemberships)
      .catch(console.error);
    apiAuthFetch(`/admin/escala/teams/${teamId}/functions`, token)
      .then(setFunctions)
      .catch(console.error);
    apiAuthFetch('/admin/escala/members?active=true&pageSize=100', token)
      .then((res) => setParishMembers(res.items))
      .catch(console.error);
  }, [token, teamId]);

  useEffect(() => {
    load();
  }, [load]);

  const buildPayload = () => ({
    isCoordinator: form.isCoordinator,
    maxAssignmentsPerMonth:
      form.maxAssignmentsPerMonth.trim() === '' ? null : Number(form.maxAssignmentsPerMonth),
    priority: form.priority,
  });

  const handleSave = async () => {
    if (!token) return;
    setError('');
    try {
      if (editingId) {
        await apiAuthFetch(`/admin/escala/memberships/${editingId}`, token, {
          method: 'PUT',
          body: JSON.stringify(buildPayload()),
        });
        setEditingId(null);
      } else {
        if (!form.memberId) {
          setError('Selecione um membro.');
          return;
        }
        await apiAuthFetch(`/admin/escala/teams/${teamId}/members`, token, {
          method: 'POST',
          body: JSON.stringify({ memberId: form.memberId, ...buildPayload() }),
        });
      }
      setForm(emptyMembershipForm);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.');
    }
  };

  const handleEdit = (m: Membership) => {
    setEditingId(m.id);
    setForm({
      memberId: m.memberId,
      isCoordinator: m.isCoordinator,
      maxAssignmentsPerMonth:
        m.maxAssignmentsPerMonth == null ? '' : String(m.maxAssignmentsPerMonth),
      priority: m.priority,
    });
    setError('');
  };

  const handleDelete = async (id: string) => {
    if (!token || !confirm('Remover/desativar este vínculo?')) return;
    await apiAuthFetch(`/admin/escala/memberships/${id}`, token, { method: 'DELETE' });
    if (editingId === id) {
      setEditingId(null);
      setForm(emptyMembershipForm);
    }
    load();
  };

  // Membros ainda não vinculados (para o seletor de novo vínculo).
  const linkedIds = new Set(memberships.map((m) => m.memberId));
  const availableMembers = parishMembers.filter((m) => !linkedIds.has(m.id));

  return (
    <div>
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="font-semibold mb-3">{editingId ? 'Editar Vínculo' : 'Vincular Membro'}</h2>
        {error && (
          <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {error}
          </div>
        )}
        <div className="flex flex-wrap gap-3 items-end">
          {!editingId && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Membro</label>
              <select
                className="border rounded px-3 py-2 text-sm"
                value={form.memberId}
                onChange={(e) => setForm({ ...form, memberId: e.target.value })}
              >
                <option value="">Selecione</option>
                {availableMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName} ({m.phone})
                  </option>
                ))}
              </select>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-gray-700 pb-2">
            <input
              type="checkbox"
              checked={form.isCoordinator}
              onChange={(e) => setForm({ ...form, isCoordinator: e.target.checked })}
            />
            Coordenador
          </label>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Teto/mês (opcional)</label>
            <input
              type="number"
              min="1"
              className="border rounded px-3 py-2 text-sm w-28"
              value={form.maxAssignmentsPerMonth}
              onChange={(e) => setForm({ ...form, maxAssignmentsPerMonth: e.target.value })}
              placeholder="sem teto"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Prioridade</label>
            <input
              type="number"
              min="0"
              className="border rounded px-3 py-2 text-sm w-24"
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
            />
          </div>
          <button
            onClick={handleSave}
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
          >
            {editingId ? 'Salvar' : 'Vincular'}
          </button>
          {editingId && (
            <button
              onClick={() => {
                setEditingId(null);
                setForm(emptyMembershipForm);
                setError('');
              }}
              className="bg-gray-200 text-gray-700 px-4 py-2 rounded text-sm hover:bg-gray-300"
            >
              Cancelar
            </button>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Menor prioridade = preferência mais forte na alocação (D5). O teto por equipe limita
          escalas por mês (D8).
        </p>
      </div>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left p-3">Membro</th>
              <th className="text-center p-3">Coord.</th>
              <th className="text-center p-3">Teto/mês</th>
              <th className="text-center p-3">Prioridade</th>
              <th className="text-center p-3">Qualif.</th>
              <th className="text-center p-3">Ativo</th>
              <th className="text-right p-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {memberships.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-gray-500">
                  Nenhum membro vinculado.
                </td>
              </tr>
            )}
            {memberships.map((m) => (
              <Fragment key={m.id}>
                <tr className={`border-b ${editingId === m.id ? 'bg-blue-50' : ''}`}>
                  <td className="p-3">
                    {m.member?.fullName ?? m.memberId}
                    {m.member && <p className="text-xs text-gray-500">{m.member.phone}</p>}
                  </td>
                  <td className="p-3 text-center">{m.isCoordinator ? '✓' : '—'}</td>
                  <td className="p-3 text-center">{m.maxAssignmentsPerMonth ?? '∞'}</td>
                  <td className="p-3 text-center">{m.priority}</td>
                  <td className="p-3 text-center">{m.qualifications?.length ?? 0}</td>
                  <td className="p-3 text-center">{m.isActive ? '✓' : '✗'}</td>
                  <td className="p-3 text-right space-x-3 whitespace-nowrap">
                    <button
                      onClick={() => setQualifyingId(qualifyingId === m.id ? null : m.id)}
                      className="text-emerald-700 text-xs hover:underline"
                    >
                      Qualificações
                    </button>
                    <button onClick={() => handleEdit(m)} className="text-blue-600 text-xs hover:underline">
                      Editar
                    </button>
                    <button onClick={() => handleDelete(m.id)} className="text-red-600 text-xs hover:underline">
                      Remover
                    </button>
                  </td>
                </tr>
                {qualifyingId === m.id && (
                  <tr className="border-b bg-emerald-50/40">
                    <td colSpan={7} className="p-3">
                      <QualificationsEditor
                        membershipId={m.id}
                        functions={functions}
                        token={token}
                        onSaved={() => {
                          setQualifyingId(null);
                          load();
                        }}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function QualificationsEditor({
  membershipId,
  functions,
  token,
  onSaved,
}: {
  membershipId: string;
  functions: TeamFunction[];
  token: string;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    apiAuthFetch(`/admin/escala/memberships/${membershipId}/functions`, token)
      .then((res: { functionIds: string[] }) => setSelected(new Set(res.functionIds)))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token, membershipId]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    if (!token) return;
    setSaving(true);
    setError('');
    try {
      // Replace-set: substitui o conjunto inteiro das funções qualificadas.
      await apiAuthFetch(`/admin/escala/memberships/${membershipId}/functions`, token, {
        method: 'PUT',
        body: JSON.stringify({ functionIds: [...selected] }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-gray-500">Carregando qualificações...</p>;

  const activeFns = functions.filter((f) => f.isActive || selected.has(f.id));

  return (
    <div>
      <p className="text-sm font-medium mb-2">Funções que este membro pode exercer</p>
      {error && <p className="text-sm text-red-700 mb-2">{error}</p>}
      {activeFns.length === 0 ? (
        <p className="text-sm text-gray-500">
          Nenhuma função nesta equipe. Cadastre funções na aba “Funções”.
        </p>
      ) : (
        <div className="flex flex-wrap gap-3 mb-3">
          {activeFns.map((f) => (
            <label key={f.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggle(f.id)} />
              {f.name}
            </label>
          ))}
        </div>
      )}
      <button
        onClick={save}
        disabled={saving}
        className="bg-emerald-600 text-white px-4 py-2 rounded text-sm hover:bg-emerald-700 disabled:opacity-60"
      >
        {saving ? 'Salvando...' : 'Salvar qualificações'}
      </button>
    </div>
  );
}

// ── Demanda (staffing) ────────────────────────────────────

interface StaffingForm {
  functionId: string;
  scope: string;
  requiredCount: number;
  weekday: number;
  massScheduleId: string;
  massExceptionId: string;
  isActive: boolean;
}
const emptyStaffingForm: StaffingForm = {
  functionId: '',
  scope: 'DEFAULT',
  requiredCount: 1,
  weekday: 0,
  massScheduleId: '',
  massExceptionId: '',
  isActive: true,
};

function StaffingTab({ teamId, token }: { teamId: string; token: string }) {
  const [rules, setRules] = useState<StaffingRequirement[]>([]);
  const [functions, setFunctions] = useState<TeamFunction[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [exceptions, setExceptions] = useState<MassException[]>([]);
  const [form, setForm] = useState<StaffingForm>(emptyStaffingForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (!token) return;
    apiAuthFetch(`/admin/escala/teams/${teamId}/staffing`, token)
      .then(setRules)
      .catch(console.error);
    apiAuthFetch(`/admin/escala/teams/${teamId}/functions`, token)
      .then(setFunctions)
      .catch(console.error);
    apiAuthFetch('/admin/masses/schedules', token).then(setSchedules).catch(console.error);
    apiAuthFetch('/admin/masses/exceptions', token).then(setExceptions).catch(console.error);
  }, [token, teamId]);

  useEffect(() => {
    load();
  }, [load]);

  const targetKind = scopeTargetKind(form.scope);

  // Combinação escopo×alvo válida? (o backend também valida — aqui bloqueia o submit)
  const targetOk =
    targetKind === null ||
    (targetKind === 'weekday' && form.weekday >= 0 && form.weekday <= 6) ||
    (targetKind === 'schedule' && form.massScheduleId !== '') ||
    (targetKind === 'occasion' && form.massExceptionId !== '');
  const canSubmit =
    (editingId !== null || form.functionId !== '') && form.requiredCount >= 1 && targetOk;

  const buildPayload = (includeFunction: boolean) => {
    const base: Record<string, unknown> = {
      scope: form.scope,
      requiredCount: form.requiredCount,
      isActive: form.isActive,
    };
    if (includeFunction) base.functionId = form.functionId;
    if (targetKind === 'weekday') base.weekday = form.weekday;
    if (targetKind === 'schedule') base.massScheduleId = form.massScheduleId;
    if (targetKind === 'occasion') base.massExceptionId = form.massExceptionId;
    return base;
  };

  const handleSave = async () => {
    if (!token || !canSubmit) return;
    setError('');
    try {
      if (editingId) {
        // PUT não altera a função (schema de update não inclui functionId).
        await apiAuthFetch(`/admin/escala/staffing/${editingId}`, token, {
          method: 'PUT',
          body: JSON.stringify(buildPayload(false)),
        });
        setEditingId(null);
      } else {
        await apiAuthFetch(`/admin/escala/teams/${teamId}/staffing`, token, {
          method: 'POST',
          body: JSON.stringify(buildPayload(true)),
        });
      }
      setForm(emptyStaffingForm);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.');
    }
  };

  const handleEdit = (r: StaffingRequirement) => {
    setEditingId(r.id);
    setForm({
      functionId: r.functionId,
      scope: r.scope,
      requiredCount: r.requiredCount,
      weekday: r.weekday ?? 0,
      massScheduleId: r.massScheduleId ?? '',
      massExceptionId: r.massExceptionId ?? '',
      isActive: r.isActive,
    });
    setError('');
  };

  const handleDelete = async (id: string) => {
    if (!token || !confirm('Excluir esta regra de demanda?')) return;
    await apiAuthFetch(`/admin/escala/staffing/${id}`, token, { method: 'DELETE' });
    if (editingId === id) {
      setEditingId(null);
      setForm(emptyStaffingForm);
    }
    load();
  };

  const fnName = (id: string) => functions.find((f) => f.id === id)?.name ?? id;
  const describeTarget = (r: StaffingRequirement) => {
    switch (r.scope) {
      case 'WEEKDAY':
        return weekdayLabels[r.weekday ?? 0];
      case 'SCHEDULE': {
        const s = schedules.find((x) => x.id === r.massScheduleId);
        return s ? `${weekdayLabels[s.weekday]} ${s.time}` : r.massScheduleId;
      }
      case 'OCCASION': {
        const ex = exceptions.find((x) => x.id === r.massExceptionId);
        return ex ? `${ex.date} ${ex.time}${ex.title ? ` — ${ex.title}` : ''}` : r.massExceptionId;
      }
      default:
        return '—';
    }
  };

  return (
    <div>
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="font-semibold mb-3">{editingId ? 'Editar Demanda' : 'Adicionar Demanda'}</h2>
        {error && (
          <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {error}
          </div>
        )}
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Função</label>
            <select
              className="border rounded px-3 py-2 text-sm disabled:bg-gray-100"
              value={form.functionId}
              disabled={editingId !== null}
              onChange={(e) => setForm({ ...form, functionId: e.target.value })}
            >
              <option value="">Selecione</option>
              {functions.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Escopo</label>
            <select
              className="border rounded px-3 py-2 text-sm"
              value={form.scope}
              onChange={(e) =>
                // Trocar de escopo zera o alvo (evita alvo órfão do escopo anterior).
                setForm({
                  ...form,
                  scope: e.target.value,
                  weekday: 0,
                  massScheduleId: '',
                  massExceptionId: '',
                })
              }
            >
              {scopeOrder.map((s) => (
                <option key={s} value={s}>
                  {scopeLabels[s]}
                </option>
              ))}
            </select>
          </div>

          {/* Alvo acompanha o escopo */}
          {targetKind === 'weekday' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Dia da semana</label>
              <select
                className="border rounded px-3 py-2 text-sm"
                value={form.weekday}
                onChange={(e) => setForm({ ...form, weekday: Number(e.target.value) })}
              >
                {weekdayLabels.map((label, i) => (
                  <option key={i} value={i}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          )}
          {targetKind === 'schedule' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Horário</label>
              <select
                className="border rounded px-3 py-2 text-sm"
                value={form.massScheduleId}
                onChange={(e) => setForm({ ...form, massScheduleId: e.target.value })}
              >
                <option value="">Selecione</option>
                {schedules.map((s) => (
                  <option key={s.id} value={s.id}>
                    {weekdayLabels[s.weekday]} {s.time}
                  </option>
                ))}
              </select>
            </div>
          )}
          {targetKind === 'occasion' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Ocasião (exceção)</label>
              <select
                className="border rounded px-3 py-2 text-sm"
                value={form.massExceptionId}
                onChange={(e) => setForm({ ...form, massExceptionId: e.target.value })}
              >
                <option value="">Selecione</option>
                {exceptions.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.date} {ex.time}
                    {ex.title ? ` — ${ex.title}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs text-gray-500 mb-1">Qtd. necessária</label>
            <input
              type="number"
              min="1"
              className="border rounded px-3 py-2 text-sm w-24"
              value={form.requiredCount}
              onChange={(e) => setForm({ ...form, requiredCount: Number(e.target.value) })}
            />
          </div>

          {editingId && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Ativa</label>
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
            disabled={!canSubmit}
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {editingId ? 'Salvar' : 'Adicionar'}
          </button>
          {editingId && (
            <button
              onClick={() => {
                setEditingId(null);
                setForm(emptyStaffingForm);
                setError('');
              }}
              className="bg-gray-200 text-gray-700 px-4 py-2 rounded text-sm hover:bg-gray-300"
            >
              Cancelar
            </button>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Prioridade de resolução (mais específico vence): Ocasião → Solenidade → Horário → Dia →
          Padrão (D6).
        </p>
      </div>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left p-3">Função</th>
              <th className="text-left p-3">Escopo</th>
              <th className="text-left p-3">Alvo</th>
              <th className="text-center p-3">Qtd.</th>
              <th className="text-center p-3">Ativa</th>
              <th className="text-right p-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-gray-500">
                  Nenhuma regra de demanda cadastrada.
                </td>
              </tr>
            )}
            {rules.map((r) => (
              <tr key={r.id} className={`border-b ${editingId === r.id ? 'bg-blue-50' : ''}`}>
                <td className="p-3">{r.function?.name ?? fnName(r.functionId)}</td>
                <td className="p-3">{scopeLabels[r.scope] ?? r.scope}</td>
                <td className="p-3">{describeTarget(r)}</td>
                <td className="p-3 text-center">{r.requiredCount}</td>
                <td className="p-3 text-center">{r.isActive ? '✓' : '✗'}</td>
                <td className="p-3 text-right space-x-3">
                  <button onClick={() => handleEdit(r)} className="text-blue-600 text-xs hover:underline">
                    Editar
                  </button>
                  <button onClick={() => handleDelete(r.id)} className="text-red-600 text-xs hover:underline">
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
