import { defineParams } from '@sveltejs/kit/params';

export const params = defineParams({
 /** The Classic game lives at `/classic`; the bare `/` is its welcome screen. */
 classic: (param: string) => param === 'classic' ? param : undefined
});
