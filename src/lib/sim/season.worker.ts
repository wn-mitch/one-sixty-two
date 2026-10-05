import { simulateSeason } from './season.ts';
import type { WorkerRequest, WorkerResponse } from './types.ts';

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
 const { runId, input } = event.data;
 const send = (message: WorkerResponse) => self.postMessage(message);
 try {
  const result = simulateSeason(input, game => send({ runId, type: 'progress', completed: game.number }));
  send({ runId, type: 'result', result });
 } catch (error) {
  send({ runId, type: 'error', message: error instanceof Error ? error.message : 'Simulation failed' });
 }
};
