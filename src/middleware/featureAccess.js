const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const checkFeatureAccess = (featureName) => {
	return async (req, res, next) => {
		if (!req.session.userId) {
			return res.status(401).json({ error: 'Unauthorized' });
		}

		try {
			const user = await prisma.user.findUnique({
				where: { id: req.session.userId }
			});

			if (!user) return res.status(401).json({ error: 'User not found' });

			// Pro users bypass all limits
			if (user.isPro) {
				return next();
			}

			// Free Tier Logic
			switch (featureName) {
				case 'create_board':
					const boardCount = await prisma.board.count({
						where: { userId: user.id }
					});
					if (boardCount >= 1) {
						return res.status(403).json({
							error: 'Free tier limit reached (1 Board). Upgrade to Pro for unlimited boards.'
						});
					}
					break;

				case 'smart_timing':
					return res.status(403).json({
						error: 'Smart Timing is a Pro feature.'
					});

				default:
					break;
			}

			next();
		} catch (err) {
			console.error('Feature access error', err);
			res.status(500).json({ error: 'Internal Server Error' });
		}
	};
};

module.exports = checkFeatureAccess;
