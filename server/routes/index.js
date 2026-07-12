import express from 'express';
import authRoutes from './auth.js';
import userRoutes from './users.js';
import deliveryRoutes from './deliveries.js';
import bagRoutes from './bags.js';
import reportRoutes from './reports.js';
import communicationRoutes from './communications.js';
import deliveryChangeRoutes from './deliveryChanges.js';
import incidentRoutes from './incidents.js';


const router = express.Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/deliveries', deliveryRoutes);
router.use('/bags', bagRoutes);
router.use('/reports', reportRoutes);
router.use('/communications', communicationRoutes);
router.use('/delivery-changes', deliveryChangeRoutes);
router.use('/incidents', incidentRoutes);

export default router;