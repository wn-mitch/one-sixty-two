import { defineParams } from '@sveltejs/kit/params';

export const params = defineParams({
 /** The Classic game lives at `/classic` and the daily run at `/daily`; the bare `/` is their welcome screen. */
 classic: (param: string) => param === 'classic' || param === 'daily' ? param : undefined
});
