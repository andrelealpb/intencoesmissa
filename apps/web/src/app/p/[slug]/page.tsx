import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui/card";

interface Parish {
  id: string;
  slug: string;
  parishName: string;
  legalName?: string;
  pastorName?: string;
  address?: string;
  phones?: string[];
  logoUrl?: string;
}

async function getParish(slug: string): Promise<Parish | null> {
  try {
    return await apiFetch(`/public/parishes/${slug}`);
  } catch {
    return null;
  }
}

export default async function ParishPage({
  params,
}: {
  params: { slug: string };
}) {
  const parish = await getParish(params.slug);

  if (!parish) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Paroquia nao encontrada
          </h1>
          <p className="text-gray-600 mb-6">
            O link que voce acessou nao corresponde a nenhuma paroquia cadastrada.
          </p>
          <Link href="/" className="link">
            Voltar ao inicio
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-primary-50 to-white">
      <div className="container-page max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          {parish.logoUrl && (
            <img
              src={parish.logoUrl}
              alt={`Logo ${parish.parishName}`}
              className="w-24 h-24 mx-auto mb-4 rounded-full object-cover border-4 border-white shadow-md"
            />
          )}
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {parish.parishName}
          </h1>
          {parish.pastorName && (
            <p className="text-gray-600">Pe. {parish.pastorName}</p>
          )}
        </div>

        {/* Parish Info */}
        <Card className="mb-8">
          <div className="space-y-3">
            {parish.address && (
              <div className="flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                <span className="text-gray-700">{parish.address}</span>
              </div>
            )}
            {parish.phones && parish.phones.length > 0 && (
              <div className="flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                  />
                </svg>
                <span className="text-gray-700">
                  {parish.phones.join(" | ")}
                </span>
              </div>
            )}
          </div>
        </Card>

        {/* CTA */}
        <div className="text-center">
          <Link
            href={`/p/${params.slug}/form`}
            className="inline-flex items-center justify-center px-8 py-4 bg-primary-600 text-white text-lg font-semibold rounded-xl hover:bg-primary-700 transition-colors shadow-lg shadow-primary-200"
          >
            Registrar Intencao
            <svg
              className="w-5 h-5 ml-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 7l5 5m0 0l-5 5m5-5H6"
              />
            </svg>
          </Link>
        </div>
      </div>
    </main>
  );
}
