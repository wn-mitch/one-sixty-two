import { loadEngine, simulateSeries } from './browser.ts';
import type { SeriesWorkerRequest, SeriesWorkerResponse } from '../sim/series-types.ts';

self.onmessage = async (event: MessageEvent<SeriesWorkerRequest>) => {
 const { runId, input } = event.data;
 const send = (message: SeriesWorkerResponse) => self.postMessage(message);
 try {
  await loadEngine();
  const result = simulateSeries(input, progress => send({ runId, type: 'progress', progress }));
  send({ runId, type: 'result', result });
 } catch (error) {
  send({ runId, type: 'error', message: error instanceof Error ? error.message : 'Series simulation failed' });
 }
};
