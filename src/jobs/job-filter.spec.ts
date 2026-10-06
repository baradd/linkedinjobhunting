import { Settings } from '../settings/settings.service';
import { matchesJob } from './job-filter';
import { Job } from './job.interface';

const base: Settings = {
  keywords: ['node.js', 'nodejs', 'node', 'nestjs'],
  excludes: ['intern'],
  locations: [],
  includeRemote: true,
  paused: false,
};

const job = (over: Partial<Job> = {}): Job => ({
  id: 'x:1',
  title: 'Senior Node.js Developer',
  company: 'Acme',
  url: 'https://example.com/1',
  source: 'test',
  ...over,
});

const opts = { matchDescription: true };

describe('matchesJob', () => {
  it('matches keyword in title', () => {
    expect(matchesJob(job(), base, opts)).toBe(true);
  });

  it('matches keyword in tags', () => {
    expect(matchesJob(job({ title: 'Backend Engineer', tags: ['NestJS', 'Postgres'] }), base, opts)).toBe(true);
  });

  it('matches keyword in description only when enabled', () => {
    const j = job({ title: 'Backend Engineer', description: 'We use Node and TypeScript.' });
    expect(matchesJob(j, base, { matchDescription: true })).toBe(true);
    expect(matchesJob(j, base, { matchDescription: false })).toBe(false);
  });

  it('does not match partial words', () => {
    expect(matchesJob(job({ title: 'Anode Chemist', tags: [] }), base, opts)).toBe(false);
    expect(matchesJob(job({ title: 'Java Developer', description: 'Manages nodes in a cluster' }), base, opts)).toBe(false);
  });

  it('respects excludes', () => {
    expect(matchesJob(job({ title: 'Node.js Intern' }), base, opts)).toBe(false);
  });

  it('applies location filter and remote exception', () => {
    const s = { ...base, locations: ['yerevan'] };
    expect(matchesJob(job({ location: 'Yerevan, Armenia' }), s, opts)).toBe(true);
    expect(matchesJob(job({ location: 'Berlin' }), s, opts)).toBe(false);
    expect(matchesJob(job({ location: 'Berlin', remote: true }), s, opts)).toBe(true);
    expect(matchesJob(job({ location: 'Berlin', remote: true }), { ...s, includeRemote: false }, opts)).toBe(false);
  });
});
