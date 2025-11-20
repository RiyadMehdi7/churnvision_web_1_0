import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

// Mock data for now since backend might not have data yet
const mockData = {
    departments: [
        { name: "Sales", avg_risk: 0.8 },
        { name: "Engineering", avg_risk: 0.3 },
        { name: "Support", avg_risk: 0.6 },
    ]
};

export function RiskHeatmap() {
    const { data, isLoading, error } = useQuery({
        queryKey: ["churn-risks"],
        queryFn: async () => {
            try {
                return await api.get("/predictions/heatmap");
            } catch (e) {
                console.warn("Backend not ready, using mock data");
                return mockData;
            }
        },
    });

    if (isLoading) return <div className="animate-pulse h-[400px] w-full bg-gray-200 rounded-md" />;
    if (error) return <div className="text-red-500">Error loading data</div>;

    const safeData = data || mockData;

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {safeData.departments.map((dept: any) => (
                <div
                    key={dept.name}
                    className="p-6 border rounded-lg shadow-sm bg-card text-card-foreground"
                >
                    <h3 className="font-semibold text-lg">{dept.name}</h3>
                    <div className="mt-2 flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Risk Score</span>
                        <span className={`font-bold ${dept.avg_risk > 0.7 ? 'text-red-500' : 'text-green-500'}`}>
                            {(dept.avg_risk * 100).toFixed(0)}%
                        </span>
                    </div>
                </div>
            ))}
        </div>
    );
}
