export interface ProjectInput {
  projectText: string;
  track: string;
  jdAnalysis?: JdAnalysis;
  source: "paste" | "resume" | "demo";
}

export interface JdAnalysis {
  capabilities: string[];
  focusPoints: string[];
}

export interface ResumeProject {
  name: string;
  text: string;
  highlights: string[];
}

export interface ResumeExtraction {
  projects: ResumeProject[];
}

export interface ProjectRewrite {
  rewrite: string;
  notes: string[];
}

export interface Feedback {
  score: number;
  star: {
    situation: string;
    task: string;
    action: string;
    result: string;
  };
  quotes: { said: string; issue: string; rewrite: string }[];
  missed: string[];
  oneTip: string;
}

export interface Round {
  index: number;
  question: string;
  anchor: string;
  answer: string;
  followups: { question: string; answer: string }[];
  feedback?: Feedback;
  skipped?: boolean;
}

export interface InterviewSession {
  id: string;
  userId?: string;
  input: ProjectInput;
  rounds: Round[];
  status: "in_progress" | "completed";
  startedAt: string;
  finishedAt?: string;
}

export interface Report {
  radar: {
    事实与数据: number;
    个人贡献: number;
    技术深度: number;
    结果导向: number;
    逻辑表达: number;
  };
  patterns: string[];
  plan7d: { day: number; action: string }[];
  checklist: string[];
}

export interface TrackPreset {
  id: string;
  name: string;
  capabilities: string[];
  seedQuestions: string[];
}
