export interface PositionEntry {
	code: string;
	name: string;
	group: 'hitter' | 'pitcher';
	summary: string;
}

export interface StatEntry {
	code: string;
	name: string;
	direction: 'higher' | 'lower';
	summary: string;
}

export const POSITION_GLOSSARY: readonly PositionEntry[] = [
	{ code: 'C', name: 'Catcher', group: 'hitter', summary: 'Crouches behind home plate and calls pitches.' },
	{ code: '1B', name: 'First base', group: 'hitter', summary: 'Guards first base; often a big power hitter.' },
	{ code: '2B', name: 'Second base', group: 'hitter', summary: 'Covers the right side of the infield.' },
	{ code: '3B', name: 'Third base', group: 'hitter', summary: 'Covers the left side of the infield.' },
	{ code: 'SS', name: 'Shortstop', group: 'hitter', summary: 'Key infield defender between second and third.' },
	{ code: 'LF', name: 'Left field', group: 'hitter', summary: 'Outfielder on the left side.' },
	{ code: 'CF', name: 'Center field', group: 'hitter', summary: 'Fastest outfielder, covering the most ground.' },
	{ code: 'RF', name: 'Right field', group: 'hitter', summary: 'Outfielder on the right side, usually with a strong arm.' },
	{ code: 'DH', name: 'Designated hitter', group: 'hitter', summary: 'Bats only — never plays defense. Any hitter can fill this spot.' },
	{ code: 'SP', name: 'Starting pitcher', group: 'pitcher', summary: 'Starts the game and pitches most of the innings. You draft 3.' },
	{ code: 'CL', name: 'Closer', group: 'pitcher', summary: 'Enters in the 9th inning to protect a close lead.' },
	{ code: 'RP', name: 'Relief pitcher', group: 'pitcher', summary: 'Takes over after the starter leaves. You draft 3 plus a closer.' }
];

export const STAT_GLOSSARY: readonly StatEntry[] = [
	{ code: 'WAR/162', name: 'Overall value', direction: 'higher', summary: 'Estimated wins this player adds over a full 162-game season. The quickest way to compare any two cards.' },
	{ code: 'OPS', name: 'Hitting', direction: 'higher', summary: 'How often a batter gets on base plus how hard they hit. Around .800 is strong; 1.000+ is historic.' },
	{ code: 'DEF est.', name: 'Fielding', direction: 'higher', summary: 'Estimated runs saved on defense at this position. Positive numbers are above average.' },
	{ code: 'HR', name: 'Home runs', direction: 'higher', summary: 'Home runs hit that season. Shown on Designated Hitters (DH) instead of defense.' },
	{ code: 'ERA', name: 'Runs allowed', direction: 'lower', summary: 'Earned runs a pitcher gives up per 9 innings. Under 3.00 is strong; under 2.00 is dominant.' },
	{ code: 'SO', name: 'Strikeouts', direction: 'higher', summary: 'Batters a pitcher struck out that season.' }
];

export const LINEUP_STAT_GLOSSARY: readonly StatEntry[] = [
	{ code: 'OBP', name: 'On-base %', direction: 'higher', summary: 'How often a batter avoids making an out. Great for the top of the batting order.' },
	{ code: 'SLG', name: 'Slugging %', direction: 'higher', summary: 'Extra-base power (doubles, triples, home runs). Great for spots 3 and 4.' },
	{ code: 'IP', name: 'Innings pitched', direction: 'higher', summary: 'How deep a starter usually goes into games.' },
	{ code: 'SV', name: 'Saves', direction: 'higher', summary: 'Close games a reliever finished and protected.' }
];

const POSITION_NAMES: Readonly<Record<string, string>> = {
	All: 'All positions',
	C: 'Catcher',
	'1B': 'First base',
	'2B': 'Second base',
	'3B': 'Third base',
	SS: 'Shortstop',
	LF: 'Left field',
	CF: 'Center field',
	RF: 'Right field',
	DH: 'Designated hitter',
	SP: 'Starting pitcher',
	SP1: 'Starting pitcher 1',
	SP2: 'Starting pitcher 2',
	SP3: 'Starting pitcher 3',
	CL: 'Closer',
	RP: 'Relief pitcher',
	RP1: 'Relief pitcher 1',
	RP2: 'Relief pitcher 2',
	RP3: 'Relief pitcher 3',
	RP4: 'Relief pitcher 4',
	RP5: 'Relief pitcher 5',
	BP: 'Team bullpen'
};

/** Plain-English name for a baseball position or filter code. */
export function positionName(code: string): string {
	return POSITION_NAMES[code] ?? code;
}
