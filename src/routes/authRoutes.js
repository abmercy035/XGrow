const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.get('/twitter', authController.login);
router.get('/twitter/callback', authController.callback);
router.get('/logout', authController.logout);
router.get('/me', authController.getMe);

module.exports = router;
