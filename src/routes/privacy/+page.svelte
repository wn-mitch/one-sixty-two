<svelte:head>
	<title>Privacy policy | 162-0</title>
	<meta name="description" content="How 162-0 handles device saves, public replay links, shared images, hosting information, and privacy requests." />
	<link rel="canonical" href="https://162-0.dev/privacy" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://162-0.dev/privacy" />
	<meta property="og:title" content="Privacy policy | 162-0" />
	<meta property="og:description" content="How 162-0 handles device saves, public replay links, shared images, hosting information, and privacy requests." />
</svelte:head>

<main class="privacy">
	<header>
		<h1>Privacy policy</h1>
		<p class="lede">162-0 is a baseball game from Alpaca Software. This policy covers the website at 162-0.dev and the iOS app that loads it.</p>
		<p>You do not need an account to play. Your saved game library lives on your device, but completed Classic seasons can automatically publish replay data and share images. The service also processes network information to deliver and protect the game.</p>
	</header>

	<section aria-labelledby="device-data">
		<h2 id="device-data">What stays on your device</h2>
		<p>The game uses local storage, including an on-device SQLite database, to remember drafts, saved seasons, head-to-head history, your collection, earned tokens, cosmetic choices, and settings. We do not provide an account-based backup or cross-device sync of that library.</p>
		<p>The iOS app and your web browser have separate storage. Deleting the app or clearing the website’s stored data can erase your saves. Removing a saved season in My teams deletes that local entry, not a replay or image already published online.</p>
		<p>If phone tilt is enabled, the game uses device orientation to move the cards. This sensor input is processed on your device, not uploaded by the game. You can turn phone tilt off in Settings; system Reduce Motion also limits card movement.</p>
	</section>

	<section aria-labelledby="public-sharing">
		<h2 id="public-sharing">Replay links and shared images</h2>
		<p>When you finish your own Classic season, the game automatically prepares and uploads replay data, the season record, and card or field images so sharing is ready. This can happen before you press a Share or Copy link button. Publishing a saved season’s link also uploads its replay if needed.</p>
		<p>Replay data includes the game seed, roster selections, draft actions, lineup, stadium, and game/data versions. Shared artwork contains the simulated roster and results. These publications are not linked to a player account. Anyone with a replay, challenge, or image URL can view and redistribute it; an unlisted link is not private storage.</p>
		<p>Using Copy link in the foil lab can upload the design settings to create a short link. Head-to-head links encode the information needed to open a series without storing a separate series record on our server.</p>
		<p>Published replays and saved lab links have no automatic expiry. Share images and their publication records are scheduled for deletion after 90 days. Copies downloaded, cached, or reposted by others may remain available after our copy is removed.</p>
	</section>

	<section aria-labelledby="hosting">
		<h2 id="hosting">Hosting, security, and traffic measurement</h2>
		<p>Cloudflare hosts the website and stores published replays, images, and lab links. Requests disclose information needed to serve and secure the service, such as your IP address, requested URL, browser information, and request timing. Upload limits use your IP address to prevent abuse. Operational errors may be recorded for troubleshooting.</p>
		<p>The deployed website also loads Cloudflare’s analytics beacon to measure visits and page performance. This is separate from your saved game library. We do not use advertising trackers or sell your personal information.</p>
		<p>Cloudflare processes hosting, security, and analytics information under its service terms and retention practices. See <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noreferrer">Cloudflare’s privacy policy</a> and its <a href="https://developers.cloudflare.com/web-analytics/about/" target="_blank" rel="noreferrer">Web Analytics documentation</a>. Infrastructure processing may occur outside your country.</p>
	</section>

	<section aria-labelledby="external-services">
		<h2 id="external-services">External links and purchases</h2>
		<p>Opening a source credit, publisher website, or external support link takes you to a service with its own privacy practices. The native share sheet sends content only to the app or destination you choose, which then handles it under its own policies.</p>
		<p>The current iOS app has no in-app purchases. The website’s optional support link opens Ko-fi; any payment and contact information you provide there is handled by Ko-fi and its payment providers, not by the game’s local save database. The iOS app does not show that support link.</p>
	</section>

	<section aria-labelledby="your-choices">
		<h2 id="your-choices">Your choices and deletion requests</h2>
		<p>You can delete saved seasons in My teams and clear the website’s stored data through your browser. Deleting the iOS app removes its local app storage; offloading it may preserve that storage. These actions do not remove server publications or copies you shared elsewhere.</p>
		<p>For a privacy question, access or deletion request, or concern about a child’s information, <a href="https://alpacasoft.dev/" target="_blank" rel="noreferrer">contact Alpaca Software</a> using the email link in the website footer. Include the relevant replay, challenge, image, or lab URL so we can identify the publication. Do not send sensitive information through a public issue or shared game link.</p>
		<p>There is no player account or self-service server-deletion control. We may need information to establish that a request concerns you. We cannot retrieve a device-only save from our servers or remove copies held by other people. Information you send in a support request is used to respond and handle the request.</p>
		<p>Depending on your location, you may have rights to access, correct, delete, or restrict use of personal information, or to complain to your local privacy regulator. Use the contact route above to exercise those rights.</p>
	</section>

	<section aria-labelledby="children">
		<h2 id="children">Children’s privacy</h2>
		<p>The game does not ask players for a name, email address, birth date, or account profile. Please do not send a child’s personal information in a support message unless it is necessary to address a privacy concern. A parent or guardian can use the contact route above to request review or removal of information concerning their child.</p>
	</section>

	<section aria-labelledby="policy-changes">
		<h2 id="policy-changes">Changes to this policy</h2>
		<p>We will update this page when the game’s data practices change, including before introducing accounts or in-app purchases. This page describes the current service, not planned features.</p>
	</section>
</main>

<style>
	.privacy { width: min(100%, 68ch); margin-inline: auto; padding: var(--space-8) 0 var(--space-16); }
	header { padding-bottom: var(--space-6); }
	h1 { font-size: var(--text-3xl); }
	.lede { color: var(--muted); }
	section { padding-block: var(--space-6); border-top: 1px solid var(--border); }
	h2 { margin: 0 0 var(--space-4); font-size: var(--text-xl); }
	p { margin: var(--space-3) 0 0; line-height: 1.65; overflow-wrap: anywhere; }
</style>
