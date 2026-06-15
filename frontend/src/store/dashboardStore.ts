import { create } from 'zustand';

interface DashboardState {
  totalViolationsToday: number;
  complianceRate: number;
  highRiskCount: number;
  resolvedCount: number;
  setStats: (stats: Partial<Omit<DashboardState, 'setStats'>>) => void;
}

const useDashboardStore = create<DashboardState>((set) => ({
  totalViolationsToday: 0,
  complianceRate: 100,
  highRiskCount: 0,
  resolvedCount: 0,
  setStats: (stats) => set(stats),
}));

export default useDashboardStore;
