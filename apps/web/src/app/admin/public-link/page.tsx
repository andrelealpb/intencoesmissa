'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { apiAuthFetch } from '@/lib/api';

interface Parish {
  slug: string;
  parishName: string;
}

export default function PublicLinkPage() {
  const { data: session } = useSession();
  const [parish, setParish] = useState<Parish | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!session?.accessToken) return;
    apiAuthFetch('/admin/parish/profile', session.accessToken as string)
      .then(setParish)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [session]);

  if (loading) return <p className="text-gray-500">Carregando...</p>;
  if (!parish) return <p className="text-red-500">Erro ao carregar dados da paróquia</p>;

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const publicUrl = `${baseUrl}/p/${parish.slug}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(publicUrl)}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const input = document.createElement('input');
      input.value = publicUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-2">Link do Fiel</h1>
      <p className="text-gray-500 mb-6">
        Compartilhe este link com os fiéis para que possam registrar intenções de missa na paróquia <strong>{parish.parishName}</strong>.
      </p>

      <div className="max-w-lg space-y-6">
        {/* Link with copy */}
        <div className="bg-white rounded-lg shadow p-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Link público da paróquia</label>
          <div className="flex gap-2">
            <input
              readOnly
              value={publicUrl}
              className="flex-1 border rounded-md px-3 py-2 text-sm bg-gray-50 text-gray-700 font-mono select-all"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              onClick={handleCopy}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                copied
                  ? 'bg-green-600 text-white'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {copied ? 'Copiado!' : 'Copiar'}
            </button>
          </div>
        </div>

        {/* QR Code */}
        <div className="bg-white rounded-lg shadow p-6">
          <label className="block text-sm font-medium text-gray-700 mb-4">QR Code</label>
          <div className="flex flex-col items-center gap-4">
            <div className="bg-white p-4 rounded-lg border-2 border-gray-100">
              <img
                src={qrCodeUrl}
                alt={`QR Code para ${publicUrl}`}
                width={250}
                height={250}
                className="block"
              />
            </div>
            <p className="text-xs text-gray-400 text-center">
              Escaneie o QR code com a câmera do celular para acessar o formulário de intenções.
            </p>
            <a
              href={qrCodeUrl}
              download={`qrcode-${parish.slug}.png`}
              className="text-sm text-blue-600 hover:underline"
            >
              Baixar QR Code
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
