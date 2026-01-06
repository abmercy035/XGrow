const express = require('express');
const router = express.Router();
const promotionController = require('../controllers/promotionController');

router.post('/', promotionController.promoteUser);
router.get('/', promotionController.getPromotedUsers);

module.exports = router;
