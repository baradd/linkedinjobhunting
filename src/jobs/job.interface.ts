export interface Job {
  /** Globally unique, e.g. "remotive:12345" */
  id: string;
  title: string;
  company: string;
  location?: string;
  remote?: boolean;
  url: string;
  source: string;
  tags?: string[];
  description?: string;
  postedAt?: Date;
}

export interface JobSource {
  readonly name: string;
  /** Minimum minutes between two fetches of this source. */
  readonly intervalMinutes: number;
  isEnabled(): boolean;
  fetch(): Promise<Job[]>;
}

export const JOB_SOURCES = Symbol('JOB_SOURCES');
