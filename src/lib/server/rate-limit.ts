/** The Workers rate-limit binding, declared as `UPLOAD_LIMIT` in wrangler.jsonc. */
export interface RateLimiter {
	limit(options: { key: string }): Promise<{ success: boolean }>;
}

/**
 * Whether this client may store another replay or share upload. Uploads are keyed by the client's IP, so one
 * script cannot fill storage; a player finishing seasons never comes near the limit. Without the binding
 * (unit tests, plain Node) every upload is allowed.
 */
export async function uploadAllowed(limiter: RateLimiter | undefined, request: Request): Promise<boolean> {
	if (!limiter) return true;
	const key = request.headers.get('cf-connecting-ip') ?? 'local';
	return (await limiter.limit({ key })).success;
}
