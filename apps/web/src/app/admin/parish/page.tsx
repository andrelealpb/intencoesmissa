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
  dispatchEmails: string[];
  logoUrl?: string;
  pixKey?: string;
  pixQrCodeUrl?: string;
}

export default function ParishPage() {
  const { data: session } = useSession();
  const [parish, setParish] = useState<Parish | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [emailInput, setEmailInput] = useState('');

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
          dispatchEmails: parish.dispatchEmails,
          pixKey: parish.pixKey,
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
  if (!parish) return <p className="text-red-500">Erro ao carregar dados da paróquia</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Dados da Paróquia</h1>

      <div className="bg-white rounded-lg shadow p-6 space-y-4 max-w-2xl">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Paróquia</label>
          <input
            className="w-full border rounded-md px-3 py-2 text-sm"
            value={parish.parishName}
            onChange={(e) => setParish({ ...parish, parishName: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Razão Social</label>
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
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Pároco</label>
          <input
            className="w-full border rounded-md px-3 py-2 text-sm"
            value={parish.pastorName ?? ''}
            onChange={(e) => setParish({ ...parish, pastorName: e.target.value })}
          />
        </div>

        {/* Logo */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Logomarca</label>
          {parish.logoUrl ? (
            <div className="flex items-center gap-4">
              <img src={parish.logoUrl} alt="Logo" className="w-16 h-16 object-contain border rounded" />
              <button onClick={handleLogoDelete} className="text-sm text-red-600 hover:underline">
                Remover
              </button>
            </div>
          ) : (
            <input type="file" accept="image/*" onChange={handleLogoUpload} className="text-sm" />
          )}
        </div>

        {/* Dispatch emails */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">E-mails de Disparo</label>
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
                placeholder="E-mail, CPF/CNPJ, telefone ou chave aleatória"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">QR Code PIX</label>
              {parish.pixQrCodeUrl ? (
                <div className="flex items-center gap-4">
                  <img src={parish.pixQrCodeUrl} alt="QR Code PIX" className="w-32 h-32 object-contain border rounded" />
                  <button onClick={handlePixQrDelete} className="text-sm text-red-600 hover:underline">
                    Remover
                  </button>
                </div>
              ) : (
                <input type="file" accept="image/*" onChange={handlePixQrUpload} className="text-sm" />
              )}
              <p className="text-xs text-gray-500 mt-1">Envie a imagem do QR Code gerado pelo seu banco.</p>
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
