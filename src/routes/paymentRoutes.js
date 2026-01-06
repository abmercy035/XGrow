const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');

router.post('/initialize', paymentController.initializePayment);
router.get('/verify', paymentController.verifyPayment);

module.exports = router;
