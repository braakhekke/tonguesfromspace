import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import './wizard.css';
import * as api from './api';
import type { State, Step } from './api';
import { go } from './nav';
import { Dashboard } from './Dashboard';
import { RegionScreen } from './screens/RegionScreen';
import { RecordScreen } from './screens/RecordScreen';
import { OutlineScreen } from './screens/OutlineScreen';
import { PlacementScreen } from './screens/PlacementScreen';
import { SeasonScreen } from './screens/SeasonScreen';
import { ScenesScreen } from './screens/ScenesScreen';
import { LayersScreen } from './screens/LayersScreen';
import { LaterScreen } from './screens/LaterScreen';

const PHASES = ['', 'Map view and everything on it', '3D view and everything on it', 'Content', 'About and Sources'];
export type ScreenProps = { st: State; step: Step; patch: any; setPatch: (p: any) => void; setBlock: (why: string | null) => void };

const Check = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
const STATUS_WORD: Record<string, string> = { done: 'done', todo: 'to do', review: 'proposed', stale: 'changed upstream: look again', blocked: 'waiting', attention: 'a check fails', unavailable: 'not built yet' };

export function Wizard({ parts }: { parts: string[] }) {
  const [region, glacier, stepId] = parts;
  if (!region) return <Dashboard />;
  return <Walkthrough key={`${region}/${glacier}`} region={region} glacier={glacier && glacier !== '-' ? glacier : null} stepId={stepId ?? null} />;
}

function Walkthrough({ region, glacier, stepId }: { region: string; glacier: string | null; stepId: string | null }) {
  const [st, setSt] = useState<State | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const reload = () => api.state(region, glacier).then(setSt).catch((e) => setErr(e.message));
  useEffect(() => { reload(); }, [region, glacier]);
  const step = useMemo(() => st?.steps.find((s) => s.id === (stepId ?? st.next)) ?? st?.steps[0] ?? null, [st, stepId]);
  useEffect(() => { if (st && !stepId && step) go(`/onboard/${region}/${glacier ?? '-'}/${step.id}`, '', true); }, [st?.next]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 4200); return () => clearTimeout(t); } }, [toast]);

  if (err) return <div class="dash"><h1>Something is wrong</h1><p class="lede">{err}</p><a class="btn line" href="/onboard">Back to the overview</a></div>;
  if (!st || !step) return <div class="dash"><p>Loading…</p></div>;

  const openStep = (id: string) => go(`/onboard/${region}/${glacier ?? '-'}/${id}`);
  const dotClass = (s: Step) => (s.id === st.next && s.status !== 'done' ? 'next' : s.status);
  const phases = [...new Set(st.steps.map((s) => s.phase))];
  const title = st.glacier?.name ?? st.region.name;

  return (
    <div class="wz">
      <nav class="wz-rail" aria-label="Steps">
        <div class="head">
          <a href="/onboard">← All regions</a>
          <h1>{title}</h1>
          <small>{st.glacier ? st.region.name : 'Region'} · {st.done} of {st.total} steps done</small>
          <div class="wz-bar"><b style={`width:${(st.done / Math.max(1, st.total)) * 100}%`} /></div>
        </div>
        {phases.map((ph) => (
          <div key={ph}>
            <div class="wz-phase"><span class="num">{String(ph).padStart(2, '0')}</span>{PHASES[ph]}</div>
            {st.steps.filter((s) => s.phase === ph).map((s) => (
              <button type="button" key={s.id} class="wz-step" aria-current={s.id === step.id ? 'step' : undefined} disabled={s.status === 'unavailable'} onClick={() => openStep(s.id)}>
                <span class={'dot ' + dotClass(s)}><Check /></span>
                <span>{s.title}<small>{STATUS_WORD[s.status]}</small></span>
              </button>
            ))}
          </div>
        ))}
      </nav>
      {/* keyed by step: each step starts with clean state by remounting, not by an effect that races its screen */}
      <StepFrame key={step.id} st={st} step={step} region={region} glacier={glacier}
        onSaved={async (staled) => {
          const fresh = await api.state(region, glacier);
          setSt(fresh);
          setToast(staled.length ? `Confirmed. ${staled.length} later ${staled.length === 1 ? 'step is' : 'steps are'} marked stale: ${staled.map((x) => fresh.steps.find((y) => y.id === x)?.title ?? x).join(', ')}.` : 'Confirmed.');
          if (fresh.next && fresh.next !== step.id) setTimeout(() => openStep(fresh.next!), 700);
          else if (!fresh.next) setToast(`Confirmed. All ${fresh.total} steps built so far are done for ${title}; the later phases are not built yet.`);
        }}
        onError={setToast} />
      {toast && <div class="toast" role="status">{toast}</div>}
    </div>
  );
}

type FrameProps = { st: State; step: Step; region: string; glacier: string | null; onSaved: (staled: string[]) => Promise<void>; onError: (m: string) => void };

function StepFrame({ st, step, region, glacier, onSaved, onError }: FrameProps) {
  const [patch, setPatch] = useState<any>(null);
  const [block, setBlock] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [seen, setSeen] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [staleHint, setStaleHint] = useState<string[]>([]);
  useEffect(() => { api.dependents(region, glacier, step.id).then(setStaleHint).catch(() => {}); }, []);

  const looked = step.look.length === 0 || step.look.every((_, i) => seen[i]);
  const canConfirm = step.status !== 'unavailable' && step.status !== 'blocked' && patch !== null && !block && reason.trim().length >= 3 && looked && !busy;
  const confirm = async () => {
    if (!canConfirm) return;
    setBusy(true);
    try {
      const r = await api.confirmStep(region, glacier, step.id, patch, reason.trim());
      await onSaved(r.staled);
    } catch (e) { onError((e as Error).message); } finally { setBusy(false); }
  };
  const confirmRef = useRef(confirm);
  confirmRef.current = confirm;
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); confirmRef.current(); } };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, []);

  const props: ScreenProps = { st, step, patch, setPatch, setBlock };
  const Screen = { region: RegionScreen, record: RecordScreen, outline: OutlineScreen, placement: PlacementScreen, season: SeasonScreen, scenes: ScenesScreen, layers: LayersScreen, later: LaterScreen }[step.screen as 'region'] ?? LaterScreen;

  return (
    <>
      <main class="wz-main">
        <div class="wz-top">
          <div class="lab">Phase {step.phase} · {PHASES[step.phase]}</div>
          <h2>{step.title}</h2>
          <p>{step.why}</p>
          {st.proposals?.[step.id] && step.status !== 'done' && (
            <p class="proposal"><b>Proposal ready.</b> {st.proposals[step.id]!.note} Nothing is saved until you confirm; change anything that looks wrong.</p>
          )}
        </div>
        <div class="wz-stage"><Screen {...props} /></div>
      </main>

      <aside class="wz-side">
        {step.look.length > 0 && (
          <section>
            <h3>What to look for</h3>
            <ul class="look" role="group">
              {step.look.map((t, i) => (
                <li key={i} role="checkbox" aria-checked={!!seen[i]} tabIndex={0} onClick={() => setSeen({ ...seen, [i]: !seen[i] })} onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), setSeen({ ...seen, [i]: !seen[i] }))}><i />{t}</li>
              ))}
            </ul>
          </section>
        )}
        <section>
          <h3>Automatic checks</h3>
          {step.status === 'blocked' && <p class="note">Waiting for: {step.blockedBy.map((b) => st.steps.find((s) => s.id === b)?.title ?? b).join(', ')}.</p>}
          <ul class="checks">
            {step.problems.length === 0 && !block && step.status !== 'blocked' && step.status !== 'done' && <li class="plain"><span class="note">Checked again when you confirm.</span></li>}
            {step.problems.map((p) => <li key={p}><span class="bad">!</span>{p}</li>)}
            {block && <li><span class="bad">!</span>{block}</li>}
            {step.status === 'done' && !block && step.problems.length === 0 && <li><span class="ok">✓</span>All checks pass.</li>}
          </ul>
        </section>
        {staleHint.length > 0 && (
          <section><div class="warn">Changing this will mark {staleHint.length} finished {staleHint.length === 1 ? 'step' : 'steps'} stale: {staleHint.map((s) => st.steps.find((x) => x.id === s)?.title ?? s).join(', ')}. Their pictures and checks are redone.</div></section>
        )}
        {st.done === st.total && (
          <section><p class="proposal"><b>Everything built so far is done for {st.glacier?.name ?? st.region.name}.</b> The steps after this one (3D, texts, About) are not built yet. <a href="/onboard">Back to the overview</a></p></section>
        )}
        {step.confirmation && (
          <section><h3>Confirmed</h3><p class="note" style="margin:0">{step.confirmation.at} by {step.confirmation.by}: “{step.confirmation.reason}”{step.status === 'stale' ? ' (stale)' : ''}</p></section>
        )}
        <section>
          <h3>Your confirmation</h3>
          <textarea placeholder="Why is this right? (stored with the result)" value={reason} onInput={(e) => setReason((e.target as HTMLTextAreaElement).value)} aria-label="Reason" />
          <div class="wz-actions">
            <button type="button" class="btn" disabled={!canConfirm} onClick={confirm}>{busy ? 'Saving…' : 'Looks good, confirm'} <kbd>⌘↵</kbd></button>
            {!canConfirm && step.status !== 'unavailable' && <p class="note" style="margin:0">{patch === null ? 'Make or accept a proposal first. ' : ''}{!looked ? 'Tick what you looked at. ' : ''}{reason.trim().length < 3 ? 'Write a reason. ' : ''}</p>}
          </div>
        </section>
      </aside>
    </>
  );
}
