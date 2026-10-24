import { buildLeagueSchedule, loadEngine, simulateLeagueSegment } from './browser.ts';
import type { LeagueWorkerRequest, LeagueWorkerResponse } from '../sim/league-types.ts';

self.onmessage = async (event: MessageEvent<LeagueWorkerRequest>) => {
 const { runId, input } = event.data;
 const send = (message: LeagueWorkerResponse) => self.postMessage(message);
 try {
  await loadEngine();
  const result = simulateLeagueSegment(input, completed => send({ runId, type: 'progress', completed }));
  // The season's fixtures come back with each segment, so the page can lay out the whole schedule without the engine.
  send({ runId, type: 'result', result, schedule: buildLeagueSchedule(input.seed, input.rivals) });
 } catch (error) {
  send({ runId, type: 'error', message: error instanceof Error ? error.message : 'Simulation failed' });
 }
};
