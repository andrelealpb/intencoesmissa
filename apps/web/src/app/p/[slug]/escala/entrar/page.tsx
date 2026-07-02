"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { setMemberToken } from "@/lib/member-session";

// Mensagens genéricas (anti-enumeração da S5): nada distingue "não cadastrado"
// de "cadastrado".
const GENERIC_REQUEST =
  "Se você está cadastrado, enviamos um código de acesso pelo WhatsApp (ou um link por e-mail).";
const GENERIC_ERROR = "Código inválido ou expirado. Tente novamente.";

type Step = "identifier" | "code";

function EntrarInner() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const slug = params.slug;

  const magicToken = searchParams.get("token");

  const [step, setStep] = useState<Step>("identifier");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [validatingMagic, setValidatingMagic] = useState(Boolean(magicToken));

  const enter = useCallback(
    (token: string) => {
      setMemberToken(slug, token);
      router.replace(`/p/${slug}/escala`);
    },
    [slug, router],
  );

  // Callback do link mágico: valida via GET magic e entra.
  useEffect(() => {
    if (!magicToken) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(
          `/escala/auth/magic?token=${encodeURIComponent(magicToken)}`,
        );
        if (cancelled) return;
        if (res?.token) {
          enter(res.token);
          return;
        }
        setError(GENERIC_ERROR);
      } catch {
        if (!cancelled) setError(GENERIC_ERROR);
      } finally {
        if (!cancelled) setValidatingMagic(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [magicToken, enter]);

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiFetch(`/escala/auth/request`, {
        method: "POST",
        body: JSON.stringify({ parishSlug: slug, identifier: identifier.trim() }),
      });
      // Sempre genérico, independente do resultado.
      setInfo(GENERIC_REQUEST);
      setStep("code");
    } catch {
      // Mesmo em erro inesperado, não vaza nada específico.
      setInfo(GENERIC_REQUEST);
      setStep("code");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch(`/escala/auth/verify`, {
        method: "POST",
        body: JSON.stringify({
          parishSlug: slug,
          identifier: identifier.trim(),
          code: code.trim(),
        }),
      });
      if (res?.token) {
        enter(res.token);
        return;
      }
      setError(GENERIC_ERROR);
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setLoading(false);
    }
  }

  if (validatingMagic) {
    return (
      <Centered>
        <Card className="w-full max-w-sm">
          <p className="text-center text-sm text-gray-600 py-4">
            Validando seu acesso…
          </p>
        </Card>
      </Centered>
    );
  }

  return (
    <Centered>
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-gray-900">Escala de serviço</h1>
          <p className="mt-1 text-sm text-gray-500">
            Acesse para informar sua disponibilidade.
          </p>
        </div>

        <Card>
          {step === "identifier" ? (
            <form onSubmit={handleRequest} className="space-y-4">
              <Input
                label="Telefone ou e-mail"
                placeholder="(11) 99999-9999"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete="username"
                inputMode="text"
                required
              />
              <Button
                type="submit"
                className="w-full"
                loading={loading}
                disabled={!identifier.trim()}
              >
                Enviar código de acesso
              </Button>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </form>
          ) : (
            <form onSubmit={handleVerify} className="space-y-4">
              {info && <p className="text-sm text-gray-600">{info}</p>}
              <Input
                label="Código de 6 dígitos"
                placeholder="000000"
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
              />
              <Button
                type="submit"
                className="w-full"
                loading={loading}
                disabled={code.length !== 6}
              >
                Entrar
              </Button>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="button"
                className="w-full text-sm text-gray-500 hover:text-gray-700"
                onClick={() => {
                  setStep("identifier");
                  setCode("");
                  setError(null);
                }}
              >
                Usar outro telefone/e-mail
              </button>
            </form>
          )}
        </Card>

        <p className="mt-4 text-center text-xs text-gray-400">
          Recebeu um link por e-mail? Basta abri-lo para entrar.
        </p>
      </div>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-white px-4 py-10">
      {children}
    </main>
  );
}

export default function EntrarPage() {
  return (
    <Suspense fallback={<Centered>{null}</Centered>}>
      <EntrarInner />
    </Suspense>
  );
}
