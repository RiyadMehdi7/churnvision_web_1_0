import { createRootRoute, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { Header } from '@/components/layout/Header'

export const Route = createRootRoute({
    component: () => (
        <div className="min-h-screen bg-background font-sans antialiased">
            <Header />
            <main>
                <Outlet />
            </main>
            <TanStackRouterDevtools />
        </div>
    ),
})
