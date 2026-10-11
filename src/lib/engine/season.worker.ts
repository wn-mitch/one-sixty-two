import { loadEngine, simulateSeason } from './browser.ts';
import type { WorkerRequest, WorkerResponse } from '../sim/types.ts';

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
 const { runId, input } = event.data;
 const send = (message: WorkerResponse) => self.postMessage(message);
 try {
  await loadEngine();
  const result = simulateSeason(input, completed => send({ runId, type: 'progress', completed }));
  send({ runId, type: 'result', result });
 } catch (error) {
  send({ runId, type: 'error', message: error instanceof Error ? error.message : 'Simulation failed' });
 }
};
