const https = require('https');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET;

// Helper for Paystack Requests
const paystackRequest = (options, postData) => {
	return new Promise((resolve, reject) => {
		const req = https.request(options, (res) => {
			let data = '';
			res.on('data', (chunk) => { data += chunk; });
			res.on('end', () => {
				try {
					resolve(JSON.parse(data));
				} catch (e) {
					reject(e);
				}
			});
		});
		req.on('error', (e) => reject(e));
		if (postData) req.write(postData);
		req.end();
	});
};

exports.initializePayment = async (req, res) => {
	if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });

	try {
		const user = await prisma.user.findUnique({ where: { id: req.session.userId } });

		// Price: ~ $1.00 (1600 NGN) - Fallback for Nigerian Merchants
		const params = JSON.stringify({
			email: user.email,
			amount: 1600 * 100, // 1600 Naira in kobo
			// currency: 'NGN', // Default is NGN
			callback_url: `${req.protocol}://${req.get('host')}/api/payment/verify`,
			metadata: {
				userId: user.id
			}
		});

		const options = {
			hostname: 'api.paystack.co',
			port: 443,
			path: '/transaction/initialize',
			method: 'POST',
			headers: {
				Authorization: `Bearer ${PAYSTACK_SECRET}`,
				'Content-Type': 'application/json'
			}
		};

		const response = await paystackRequest(options, params);

		if (response.status) {
			res.json({ authorization_url: response.data.authorization_url });
		} else {
			res.status(400).json({ error: response.message || 'Payment initialization failed' });
		}
	} catch (err) {
		console.error('Paystack Init Error:', err);
		res.status(500).json({ error: 'Payment service error' });
	}
};

exports.verifyPayment = async (req, res) => {
	const { reference } = req.query;
	if (!reference) return res.status(400).send('No reference provided');

	try {
		const options = {
			hostname: 'api.paystack.co',
			port: 443,
			path: `/transaction/verify/${reference}`,
			method: 'GET',
			headers: {
				Authorization: `Bearer ${PAYSTACK_SECRET}`
			}
		};

		const response = await paystackRequest(options);

		if (response.status && response.data.status === 'success') {
			const userId = response.data.metadata?.userId;

			// Check if transaction already exists to avoid double-processing
			const existingTx = await prisma.transaction.findUnique({ where: { reference } });

			if (!existingTx && userId) {
				// Activate Pro
				await prisma.user.update({
					where: { id: userId },
					data: { isPro: true }
				});

				// Record Transaction
				await prisma.transaction.create({
					data: {
						userId: userId,
						reference: reference,
						amount: response.data.amount,
						status: 'SUCCESS'
					}
				});
			}

			// Redirect to waitlist success page (gatekeeper)
			res.redirect('/waitlist-success.html');
		} else {
			res.redirect('/?payment=failed');
		}
	} catch (err) {
		console.error('Paystack Verify Error:', err);
		res.redirect('/?payment=error');
	}
};
