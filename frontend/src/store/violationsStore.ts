import { ReactNode } from 'react';
import { create } from 'zustand';

interface Violation {
  zone: ReactNode;
  id: number;
  ppe_type: string;
  camera_id: string;
  severity: string;
  status: string;
  image_path?: string;
  timestamp?: string;
}

interface ViolationsState {
  liveFeed: Violation[];
  setLiveFeed: (items: Violation[]) => void;
  addViolation: (item: Violation) => void;
}

const useViolationsStore = create<ViolationsState>((set) => ({
  liveFeed: [],
  setLiveFeed: (items) => set({ liveFeed: items }),
  addViolation: (item) => set((state) => ({ liveFeed: [item, ...state.liveFeed] })),
}));

export default useViolationsStore;
