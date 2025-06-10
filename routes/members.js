const express = require('express');
const router = express.Router();
const Member = require('../models/Member');
const QRCode = require('qrcode');
const nodemailer = require('nodemailer');
const auth = require('../middleware/auth');
const role = require('../middleware/role');

// Create email transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Get all members (admin only)
router.get('/', auth, role(['admin']), async (req, res) => {
    console.log('Fetching all members');
    try {
        const members = await Member.find().sort({ createdAt: -1 });
        console.log(`Found ${members.length} members`);
        res.json(members);
    } catch (err) {
        console.error('Error fetching members:', err);
        res.status(500).json({ message: err.message });
    }
});

// Get a single member (admin or the member themselves)
router.get('/:id', auth, async (req, res) => {
    console.log('Fetching member:', { memberId: req.params.id });
    try {
        const member = await Member.findById(req.params.id);
        if (!member) {
            console.log('Member not found:', { memberId: req.params.id });
            return res.status(404).json({ message: 'Member not found' });
        }

        // Check if user is admin or the member themselves
        if (req.user.role !== 'admin' && member._id.toString() !== req.user.id) {
            console.log('Access denied: User not authorized to view this member', {
                userId: req.user.id,
                memberId: req.params.id
            });
            return res.status(403).json({ message: 'Access denied' });
        }

        console.log('Member found:', { memberId: member._id, name: member.name });
        res.json(member);
    } catch (err) {
        console.error('Error fetching member:', { memberId: req.params.id, error: err });
        res.status(500).json({ message: err.message });
    }
});

// Create a new member (admin only)
router.post('/', auth, role(['admin']), async (req, res) => {
    console.log('Creating new member:', { name: req.body.name, email: req.body.email });
    try {
        const member = new Member(req.body);

        // Generate QR code
        const qrData = JSON.stringify({
            id: member._id,
            name: member.name,
            email: member.email
        });

        const qrCode = await QRCode.toDataURL(qrData);
        member.qrCode = qrCode;

        const newMember = await member.save();
        console.log('Member created successfully:', { memberId: newMember._id });

        // Send welcome email with QR code
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: member.email,
            subject: 'Welcome to Our Membership Program',
            html: `
        <h1>Welcome ${member.name}!</h1>
        <p>Thank you for joining our membership program.</p>
        <p>Here is your membership QR code:</p>
        <img src="${qrCode}" alt="Membership QR Code" />
        <p>Please keep this QR code safe as it will be used for verification.</p>
      `
        };

        await transporter.sendMail(mailOptions);
        console.log('Welcome email sent:', { memberId: newMember._id, email: member.email });

        res.status(201).json(newMember);
    } catch (err) {
        console.error('Error creating member:', err);
        res.status(400).json({ message: err.message });
    }
});

// Update a member (admin only)
router.put('/:id', auth, role(['admin']), async (req, res) => {
    console.log('Updating member:', { memberId: req.params.id, updates: req.body });
    try {
        const member = await Member.findById(req.params.id);
        if (!member) {
            console.log('Member not found for update:', { memberId: req.params.id });
            return res.status(404).json({ message: 'Member not found' });
        }

        Object.assign(member, req.body);
        const updatedMember = await member.save();
        console.log('Member updated successfully:', { memberId: updatedMember._id });
        res.json(updatedMember);
    } catch (err) {
        console.error('Error updating member:', { memberId: req.params.id, error: err });
        res.status(400).json({ message: err.message });
    }
});

// Delete a member (admin only)
router.delete('/:id', auth, role(['admin']), async (req, res) => {
    console.log('Deleting member:', { memberId: req.params.id });
    try {
        const member = await Member.findById(req.params.id);
        if (!member) {
            console.log('Member not found for deletion:', { memberId: req.params.id });
            return res.status(404).json({ message: 'Member not found' });
        }

        await Member.deleteOne({ _id: req.params.id });
        console.log('Member deleted successfully:', { memberId: req.params.id });
        res.json({ message: 'Member deleted successfully' });
    } catch (err) {
        console.error('Error deleting member:', { memberId: req.params.id, error: err });
        res.status(500).json({ message: 'Server error' });
    }
});

// Update membership status (admin only)
router.patch('/:id/status', auth, role(['admin']), async (req, res) => {
    console.log('Updating member status:', { memberId: req.params.id, newStatus: req.body.status });
    try {
        const member = await Member.findById(req.params.id);
        if (!member) {
            console.log('Member not found for status update:', { memberId: req.params.id });
            return res.status(404).json({ message: 'Member not found' });
        }

        member.membershipStatus = req.body.status;
        const updatedMember = await member.save();
        console.log('Member status updated:', { memberId: updatedMember._id, newStatus: req.body.status });

        // Send status update email
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: member.email,
            subject: 'Membership Status Update',
            html: `
        <h1>Membership Status Update</h1>
        <p>Dear ${member.name},</p>
        <p>Your membership status has been updated to: ${req.body.status}</p>
      `
        };

        await transporter.sendMail(mailOptions);
        console.log('Status update email sent:', { memberId: updatedMember._id, email: member.email });

        res.json(updatedMember);
    } catch (err) {
        console.error('Error updating member status:', { memberId: req.params.id, error: err });
        res.status(400).json({ message: err.message });
    }
});

module.exports = router; 