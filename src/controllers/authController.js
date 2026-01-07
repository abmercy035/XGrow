
const { twitterClient, callbackUrl } = require('../utils/twitterClient');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.login = async (req, res) => {
	try {
					const { url, codeVerifier, state } = twitterClient.generateOAuth2AuthLink(
						callbackUrl,
						{ scope: ['tweet.read', 'users.read', 'follows.read', 'like.read', 'offline.access'] }
					);

		console.log('DEBUG: OAuth Start');
		console.log('DEBUG: Callback URL sent to Twitter:', callbackUrl);
		console.log('DEBUG: Client ID present:', !!process.env.TWITTER_CLIENT_ID);
		console.log('DEBUG: Scopes:', ['tweet.read', 'users.read', 'follows.read', 'like.read', 'offline.access']);

					// Store strict PKCE vars in session
					req.session.codeVerifier = codeVerifier;
					req.session.state = state;

					console.log('Login started. State:', state, 'Verifier:', codeVerifier);

					req.session.save((err) => {
									if (err) {
										console.error('Session save error:', err);
										return res.status(500).send(`Session save error: ${err.message}`);
									}
									res.redirect(url);
								});
				} catch (err) {
					console.error('Login Error:', err);
					res.status(500).send(`Login failed: ${err.message}`);
				}
};

exports.callback = async (req, res) => {
	const { state, code } = req.query;

	const sessionState = req.session.state;
	const codeVerifier = req.session.codeVerifier;

	if (!state || !sessionState || !code || state !== sessionState || !codeVerifier) {
		return res.status(400).send('Invalid state or session timeout');
	}

	try {
		// Exchange code for tokens
		const {
			client: loggedClient,
			accessToken,
			refreshToken,
			expiresIn,
		} = await twitterClient.loginWithOAuth2({
			code,
			codeVerifier,
			redirectUri: callbackUrl,
		});

		// Get User Details with email and metrics
		const { data: userObject } = await loggedClient.v2.me({
			'user.fields': ['public_metrics', 'profile_image_url', 'description', 'verified']
		});

		// Calculate expiration date
		const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

		// Upsert User
		const user = await prisma.user.upsert({
			where: { twitterId: userObject.id },
			update: {
				username: userObject.username,
				accessToken,
				refreshToken,
				// tokenExpiresAt, // TODO: Add to schema migration
				// email: `${userObject.username}@x.com`, // Email is unique, avoid hardcode collision
				followerCount: userObject.public_metrics?.followers_count || 0,
				profileImageUrl: userObject.profile_image_url,
				bio: userObject.description,
				// isVerified: userObject.verified || false, // TODO: Add to schema migration
			},
			create: {
				twitterId: userObject.id,
				username: userObject.username,
				accessToken,
				refreshToken,
				// tokenExpiresAt,
				email: `${userObject.username}_${userObject.id}@xgrow.app`,
				followerCount: userObject.public_metrics?.followers_count || 0,
				profileImageUrl: userObject.profile_image_url,
				bio: userObject.description,
				// isVerified: userObject.verified || false,
			},
		});


		// Update Session
		req.session.userId = user.id;
		req.session.user = { ...user, isPro: user.isPro || false };

		// WAILIST GATEKEEPER
		// WAILIST GATEKEEPER
		if (user.isAdmin) {
			return res.redirect('/'); // Admins go straight to Dashboard
		}

		if (!user.isPro) {
			return res.redirect('/payment.html');
		}

		// If paid but not admin -> Waitlist Success (Lockout dashboard)
		// At this point, user is NOT admin (from first check) and IS pro (from second check)
		return res.redirect('/waitlist-success.html');
	} catch (err) {
		console.error('Login error:', err);
		res.status(403).send(`Invalid verifier or access tokens. Details: ${err.message || JSON.stringify(err)}`);
	}
};

exports.logout = (req, res) => {
	req.session.destroy(() => {
		res.redirect('/login.html'); // Simple static login page
	});
};

exports.getMe = async (req, res) => {
	if (!req.session.userId) {
		return res.status(401).json({ error: 'Unauthorized' });
	}
	const user = await prisma.user.findUnique({ where: { id: req.session.userId } });
	res.json(user);
};
