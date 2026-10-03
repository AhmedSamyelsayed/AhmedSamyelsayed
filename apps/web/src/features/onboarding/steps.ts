export const WIZARD_STEPS = [
  'profile',
  'working-time',
  'structure',
  'employees',
  'team',
  'done',
] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export function isWizardStep(value: string | undefined): value is WizardStep {
  return (WIZARD_STEPS as readonly string[]).includes(value ?? '');
}

export function nextStep(step: WizardStep): WizardStep {
  return WIZARD_STEPS[Math.min(WIZARD_STEPS.indexOf(step) + 1, WIZARD_STEPS.length - 1)]!;
}

export function previousStep(step: WizardStep): WizardStep | null {
  const i = WIZARD_STEPS.indexOf(step);
  return i > 0 ? WIZARD_STEPS[i - 1]! : null;
}

/** Where to resume: the saved step, or the first step for unknown values. */
export function resumeStep(saved: string | null | undefined): WizardStep {
  return isWizardStep(saved ?? undefined) ? (saved as WizardStep) : 'profile';
}
