import { simulateSeries } from './series.ts';
import type { SeriesWorkerRequest, SeriesWorkerResponse } from './series-types.ts';

self.onmessage = (event: MessageEvent<SeriesWorkerRequest>) => {
 const { runId, input } = event.data;
 const send = (message: SeriesWorkerResponse) => self.postMessage(message);
 try {
  const result = simulateSeries(input, progress => send({ runId, type: 'progress', progress }));
  send({ runId, type: 'result', result });
 } catch (error) {
  send({ runId, type: 'error', message: error instanceof Error ? error.message : 'Series simulation failed' });
 }
};
