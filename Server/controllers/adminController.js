const axios = require('axios');
const mongoose = require('mongoose');
const Admin = require('../models/Admin');
require('dotenv').config();

exports.CreateAdmin = async (req, res) => {
    try {
        const userId = req.auth?.userId || req.session?.userId || req.body.userId;
        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }
        
        const admin = new Admin({ userId, status: true });
        await admin.save();
        res.status(201).json({ message: 'Admin created successfully', admin });
    } catch (error) {
        console.error('Error creating admin:', error);
        res.status(500).json({ error: 'Failed to create admin' });
    }
}

exports.checkAdminStatus = async (req, res) => {
    try {
        const userId = req.auth?.userId || req.session?.userId;
        
        if (!userId) {
            return res.status(401).json({ isAdmin: false, message: 'Authentication required' });
        }
        
        const adminUser = await Admin.findOne({ userId, status: true });
        
        if (adminUser) {
            return res.json({ isAdmin: true });
        } else {
            return res.json({ isAdmin: false });
        }
    } catch (error) {
        console.error('Error checking admin status:', error);
        res.status(500).json({ error: 'Failed to check admin status', isAdmin: false });
    }
}