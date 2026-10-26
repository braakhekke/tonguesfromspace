import type { ScreenProps } from '../Wizard';

export function LaterScreen({ step }: ScreenProps) {
  return (
    <div class="wz-pad">
      <div class="cardx">
        <h4>Specified, not built yet</h4>
        <p style="margin:0 0 8px">{step.why}</p>
        <p class="note">This step is described in docs/SPEC.md. Its screen will use the same pattern as the ones before it: a proposal, a visual checkpoint, automatic checks, your confirmation.</p>
      </div>
    </div>
  );
}
