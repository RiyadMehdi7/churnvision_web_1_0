import React, { useMemo, useState } from 'react';
import AutoSizer from 'react-virtualized-auto-sizer';
import { Employee, RiskLevel } from '../types/employee';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { colors } from '../lib/utils';

interface EmployeeNetworkGraphProps {
  employees: Employee[];
  availableDepartments: string[];
  isLoading?: boolean;
}

interface NetworkNode {
  id: string;
  name: string;
  department: string;
  position: string;
  riskLevel: RiskLevel;
  churnProbability: number;
  status: string;
  isHighRisk: boolean;
  isResigned: boolean;
  age?: number;
  managerId?: string | null;
  x: number;
  y: number;
}

interface NetworkEdge {
  source: string;
  target: string;
  weight: number;
  reasons: string[];
  isRiskPath: boolean;
}

interface ClusterMeta {
  name: string;
  x: number;
  y: number;
}

const riskColorMap: Record<RiskLevel, string> = {
  [RiskLevel.High]: colors.risk.high,
  [RiskLevel.Medium]: colors.risk.medium,
  [RiskLevel.Low]: colors.risk.low
};

const defaultDepartments = ['All'];

const MAX_DEPARTMENT_EDGES = 80;
const MAX_PEER_EDGES_PER_GROUP = 6;
const MAX_EDGES_TOTAL = 140;
const MAX_NODES = 140;

function prioritizeEmployees(employees: Employee[]): Employee[] {
  if (employees.length <= MAX_NODES) {
    return employees;
  }

  const riskRank: Record<RiskLevel, number> = {
    [RiskLevel.High]: 3,
    [RiskLevel.Medium]: 2,
    [RiskLevel.Low]: 1
  };

  const scored = employees.map((employee) => {
    const riskLevel = employee.riskLevel || RiskLevel.Low;
    const churn = typeof employee.churnProbability === 'number' ? employee.churnProbability : 0;
    const isResigned = (employee.status || '').toLowerCase() !== 'active';
    const score = (
      (isResigned ? 4 : 0) +
      (riskRank[riskLevel] || 0) +
      churn
    );
    return { employee, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_NODES).map((entry) => entry.employee);
}

function computeAffinity(a: Employee, b: Employee) {
  let weight = 0;
  const reasons: string[] = [];

  if (a.structure_name && b.structure_name && a.structure_name === b.structure_name) {
    weight += 0.35;
    reasons.push('Department');
  }

  const posA = (a.position || '').toLowerCase();
  const posB = (b.position || '').toLowerCase();
  if (posA && posB && (posA === posB || posA.includes(posB) || posB.includes(posA))) {
    weight += 0.18;
    reasons.push('Role');
  }

  if (typeof a.age === 'number' && typeof b.age === 'number') {
    const diff = Math.abs(a.age - b.age);
    if (diff <= 5) {
      weight += 0.18;
      reasons.push('Age ±5');
    } else if (diff <= 10) {
      weight += 0.08;
      reasons.push('Age ±10');
    }
  }

  const tenureDiff = Math.abs((Number(a.tenure) || 0) - (Number(b.tenure) || 0));
  if (tenureDiff <= 1) {
    weight += 0.08;
    reasons.push('Tenure ±1');
  } else if (tenureDiff <= 3) {
    weight += 0.04;
    reasons.push('Tenure ±3');
  }

  if (a.workLocation && b.workLocation && a.workLocation === b.workLocation) {
    weight += 0.08;
    reasons.push('Work location');
  } else if (a.remotePreference && b.remotePreference && a.remotePreference === b.remotePreference) {
    weight += 0.04;
    reasons.push('Work mode');
  }

  if (weight === 0) {
    weight = 0.1;
  }

  return {
    weight: Math.min(0.9, weight),
    reasons
  };
}

function pruneGraph(
  nodes: NetworkNode[],
  edges: NetworkEdge[],
  minDegree: number
): { nodes: NetworkNode[]; edges: NetworkEdge[] } {
  if (edges.length === 0) {
    return { nodes: [], edges: [] };
  }

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  let currentEdges = edges.slice();
  let currentIds = new Set(nodes.map((node) => node.id));
  let changed = true;

  while (changed) {
    const degree = new Map<string, number>();
    currentEdges.forEach((edge) => {
      degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
      degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
    });

    const keepIds = new Set<string>();
    degree.forEach((count, id) => {
      if (count >= minDegree) {
        keepIds.add(id);
      }
    });

    if (keepIds.size === 0) {
      return { nodes: [], edges: [] };
    }

    changed = keepIds.size !== currentIds.size || [...keepIds].some((id) => !currentIds.has(id));
    currentIds = keepIds;
    currentEdges = currentEdges.filter(
      (edge) => currentIds.has(edge.source) && currentIds.has(edge.target)
    );
  }

  const finalNodes = [...currentIds]
    .map((id) => nodeMap.get(id))
    .filter((node): node is NetworkNode => Boolean(node));

  return {
    nodes: finalNodes,
    edges: currentEdges
  };
}

function buildNetwork(employees: Employee[]): { nodes: NetworkNode[]; edges: NetworkEdge[]; clusters: ClusterMeta[] } {
  if (!employees.length) {
    return { nodes: [], edges: [], clusters: [] };
  }

  let nodes: NetworkNode[] = employees.map((employee) => {
    const riskLevel = employee.riskLevel || RiskLevel.Low;
    const status = employee.status || 'Active';
    const isResigned = status.toLowerCase() !== 'active';
    const probability = typeof employee.churnProbability === 'number' ? employee.churnProbability : 0;

    return {
      id: employee.hr_code,
      name: employee.full_name || employee.name || employee.hr_code,
      department: employee.structure_name || 'Unknown',
      position: employee.position || 'Unknown',
      riskLevel,
      churnProbability: probability,
      status,
      isHighRisk: riskLevel === RiskLevel.High,
      isResigned,
      age: employee.age,
      managerId: employee.manager_id ?? null,
      x: 0,
      y: 0
    };
  });

  const employeeById = new Map<string, Employee>();
  employees.forEach((employee) => {
    employeeById.set(employee.hr_code, employee);
  });

  const edgesMap = new Map<string, NetworkEdge>();

  const addEdge = (source: string, target: string, weight: number, reasons: string[]) => {
    if (!source || !target || source === target) {
      return;
    }
    const key = source < target ? `${source}|${target}` : `${target}|${source}`;
    const existing = edgesMap.get(key);
    if (existing) {
      existing.weight = Math.min(1, existing.weight + weight);
      reasons.forEach((reason) => {
        if (!existing.reasons.includes(reason)) {
          existing.reasons.push(reason);
        }
      });
    } else {
      edgesMap.set(key, {
        source,
        target,
        weight,
        reasons: Array.from(new Set(reasons)),
        isRiskPath: false
      });
    }
  };

  // Manager-report edges
  employees.forEach((employee) => {
    if (!employee.manager_id) {
      return;
    }
    const managerKey = String(employee.manager_id).trim();
    const manager = employeeById.get(managerKey);
    if (manager) {
      addEdge(employee.hr_code, manager.hr_code, 0.9, ['Manager link']);
    }
  });

  // Peer groups by manager
  const peersByManager = new Map<string, Employee[]>();
  employees.forEach((employee) => {
    if (!employee.manager_id) {
      return;
    }
    const key = String(employee.manager_id).trim();
    if (!peersByManager.has(key)) {
      peersByManager.set(key, []);
    }
    peersByManager.get(key)!.push(employee);
  });

  peersByManager.forEach((group) => {
    if (group.length < 2) {
      return;
    }

    const seenPairs = new Set<string>();
    let remaining = MAX_PEER_EDGES_PER_GROUP;

    for (let i = 0; i < group.length && remaining > 0; i += 1) {
      const employee = group[i];
      const ranked = group
        .slice(i + 1)
        .map((candidate) => {
          const affinity = computeAffinity(employee, candidate);
          const reasons = Array.from(new Set(['Shared manager', ...affinity.reasons]));
          return {
            candidate,
            weight: Math.max(0.4, affinity.weight),
            reasons
          };
        })
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 2);

      ranked.forEach(({ candidate, weight, reasons }) => {
        if (remaining <= 0) return;
        const key = employee.hr_code < candidate.hr_code
          ? `${employee.hr_code}|${candidate.hr_code}`
          : `${candidate.hr_code}|${employee.hr_code}`;
        if (!seenPairs.has(key)) {
          addEdge(employee.hr_code, candidate.hr_code, weight, reasons);
          seenPairs.add(key);
          remaining -= 1;
        }
      });
    }
  });

  // Department and similarity edges
  const employeesByDept = new Map<string, Employee[]>();
  employees.forEach((employee) => {
    const dept = employee.structure_name || 'Unknown';
    if (!employeesByDept.has(dept)) {
      employeesByDept.set(dept, []);
    }
    employeesByDept.get(dept)!.push(employee);
  });

  let departmentEdgeCount = 0;
  employeesByDept.forEach((group) => {
    if (group.length < 2 || departmentEdgeCount >= MAX_DEPARTMENT_EDGES) {
      return;
    }

    const seenPairs = new Set<string>();
    for (let i = 0; i < group.length && departmentEdgeCount < MAX_DEPARTMENT_EDGES; i += 1) {
      const employee = group[i];
      const ranked = group
        .slice(i + 1)
        .map((candidate) => {
          const affinity = computeAffinity(employee, candidate);
          return {
            candidate,
            weight: affinity.weight,
            reasons: affinity.reasons
          };
        })
        .filter((entry) => entry.weight >= 0.18)
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 2);

      ranked.forEach(({ candidate, weight, reasons }) => {
        if (departmentEdgeCount >= MAX_DEPARTMENT_EDGES) return;
        const key = employee.hr_code < candidate.hr_code
          ? `${employee.hr_code}|${candidate.hr_code}`
          : `${candidate.hr_code}|${employee.hr_code}`;
        if (!seenPairs.has(key)) {
          addEdge(employee.hr_code, candidate.hr_code, weight, reasons);
          seenPairs.add(key);
          departmentEdgeCount += 1;
        }
      });
    }
  });

  let edges = Array.from(edgesMap.values());

  if (edges.length > MAX_EDGES_TOTAL) {
    edges = edges
      .sort((a, b) => b.weight - a.weight)
      .slice(0, MAX_EDGES_TOTAL);
  }

  const pruned = pruneGraph(nodes, edges, 2);
  if (!pruned.nodes.length) {
    return { nodes: [], edges: [], clusters: [] };
  }

  nodes = pruned.nodes;
  edges = pruned.edges;

  const nodeLookup = new Map<string, NetworkNode>();
  nodes.forEach((node) => nodeLookup.set(node.id, node));

  edges.forEach((edge) => {
    const source = nodeLookup.get(edge.source);
    const target = nodeLookup.get(edge.target);
    if (!source || !target) {
      return;
    }
    const riskySource = source.isHighRisk || source.isResigned;
    const riskyTarget = target.isHighRisk || target.isResigned;
    edge.isRiskPath = (riskySource || riskyTarget) && edge.weight >= 0.5;
  });

  // Cluster layout
  const clusterNames = Array.from(new Set(nodes.map((node) => node.department)));
  const columnCount = Math.max(1, Math.ceil(Math.sqrt(clusterNames.length)));
  const rowCount = Math.max(1, Math.ceil(clusterNames.length / columnCount));

  const clusters: ClusterMeta[] = clusterNames.map((name, index) => {
    const col = index % columnCount;
    const row = Math.floor(index / columnCount);
    const x = (col + 0.5) / columnCount;
    const y = (row + 0.5) / rowCount;
    return { name, x, y };
  });

  const nodesByDept = new Map<string, NetworkNode[]>();
  nodes.forEach((node) => {
    if (!nodesByDept.has(node.department)) {
      nodesByDept.set(node.department, []);
    }
    nodesByDept.get(node.department)!.push(node);
  });

  clusters.forEach((cluster) => {
    const members = nodesByDept.get(cluster.name) || [];
    if (members.length === 1) {
      const node = members[0];
      node.x = cluster.x;
      node.y = cluster.y;
      return;
    }

    const radius = Math.min(0.18, 0.08 + members.length * 0.015);
    members.forEach((node, index) => {
      const angle = (2 * Math.PI * index) / members.length;
      const offsetX = Math.cos(angle) * radius;
      const offsetY = Math.sin(angle) * radius;
      node.x = Math.max(0.05, Math.min(0.95, cluster.x + offsetX));
      node.y = Math.max(0.05, Math.min(0.95, cluster.y + offsetY));
    });
  });

  return { nodes, edges, clusters };
}

const EmployeeNetworkGraph: React.FC<EmployeeNetworkGraphProps> = ({ employees, availableDepartments, isLoading }) => {
  const departmentOptions = useMemo(() => {
    const merged = [...defaultDepartments];
    availableDepartments
      .filter((dept) => dept && !merged.includes(dept))
      .forEach((dept) => merged.push(dept));
    return merged;
  }, [availableDepartments]);

  const [departmentFilter, setDepartmentFilter] = useState<string>(departmentOptions[0] || 'All');
  const [hovered, setHovered] = useState<{ node: NetworkNode; x: number; y: number } | null>(null);

  const filteredEmployees = useMemo(() => {
    if (departmentFilter === 'All') {
      return employees;
    }
    return employees.filter((employee) => (employee.structure_name || 'Unknown') === departmentFilter);
  }, [departmentFilter, employees]);

  const trimmedEmployees = useMemo(() => prioritizeEmployees(filteredEmployees), [filteredEmployees]);

  const { nodes, edges, clusters } = useMemo(() => buildNetwork(trimmedEmployees), [trimmedEmployees]);

  const totalFiltered = filteredEmployees.length;
  const totalConsidered = trimmedEmployees.length;
  const performanceLimited = totalConsidered < totalFiltered;
  const connectionFiltered = nodes.length < totalConsidered;
  const performanceSuffix = performanceLimited ? `, capped at top ${MAX_NODES}` : '';
  const connectionMessage = connectionFiltered
    ? 'Employees without at least two shared connections are hidden.'
    : 'All filtered employees meet the two-link requirement.';

  const nodeLookup = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  if (isLoading) {
    return (
      <div className="flex h-[640px] items-center justify-center rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <span className="text-sm text-gray-500 dark:text-gray-400">Loading network…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-300">
          <span>
            Nodes: <strong>{nodes.length}</strong>
          </span>
          <span>
            Connections: <strong>{edges.length}</strong>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span className="inline-flex h-3 w-3 rounded-full bg-risk-high" />
            High Risk
            <span className="inline-flex h-3 w-3 rounded-full bg-risk-medium ml-3" />
            Medium
            <span className="inline-flex h-3 w-3 rounded-full bg-risk-low ml-3" />
            Low
          </div>
          <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All departments" />
            </SelectTrigger>
            <SelectContent>
              {departmentOptions.map((dept) => (
                <SelectItem key={dept} value={dept}>
                  {dept}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {totalFiltered > 0 && (
        <div className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-200">
          Displaying {nodes.length} of {totalFiltered} filtered employees (2+ links{performanceSuffix}). {connectionMessage}
        </div>
      )}

      <div className="relative h-[640px] rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        {nodes.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-500 dark:text-gray-400">
            No employees meet the two-link requirement yet.
          </div>
        ) : (
          <AutoSizer>
            {({ width, height }) => {
              if (!width || !height) {
                return null;
              }

              const padding = 72;
              const toPixelX = (value: number) => padding + value * Math.max(width - padding * 2, 0);
              const toPixelY = (value: number) => padding + value * Math.max(height - padding * 2, 0);

              return (
                <svg width={width} height={height} className="text-gray-500">
                  <defs>
                    <filter id="nodeShadow" x="-50%" y="-50%" width="200%" height="200%">
                      <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="#0f172a" floodOpacity="0.2" />
                    </filter>
                  </defs>

                  {edges.length === 0 && (
                    <text
                      x={width / 2}
                      y={height / 2}
                      textAnchor="middle"
                      className="text-sm font-medium fill-gray-400 dark:fill-gray-500"
                    >
                      Not enough overlapping attributes to display connections yet.
                    </text>
                  )}

                  {edges.map((edge) => {
                    const source = nodeLookup.get(edge.source);
                    const target = nodeLookup.get(edge.target);
                    if (!source || !target) {
                      return null;
                    }
                    const x1 = toPixelX(source.x);
                    const y1 = toPixelY(source.y);
                    const x2 = toPixelX(target.x);
                    const y2 = toPixelY(target.y);
                    const strokeWidth = 1 + edge.weight * 2.5;
                    const stroke = edge.isRiskPath ? colors.risk.high : colors.gray[400];
                    const opacity = edge.isRiskPath ? 0.6 : 0.35 + edge.weight * 0.3;

                    return (
                      <line
                        key={`${edge.source}-${edge.target}`}
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke={stroke}
                        strokeWidth={strokeWidth}
                        strokeOpacity={opacity}
                      />
                    );
                  })}

                  {clusters.map((cluster) => {
                    const x = toPixelX(cluster.x);
                    const y = toPixelY(cluster.y) - 36;
                    return (
                      <text
                        key={cluster.name}
                        x={x}
                        y={y}
                        textAnchor="middle"
                        className="text-xs font-medium fill-gray-500 dark:fill-gray-400"
                      >
                        {cluster.name}
                      </text>
                    );
                  })}

                  {nodes.map((node) => {
                    const x = toPixelX(node.x);
                    const y = toPixelY(node.y);
                    const radius = 10 + (node.isHighRisk ? 4 : 0) + (node.isResigned ? 2 : 0);
                    const fill = riskColorMap[node.riskLevel] ?? colors.chart.primary;
                    const stroke = node.isResigned ? colors.gray[600] : colors.gray[800];

                    return (
                      <g
                        key={node.id}
                        transform={`translate(${x}, ${y})`}
                        onMouseEnter={() => setHovered({ node, x, y })}
                        onMouseLeave={() => setHovered(null)}
                        className="cursor-pointer"
                      >
                        <circle
                          r={radius}
                          fill={fill}
                          stroke={stroke}
                          strokeWidth={node.isResigned ? 3 : 2}
                          filter="url(#nodeShadow)"
                        />
                        <text
                          y={radius + 14}
                          textAnchor="middle"
                          className="text-xs font-medium fill-slate-700 dark:fill-slate-200"
                        >
                          {node.name}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              );
            }}
          </AutoSizer>
        )}

        {hovered && (
          <div
            className="pointer-events-none absolute z-20 w-64 rounded-md border border-gray-200 bg-white p-3 text-xs shadow-lg dark:border-gray-700 dark:bg-gray-900"
            style={{ left: hovered.x + 16, top: hovered.y + 16 }}
          >
            <div className="font-semibold text-gray-800 dark:text-gray-100">{hovered.node.name}</div>
            <div className="mt-1 space-y-1 text-gray-600 dark:text-gray-300">
              <div>
                <span className="font-medium">Department:</span> {hovered.node.department}
              </div>
              <div>
                <span className="font-medium">Role:</span> {hovered.node.position}
              </div>
              <div>
                <span className="font-medium">Risk Score:</span> {(hovered.node.churnProbability * 100).toFixed(1)}%
              </div>
              <div>
                <span className="font-medium">Status:</span> {hovered.node.status}
              </div>
              {typeof hovered.node.age === 'number' && (
                <div>
                  <span className="font-medium">Age:</span> {hovered.node.age}
                </div>
              )}
            </div>
            <div className="mt-2 border-t border-gray-200 pt-2 text-gray-500 dark:border-gray-700 dark:text-gray-400">
              <div className="font-semibold text-gray-700 dark:text-gray-200">Connections</div>
              <ul className="mt-1 space-y-1">
                {edges
                  .filter((edge) => edge.source === hovered.node.id || edge.target === hovered.node.id)
                  .map((edge) => {
                    const counterpartId = edge.source === hovered.node.id ? edge.target : edge.source;
                    const counterpart = nodeLookup.get(counterpartId);
                    if (!counterpart) {
                      return null;
                    }
                    return (
                      <li key={`${edge.source}-${edge.target}`} className="leading-snug">
                        <span className="font-medium text-gray-700 dark:text-gray-200">{counterpart.name}</span>
                        <span className="ml-1 text-gray-500 dark:text-gray-400">
                          ({edge.reasons.join(', ')})
                        </span>
                      </li>
                    );
                  })}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EmployeeNetworkGraph;
