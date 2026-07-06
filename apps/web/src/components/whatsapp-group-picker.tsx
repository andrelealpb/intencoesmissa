'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { apiAuthFetch } from '@/lib/api';

interface Group {
  id: string;
  name: string;
}

/**
 * Seletor de **um** grupo de WhatsApp da instância Z-API da paróquia.
 *
 * Reusa o mesmo endpoint da tela da paróquia (`/admin/parish`, seção "Grupos do
 * WhatsApp"): `GET /admin/whatsapp/groups` — lista os grupos da instância
 * conectada, escopada pela paróquia do JWT (backend intocado). Mantém a entrada
 * manual do ID como fallback, espelhando o comportamento daquela tela.
 *
 * Lê o token da sessão **no clique** (via `useSession`), como a tela da paróquia
 * — nunca depende de um prop de token possivelmente vazio no primeiro render.
 *
 * `value` = ID do grupo gravado (ex.: `120363...-group`) ou string vazia.
 */
export function WhatsappGroupPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const { data: session } = useSession();
  const [available, setAvailable] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [manual, setManual] = useState('');
  const [error, setError] = useState('');

  const fetchGroups = async () => {
    const token = session?.accessToken as string | undefined;
    if (!token) {
      setError('Sessao ainda carregando. Tente novamente em instantes.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const groups = (await apiAuthFetch('/admin/whatsapp/groups', token)) as
        | Group[]
        | null;
      // Defensivo: garante um array mesmo se o backend devolver algo inesperado.
      setAvailable(Array.isArray(groups) ? groups : []);
      setSearched(true);
    } catch (err) {
      setAvailable([]);
      setSearched(true);
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao buscar grupos do WhatsApp.',
      );
    } finally {
      setLoading(false);
    }
  };

  const selectedName = available.find((g) => g.id === value)?.name;

  return (
    <div className="space-y-2">
      {value ? (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-md px-3 py-2">
          <span className="flex-1 text-sm text-green-800">
            {selectedName ?? 'Grupo selecionado'}
          </span>
          <span className="text-xs text-gray-400 font-mono break-all">{value}</span>
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-red-500 hover:text-red-700 text-sm font-medium px-2"
          >
            Remover
          </button>
        </div>
      ) : (
        <p className="text-xs text-gray-500">Nenhum grupo selecionado.</p>
      )}

      <button
        type="button"
        onClick={fetchGroups}
        disabled={loading}
        className="bg-gray-100 border border-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm hover:bg-gray-200 disabled:opacity-50"
      >
        {loading ? 'Buscando grupos...' : 'Buscar Grupos do WhatsApp'}
      </button>

      {error && (
        <div className="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
      )}

      {searched && !error && (
        <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
          {available.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-500">
              Nenhum grupo encontrado na instância conectada. Confira a conexão do
              WhatsApp em Paróquia ou informe o ID manualmente abaixo.
            </p>
          ) : (
            available.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => onChange(g.id)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-green-50 flex items-center justify-between gap-2 ${
                  g.id === value ? 'bg-green-50' : ''
                }`}
              >
                <span className="flex-1">{g.name}</span>
                <span className="text-xs text-gray-400 shrink-0">
                  {g.id === value ? 'Selecionado' : 'Selecionar'}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          className="flex-1 border rounded-md px-3 py-2 text-sm"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="Ou digite o ID manualmente (ex: 120363019502650977-group)"
        />
        <button
          type="button"
          onClick={() => {
            const trimmed = manual.trim();
            if (trimmed) {
              onChange(trimmed);
              setManual('');
            }
          }}
          disabled={!manual.trim()}
          className="bg-green-600 text-white px-3 py-2 rounded-md text-sm hover:bg-green-700 disabled:opacity-50"
        >
          Usar
        </button>
      </div>
    </div>
  );
}
