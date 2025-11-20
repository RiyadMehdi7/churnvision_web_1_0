import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface SidebarProps {
    title?: string;
    subtitle?: string;
    className?: string;
}

export function Sidebar({ title = "Team Members", subtitle = "428 employees found", className }: SidebarProps) {
    return (
        <div className={cn("w-80 border-r bg-background flex flex-col h-[calc(100vh-64px)]", className)}>
            <div className="p-4 border-b">
                <h2 className="font-semibold text-lg">{title}</h2>
                <p className="text-sm text-muted-foreground">{subtitle}</p>

                <div className="mt-4 space-y-3">
                    <div className="relative">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Search employees..." className="pl-8" />
                    </div>

                    <Select>
                        <SelectTrigger>
                            <SelectValue placeholder="Sort by: Risk Level" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="risk">Sort by: Risk Level</SelectItem>
                            <SelectItem value="name">Sort by: Name</SelectItem>
                        </SelectContent>
                    </Select>

                    <Select>
                        <SelectTrigger>
                            <SelectValue placeholder="All Departments" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Departments</SelectItem>
                            <SelectItem value="sales">Sales</SelectItem>
                            <SelectItem value="engineering">Engineering</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-4 space-y-4">
                {/* Mock List Items */}
                {[
                    { name: "Amanda Long", role: "Senior Engineer", dept: "Sales", risk: "Medium" },
                    { name: "Amy Duran", role: "Senior Engineer", dept: "Operations", risk: "Medium" },
                    { name: "Adam Howard", role: "Senior Engineer", dept: "Sales", risk: "Medium" },
                    { name: "Andrea Allen", role: "Senior Engineer", dept: "Engineering", risk: "Medium" },
                    { name: "Abigail Cooper", role: "Senior Engineer", dept: "Product", risk: "Medium" },
                ].map((employee, i) => (
                    <div key={i} className="flex items-center justify-between p-2 hover:bg-accent rounded-md cursor-pointer group">
                        <div>
                            <div className="font-medium">{employee.name}</div>
                            <div className="text-xs text-muted-foreground">{employee.role}</div>
                            <div className="text-xs text-muted-foreground">{employee.dept}</div>
                        </div>
                        <div className="rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-medium text-yellow-800">
                            {employee.risk} Risk
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
