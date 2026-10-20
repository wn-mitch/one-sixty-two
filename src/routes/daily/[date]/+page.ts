import { error } from '@sveltejs/kit';
import { isDailyDate } from '#lib/game/daily.ts';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) => {
	if (!isDailyDate(params.date)) error(404, 'That daily does not exist.');
	return { date: params.date };
};
