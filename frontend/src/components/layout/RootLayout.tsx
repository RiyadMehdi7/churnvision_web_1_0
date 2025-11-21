import { Outlet } from 'react-router-dom'

export function RootLayout() {
  return (
    <div className="h-screen overflow-hidden bg-background">
      <div className="relative h-full flex flex-col">
        <div className="flex-1 overflow-hidden">
          <Outlet />
        </div>
      </div>
    </div>
  )
} 