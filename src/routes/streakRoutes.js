const express = require('express');
const router = express.Router();
const streakController = require('../controllers/streakController');

router.post('/confirm-post', streakController.confirmPost);

module.exports = router;
