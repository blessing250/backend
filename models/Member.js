const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    membershipType: {
        type: String,
        enum: ['Basic', 'Premium', 'VIP'],
        default: 'Basic'
    },
    membershipStatus: {
        type: String,
        enum: ['active', 'inactive', 'pending'],
        default: 'pending'
    },
    joinDate: {
        type: Date,
        default: Date.now
    },
    lastVisit: {
        type: Date,
        default: Date.now
    },
    qrCode: {
        type: String,
        unique: true
    },
    phoneNumber: {
        type: String,
        trim: true
    },
    address: {
        street: String,
        city: String,
        state: String,
        zipCode: String
    },
    emergencyContact: {
        name: String,
        phone: String,
        relationship: String
    }
}, {
    timestamps: true
});

// Index for faster queries
memberSchema.index({ email: 1 });
memberSchema.index({ membershipStatus: 1 });
memberSchema.index({ membershipType: 1 });

const Member = mongoose.model('Member', memberSchema);

module.exports = Member; 