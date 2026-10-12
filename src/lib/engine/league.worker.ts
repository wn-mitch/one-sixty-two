import { loadEngine, simulateLeagueChapter } from './browser.ts';
import type { LeagueWorkerRequest, LeagueWorkerResponse } from '../sim/league-types.ts';

self.onmessage = async (event: MessageEvent<LeagueWorkerRequest>) => {
 const { runId, input } = event.data;
 const send = (message: LeagueWorkerResponse) => self.postMessage(message);
 try {
  await loadEngine();
  const result = simulateLeagueChapter(input, completed => send({ runId, type: 'progress', completed }));
  send({ runId, type: 'result', result });
 } catch (error) {
  send({ runId, type: 'error', message: error instanceof Error ? error.message : 'Simulation failed' });
 }
};
