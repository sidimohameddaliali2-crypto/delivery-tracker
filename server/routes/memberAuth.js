import express from 'express';
import jwt from 'jsonwebtoken';
import Partner from '../models/Partner.js';
import Member from '../models/Member.js';
import { memberProtect } from '../middleware/memberAuth.js';

const router = express.Router();

const generateMemberToken = (memberId) =>
  jwt.sign({ memberId }, process.env.JWT_SECRET || 'your-secret-key', { expiresIn: '30d' });

const memberResponse = (member, partner) => ({
  token: generateMemberToken(member._id),
  member: {
    _id: member._id,
    name: member.name,
    email: member.email,
    dietaryExclusions: member.dietaryExclusions,
    partner: {
      _id: partner._id,
      businessName: partner.businessName,
      businessType: partner.businessType,
      minimumOrder: partner.minimumOrder ?? 0
    }
  }
});

// GET /api/member/auth/invite/:token — PUBLIC. Resolve an invite link to its partner.
router.get('/invite/:token', async (req, res) => {
  try {
    const partner = await Partner.findOne({ memberInviteToken: req.params.token });
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Invalid or expired invite link' });
    }
    res.json({
      success: true,
      data: {
        businessName: partner.businessName,
        businessType: partner.businessType,
        isActive: partner.isActive
      }
    });
  } catch (err) {
    console.error('Member invite lookup error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/member/auth/register — PUBLIC. First join OR returning "login".
router.post('/register', async (req, res) => {
  try {
    const { inviteToken, name, email, dietaryExclusions } = req.body;
    if (!inviteToken || !name || !email) {
      return res.status(400).json({ success: false, message: 'inviteToken, name and email are required' });
    }

    const partner = await Partner.findOne({ memberInviteToken: inviteToken });
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Invalid or expired invite link' });
    }
    if (!partner.isActive) {
      return res.status(403).json({ success: false, message: 'This partner is not currently accepting members' });
    }

    const cleanEmail = email.toLowerCase().trim();
    let member = await Member.findOne({ partner: partner._id, email: cleanEmail });
    if (member) {
      member.name = name.trim();
      if (dietaryExclusions !== undefined) member.dietaryExclusions = dietaryExclusions;
      member.lastLogin = new Date();
      await member.save();
    } else {
      member = await Member.create({
        partner: partner._id,
        name: name.trim(),
        email: cleanEmail,
        dietaryExclusions: dietaryExclusions || '',
        lastLogin: new Date()
      });
    }

    if (!member.isActive) {
      return res.status(403).json({ success: false, message: 'This membership has been deactivated. Contact the partner.' });
    }

    res.json({ success: true, data: memberResponse(member, partner) });
  } catch (err) {
    console.error('Member register error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/member/auth/login — PUBLIC. Returning member, no profile creation.
router.post('/login', async (req, res) => {
  try {
    const { inviteToken, email } = req.body;
    if (!inviteToken || !email) {
      return res.status(400).json({ success: false, message: 'inviteToken and email are required' });
    }

    const partner = await Partner.findOne({ memberInviteToken: inviteToken });
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Invalid or expired invite link' });
    }
    if (!partner.isActive) {
      return res.status(403).json({ success: false, message: 'This partner is not currently accepting members' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const member = await Member.findOne({ partner: partner._id, email: cleanEmail });
    if (!member) {
      return res.status(404).json({ success: false, message: "We couldn't find an account for that email here — sign up instead." });
    }
    if (!member.isActive) {
      return res.status(403).json({ success: false, message: 'This membership has been deactivated. Contact the partner.' });
    }

    member.lastLogin = new Date();
    await member.save();

    res.json({ success: true, data: memberResponse(member, partner) });
  } catch (err) {
    console.error('Member login error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/member/auth/me
router.get('/me', memberProtect, (req, res) => {
  res.json({ success: true, data: { member: req.member } });
});

export default router;
