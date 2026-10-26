/**
 * A picture box you already know, as the proposal for the placement step: `propose-box <region> <glacier> <S> <W> <N> <E> "<why>"`.
 * The tip of an earlier proposal is kept. Like every proposal it is not data until it is confirmed in the walkthrough.
 */
import { loadCtx } from './engine';
import { readProposals, writeProposal } from './proposals';
import { Bounds } from './shared/schema';
import { imageGrid } from './shared/geo';

export function proposeBox(region: string, glacier: string, box: [[number, number], [number, number]], note: string, tip?: [number, number]) {
  const b = Bounds.parse(box); // south < north, west < east, within range
  loadCtx(region, glacier); // the glacier must exist
  const prev = readProposals(region, glacier)['glacier.placement']?.data;
  const keep = tip ?? prev?.tip;
  if (!keep) throw new Error('No tip to keep: run propose-glamos first, or give the tip as the last two arguments.');
  writeProposal(region, glacier, 'glacier.placement', 'propose-box', note, { tip: keep, pictureBox: b });
  const g = imageGrid(b);
  return { box: b, tip: keep as [number, number], w: g.w, h: g.h, requests: g.tiles.length };
}
