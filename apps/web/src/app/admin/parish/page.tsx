'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { apiAuthFetch } from '@/lib/api';

interface Recipient {
  name: string;
  email: string;
  phone: string;
}

interface Parish {
  id: string;
  slug: string;
  parishName: string;
  legalName?: string;
  cnpj?: string;
  pastorName?: string;
  pastorEmail?: string;
  pastorPhone?: string;
  dispatchEmails: string[];
  dispatchPhones: string[];
  dispatchGroups: string[];
  dispatchRecipients?: Recipient[];
  logoUrl?: string;
  pixKey?: string;
  pixQrCodeUrl?: string;
  zapiInstanceId?: string;
  zapiToken?: string;
  zapiClientToken?: string;
  zapiPhone?: string;
}

export default function ParishPage() {
  const { data: session } = useSession();
  const [parish, setParish] = useState<Parish | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [newRecipient, setNewRecipient] = useState<Recipient>({ name: '', email: '', phone: '' });
  const [zapiInstanceId, setZapiInstanceId] = useState('');
  const [zapiToken, setZapiToken] = useState('');
  const [zapiClientToken, setZapiClientToken] = useState('');
  const [dispatchGroups, setDispatchGroups] = useState<string[]>([]);
  const [newGroupId, setNewGroupId] = useState('');
  const [zapiStatus, setZapiStatus] = useState<{ configured: boolean; connected: boolean; phone?: string; error?: string } | null>(null);
  const [zapiChecking, setZapiChecking] = useState(false);

  const checkZapiStatus = async (accessToken: string) => {
    setZapiChecking(true);
    try {
      const status = await apiAuthFetch('/admin/whatsapp/status', accessToken);
      setZapiStatus(status);
      if (status.phone) {
        setParish((prev) => prev ? { ...prev, zapiPhone: status.phone } : prev);
      }
    } catch (err: any) {
      setZapiStatus({ configured: false, connected: false, error: err.message });
    } finally {
      setZapiChecking(false);
    }
  };

  useEffect(() => {
    if (!session?.accessToken) return;
    const token = session.accessToken as string;
    apiAuthFetch('/admin/parish/profile', token)
      .then((data: Parish) => {
        setParish(data);
        setZapiInstanceId(data.zapiInstanceId || '');
        setZapiToken(data.zapiToken || '');
        setZapiClientToken(data.zapiClientToken || '');
        setDispatchGroups(data.dispatchGroups || []);
        // Auto-check WhatsApp status if configured
        if (data.zapiInstanceId && data.zapiToken) {
          checkZapiStatus(token);
        }
        // Initialize recipients from dispatchRecipients or build from legacy arrays
        if (data.dispatchRecipients && data.dispatchRecipients.length > 0) {
          setRecipients(data.dispatchRecipients);
        } else {
          // Build from legacy separate arrays
          const emails = data.dispatchEmails || [];
          const phones = data.dispatchPhones || [];
          const maxLen = Math.max(emails.length, phones.length);
          const built: Recipient[] = [];
          for (let i = 0; i < maxLen; i++) {
            built.push({
              name: '',
              email: emails[i] || '',
              phone: phones[i] || '',
            });
          }
          setRecipients(built);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [session]);

  const handleSave = async () => {
    if (!session?.accessToken || !parish) return;
    setSaving(true);
    try {
      await apiAuthFetch('/admin/parish/profile', session.accessToken as string, {
        method: 'PUT',
        body: JSON.stringify({
          slug: parish.slug,
          parishName: parish.parishName,
          legalName: parish.legalName,
          cnpj: parish.cnpj,
          pastorName: parish.pastorName,
          pastorEmail: parish.pastorEmail,
          pastorPhone: parish.pastorPhone,
          dispatchEmails: recipients.map((r) => r.email).filter(Boolean),
          dispatchPhones: recipients.map((r) => r.phone).filter(Boolean),
          dispatchRecipients: recipients.filter((r) => r.name || r.email || r.phone),
          pixKey: parish.pixKey,
          zapiInstanceId: zapiInstanceId || null,
          zapiToken: zapiToken || null,
          zapiClientToken: zapiClientToken || null,
          zapiPhone: parish.zapiPhone,
          dispatchGroups,
        }),
      });
      alert('Dados salvos com sucesso!');
    } catch (e: any) {
      alert('Erro ao salvar: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const addRecipient = () => {
    if (!newRecipient.name && !newRecipient.email && !newRecipient.phone) return;
    setRecipients((prev) => [...prev, { ...newRecipient }]);
    setNewRecipient({ name: '', email: '', phone: '' });
  };

  const removeRecipient = (index: number) => {
    setRecipients((prev) => prev.filter((_, i) => i !== index));
  };

  const updateRecipient = (index: number, field: keyof Recipient, value: string) => {
    setRecipients((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session?.accessToken) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/admin/parish/logo`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.accessToken}` },
          body: formData,
        },
      );
      if (res.ok) {
        const updated = await res.json();
        setParish((prev) => (prev ? { ...prev, logoUrl: updated.logoUrl } : prev));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogoDelete = async () => {
    if (!session?.accessToken) return;
    try {
      await apiAuthFetch('/admin/parish/logo', session.accessToken as string, { method: 'DELETE' });
      setParish((prev) => (prev ? { ...prev, logoUrl: undefined } : prev));
    } catch (err) {
      console.error(err);
    }
  };

  const handlePixQrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session?.accessToken) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/admin/parish/pix-qrcode`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.accessToken}` },
          body: formData,
        },
      );
      if (res.ok) {
        const updated = await res.json();
        setParish((prev) => (prev ? { ...prev, pixQrCodeUrl: updated.pixQrCodeUrl } : prev));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handlePixQrDelete = async () => {
    if (!session?.accessToken) return;
    try {
      await apiAuthFetch('/admin/parish/pix-qrcode', session.accessToken as string, { method: 'DELETE' });
      setParish((prev) => (prev ? { ...prev, pixQrCodeUrl: undefined } : prev));
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <p className="text-gray-500">Carregando...</p>;
  if (!parish) return <p className="text-red-500">Erro ao carregar dados da paroquia</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Dados da Paroquia</h1>

      <div className="bg-white rounded-lg shadow p-6 space-y-4 max-w-2xl">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Paroquia</label>
          <input
            className="w-full border rounded-md px-3 py-2 text-sm"
            value={parish.parishName}
            onChange={(e) => setParish((prev) => prev ? { ...prev, parishName: e.target.value } : prev)}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Razao Social</label>
            <input
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={parish.legalName ?? ''}
              onChange={(e) => setParish((prev) => prev ? { ...prev, legalName: e.target.value } : prev)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ</label>
            <input
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={parish.cnpj ?? ''}
              onChange={(e) => setParish((prev) => prev ? { ...prev, cnpj: e.target.value } : prev)}
            />
          </div>
        </div>

        {/* Paroco */}
        <div className="border-t pt-4 mt-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Paroco</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
              <input
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={parish.pastorName ?? ''}
                onChange={(e) => setParish((prev) => prev ? { ...prev, pastorName: e.target.value } : prev)}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                <input
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  type="email"
                  placeholder="paroco@email.com"
                  value={parish.pastorEmail ?? ''}
                  onChange={(e) => setParish((prev) => prev ? { ...prev, pastorEmail: e.target.value } : prev)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Celular (WhatsApp)</label>
                <input
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  type="tel"
                  placeholder="(11) 99999-9999"
                  value={parish.pastorPhone ?? ''}
                  onChange={(e) => setParish((prev) => prev ? { ...prev, pastorPhone: e.target.value } : prev)}
                />
              </div>
            </div>
            <p className="text-xs text-gray-500">Recebe o resumo das intencoes marcadas no tipo de intencao (por e-mail e WhatsApp).</p>
          </div>
        </div>

        {/* Logo */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Logomarca</label>
          {parish.logoUrl ? (
            <div className="flex items-start gap-4">
              <img src={parish.logoUrl} alt="Logo" className="w-20 h-20 object-contain border rounded" />
              <div className="flex flex-col gap-2 pt-1">
                <label className="text-sm text-blue-600 hover:underline cursor-pointer">
                  Alterar
                  <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                </label>
                <button onClick={handleLogoDelete} className="text-sm text-red-600 hover:underline text-left">
                  Excluir
                </button>
              </div>
            </div>
          ) : (
            <input type="file" accept="image/*" onChange={handleLogoUpload} className="text-sm" />
          )}
        </div>

        {/* Destinatarios do Disparo */}
        <div className="border-t pt-4 mt-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-1">Destinatarios do Disparo</h3>
          <p className="text-xs text-gray-500 mb-3">Pessoas que recebem a lista de intencoes (por e-mail e/ou WhatsApp).</p>

          {/* Recipients list */}
          {recipients.length > 0 && (
            <div className="space-y-2 mb-4">
              {recipients.map((r, idx) => (
                <div key={idx} className="border rounded-md p-3 bg-gray-50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-gray-500">Pessoa {idx + 1}</span>
                    <button
                      onClick={() => removeRecipient(idx)}
                      className="text-red-500 hover:text-red-700 text-xs"
                    >
                      Remover
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      className="border rounded-md px-2 py-1.5 text-sm"
                      placeholder="Nome"
                      value={r.name}
                      onChange={(e) => updateRecipient(idx, 'name', e.target.value)}
                    />
                    <input
                      className="border rounded-md px-2 py-1.5 text-sm"
                      placeholder="E-mail"
                      type="email"
                      value={r.email}
                      onChange={(e) => updateRecipient(idx, 'email', e.target.value)}
                    />
                    <input
                      className="border rounded-md px-2 py-1.5 text-sm"
                      placeholder="Celular"
                      type="tel"
                      value={r.phone}
                      onChange={(e) => updateRecipient(idx, 'phone', e.target.value)}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add new recipient */}
          <div className="border rounded-md p-3 bg-blue-50">
            <span className="text-xs font-medium text-blue-700 mb-2 block">Adicionar pessoa</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
              <input
                className="border rounded-md px-2 py-1.5 text-sm"
                placeholder="Nome"
                value={newRecipient.name}
                onChange={(e) => setNewRecipient((prev) => ({ ...prev, name: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addRecipient())}
              />
              <input
                className="border rounded-md px-2 py-1.5 text-sm"
                placeholder="E-mail"
                type="email"
                value={newRecipient.email}
                onChange={(e) => setNewRecipient((prev) => ({ ...prev, email: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addRecipient())}
              />
              <input
                className="border rounded-md px-2 py-1.5 text-sm"
                placeholder="Celular"
                type="tel"
                value={newRecipient.phone}
                onChange={(e) => setNewRecipient((prev) => ({ ...prev, phone: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addRecipient())}
              />
            </div>
            <button
              onClick={addRecipient}
              className="bg-blue-600 text-white px-4 py-1.5 rounded-md text-sm hover:bg-blue-700"
            >
              Adicionar
            </button>
          </div>
        </div>

        {/* PIX */}
        <div className="border-t pt-4 mt-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Dados PIX</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Chave PIX</label>
              <input
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={parish.pixKey ?? ''}
                onChange={(e) => setParish((prev) => prev ? { ...prev, pixKey: e.target.value } : prev)}
                placeholder="E-mail, CPF/CNPJ, telefone ou chave aleatoria"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">QR Code PIX</label>
              {parish.pixQrCodeUrl ? (
                <div className="flex items-start gap-4">
                  <img src={parish.pixQrCodeUrl} alt="QR Code PIX" className="w-32 h-32 object-contain border rounded" />
                  <div className="flex flex-col gap-2 pt-1">
                    <label className="text-sm text-blue-600 hover:underline cursor-pointer">
                      Alterar
                      <input type="file" accept="image/*" onChange={handlePixQrUpload} className="hidden" />
                    </label>
                    <button onClick={handlePixQrDelete} className="text-sm text-red-600 hover:underline text-left">
                      Excluir
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <input type="file" accept="image/*" onChange={handlePixQrUpload} className="text-sm" />
                  <p className="text-xs text-gray-500 mt-1">Envie a imagem do QR Code gerado pelo seu banco.</p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* WhatsApp / Z-API */}
        <div className="border-t pt-4 mt-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">WhatsApp (Z-API)</h3>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Instance ID</label>
                <input
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={zapiInstanceId}
                  onChange={(e) => setZapiInstanceId(e.target.value)}
                  placeholder="ID da instancia"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Token</label>
                <input
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={zapiToken}
                  onChange={(e) => setZapiToken(e.target.value)}
                  placeholder="Token da instancia"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Client-Token</label>
                <input
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={zapiClientToken}
                  onChange={(e) => setZapiClientToken(e.target.value)}
                  placeholder="Token de seguranca da conta"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Numero Conectado</label>
              <input
                className="w-full border rounded-md px-3 py-2 text-sm bg-gray-100 text-gray-500"
                value={parish.zapiPhone || (zapiStatus?.phone) || ''}
                readOnly
                placeholder="Sera preenchido automaticamente ao conectar"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Grupos do WhatsApp
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Adicione IDs de grupos para receber o PDF das intencoes. O ID do grupo pode ser obtido no painel da Z-API (ex: 120363019502650977-group).
              </p>
              <div className="space-y-2">
                {dispatchGroups.map((g, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      className="flex-1 border rounded-md px-3 py-2 text-sm bg-gray-50"
                      value={g}
                      readOnly
                    />
                    <button
                      type="button"
                      onClick={() => setDispatchGroups(dispatchGroups.filter((_, i) => i !== idx))}
                      className="text-red-500 hover:text-red-700 text-sm font-medium px-2"
                    >
                      Remover
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <input
                    className="flex-1 border rounded-md px-3 py-2 text-sm"
                    value={newGroupId}
                    onChange={(e) => setNewGroupId(e.target.value)}
                    placeholder="ID do grupo (ex: 120363019502650977-group)"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const trimmed = newGroupId.trim();
                      if (trimmed && !dispatchGroups.includes(trimmed)) {
                        setDispatchGroups([...dispatchGroups, trimmed]);
                        setNewGroupId('');
                      }
                    }}
                    disabled={!newGroupId.trim()}
                    className="bg-green-600 text-white px-3 py-2 rounded-md text-sm hover:bg-green-700 disabled:opacity-50"
                  >
                    Adicionar
                  </button>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => session?.accessToken && checkZapiStatus(session.accessToken as string)}
                disabled={zapiChecking}
                className="bg-green-600 text-white px-4 py-2 rounded-md text-sm hover:bg-green-700 disabled:opacity-50"
              >
                {zapiChecking ? 'Verificando...' : 'Testar Conexao'}
              </button>
              {zapiStatus && (
                <span className={`text-sm font-medium ${zapiStatus.connected ? 'text-green-600' : 'text-red-600'}`}>
                  {!zapiStatus.configured ? 'Nao configurado' : zapiStatus.connected ? 'Conectado' : 'Desconectado'}
                </span>
              )}
            </div>
            {zapiStatus && !zapiStatus.connected && zapiStatus.configured && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3">
                <p className="text-sm text-red-700 font-medium">Problema na conexao com Z-API</p>
                <p className="text-xs text-red-600 mt-1">
                  {zapiStatus.error
                    ? zapiStatus.error
                    : 'O WhatsApp nao esta conectado. Verifique no painel da Z-API se o QR Code foi escaneado e a instancia esta ativa.'}
                </p>
              </div>
            )}
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 text-white px-6 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  );
}
