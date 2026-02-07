import Link from "next/link";

export default function SuccessPage({
  searchParams,
}: {
  searchParams: { protocol?: string };
}) {
  const protocol = searchParams.protocol || "---";

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-primary-50">
      <div className="max-w-md mx-auto px-4 text-center">
        {/* Success icon */}
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 text-green-600 mb-6">
          <svg
            className="w-10 h-10"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-3">
          Intencao Registrada com Sucesso!
        </h1>

        <p className="text-gray-600 mb-6">
          Sua intencao foi registrada com sucesso. Guarde o numero do protocolo
          abaixo para acompanhamento.
        </p>

        {/* Protocol card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-8">
          <p className="text-sm text-gray-500 mb-1">Protocolo</p>
          <p className="text-2xl font-bold font-mono text-primary-700 tracking-wider">
            {protocol}
          </p>
        </div>

        <Link
          href="/"
          className="inline-flex items-center justify-center px-6 py-3 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors shadow-sm"
        >
          Voltar ao Inicio
        </Link>
      </div>
    </main>
  );
}
