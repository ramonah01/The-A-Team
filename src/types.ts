export interface MemoryItem {
  content: string;
  timestamp?: string;
  status?: 'pending' | 'completed';
}

export interface TeamMember {
  role: string;
  function: string;
  inputs: string[];
  outputs: string[];
  instructions: string[];
  capabilities: string[];
  skills: string[];
  attributes: string[];
  memorySystem: {
    resources: MemoryItem[];
    initialActivities: MemoryItem[];
  };
}

export interface Dependency {
  toId: string;
  label?: string;
  style?: 'smoothstep' | 'step' | 'straight' | 'bezier';
  showArrow?: boolean;
}

export interface ProcessStep {
  id: string;
  label: string;
  actor: string;
  description: string;
  nextSteps: (string | Dependency)[];
}

export interface TeamStructure {
  id?: string;
  operationName: string;
  originalDescription: string;
  teamMembers: TeamMember[];
  processFlow: ProcessStep[];
  ownerId?: string;
  createdAt?: any;
}
