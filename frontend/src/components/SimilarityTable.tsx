import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { RiskIndicator } from './RiskIndicator';

interface SimilarEmployee {
    id: string;
    name: string;
    similarity: number;
    churnRisk: number;
    status: string;
    factors: string[];
}

interface SimilarityTableProps {
    targetEmployeeName: string;
    similarEmployees: SimilarEmployee[];
    explanation?: string;
    comparisonType?: string;
}

const SimilarityTable: React.FC<SimilarityTableProps> = ({
    targetEmployeeName,
    similarEmployees,
    explanation,
    comparisonType
}) => {
    return (
        <div className="space-y-4 my-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800">
                <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-1">
                    Similarity Analysis: {targetEmployeeName}
                </h4>
                {explanation && (
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                        {explanation}
                    </p>
                )}
            </div>

            <div className="border rounded-lg overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Employee</TableHead>
                            <TableHead>Similarity</TableHead>
                            <TableHead>Risk Profile</TableHead>
                            <TableHead>Key Factors</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {similarEmployees.map((emp) => (
                            <TableRow key={emp.id}>
                                <TableCell className="font-medium">{emp.name}</TableCell>
                                <TableCell>
                                    <Badge variant="secondary">
                                        {(emp.similarity * 100).toFixed(1)}%
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    <RiskIndicator riskScore={emp.churnRisk} size="sm" showLabel={false} />
                                </TableCell>
                                <TableCell>
                                    <div className="flex flex-wrap gap-1">
                                        {emp.factors.map((factor, i) => (
                                            <span key={i} className="text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-400">
                                                {factor}
                                            </span>
                                        ))}
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
};

export default SimilarityTable;
