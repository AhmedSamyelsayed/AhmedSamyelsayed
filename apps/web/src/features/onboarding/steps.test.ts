import { describe, expect, it } from 'vitest';
import { nextStep, previousStep, resumeStep } from './steps';

describe('wizard steps', () => {
  it('moves forward and back and stops at the ends', () => {
    expect(nextStep('profile')).toBe('working-time');
    expect(nextStep('done')).toBe('done');
    expect(previousStep('profile')).toBeNull();
    expect(previousStep('team')).toBe('job-analysis');
    expect(nextStep('employees')).toBe('job-analysis');
  });

  it('resumes from the saved step or starts over', () => {
    expect(resumeStep('structure')).toBe('structure');
    expect(resumeStep('ai')).toBe('profile');
    expect(resumeStep(null)).toBe('profile');
  });
});
