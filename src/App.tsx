import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  Users, 
  ChevronRight, 
  Loader2, 
  Plus, 
  Brain, 
  Wrench, 
  Target, 
  Cpu, 
  FileText, 
  ArrowRightLeft,
  Sparkles,
  AlertCircle,
  LogIn,
  LogOut,
  History,
  Save,
  Download,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { TeamMember, TeamStructure, ProcessStep, MemoryItem } from './types';
import ProcessFlowDiagram from './components/ProcessFlowDiagram';
import { OperationBuilderWizard } from './components/OperationBuilderWizard';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { 
  Panel, 
  PanelGroup, 
  PanelResizeHandle 
} from "react-resizable-panels";
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithRedirect,
  getRedirectResult,
  signOut, 
  onAuthStateChanged,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  serverTimestamp
} from './firebase';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    operationName: {
      type: Type.STRING,
      description: "The name of the operation described by the user.",
    },
    teamMembers: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          role: { type: Type.STRING, description: "The title of the team member." },
          function: { type: Type.STRING, description: "A detailed description of the member's core function." },
          inputs: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING },
            description: "What information or resources this member needs to start their work."
          },
          outputs: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING },
            description: "What this member produces or delivers."
          },
          instructions: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING },
            description: "Step-by-step instructions for their role."
          },
          capabilities: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING },
            description: "Specific technical or operational capabilities."
          },
          skills: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING },
            description: "Required skills (e.g., programming, leadership)."
          },
          attributes: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING },
            description: "Personal or professional attributes (e.g., detail-oriented, resilient)."
          },
          memorySystem: {
            type: Type.OBJECT,
            properties: {
              resources: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    content: { type: Type.STRING, description: "An actionable setup task describing what resource this agent needs configured (e.g., 'Locate and link the project version registry'). Do NOT invent generic names or timestamps." },
                    status: { type: Type.STRING, enum: ["pending", "completed"], description: "Always set to 'pending' — status is updated during deployment, not generation." }
                  },
                  required: ["content", "status"]
                },
                description: "Setup tasks: what resources, files, or databases this agent needs configured in the target environment. Write as actionable items (e.g., 'Locate and link the project version registry') — NOT generic names like 'Master Database'. Do NOT invent timestamps."
              },
              initialActivities: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    content: { type: Type.STRING, description: "A verifiable onboarding task (e.g., 'Validate all source file paths exist'). Do NOT invent generic actions or timestamps." },
                    status: { type: Type.STRING, enum: ["pending", "completed"], description: "Always set to 'pending' — status is updated during deployment, not generation." }
                  },
                  required: ["content", "status"]
                },
                description: "Onboarding tasks: first actions when deployed into the target environment. Write as verifiable setup tasks (e.g., 'Validate all source file paths') — NOT vague actions like 'Initialize system'. Do NOT invent timestamps."
              }
            },
            required: ["resources", "initialActivities"]
          }
        },
        required: ["role", "function", "inputs", "outputs", "instructions", "capabilities", "skills", "attributes", "memorySystem"],
      },
    },
    processFlow: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING, description: "Unique ID for the step (e.g., step-1)." },
          label: { type: Type.STRING, description: "Short label for the step." },
          actor: { type: Type.STRING, description: "The role responsible for this step." },
          description: { type: Type.STRING, description: "Detailed description of the process step." },
          nextSteps: { 
            type: Type.ARRAY, 
            items: { 
              type: Type.OBJECT,
              properties: {
                toId: { type: Type.STRING, description: "ID of the next step." },
                label: { type: Type.STRING, description: "Label for the dependency (e.g., 'Success', 'Error', 'Data Flow')." },
                style: { type: Type.STRING, enum: ['smoothstep', 'step', 'straight', 'bezier'], description: "Visual style of the connection." }
              },
              required: ["toId"]
            },
            description: "Dependencies and connections to subsequent steps."
          }
        },
        required: ["id", "label", "actor", "description", "nextSteps"]
      }
    }
  },
  required: ["operationName", "teamMembers", "processFlow"],
};

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [team, setTeam] = useState<TeamStructure | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedMember, setSelectedMember] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'team' | 'flow'>('team');
  const [history, setHistory] = useState<TeamStructure[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [refining, setRefining] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeInput, setActiveInput] = useState<{ role: string, type: 'activity' | 'resource' } | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const initialLoadDone = useRef(false);
  
  // Persistent Memory State
  const [memberMemories, setMemberMemories] = useState<Record<string, { activities: MemoryItem[], resources: MemoryItem[] }>>({});

  const handleFirestoreError = (error: unknown, operationType: string, path: string | null) => {
    const errInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
        isAnonymous: auth.currentUser?.isAnonymous,
        tenantId: auth.currentUser?.tenantId,
        providerInfo: auth.currentUser?.providerData.map(provider => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL
        })) || []
      },
      operationType,
      path
    };
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    return error instanceof Error ? error.message : String(error);
  };

  const formatDate = (date: any) => {
    if (!date) return 'N/A';
    if (typeof date.toDate === 'function') return date.toDate().toLocaleString();
    if (date instanceof Date) return date.toLocaleString();
    if (date.seconds) return new Date(date.seconds * 1000).toLocaleString();
    return 'Processing...';
  };

  const selectTeamFromHistory = async (selectedTeam: TeamStructure) => {
    setTeam(selectedTeam);
    setDescription(selectedTeam.originalDescription || '');
    setShowHistory(false);
    setSelectedMember(null);
    setActiveTab('team');
    setSaveSuccess(false);
    setSuggestions([]);
    
    // Load memories for this team
    try {
      const q = query(collection(db, "memories"), where("teamId", "==", selectedTeam.id));
      const querySnapshot = await getDocs(q);
      const memories: Record<string, { activities: MemoryItem[], resources: MemoryItem[] }> = {};
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        memories[data.role] = {
          activities: data.activities || [],
          resources: data.resources || []
        };
      });
      setMemberMemories(memories);
    } catch (err) {
      handleFirestoreError(err, "get", "memories");
      console.error("Error loading memories:", err);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        loadHistory(u.uid);
      } else {
        setHistory([]);
        setTeam(null);
        initialLoadDone.current = false;
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    getRedirectResult(auth).catch((error) => {
      console.error("Redirect login error:", error);
      setError(`Login error: ${error.message}`);
    });
  }, []);

  const loadHistory = async (uid: string) => {
    try {
      const q = query(collection(db, "teams"), where("ownerId", "==", uid));
      const querySnapshot = await getDocs(q);
      const teams: TeamStructure[] = [];
      querySnapshot.forEach((doc) => {
        teams.push({ id: doc.id, ...doc.data() } as TeamStructure);
      });
      const sortedTeams = teams.sort((a, b) => {
        const aTime = a.createdAt?.seconds || 0;
        const bTime = b.createdAt?.seconds || 0;
        return bTime - aTime;
      });
      setHistory(sortedTeams);

      // Auto-load most recent if nothing is selected and this is the first load
      if (sortedTeams.length > 0 && !initialLoadDone.current) {
        initialLoadDone.current = true;
        selectTeamFromHistory(sortedTeams[0]);
      }
    } catch (err) {
      handleFirestoreError(err, "get", "teams");
      console.error("Error loading history:", err);
    }
  };

  const login = async () => {
    try {
      await signInWithRedirect(auth, googleProvider);
    } catch (err) {
      console.error("Login failed:", err);
      setError("Login failed. Please try again.");
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const generateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;
    if (!user) {
      setError("Please sign in to generate and save teams.");
      return;
    }

    setLoading(true);
    setError(null);
    // Removed setTeam(null) to keep existing content visible during regeneration
    setSelectedMember(null);
    setMemberMemories({});
    setActiveTab('team');

    try {
      let attempts = 0;
      const maxAttempts = 2;
    let lastError: any = null;

    while (attempts < maxAttempts) {
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: `You are an expert Systems Architect. 

          --- START OF OPERATION PARAMETERS ---
          ${description}
          --- END OF OPERATION PARAMETERS ---

          TASK: Generate a COMPREHENSIVE and HOLISTIC team structure and process flow based on the parameters provided above.

          INTEGRATION RULE: 
          The parameters above may contain specific "Refinements" or "Enhancements" added to an original base description. You MUST treat the entire text as a single, unified set of operational parameters. You are strictly forbidden from focusing only on the refinements. The resulting system must perform ALL core tasks from the original description while seamlessly integrating the new refinements.

          CRITICAL ARCHITECTURAL REQUIREMENTS:
          1. Every team MUST have exactly one "Ultimate Orchestrator" role responsible for system-wide coordination and memory management.
          2. If the parameters already include a role that acts as a system lead or orchestrator, assign the "Ultimate Orchestrator" duties to that existing role and ensure its name includes "Orchestrator".
          3. If no such role is present, you MUST add a separate "Ultimate Orchestrator" as an additional team member.
          4. Every agent (team member) MUST have "Memory Creation Logging" and "Persistent Task Recording" explicitly listed in their skills and capabilities.
          5. The Ultimate Orchestrator must have instructions to update the system-wide memory index and coordinate between agent-specific memories.
          
          MEMORY SYSTEM RULES:
          - Resources and initialActivities should be SETUP TASKS for the target environment, not fake pre-existing resources.
          - Write each item as an actionable TODO (e.g., "Identify and link the project's source data directory").
          - Do NOT generate timestamps — they are assigned when tasks are completed during deployment.
          - Do NOT invent generic names like "Master Database" or "Historical Records".
          - Set status to "pending" for all items.

          OUTPUT SPECIFICATIONS:
          - Be concise but thorough. Avoid redundant descriptions.
          - For each team member: Provide a detailed breakdown of their function, inputs, outputs, instructions, capabilities, skills, attributes, and an initial memory system (resources and activities as setup tasks).
          - Process Flow: Create a step-by-step process flow diagram mapping how these roles interact to achieve the FULL scope of the operation.`,
          config: {
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
            maxOutputTokens: 8192,
          },
        });

        if (!response.text) {
          throw new Error("Empty response from AI model.");
        }

        const result = JSON.parse(response.text) as TeamStructure;
        
        // Save to Firebase
        const teamId = `team_${Date.now()}`;
        const teamData: TeamStructure = {
          ...result,
          id: teamId,
          originalDescription: description,
          ownerId: user.uid,
          createdAt: serverTimestamp()
        };

        await setDoc(doc(db, "teams", teamId), teamData);
        
        // Initialize memories in state and Firestore — force pending status, strip LLM timestamps
        const initialMemories: Record<string, { activities: MemoryItem[], resources: MemoryItem[] }> = {};
        for (const member of result.teamMembers) {
          const mem = {
            activities: (member.memorySystem?.initialActivities || []).map(a => ({
              content: a.content,
              status: 'pending' as const
            })),
            resources: (member.memorySystem?.resources || []).map(r => ({
              content: r.content,
              status: 'pending' as const
            }))
          };
          initialMemories[member.role] = mem;
          
          // Save initial memory to Firestore
          try {
            await setDoc(doc(db, "memories", `${teamId}_${member.role}`), {
              teamId,
              role: member.role,
              ...mem,
              updatedAt: serverTimestamp()
            });
          } catch (err) {
            handleFirestoreError(err, "create", `memories/${teamId}_${member.role}`);
          }
        }

        setTeam(teamData);
        setMemberMemories(initialMemories);
        loadHistory(user.uid);
        return; // Success!

      } catch (err) {
        attempts++;
        lastError = err;
        console.warn(`Generation attempt ${attempts} failed:`, err);
        if (attempts < maxAttempts) {
          // Wait a bit before retrying
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    // If we get here, all attempts failed
    handleFirestoreError(lastError, "create", "teams");
    console.error("Generation failed after multiple attempts:", lastError);
    
    if (lastError instanceof SyntaxError) {
      setError("The operation description is too complex for the AI to structure as JSON. Try simplifying or breaking it into smaller parts.");
    } else if (lastError?.message?.includes("quota") || lastError?.message?.includes("limit")) {
      setError("AI service limit reached. Please wait a moment and try again with a slightly shorter description.");
    } else {
      setError("Failed to generate team architecture. The description might be too long or complex. Please try again.");
    }
} finally {
      setLoading(false);
    }
  };

  const addActivity = async (role: string, activity: string) => {
    if (!team || !user) return;
    const newItem: MemoryItem = {
      content: activity,
      timestamp: new Date().toISOString(),
      status: 'completed'
    };
    const newMemories = {
      ...memberMemories,
      [role]: {
        ...memberMemories[role],
        activities: [newItem, ...(memberMemories[role]?.activities || [])]
      }
    };
    setMemberMemories(newMemories);
    
    try {
      await setDoc(doc(db, "memories", `${team.id}_${role}`), {
        teamId: team.id,
        role,
        ...newMemories[role],
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, "update", `memories/${team.id}_${role}`);
      console.error("Failed to save activity:", err);
    }
  };

  const addResource = async (role: string, resource: string) => {
    if (!team || !user) return;
    const newItem: MemoryItem = {
      content: resource,
      timestamp: new Date().toISOString(),
      status: 'completed'
    };
    const newMemories = {
      ...memberMemories,
      [role]: {
        ...memberMemories[role],
        resources: [newItem, ...(memberMemories[role]?.resources || [])]
      }
    };
    setMemberMemories(newMemories);

    try {
      await setDoc(doc(db, "memories", `${team.id}_${role}`), {
        teamId: team.id,
        role,
        ...newMemories[role],
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, "update", `memories/${team.id}_${role}`);
      console.error("Failed to save resource:", err);
    }
  };

  const manualSave = async () => {
    if (!team || !user) return;
    setIsSaving(true);
    try {
      // Update the team in Firestore (in case of any future edits)
      await setDoc(doc(db, "teams", team.id), {
        ...team,
        originalDescription: description,
        updatedAt: serverTimestamp()
      }, { merge: true });

      // Ensure all memories are saved
      for (const role in memberMemories) {
        try {
          await setDoc(doc(db, "memories", `${team.id}_${role}`), {
            teamId: team.id,
            role,
            ...memberMemories[role],
            updatedAt: serverTimestamp()
          }, { merge: true });
        } catch (err) {
          handleFirestoreError(err, "update", `memories/${team.id}_${role}`);
        }
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      loadHistory(user.uid);
    } catch (err) {
      handleFirestoreError(err, "update", `teams/${team.id}`);
      console.error("Manual save failed:", err);
      setError("Failed to save architecture.");
    } finally {
      setIsSaving(false);
    }
  };

  const downloadResources = async () => {
    if (!team) return;
    
    const zip = new JSZip();
    
    // 1. Team Architecture JSON
    zip.file("team_architecture.json", JSON.stringify(team, null, 2));
    
    // 2. Memory Ledger JSON
    zip.file("memory_ledger.json", JSON.stringify(memberMemories, null, 2));
    
    // 3. Agents.md (Comprehensive Agent Profiles)
    let agentsMd = `# Agents: ${team.operationName}\n\n`;
    agentsMd += `This document summarizes all agents within the ${team.operationName} operation, managed by the Ultimate Orchestrator.\n\n`;
    
    team.teamMembers.forEach(m => {
      agentsMd += `## ${m.role}\n`;
      agentsMd += `**Function**: ${m.function}\n\n`;
      agentsMd += `### Core Skills & Capabilities\n`;
      m.skills.forEach(s => agentsMd += `- ${s}\n`);
      m.capabilities.forEach(c => agentsMd += `- ${c}\n`);
      agentsMd += `\n---\n\n`;
    });
    zip.file("Agents.md", agentsMd);

    // 4. Memory_Ledger.md (Overall Memory File)
    let memoryLedgerMd = `# Overall Memory Ledger: ${team.operationName}\n\n`;
    memoryLedgerMd += `This ledger contains the collective task recordings and resource logs for all agents.\n\n`;
    
    team.teamMembers.forEach(m => {
      const currentMem = memberMemories[m.role];
      memoryLedgerMd += `## Memory: ${m.role}\n`;
      memoryLedgerMd += `### Task Recordings (Activities)\n`;
      (currentMem?.activities || m.memorySystem.initialActivities).forEach(a => {
        if (a.status === 'completed' && a.timestamp) {
          memoryLedgerMd += `- ${a.content} [${new Date(a.timestamp).toLocaleString()}]\n`;
        } else {
          memoryLedgerMd += `- **TODO:** ${a.content}\n`;
        }
      });
      memoryLedgerMd += `\n### Resource Recall\n`;
      (currentMem?.resources || m.memorySystem.resources).forEach(r => {
        if (r.status === 'completed' && r.timestamp) {
          memoryLedgerMd += `- ${r.content} [${new Date(r.timestamp).toLocaleString()}]\n`;
        } else {
          memoryLedgerMd += `- **TODO:** ${r.content}\n`;
        }
      });
      memoryLedgerMd += `\n---\n\n`;
    });
    zip.file("Memory_Ledger.md", memoryLedgerMd);

    // 5. Main_Index.md (System Index)
    let mainIndexMd = `# Main System Index: ${team.operationName}\n\n`;
    mainIndexMd += `## Operation Overview\n${description}\n\n`;
    mainIndexMd += `## Memory Index\n`;
    team.teamMembers.forEach(m => {
      mainIndexMd += `- [${m.role} Memory](./members/${m.role.replace(/\s+/g, '_').toLowerCase()}.md)\n`;
    });
    mainIndexMd += `\n## Process Flow Index\n`;
    team.processFlow.forEach(s => {
      mainIndexMd += `- [Step: ${s.label} (${s.actor})](#step-${s.id})\n`;
    });
    zip.file("Main_Index.md", mainIndexMd);
    
    // 6. Individual Member Profiles (Markdown)
    const membersFolder = zip.folder("members");
    team.teamMembers.forEach(m => {
      let memberMd = `# ${m.role}\n\n`;
      memberMd += `## Core Function\n${m.function}\n\n`;
      
      memberMd += `## Inputs\n`;
      m.inputs.forEach(i => memberMd += `- ${i}\n`);
      memberMd += `\n`;
      
      memberMd += `## Outputs\n`;
      m.outputs.forEach(o => memberMd += `- ${o}\n`);
      memberMd += `\n`;
      
      memberMd += `## Instructions\n`;
      m.instructions.forEach(ins => memberMd += `- ${ins}\n`);
      memberMd += `\n`;
      
      memberMd += `## Capabilities\n`;
      m.capabilities.forEach(c => memberMd += `- ${c}\n`);
      memberMd += `\n`;
      
      memberMd += `## Skills\n`;
      m.skills.forEach(s => memberMd += `- ${s}\n`);
      memberMd += `\n`;
      
      memberMd += `## Attributes\n`;
      m.attributes.forEach(a => memberMd += `- ${a}\n`);
      memberMd += `\n`;
      
      memberMd += `## Memory System (Current State)\n`;
      memberMd += `### Resources\n`;
      const currentMem = memberMemories[m.role];
      (currentMem?.resources || m.memorySystem.resources).forEach(r => {
        if (r.status === 'completed' && r.timestamp) {
          memberMd += `- ${r.content} [${new Date(r.timestamp).toLocaleString()}]\n`;
        } else {
          memberMd += `- **TODO:** ${r.content}\n`;
        }
      });
      memberMd += `\n### Activities\n`;
      (currentMem?.activities || m.memorySystem.initialActivities).forEach(a => {
        if (a.status === 'completed' && a.timestamp) {
          memberMd += `- ${a.content} [${new Date(a.timestamp).toLocaleString()}]\n`;
        } else {
          memberMd += `- **TODO:** ${a.content}\n`;
        }
      });
      
      membersFolder?.file(`${m.role.replace(/\s+/g, '_').toLowerCase()}.md`, memberMd);
    });
    
    // 5. Process Flow Markdown
    let flowMd = `# Process Flow: ${team.operationName}\n\n`;
    team.processFlow.forEach((step, idx) => {
      flowMd += `### Step ${idx + 1}: ${step.label}\n`;
      flowMd += `- **Actor**: ${step.actor}\n`;
      flowMd += `- **Description**: ${step.description}\n`;
      flowMd += `- **Next Steps**: ${step.nextSteps.map(ns => typeof ns === 'string' ? ns : ns.toId).join(', ') || 'None'}\n\n`;
    });
    zip.file("process_flow.md", flowMd);

    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `${team.operationName.replace(/\s+/g, '_').toLowerCase()}_architecture.zip`);
  };

  const refineDescription = async () => {
    if (!description.trim()) return;
    setRefining(true);
    setError(null);
    
    const currentRoles = team ? team.teamMembers.map(m => m.role).join(', ') : 'None';
    
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analyze the following operation description and suggest 3 specific refinements or additional details that would make the team architecture more effective and resource-efficient. 
        
        Current Operation Description: "${description}"
        Current Team Roles (if any): ${currentRoles}

        Focus on resource optimization, role clarity, and operational bottlenecks. Ensure suggestions are additive and integrate well with the existing scope. Provide a comprehensive refinement of the entire solution's logic.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        }
      });
      const result = JSON.parse(response.text);
      setSuggestions(result);
    } catch (err) {
      console.error("Refinement failed:", err);
      setError("Failed to get refinement suggestions.");
    } finally {
      setRefining(false);
    }
  };

  const applySuggestion = (suggestion: string) => {
    setDescription(prev => prev.trim() + "\n\nRefinement: " + suggestion);
    setSuggestions(prev => prev.filter(s => s !== suggestion));
  };

  const handleUpdateSteps = (newSteps: ProcessStep[]) => {
    if (!team) return;
    setTeam({
      ...team,
      processFlow: newSteps
    });
    setSaveSuccess(false); // Indicate that there are unsaved changes
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="bg-slate-900 p-2 rounded-lg">
            <Users className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">TEAM ARCHITECT AI</h1>
            <p className="text-xs text-slate-500 font-mono uppercase tracking-wider">Operational Design System</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <button 
                onClick={() => setShowHistory(!showHistory)}
                className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors relative"
                title="History"
              >
                <History className="w-5 h-5" />
                {history.length > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-slate-900 rounded-full border-2 border-white" />
                )}
              </button>
              <div className="h-6 w-px bg-slate-200 mx-1" />
              <div className="flex items-center gap-3 pl-1">
                <img 
                  src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}`} 
                  alt={user.displayName}
                  className="w-8 h-8 rounded-full border border-slate-200"
                  referrerPolicy="no-referrer"
                />
                <button 
                  onClick={logout}
                  className="text-xs font-bold text-slate-500 hover:text-slate-900 uppercase tracking-wider"
                >
                  Sign Out
                </button>
              </div>
              {team && (
                <>
                  <div className="h-6 w-px bg-slate-200 mx-2" />
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={manualSave}
                      disabled={isSaving}
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                        saveSuccess 
                          ? "bg-emerald-500 text-white" 
                          : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                      )}
                      title="Save Architecture"
                    >
                      {isSaving ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : saveSuccess ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <Save className="w-3.5 h-3.5" />
                      )}
                      {saveSuccess ? "SAVED" : "SAVE"}
                    </button>
                    <button 
                      onClick={downloadResources}
                      className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 transition-all shadow-sm"
                      title="Download Resources"
                    >
                      <Download className="w-3.5 h-3.5" />
                      DOWNLOAD
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            <button 
              onClick={login}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold hover:bg-slate-800 transition-colors"
            >
              <LogIn className="w-4 h-4" />
              SIGN IN
            </button>
          )}
          {team && (
            <div className="flex bg-slate-100 p-1 rounded-lg mr-4">
              <button 
                onClick={() => setActiveTab('team')}
                className={cn(
                  "px-4 py-1.5 rounded-md text-xs font-bold transition-all",
                  activeTab === 'team' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                TEAM STRUCTURE
              </button>
              <button 
                onClick={() => setActiveTab('flow')}
                className={cn(
                  "px-4 py-1.5 rounded-md text-xs font-bold transition-all",
                  activeTab === 'flow' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                PROCESS FLOW
              </button>
            </div>
          )}
          <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-medium border border-emerald-100">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            SYSTEM READY
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-6 flex flex-col">
        <PanelGroup direction="horizontal" className="gap-8 flex-1">
        {/* History Sidebar/Overlay */}
        <AnimatePresence>
          {showHistory && (
            <>
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowHistory(false)}
                className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40"
              />
              <motion.div 
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                className="fixed right-0 top-0 bottom-0 w-80 bg-white border-l border-slate-200 shadow-2xl z-50 p-6 overflow-y-auto"
              >
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-bold text-slate-900">Architecture History</h2>
                  <button onClick={() => setShowHistory(false)} className="text-slate-400 hover:text-slate-600">
                    <Plus className="w-5 h-5 rotate-45" />
                  </button>
                </div>
                
                <div className="space-y-3">
                  {history.length === 0 ? (
                    <div className="text-center py-12">
                      <History className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                      <p className="text-sm text-slate-500">No saved architectures yet.</p>
                    </div>
                  ) : (
                    history.map((h) => (
                      <button
                        key={h.id}
                        onClick={() => selectTeamFromHistory(h)}
                        className="w-full text-left p-4 rounded-xl border border-slate-100 hover:border-slate-300 hover:bg-slate-50 transition-all group"
                      >
                        <div className="flex flex-col mb-1">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                            Created
                          </span>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono text-slate-500 uppercase">
                              {formatDate(h.createdAt)}
                            </span>
                            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:translate-x-1 transition-transform" />
                          </div>
                        </div>
                        <h3 className="text-sm font-bold text-slate-900 line-clamp-1">{h.operationName}</h3>
                        <p className="text-xs text-slate-500 mt-1">{h.teamMembers.length} Members</p>
                      </button>
                    ))
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Left Column: Input */}
        <Panel defaultSize={33} minSize={20}>
          <PanelGroup direction="vertical">
            <Panel defaultSize={70} minSize={30} className="space-y-6 overflow-y-auto pr-2 custom-scrollbar">
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-slate-400" />
                <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">Operation Parameters</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsWizardOpen(true)}
                className="px-3 py-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1.5"
              >
                <Brain className="w-3.5 h-3.5" />
                AI Wizard
              </button>
            </div>
            <form onSubmit={generateTeam} className="space-y-4">
              {!user && (
                <div className="p-4 bg-amber-50 border border-amber-100 rounded-lg mb-4">
                  <div className="flex gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-amber-900 uppercase tracking-tight">Authentication Required</p>
                      <p className="text-xs text-amber-700 mt-1">Please sign in to save and persist your team architectures.</p>
                    </div>
                  </div>
                </div>
              )}
              <div className="relative">
                <label className="block text-xs font-medium text-slate-500 uppercase mb-2 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    Describe the Operation
                    <span className="text-[10px] font-mono text-slate-400 lowercase">({description.length} chars)</span>
                  </div>
                  {description.length > 20 && (
                    <button
                      type="button"
                      onClick={refineDescription}
                      disabled={refining}
                      className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 transition-colors"
                    >
                      {refining ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      REFINE WITH AI
                    </button>
                  )}
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g., A deep-sea research mission to explore hydrothermal vents..."
                  className="w-full min-h-48 p-4 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all text-sm resize-y"
                />
              </div>

              <AnimatePresence>
                {suggestions.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-2"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Brain className="w-3 h-3 text-emerald-500" />
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Refinement Suggestions</span>
                    </div>
                    {suggestions.map((suggestion, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => applySuggestion(suggestion)}
                        className="w-full text-left p-3 bg-emerald-50 border border-emerald-100 rounded-lg text-xs text-emerald-800 hover:bg-emerald-100 transition-all flex items-start gap-3 group"
                      >
                        <Plus className="w-3 h-3 mt-0.5 text-emerald-400 group-hover:text-emerald-600 transition-colors" />
                        {suggestion}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              <button
                type="submit"
                disabled={loading || !description.trim()}
                className={cn(
                  "w-full py-3 rounded-lg flex items-center justify-center gap-2 font-semibold text-sm transition-all",
                  loading || !description.trim() 
                    ? "bg-slate-100 text-slate-400 cursor-not-allowed" 
                    : "bg-slate-900 text-white hover:bg-slate-800 active:scale-95 shadow-lg shadow-slate-200"
                )}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    ARCHITECTING...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    GENERATE SYSTEM
                  </>
                )}
              </button>
            </form>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-100 p-4 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

            </Panel>

            <PanelResizeHandle className="h-1.5 bg-slate-200 hover:bg-slate-300 transition-colors rounded-full cursor-row-resize my-2" />

            <Panel defaultSize={30} minSize={10}>
              <div className="bg-slate-900 text-slate-400 p-6 rounded-xl space-y-4 h-full">
                <h3 className="text-xs font-bold text-white uppercase tracking-widest">System Capabilities</h3>
                <ul className="space-y-3">
                  {[
                    { icon: Brain, label: "Cognitive Role Mapping" },
                    { icon: Target, label: "Process Flow Synthesis" },
                    { icon: ArrowRightLeft, label: "Persistent Memory Ledger" }
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-3 text-xs">
                      <item.icon className="w-4 h-4 text-slate-500" />
                      {item.label}
                    </li>
                  ))}
                </ul>
              </div>
            </Panel>
          </PanelGroup>
        </Panel>

          <PanelResizeHandle className="w-1.5 bg-slate-200 hover:bg-slate-300 transition-colors rounded-full cursor-col-resize" />

          {/* Right Column: Results */}
          <Panel defaultSize={67} minSize={30} className="relative h-full flex flex-col">
          {/* Non-blocking loading overlay when regenerating */}
          {loading && team && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-x-0 top-0 z-50 p-4"
            >
              <div className="bg-white/90 backdrop-blur-sm border border-slate-200 rounded-xl p-4 shadow-lg flex items-center gap-4">
                <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
                <div>
                  <p className="text-xs font-bold text-slate-900 uppercase tracking-widest">Regenerating System...</p>
                  <p className="text-[10px] text-slate-500">Synthesizing new operational flow and updating memory ledgers...</p>
                </div>
              </div>
            </motion.div>
          )}

          <AnimatePresence mode="wait">
            {!team && !loading ? (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="h-full flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-slate-200 rounded-2xl bg-white/50"
              >
                <div className="bg-slate-100 p-4 rounded-full mb-4">
                  <Cpu className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">No Operation Defined</h3>
                <p className="text-slate-500 text-sm max-w-xs mt-2">
                  Enter your operation details on the left to generate a comprehensive team structure and process flow.
                </p>
              </motion.div>
            ) : loading && !team ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-full flex flex-col items-center justify-center space-y-6"
              >
                <div className="relative">
                  <div className="w-16 h-16 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Users className="w-6 h-6 text-slate-900" />
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-slate-900 uppercase tracking-widest">Synthesizing Operational Flow</p>
                  <p className="text-xs text-slate-500 mt-1">Mapping role dependencies and creating persistent memory ledgers...</p>
                </div>
              </motion.div>
            ) : activeTab === 'flow' ? (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-6 h-full flex flex-col flex-1"
              >
                <div className="flex items-end justify-between shrink-0">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Process Architecture</span>
                    <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Operation Flow</h2>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm relative overflow-hidden flex-1 min-h-[400px]">
                  <div className="absolute top-0 right-0 p-4 opacity-5">
                    <Target className="w-32 h-32" />
                  </div>
                  
                  <div className="absolute inset-0 z-10">
                    {team && <ProcessFlowDiagram steps={team.processFlow} onUpdateSteps={handleUpdateSteps} />}
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6 h-full overflow-y-auto pr-2 custom-scrollbar"
              >
                <div className="flex items-end justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Active Architecture</span>
                    <div className="flex items-center gap-3">
                      <h2 className="text-3xl font-bold text-slate-900 tracking-tight">{team?.operationName}</h2>
                      {team?.createdAt && (
                        <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-2 py-1 rounded mt-1">
                          {formatDate(team.createdAt)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Team Size</span>
                    <p className="text-2xl font-mono font-bold text-slate-900">{team?.teamMembers.length}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {team?.teamMembers.map((member, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className={cn(
                        "group bg-white border rounded-xl overflow-hidden transition-all duration-300",
                        selectedMember === idx ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-200 hover:border-slate-400"
                      )}
                    >
                      <button
                        onClick={() => setSelectedMember(selectedMember === idx ? null : idx)}
                        className="w-full text-left p-5 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "w-10 h-10 rounded-lg flex items-center justify-center transition-colors",
                            selectedMember === idx ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 group-hover:bg-slate-200"
                          )}>
                            <span className="text-xs font-bold font-mono">0{idx + 1}</span>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-slate-900">{member.role}</h4>
                              {member.role.toLowerCase().includes('orchestrator') && (
                                <span className="px-1.5 py-0.5 bg-slate-900 text-white text-[8px] font-bold uppercase tracking-widest rounded">
                                  SYSTEM LEAD
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 line-clamp-1">{member.function}</p>
                          </div>
                        </div>
                        <ChevronRight className={cn(
                          "w-5 h-5 text-slate-400 transition-transform duration-300",
                          selectedMember === idx ? "rotate-90 text-slate-900" : ""
                        )} />
                      </button>

                      <AnimatePresence>
                        {selectedMember === idx && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="px-5 pb-6 pt-2 border-t border-slate-100 space-y-6">
                              {/* Tabs for Member Details */}
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                <div className="space-y-6">
                                  {/* Function Section */}
                                  <div className="bg-slate-50 p-4 rounded-lg">
                                    <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                      <Brain className="w-3 h-3" /> Core Function
                                    </h5>
                                    <p className="text-sm text-slate-700 leading-relaxed">{member.function}</p>
                                  </div>

                                  {/* Instructions */}
                                  <div className="space-y-3">
                                    <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                      <Target className="w-3 h-3" /> Operational Instructions
                                    </h5>
                                    <div className="grid grid-cols-1 gap-2">
                                      {member.instructions.map((instruction, i) => (
                                        <div key={i} className="flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-lg">
                                          <span className="text-[10px] font-mono font-bold text-slate-300">{i + 1}</span>
                                          <p className="text-xs text-slate-600">{instruction}</p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>

                                {/* Persistent Memory System */}
                                <div className="bg-slate-900 rounded-xl p-6 space-y-6">
                                  <div className="flex items-center justify-between">
                                    <h5 className="text-[10px] font-bold text-white uppercase tracking-[0.2em] flex items-center gap-2">
                                      <Cpu className="w-3 h-3 text-emerald-400" /> Persistent Memory Ledger
                                    </h5>
                                    <div className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded text-[8px] font-bold uppercase tracking-widest border border-emerald-500/20">
                                      ACTIVE SYNC
                                    </div>
                                  </div>

                                  {/* Activity Log */}
                                  <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                      <h6 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Activity Log</h6>
                                      <button 
                                        onClick={() => {
                                          setActiveInput({ role: member.role, type: 'activity' });
                                          setInputValue('');
                                        }}
                                        className="text-[9px] font-bold text-emerald-400 hover:text-emerald-300 transition-colors uppercase tracking-widest"
                                      >
                                        + Record Activity
                                      </button>
                                    </div>

                                    {activeInput?.role === member.role && activeInput?.type === 'activity' && (
                                      <motion.div 
                                        initial={{ opacity: 0, y: -5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="flex gap-2"
                                      >
                                        <input
                                          autoFocus
                                          value={inputValue}
                                          onChange={(e) => setInputValue(e.target.value)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter' && inputValue.trim()) {
                                              addActivity(member.role, inputValue.trim());
                                              setActiveInput(null);
                                              setInputValue('');
                                            } else if (e.key === 'Escape') {
                                              setActiveInput(null);
                                            }
                                          }}
                                          placeholder="Enter activity..."
                                          className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-emerald-500"
                                        />
                                        <button 
                                          onClick={() => {
                                            if (inputValue.trim()) {
                                              addActivity(member.role, inputValue.trim());
                                              setActiveInput(null);
                                              setInputValue('');
                                            }
                                          }}
                                          className="px-2 py-1 bg-emerald-500 text-white rounded text-[10px] font-bold"
                                        >
                                          ADD
                                        </button>
                                        <button 
                                          onClick={() => setActiveInput(null)}
                                          className="px-2 py-1 bg-slate-700 text-slate-300 rounded text-[10px] font-bold"
                                        >
                                          ESC
                                        </button>
                                      </motion.div>
                                    )}

                                    <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                                      {memberMemories[member.role]?.activities.map((act, i) => (
                                        <div key={i} className="p-2 bg-slate-800/50 border border-slate-700/50 rounded text-[11px] text-slate-300 flex flex-col gap-1">
                                          <div className="flex items-start gap-2">
                                            <div className={`w-1 h-1 rounded-full mt-1.5 shrink-0 ${act.status === 'completed' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                            {act.content}
                                          </div>
                                          <div className="text-[8px] text-slate-500 font-mono pl-3">
                                            {act.status === 'completed' && act.timestamp
                                              ? new Date(act.timestamp).toLocaleString()
                                              : 'Pending'}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>

                                  {/* Resource Recall */}
                                  <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                      <h6 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Resource Library</h6>
                                      <button 
                                        onClick={() => {
                                          setActiveInput({ role: member.role, type: 'resource' });
                                          setInputValue('');
                                        }}
                                        className="text-[9px] font-bold text-emerald-400 hover:text-emerald-300 transition-colors uppercase tracking-widest"
                                      >
                                        + Add Resource
                                      </button>
                                    </div>

                                    {activeInput?.role === member.role && activeInput?.type === 'resource' && (
                                      <motion.div 
                                        initial={{ opacity: 0, y: -5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="flex gap-2"
                                      >
                                        <input
                                          autoFocus
                                          value={inputValue}
                                          onChange={(e) => setInputValue(e.target.value)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter' && inputValue.trim()) {
                                              addResource(member.role, inputValue.trim());
                                              setActiveInput(null);
                                              setInputValue('');
                                            } else if (e.key === 'Escape') {
                                              setActiveInput(null);
                                            }
                                          }}
                                          placeholder="Enter resource..."
                                          className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-emerald-500"
                                        />
                                        <button 
                                          onClick={() => {
                                            if (inputValue.trim()) {
                                              addResource(member.role, inputValue.trim());
                                              setActiveInput(null);
                                              setInputValue('');
                                            }
                                          }}
                                          className="px-2 py-1 bg-emerald-500 text-white rounded text-[10px] font-bold"
                                        >
                                          ADD
                                        </button>
                                        <button 
                                          onClick={() => setActiveInput(null)}
                                          className="px-2 py-1 bg-slate-700 text-slate-300 rounded text-[10px] font-bold"
                                        >
                                          ESC
                                        </button>
                                      </motion.div>
                                    )}

                                    <div className="flex flex-wrap gap-2">
                                      {memberMemories[member.role]?.resources.map((res, i) => (
                                        <div key={i} className={`px-2 py-1 border rounded text-[10px] font-mono flex flex-col gap-0.5 ${res.status === 'completed' ? 'bg-slate-800 border-slate-700 text-slate-400' : 'bg-slate-800 border-amber-700/50 text-amber-400/80'}`}>
                                          <span>{res.content}</span>
                                          <span className="text-[7px] text-slate-600">
                                            {res.status === 'completed' && res.timestamp
                                              ? new Date(res.timestamp).toLocaleDateString()
                                              : 'Pending'}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Capabilities, Skills, Attributes */}
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-slate-100">
                                <div className="space-y-3">
                                  <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    <Wrench className="w-3 h-3" /> Capabilities
                                  </h5>
                                  <div className="flex flex-wrap gap-2">
                                    {member.capabilities.map((cap, i) => (
                                      <span key={i} className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-[10px] font-medium uppercase tracking-wide">
                                        {cap}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                                <div className="space-y-3">
                                  <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    <Cpu className="w-3 h-3" /> Skills
                                  </h5>
                                  <div className="flex flex-wrap gap-2">
                                    {member.skills.map((skill, i) => (
                                      <span key={i} className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-[10px] font-medium uppercase tracking-wide">
                                        {skill}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                                <div className="space-y-3">
                                  <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    <Sparkles className="w-3 h-3" /> Attributes
                                  </h5>
                                  <div className="flex flex-wrap gap-2">
                                    {member.attributes.map((attr, i) => (
                                      <span key={i} className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-[10px] font-medium uppercase tracking-wide">
                                        {attr}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Panel>
      </PanelGroup>
    </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
          <div>System Status: Operational</div>
          <div>© 2026 Team Architect AI • v1.1.0</div>
          <div>Memory Persistence: Local Storage Active</div>
        </div>
      </footer>
      {/* AI Wizard Modal */}
      <OperationBuilderWizard 
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onComplete={(finalParams) => {
          setDescription(finalParams);
          setIsWizardOpen(false);
        }}
        ai={ai}
      />
    </div>
  );
}

