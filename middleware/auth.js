const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
    try {
        // Get token from cookie
        const token = req.cookies.token;

        if (!token) {
            console.log('Authentication failed: No token provided');
            return res.status(401).json({ message: 'No token, authorization denied' });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('Token verified successfully:', { userId: decoded.user.id, role: decoded.user.role });

        // Add user from payload
        req.user = decoded.user;
        next();
    } catch (err) {
        console.error('Authentication error:', err);
        res.status(401).json({ message: 'Token is not valid' });
    }
};

module.exports = auth; 