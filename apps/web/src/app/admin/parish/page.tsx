'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { apiAuthFetch } from '@/lib/api';

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
  logoUrl?: string;
  pixKey?: string;
  pixQrCodeUrl?: string;
  zapiInstanceId?: string;
  zapiToken?: string;
  zapiPhone?: string;
}

export default function ParishPage() {
  const { data: session } = useSession();
  const [parish, setParish] = useState<Parish | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [zapiStatus, setZapiStatus] = useState<{ configured: boolean; connected: boolean } | null>(null);

  useEffect(() => {
    if (!session?.accessToken) return;
    apiAuthFetch('/admin/parish/profile', session.accessToken as string)
      .then(setParish)
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
          dispatchEmails: parish.dispatchEmails,
          dispatchPhones: parish.dispatchPhones,
          pixKey: parish.pixKey,
          zapiInstanceId: parish.zapiInstanceId,
          zapiToken: parish.zapiToken,
          zapiPhone: parish.zapiPhone,
        }),
      });
      alert('Dados salvos com sucesso!');
    } catch (e: any) {
      alert('Erro ao salvar: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const addEmail = () => {
    if (emailInput && parish && !parish.dispatchEmails.includes(emailInput)) {
      setParish({ ...parish, dispatchEmails: [...parish.dispatchEmails, emailInput] });
      setEmailInput('');
    }
  };

  const removeEmail = (email: string) => {
    if (parish) {
      setParish({ ...parish, dispatchEmails: parish.dispatchEmails.filter((e) => e !== email) });
    }
  };

  const addPhone = () => {
    if (phoneInput && parish && !parish.dispatchPhones.includes(phoneInput)) {
      setParish({ ...parish, dispatchPhones: [...parish.dispatchPhones, phoneInput] });
      setPhoneInput('');
    }
  };

  const removePhone = (phone: string) => {
    if (parish) {
      setParish({ ...parish, dispatchPhones: parish.dispatchPhones.filter((p) => p !== phone) });
    }
  };

  const checkZapiStatus = async () => {
    if (!session?.accessToken) return;
    try {
      const status = await apiAuthFetch('/admin/whatsapp/status', session.accessToken as string);
      setZapiStatus(status);
    } catch {
      setZapiStatus({ configured: false, connected: false });
    }
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
            onChange={(e) => setParish({ ...parish, parishName: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Razao Social</label>
            <input
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={parish.legalName ?? ''}
              onChange={(e) => setParish({ ...parish, legalName: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ</label>
            <input
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={parish.cnpj ?? ''}
              onChange={(e) => setParish({ ...parish, cnpj: e.target.value })}
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
                onChange={(e) => setParish({ ...parish, pastorName: e.target.value })}
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
                  onChange={(e) => setParish({ ...parish, pastorEmail: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Celular (WhatsApp)</label>
                <input
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  type="tel"
                  placeholder="(11) 99999-9999"
                  value={parish.pastorPhone ?? ''}
                  onChange={(e) => setParish({ ...parish, pastorPhone: e.target.value })}
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
          <div className="space-y-3">
            {/* Emails */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-mails</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {parish.dispatchEmails.map((email) => (
                  <span key={email} className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full flex items-center gap-1">
                    {email}
                    <button onClick={() => removeEmail(email)} className="hover:text-red-600">&times;</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  className="flex-1 border rounded-md px-3 py-2 text-sm"
                  type="email"
                  placeholder="novo@email.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addEmail())}
                />
                <button onClick={addEmail} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700">
                  Adicionar
                </button>
              </div>
            </div>
            {/* Celulares */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Celulares (WhatsApp)</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {(parish.dispatchPhones || []).map((phone) => (
                  <span key={phone} className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full flex items-center gap-1">
                    {phone}
                    <button onClick={() => removePhone(phone)} className="hover:text-red-600">&times;</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  className="flex-1 border rounded-md px-3 py-2 text-sm"
                  type="tel"
                  placeholder="(11) 99999-9999"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addPhone())}
                />
                <button onClick={addPhone} className="bg-green-600 text-white px-4 py-2 rounded-md text-sm hover:bg-green-700">
                  Adicionar
                </button>
              </div>
            </div>
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
                onChange={(e) => setParish({ ...parish, pixKey: e.target.value })}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Instance ID</label>
                <input
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={parish.zapiInstanceId ?? ''}
                  onChange={(e) => setParish({ ...parish, zapiInstanceId: e.target.value })}
                  placeholder="ID da instancia Z-API"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Token</label>
                <input
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={parish.zapiToken ?? ''}
                  onChange={(e) => setParish({ ...parish, zapiToken: e.target.value })}
                  placeholder="Token da instancia"
                  type="password"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={checkZapiStatus}
                className="bg-green-600 text-white px-4 py-2 rounded-md text-sm hover:bg-green-700"
              >
                Testar Conexao
              </button>
              {zapiStatus && (
                <span className={`text-sm font-medium ${zapiStatus.connected ? 'text-green-600' : 'text-red-600'}`}>
                  {!zapiStatus.configured ? 'Nao configurado' : zapiStatus.connected ? 'Conectado' : 'Desconectado'}
                </span>
              )}
            </div>
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
