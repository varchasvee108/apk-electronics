import type { Check, Lesson } from '../lessons';
import type { Question } from '../quizzes';
import type { CircuitDoc, Props } from '../types';

export type TrackId = 'fundamentals' | 'ics' | 'arduino' | 'raspberry-pi' | 'engineering';
export type LearningMode = 'simulation' | 'guide';
export interface LearningUnit {
  id: string;
  title: string;
  summary: string;
  track: TrackId;
}
export interface LearningTrack {
  id: TrackId | 'all';
  title: string;
  description: string;
  icon: string;
}
export type Experiment = ({ kind: 'gate'; chip: string } | { kind: 'arduino'; program: string } | { kind: 'example' | 'lesson'; id: string }) & {
  patches?: Record<string, Props>;
};
export interface LessonContent {
  id: string;
  unit: string;
  title: string;
  goal: string;
  minutes: number;
  level: 'Beginner' | 'Intermediate';
  mode: LearningMode;
  prerequisites: string[];
  intro: string[];
  equation: string;
  worked: string;
  observe: string;
  mistake: string;
  steps: { action: string; why: string }[];
  questions: Question[];
  experiment?: Experiment;
  truth?: 'nand' | 'xor' | 'or';
  gpio?: boolean;
  resources?: { label: string; url: string }[];
  bom?: string[];
  code?: { language: string; text: string };
}
export type ExtraCheck =
  | { kind: 'serialContains'; part: string; text: string; label: string }
  | { kind: 'traceGain'; min: number; max: number; label: string }
  /** A text value the part reports (an LCD line…) contains the given text. */
  | { kind: 'extraText'; part: string; key: string; includes: string; label: string };
export type LearningCheck = Check | ExtraCheck;
export type PracticeLesson = Omit<Lesson, 'checks'> & { checks: LearningCheck[] };
export interface LearningLesson extends Omit<LessonContent, 'experiment'> {
  track: TrackId;
  mechanism: string;
  hints: string[];
  checks: LearningCheck[];
  challenge?: boolean;
  build?: () => CircuitDoc;
}
export interface Foundation {
  model: string;
  equation: string;
  worked: string;
  observe: string;
  mistake: string;
  question: [string, string[], number, string];
}
