const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

router.get('/stats', adminController.getDashboardStats);
router.get('/users', adminController.getUsers);
router.post('/users/:userId', adminController.updateUser);

module.exports = router;
