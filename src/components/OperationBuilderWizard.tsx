import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronRight, ChevronLeft, Sparkles, Brain, Target, Activity, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { GoogleGenAI } from '@google/genai';
import Markdown from 'react-markdown';

interface OperationBuilderWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (finalParameters: string) => void;
  ai: GoogleGenAI;
}

export function OperationBuilderWizard({ isOpen, onClose, onComplete, ai }: OperationBuilderWizardProps) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [data, setData] = useState({
    baseline: {
      trigger: '',
      inputs: '',
      decisionPoints: '',
      outputs: '',
      approvalSteps: '',
      exceptionPaths: '',
      timeSpent: '',
      commonDefects: ''
    },
    draft: '',
    draftFeedback: {
      contextChanges: '',
      incorrectSuggestions: '',
      formatChanges: '',
      importantControls: ''
    },
    autonomyProposal: '',
    autonomyFeedback: '',
    optimizationProposal: '',
    optimizationFeedback: '',
  });

  if (!isOpen) return null;

  const updateBaseline = (field: keyof typeof data.baseline, value: string) => {
    setData(prev => ({ ...prev, baseline: { ...prev.baseline, [field]: value } }));
  };

  const updateDraftFeedback = (field: keyof typeof data.draftFeedback, value: string) => {
    setData(prev => ({ ...prev, draftFeedback: { ...prev.draftFeedback, [field]: value } }));
  };

  const generateDraft = async () => {
    setLoading(true);
    setError(null);
    try {
      const prompt = `You are an expert AI Systems Architect. Based on the human-baseline process, draft a comprehensive description of the operation. Extract, summarize, and classify the workflow.

CRITICAL DESIGN COMPONENTS:
The AI-assisted workflow MUST be structured using the following core layers:
- Trigger: Starts the process (email, upload, form submission, schedule, API event)
- Context layer: Supplies relevant documents, metadata, history, rules
- Instruction layer: Tells the AI what task to perform and how
- Validation layer: Checks completeness, formatting, thresholds, contradictions
- Decision layer: Applies business rules to determine next step
- Human review layer: Required for exceptions, high-risk items, or approvals
- Audit layer: Stores prompt, inputs, outputs, approvals, timestamps, evidence
- Feedback layer: Captures corrections and converts them into workflow improvements

Human Baseline:
- Trigger: ${data.baseline.trigger}
- Inputs: ${data.baseline.inputs}
- Decision Points: ${data.baseline.decisionPoints}
- Outputs: ${data.baseline.outputs}
- Approval Steps: ${data.baseline.approvalSteps}
- Exception Paths: ${data.baseline.exceptionPaths}
- Time Spent: ${data.baseline.timeSpent}
- Common Defects: ${data.baseline.commonDefects}

Provide a clear, structured draft of the operation.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: prompt,
      });
      
      setData(prev => ({ ...prev, draft: response.text || '' }));
      setStep(3);
    } catch (err) {
      console.error(err);
      setError("Failed to generate draft. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const generateAutonomy = async () => {
    setLoading(true);
    setError(null);
    try {
      const prompt = `You are an expert AI Systems Architect. Based on the operation draft and the user's feedback, determine the rules for controlled autonomy.

Operation Draft:
${data.draft}

User Feedback on Draft:
- Context Changes: ${data.draftFeedback.contextChanges}
- Incorrect Suggestions: ${data.draftFeedback.incorrectSuggestions}
- Format Changes: ${data.draftFeedback.formatChanges}
- Important Controls: ${data.draftFeedback.importantControls}

Task: Propose controlled autonomy rules. Identify low-risk cases where the AI can take action, anomalies to flag, and cases requiring human review. Provide a structured proposal.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: prompt,
      });
      
      setData(prev => ({ ...prev, autonomyProposal: response.text || '' }));
      setStep(4);
    } catch (err) {
      console.error(err);
      setError("Failed to generate autonomy proposal.");
    } finally {
      setLoading(false);
    }
  };

  const generateOptimization = async () => {
    setLoading(true);
    setError(null);
    try {
      const prompt = `You are an expert AI Systems Architect. Based on the operation details and autonomy rules, propose a continuous optimization plan.

Autonomy Rules:
${data.autonomyProposal}

User Exceptions/Feedback:
${data.autonomyFeedback}

Task: Define how to track outcomes, error rates, overrides, review burdens, and edge cases for this specific operation. Provide a structured optimization plan.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: prompt,
      });
      
      setData(prev => ({ ...prev, optimizationProposal: response.text || '' }));
      setStep(5);
    } catch (err) {
      console.error(err);
      setError("Failed to generate optimization proposal.");
    } finally {
      setLoading(false);
    }
  };

  const generateFinal = async () => {
    setLoading(true);
    setError(null);
    try {
      const prompt = `You are an expert AI Systems Architect. Using the 4-stage refinement process we just completed, compile a well-rounded, highly detailed description of the "Operation Parameters".

This description will be used as the master prompt to generate an AI Agent team architecture. It must be a single, comprehensive narrative or structured document that includes:
1. The core task and workflow.
2. The rules, schemas, and escalation thresholds.
3. The controlled autonomy guidelines.
4. The continuous optimization and tracking metrics.

CRITICAL WORKFLOW CONSTRAINTS:
The resulting workflow MUST explicitly incorporate and address the following:
- A recurring structure
- High volume processing capabilities
- Known quality standards
- Measurable error conditions
- Human review ONLY where needed

CORE DESIGN COMPONENTS:
The final workflow MUST be structured using these specific layers:
- Trigger: Starts the process (email, upload, form submission, schedule, API event)
- Context layer: Supplies relevant documents, metadata, history, rules
- Instruction layer: Tells the AI what task to perform and how
- Validation layer: Checks completeness, formatting, thresholds, contradictions
- Decision layer: Applies business rules to determine next step
- Human review layer: Required for exceptions, high-risk items, or approvals
- Audit layer: Stores prompt, inputs, outputs, approvals, timestamps, evidence
- Feedback layer: Captures corrections and converts them into workflow improvements

Here is the context gathered from the 4-stage refinement process:

1. Operation Draft:
${data.draft}

2. Controlled Autonomy Rules:
${data.autonomyProposal}

3. Optimization Plan:
${data.optimizationProposal}

4. Final User Feedback:
${data.optimizationFeedback}

Draft a final, comprehensive "Operation Parameters" document.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: prompt,
      });
      
      onComplete(response.text || '');
    } catch (err) {
      console.error(err);
      setError("Failed to generate final parameters.");
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (step === 0) setStep(1);
    else if (step === 1) setStep(2);
    else if (step === 2) generateDraft();
    else if (step === 3) generateAutonomy();
    else if (step === 4) generateOptimization();
    else if (step === 5) generateFinal();
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const renderStepContent = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center h-64 space-y-4">
          <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
          <p className="text-slate-600 font-medium">AI is analyzing and synthesizing...</p>
        </div>
      );
    }

    switch (step) {
      case 0:
        return (
          <div className="space-y-6 text-center py-8">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Sparkles className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-bold text-slate-900">Design Your AI Operation</h3>
            <p className="text-slate-600 max-w-lg mx-auto leading-relaxed">
              We'll guide you through a 4-stage process to define your workflow, establish human baselines, set AI autonomy rules, and plan for continuous optimization. This ensures a robust, high-volume, and high-quality AI team architecture.
            </p>
            <div className="grid grid-cols-2 gap-4 max-w-lg mx-auto mt-8 text-left">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <Brain className="w-5 h-5 text-slate-400 mb-2" />
                <h4 className="font-bold text-slate-900 text-sm">Structured Context</h4>
                <p className="text-xs text-slate-500 mt-1">Define tasks, inputs, and rules clearly.</p>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <Target className="w-5 h-5 text-slate-400 mb-2" />
                <h4 className="font-bold text-slate-900 text-sm">Controlled Autonomy</h4>
                <p className="text-xs text-slate-500 mt-1">Set boundaries for AI actions and human review.</p>
              </div>
            </div>
          </div>
        );
      case 1:
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900">How the AI Wizard Works</h3>
              <p className="text-sm text-slate-500">Before we begin, here is how the AI will structure your operation.</p>
            </div>
            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 space-y-4">
              <p className="text-sm text-slate-700 leading-relaxed">
                The AI will automatically capture and synthesize the following core elements throughout the next stages:
              </p>
              <ul className="space-y-3 text-sm text-slate-600">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  <span><strong>The Task Definition:</strong> What exact job the AI team is doing.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  <span><strong>The Input Structure:</strong> The context, documents, fields, examples, and constraints it receives.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  <span><strong>The Decision Rules:</strong> When the AI acts, when it suggests, and when a human must approve.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  <span><strong>The Output Standard:</strong> What a successful and high-quality result looks like.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  <span><strong>The Feedback Loop:</strong> How mistakes are captured and used to improve future runs.</span>
                </li>
              </ul>
              <p className="text-sm text-slate-700 leading-relaxed mt-4">
                You won't need to answer these directly upfront. Instead, we'll start by establishing your current human baseline, and the AI will construct these elements for you to review and refine.
              </p>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Stage 1: Human-only baseline</h3>
              <p className="text-sm text-slate-500">Document how the task is currently done to establish a baseline.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Trigger</label>
                <textarea rows={3} className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" value={data.baseline.trigger} onChange={e => updateBaseline('trigger', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Inputs</label>
                <textarea rows={3} className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" value={data.baseline.inputs} onChange={e => updateBaseline('inputs', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Decision Points</label>
                <textarea rows={3} className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" value={data.baseline.decisionPoints} onChange={e => updateBaseline('decisionPoints', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Outputs</label>
                <textarea rows={3} className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" value={data.baseline.outputs} onChange={e => updateBaseline('outputs', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Approval Steps</label>
                <textarea rows={3} className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" value={data.baseline.approvalSteps} onChange={e => updateBaseline('approvalSteps', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Exception Paths</label>
                <textarea rows={3} className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" value={data.baseline.exceptionPaths} onChange={e => updateBaseline('exceptionPaths', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Time Spent</label>
                <textarea rows={3} className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" value={data.baseline.timeSpent} onChange={e => updateBaseline('timeSpent', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Common Defects</label>
                <textarea rows={3} className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" value={data.baseline.commonDefects} onChange={e => updateBaseline('commonDefects', e.target.value)} />
              </div>
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Stage 2: AI Assistant Draft</h3>
              <p className="text-sm text-slate-500">Review the AI's draft and provide feedback.</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 max-h-60 overflow-y-auto text-sm text-slate-700 prose prose-sm max-w-none">
              <Markdown>{data.draft}</Markdown>
            </div>
            <div className="space-y-4">
              <h4 className="font-bold text-slate-900 text-sm">Your Feedback</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Context Changes</label>
                  <textarea className="w-full p-2 border border-slate-200 rounded-lg text-sm" rows={2} value={data.draftFeedback.contextChanges} onChange={e => updateDraftFeedback('contextChanges', e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Incorrect Suggestions & Reasons</label>
                  <textarea className="w-full p-2 border border-slate-200 rounded-lg text-sm" rows={2} value={data.draftFeedback.incorrectSuggestions} onChange={e => updateDraftFeedback('incorrectSuggestions', e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Format Changes</label>
                  <textarea className="w-full p-2 border border-slate-200 rounded-lg text-sm" rows={2} value={data.draftFeedback.formatChanges} onChange={e => updateDraftFeedback('formatChanges', e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Important Controls</label>
                  <textarea className="w-full p-2 border border-slate-200 rounded-lg text-sm" rows={2} value={data.draftFeedback.importantControls} onChange={e => updateDraftFeedback('importantControls', e.target.value)} />
                </div>
              </div>
            </div>
          </div>
        );
      case 4:
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Stage 3: Controlled Autonomy</h3>
              <p className="text-sm text-slate-500">Review the proposed autonomy rules and provide exceptions.</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 max-h-60 overflow-y-auto text-sm text-slate-700 prose prose-sm max-w-none">
              <Markdown>{data.autonomyProposal}</Markdown>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Exceptions & Feedback</label>
              <p className="text-xs text-slate-500 mb-2">Are there any specific cases that should always require human review?</p>
              <textarea className="w-full p-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" rows={3} value={data.autonomyFeedback} onChange={e => setData(prev => ({ ...prev, autonomyFeedback: e.target.value }))} />
            </div>
          </div>
        );
      case 5:
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Stage 4: Continuous Optimization</h3>
              <p className="text-sm text-slate-500">Review the plan for tracking outcomes and improving the system.</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 max-h-60 overflow-y-auto text-sm text-slate-700 prose prose-sm max-w-none">
              <Markdown>{data.optimizationProposal}</Markdown>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Final Feedback</label>
              <p className="text-xs text-slate-500 mb-2">Any final adjustments to the tracking metrics or overall operation?</p>
              <textarea className="w-full p-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" rows={3} value={data.optimizationFeedback} onChange={e => setData(prev => ({ ...prev, optimizationFeedback: e.target.value }))} />
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Operation Parameters Builder</h2>
              <div className="flex items-center gap-1 mt-0.5">
                {[0, 1, 2, 3, 4, 5].map(i => (
                  <div key={i} className={cn("h-1 rounded-full transition-all", i <= step ? "bg-emerald-500 w-4" : "bg-slate-200 w-2")} />
                ))}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
                <X className="w-3 h-3 text-red-600" />
              </div>
              {error}
            </div>
          )}
          {renderStepContent()}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <button
            onClick={handleBack}
            disabled={step === 0 || loading}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors",
              step === 0 || loading ? "text-slate-300 cursor-not-allowed" : "text-slate-600 hover:bg-slate-200 bg-slate-100"
            )}
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          
          <button
            onClick={handleNext}
            disabled={loading}
            className={cn(
              "px-6 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors",
              loading ? "bg-emerald-400 text-white cursor-not-allowed" : "bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm"
            )}
          >
            {loading ? (
              <>Processing <Loader2 className="w-4 h-4 animate-spin" /></>
            ) : step === 5 ? (
              <>Generate Final Parameters <CheckCircle2 className="w-4 h-4" /></>
            ) : step === 0 ? (
              <>Start Interview <ChevronRight className="w-4 h-4" /></>
            ) : (
              <>Next Stage <ChevronRight className="w-4 h-4" /></>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
