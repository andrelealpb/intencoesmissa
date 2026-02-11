'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState, ReactNode } from 'react';
import Link from 'next/link';

const navItems = [
  { href: '/admin/dashboard', label: 'Dashboard' },
  { href: '/admin/parish', label: 'Paróquia' },
  { href: '/admin/settings', label: 'Configurações' },
  { href: '/admin/masses', label: 'Missas' },
  { href: '/admin/intention-types', label: 'Tipos de Intenção' },
  { href: '/admin/emoluments', label: 'Emolumentos' },
  { href: '/admin/notices', label: 'Avisos' },
  { href: '/admin/dispatches', label: 'Disparos' },
  { href: '/admin/requests', label: 'Pedidos' },
  { href: '/admin/public-link', label: 'Link do Fiel' },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isLoginPage = pathname === '/admin/login';

  useEffect(() => {
    if (status === 'unauthenticated' && !isLoginPage) {
      router.push('/admin/login');
    }
  }, [status, router, isLoginPage]);

  // Login page renders without auth wrapper
  if (isLoginPage) {
    return <>{children}</>;
  }

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Carregando...</p>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-30 w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 flex flex-col ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-bold text-lg text-gray-800">Admin Paróquia</h2>
          <p className="text-sm text-gray-500 truncate">{session.user?.email}</p>
        </div>
        <nav className="p-2 flex-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block px-3 py-2 rounded-md text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
              onClick={() => setSidebarOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-2 border-t border-gray-200">
          <button
            onClick={() => signOut({ callbackUrl: '/admin/login' })}
            className="w-full px-3 py-2 rounded-md text-sm text-gray-700 hover:bg-red-50 hover:text-red-700 transition-colors text-left"
          >
            Sair
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-md text-gray-600 hover:bg-gray-100"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="ml-3 font-semibold text-gray-800">Admin</span>
        </header>
        <main className="flex-1 p-4 md:p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
