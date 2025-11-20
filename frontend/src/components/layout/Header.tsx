import { Link, useLocation } from "@tanstack/react-router";
import { Home, Bot, Play, Database, Settings, User } from "lucide-react";
import { cn } from "@/lib/utils";

export function Header() {
    const location = useLocation();

    const navItems = [
        { name: "Home", href: "/", icon: Home },
        { name: "AI Assistant", href: "/ai-assistant", icon: Bot },
        { name: "Playground", href: "/playground", icon: Play, badge: "Beta" },
        { name: "Data Management", href: "/data-management", icon: Database },
        { name: "Settings", href: "/settings", icon: Settings },
    ];

    return (
        <header className="border-b bg-background sticky top-0 z-50">
            <div className="flex h-16 items-center px-6">
                <div className="mr-8">
                    <Link to="/" className="flex items-center gap-2 font-bold text-xl">
                        <span>ChurnVision</span>
                    </Link>
                </div>

                <nav className="flex items-center space-x-6 flex-1">
                    {navItems.map((item) => {
                        const isActive = location.pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                to={item.href}
                                className={cn(
                                    "flex items-center gap-2 text-sm font-medium transition-colors hover:text-primary",
                                    isActive ? "text-primary border-b-2 border-primary h-16" : "text-muted-foreground"
                                )}
                            >
                                <item.icon className="h-4 w-4" />
                                {item.name}
                                {item.badge && (
                                    <span className="ml-1 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-800">
                                        {item.badge}
                                    </span>
                                )}
                            </Link>
                        );
                    })}
                </nav>

                <div className="flex items-center gap-4">
                    <div className="rounded-md bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-800">
                        Enterprise
                    </div>
                    <button className="rounded-full bg-secondary p-2 hover:bg-secondary/80">
                        <User className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </header>
    );
}
