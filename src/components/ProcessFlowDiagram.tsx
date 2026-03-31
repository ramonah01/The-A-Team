import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactFlow, { 
  Node, 
  Edge, 
  Position, 
  ConnectionLineType,
  Background,
  Controls,
  Handle,
  NodeProps,
  Connection,
  addEdge,
  MarkerType,
  useNodesState,
  useEdgesState,
  applyNodeChanges,
  applyEdgeChanges,
  OnNodesChange,
  OnEdgesChange,
  NodeResizer
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';
import { ProcessStep, Dependency } from '../types';
import { Trash2, Plus, Settings2, ArrowRight, Type as TypeIcon, X } from 'lucide-react';
import { cn } from '../lib/utils';

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const nodeWidth = 200;
const nodeHeight = 80;

const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB') => {
  const isHorizontal = direction === 'LR';
  dagreGraph.setGraph({ rankdir: direction });

  nodes.forEach((node) => {
    const width = (node.style?.width as number) || nodeWidth;
    const height = (node.style?.height as number) || nodeHeight;
    dagreGraph.setNode(node.id, { width, height });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    node.targetPosition = isHorizontal ? Position.Left : Position.Top;
    node.sourcePosition = isHorizontal ? Position.Right : Position.Bottom;

    const width = (node.style?.width as number) || nodeWidth;
    const height = (node.style?.height as number) || nodeHeight;

    // We are shifting the dagre node position (center) to the top left, so it matches the React Flow node anchor point
    node.position = {
      x: nodeWithPosition.x - width / 2,
      y: nodeWithPosition.y - height / 2,
    };

    return node;
  });

  return { nodes, edges };
};

const CustomNode = ({ data, selected }: NodeProps) => {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div className="h-full w-full group/node">
      <NodeResizer 
        minWidth={150} 
        minHeight={60} 
        isVisible={selected} 
        lineClassName="border-slate-400"
        handleClassName="h-2 w-2 bg-white border-2 border-slate-900 rounded"
      />
      {selected && (
        <div className="absolute -top-10 left-0 flex gap-2 z-50">
          <button
            onClick={() => setIsEditing(!isEditing)}
            className={cn(
              "p-1.5 rounded-lg shadow-lg transition-colors flex items-center gap-1 text-[10px] font-bold",
              isEditing ? "bg-emerald-500 text-white" : "bg-white text-slate-600 border border-slate-200"
            )}
          >
            {isEditing ? 'SAVE' : 'EDIT'}
          </button>
          {data.onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                data.onDelete(data.id);
              }}
              className="p-1.5 bg-red-500 text-white rounded-lg shadow-lg hover:bg-red-600 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
      <div className="h-full w-full px-4 py-3 shadow-md rounded-xl bg-white border-2 border-slate-900 flex flex-col">
        <Handle type="target" position={Position.Top} className="w-2 h-2 !bg-slate-900" />
        <div className="flex flex-col h-full">
          {isEditing ? (
            <div className="space-y-2">
              <input 
                className="w-full text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 border border-slate-200 rounded px-1"
                value={data.actor}
                onChange={(e) => data.onUpdate(data.id, { actor: e.target.value })}
                placeholder="Actor"
              />
              <input 
                className="w-full text-sm font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded px-1"
                value={data.label}
                onChange={(e) => data.onUpdate(data.id, { label: e.target.value })}
                placeholder="Label"
              />
              <textarea 
                className="w-full text-[10px] text-slate-500 bg-slate-50 border border-slate-200 rounded px-1 resize-none"
                value={data.description}
                onChange={(e) => data.onUpdate(data.id, { description: e.target.value })}
                placeholder="Description"
                rows={2}
              />
            </div>
          ) : (
            <>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                {data.actor}
              </div>
              <div className="text-sm font-bold text-slate-900">
                {data.label}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">
                {data.description}
              </div>
            </>
          )}
        </div>
        <Handle type="source" position={Position.Bottom} className="w-2 h-2 !bg-slate-900" />
      </div>
    </div>
  );
};

const nodeTypes = {
  custom: CustomNode,
};

interface ProcessFlowDiagramProps {
  steps: ProcessStep[];
  onUpdateSteps?: (newSteps: ProcessStep[]) => void;
}

const ProcessFlowDiagram: React.FC<ProcessFlowDiagramProps> = ({ steps, onUpdateSteps }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [lastStepsJson, setLastStepsJson] = useState('');
  const [globalEdgeStyle, setGlobalEdgeStyle] = useState<string>('smoothstep');
  const [globalShowArrows, setGlobalShowArrows] = useState(true);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [showTips, setShowTips] = useState(true);

  // Function to generate layouted elements
  const generateLayout = useCallback((
    currentSteps: ProcessStep[], 
    direction = 'TB', 
    onDelete?: (id: string) => void, 
    onUpdate?: (id: string, updates: Partial<ProcessStep>) => void,
    edgeStyle = 'smoothstep',
    showArrows = true
  ) => {
    const initialNodes: Node[] = currentSteps.map((step) => {
      // Estimate height based on content to ensure visibility
      // Width is fixed at 220px initially
      const labelLines = Math.ceil(step.label.length / 25);
      const descLines = Math.ceil(step.description.length / 35);
      const estimatedHeight = 50 + (labelLines * 20) + (descLines * 14);
      const finalHeight = Math.max(80, estimatedHeight);

      return {
        id: step.id,
        type: 'custom',
        data: { 
          id: step.id,
          label: step.label, 
          actor: step.actor, 
          description: step.description,
          onDelete,
          onUpdate
        },
        position: { x: 0, y: 0 },
        style: { width: 220, height: finalHeight }
      };
    });

    const initialEdges: Edge[] = [];
    currentSteps.forEach((step) => {
      step.nextSteps.forEach((dep) => {
        const toId = typeof dep === 'string' ? dep : dep.toId;
        const label = typeof dep === 'string' ? undefined : dep.label;
        const style = typeof dep === 'string' ? edgeStyle : (dep.style || edgeStyle);
        const showArrow = typeof dep === 'string' ? showArrows : (dep.showArrow !== undefined ? dep.showArrow : showArrows);

        initialEdges.push({
          id: `e:${step.id}:${toId}`,
          source: step.id,
          target: toId,
          label: label,
          type: style,
          animated: true,
          labelStyle: { fill: '#64748b', fontWeight: 700, fontSize: 10 },
          labelBgStyle: { fill: '#f8fafc', fillOpacity: 0.8 },
          labelBgPadding: [4, 2],
          labelBgBorderRadius: 4,
          style: { stroke: '#0f172a', strokeWidth: 2 },
          markerEnd: showArrow ? {
            type: MarkerType.ArrowClosed,
            color: '#0f172a',
          } : undefined,
        });
      });
    });

    return getLayoutedElements(initialNodes, initialEdges, direction);
  }, []);

  const deleteNode = useCallback((id: string) => {
    if (!onUpdateSteps) return;
    const newSteps = steps.filter(s => s.id !== id).map(s => ({
      ...s,
      nextSteps: s.nextSteps.filter(ns => {
        const toId = typeof ns === 'string' ? ns : ns.toId;
        return toId !== id;
      })
    }));
    onUpdateSteps(newSteps);
  }, [steps, onUpdateSteps]);

  const updateNode = useCallback((id: string, updates: Partial<ProcessStep>) => {
    if (!onUpdateSteps) return;
    const newSteps = steps.map(s => s.id === id ? { ...s, ...updates } : s);
    onUpdateSteps(newSteps);
  }, [steps, onUpdateSteps]);

  // Sync steps to nodes/edges
  useEffect(() => {
    const currentJson = JSON.stringify(steps);
    if (currentJson === lastStepsJson) return;

    const { nodes: layoutedNodes, edges: layoutedEdges } = generateLayout(steps, 'TB', deleteNode, updateNode, globalEdgeStyle, globalShowArrows);
    
    setNodes((prevNodes) => {
      // If we already had nodes, try to preserve positions and sizes of existing ones
      if (prevNodes.length > 0) {
        return layoutedNodes.map(ln => {
          const existing = prevNodes.find(n => n.id === ln.id);
          if (existing) {
            return { 
              ...ln, 
              position: existing.position,
              style: existing.style 
            };
          }
          return ln;
        });
      }
      return layoutedNodes;
    });
    
    setEdges(layoutedEdges);
    setLastStepsJson(currentJson);
  }, [steps, lastStepsJson, generateLayout, setNodes, setEdges, deleteNode, updateNode, globalEdgeStyle, globalShowArrows]);

  const onConnect = useCallback((params: Connection) => {
    if (!onUpdateSteps || !params.source || !params.target) return;
    
    const newSteps = steps.map(step => {
      if (step.id === params.source) {
        // Avoid duplicate nextSteps
        const exists = step.nextSteps.some(dep => (typeof dep === 'string' ? dep : dep.toId) === params.target);
        if (!exists) {
          return {
            ...step,
            nextSteps: [...step.nextSteps, { toId: params.target!, style: globalEdgeStyle as any, showArrow: globalShowArrows }]
          };
        }
      }
      return step;
    });
    
    onUpdateSteps(newSteps);
  }, [steps, onUpdateSteps, globalEdgeStyle, globalShowArrows]);

  const onEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    setSelectedEdgeId(edge.id);
  }, []);

  const updateEdge = useCallback((edgeId: string, updates: Partial<Dependency>) => {
    if (!onUpdateSteps) return;
    const edge = edges.find(e => e.id === edgeId);
    if (!edge) return;
    
    const sourceId = edge.source;
    const targetId = edge.target;
    
    const newSteps = steps.map(step => {
      if (step.id === sourceId) {
        return {
          ...step,
          nextSteps: step.nextSteps.map(dep => {
            const toId = typeof dep === 'string' ? dep : dep.toId;
            if (toId === targetId) {
              const baseDep = typeof dep === 'string' ? { toId } : dep;
              return { ...baseDep, ...updates };
            }
            return dep;
          })
        };
      }
      return step;
    });
    onUpdateSteps(newSteps);
  }, [steps, onUpdateSteps, edges]);

  const deleteEdge = useCallback((edgeId: string) => {
    if (!onUpdateSteps) return;
    const edge = edges.find(e => e.id === edgeId);
    if (!edge) return;
    
    const sourceId = edge.source;
    const targetId = edge.target;
    
    const newSteps = steps.map(step => {
      if (step.id === sourceId) {
        return {
          ...step,
          nextSteps: step.nextSteps.filter(dep => (typeof dep === 'string' ? dep : dep.toId) !== targetId)
        };
      }
      return step;
    });
    onUpdateSteps(newSteps);
    setSelectedEdgeId(null);
  }, [steps, onUpdateSteps, edges]);

  const resetLayout = (direction: 'TB' | 'LR') => {
    const { nodes: layoutedNodes, edges: layoutedEdges } = generateLayout(steps, direction, deleteNode, updateNode, globalEdgeStyle, globalShowArrows);
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  };

  const addNewStep = () => {
    if (!onUpdateSteps) return;
    const newId = `step-${Date.now()}`;
    const newStep: ProcessStep = {
      id: newId,
      label: 'New Process Step',
      actor: 'Unassigned',
      description: 'Describe the action to be performed here.',
      nextSteps: []
    };
    onUpdateSteps([...steps, newStep]);
  };

  return (
    <div className="h-full w-full bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden shadow-inner relative flex flex-col">
      {/* Top Toolbar */}
      <div className="bg-white border-b border-slate-200 p-2 flex items-center justify-between z-20 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Layout:</p>
            <button 
              onClick={() => resetLayout('TB')}
              className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[9px] font-bold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              VERTICAL
            </button>
            <button 
              onClick={() => resetLayout('LR')}
              className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[9px] font-bold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              HORIZONTAL
            </button>
          </div>
          <div className="h-4 w-px bg-slate-200" />
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Global Style:</p>
            <div className="flex gap-1 bg-slate-50 p-0.5 rounded-md border border-slate-200">
              {['smoothstep', 'step', 'straight', 'bezier'].map(s => (
                <button
                  key={s}
                  onClick={() => setGlobalEdgeStyle(s)}
                  className={cn(
                    "px-2 py-0.5 rounded text-[8px] font-bold uppercase transition-all",
                    globalEdgeStyle === s ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 ml-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Arrows:</p>
            <button
              onClick={() => setGlobalShowArrows(!globalShowArrows)}
              className={cn(
                "w-7 h-4 rounded-full relative transition-colors",
                globalShowArrows ? "bg-emerald-500" : "bg-slate-300"
              )}
            >
              <div className={cn(
                "absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all",
                globalShowArrows ? "left-3.5" : "left-0.5"
              )} />
            </button>
          </div>
        </div>

        <button 
          onClick={addNewStep}
          className="px-3 py-1.5 bg-emerald-500 border border-emerald-600 rounded-lg text-[10px] font-bold text-white hover:bg-emerald-600 shadow-sm flex items-center gap-1.5 transition-all active:scale-95"
        >
          <Plus className="w-3.5 h-3.5" />
          ADD NEW STEP
        </button>
      </div>

      <div className="flex-1 relative overflow-hidden">
        {/* Floating Help Card */}
        <div className={cn(
          "absolute bottom-4 left-4 z-10 bg-white/90 backdrop-blur-sm rounded-xl border border-slate-200 shadow-lg transition-all duration-300 overflow-hidden",
          showTips ? "w-[180px] p-3" : "w-10 h-10 flex items-center justify-center cursor-pointer hover:bg-slate-50"
        )}>
          {showTips ? (
            <>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Settings2 className="w-3 h-3" /> Quick Tips
                </p>
                <button onClick={() => setShowTips(false)} className="text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-100">
                  <X className="w-3 h-3" />
                </button>
              </div>
              <ul className="text-[9px] text-slate-400 space-y-1.5 leading-relaxed">
                <li className="flex gap-2"><span>•</span> <span>Drag boxes to reposition</span></li>
                <li className="flex gap-2"><span>•</span> <span>Select a box to resize/edit</span></li>
                <li className="flex gap-2"><span>•</span> <span>Drag from bottom handle to link</span></li>
                <li className="flex gap-2"><span>•</span> <span>Click a connection to customize</span></li>
                <li className="flex gap-2"><span>•</span> <span>Scroll to pan up/down</span></li>
              </ul>
            </>
          ) : (
            <button onClick={() => setShowTips(true)} className="w-full h-full flex items-center justify-center text-slate-400 hover:text-slate-600" title="Show Quick Tips">
              <Settings2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Edge Customization Panel */}
        <AnimatePresence>
          {selectedEdgeId && (
            <motion.div
              initial={{ x: 300 }}
              animate={{ x: 0 }}
              exit={{ x: 300 }}
              className="absolute right-4 top-4 bottom-4 w-72 bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl shadow-2xl z-50 p-5 flex flex-col gap-5 overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-widest flex items-center gap-2">
                  <ArrowRight className="w-3.5 h-3.5 text-emerald-500" /> Connection Settings
                </h4>
                <button 
                  onClick={() => setSelectedEdgeId(null)} 
                  className="p-1 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600"
                >
                  <Plus className="w-4 h-4 rotate-45" />
                </button>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2.5 block flex items-center gap-1.5">
                    <TypeIcon className="w-3 h-3" /> Connection Label
                  </label>
                  <input 
                    type="text"
                    placeholder="e.g., Success, Data, Trigger"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 transition-all"
                    value={edges.find(e => e.id === selectedEdgeId)?.label as string || ''}
                    onChange={(e) => updateEdge(selectedEdgeId, { label: e.target.value })}
                  />
                </div>

                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2.5 block">Visual Style Override</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['smoothstep', 'step', 'straight', 'bezier'].map(s => (
                      <button
                        key={s}
                        onClick={() => updateEdge(selectedEdgeId, { style: s as any })}
                        className={cn(
                          "px-2 py-2 rounded-lg text-[9px] font-bold uppercase border transition-all",
                          edges.find(e => e.id === selectedEdgeId)?.type === s 
                            ? "bg-slate-900 text-white border-slate-900 shadow-md" 
                            : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Show Direction Arrow</span>
                  <button
                    onClick={() => {
                      const edge = edges.find(e => e.id === selectedEdgeId);
                      updateEdge(selectedEdgeId, { showArrow: !edge?.markerEnd });
                    }}
                    className={cn(
                      "w-9 h-5 rounded-full relative transition-colors",
                      edges.find(e => e.id === selectedEdgeId)?.markerEnd ? "bg-emerald-500" : "bg-slate-300"
                    )}
                  >
                    <div className={cn(
                      "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                      edges.find(e => e.id === selectedEdgeId)?.markerEnd ? "left-5" : "left-1"
                    )} />
                  </button>
                </div>

                <button
                  onClick={() => deleteEdge(selectedEdgeId)}
                  className="w-full py-2.5 bg-red-50 text-red-600 border border-red-100 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-red-100 transition-colors flex items-center justify-center gap-2 mt-4"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remove Connection
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgeClick={onEdgeClick}
        fitView
        minZoom={0.2}
        maxZoom={2}
        panOnScroll={true}
        zoomOnScroll={false}
        zoomOnDoubleClick={true}
      >
        <Background color="#cbd5e1" gap={20} />
        <Controls />
      </ReactFlow>
    </div>
    </div>
  );
};

export default ProcessFlowDiagram;
