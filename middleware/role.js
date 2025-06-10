const role = (roles) => {
    return (req, res, next) => {
        try {
            if (!req.user) {
                console.log('Role check failed: No user found in request');
                return res.status(401).json({ message: 'Not authenticated' });
            }

            if (!roles.includes(req.user.role)) {
                console.log('Role check failed: Insufficient permissions', {
                    userRole: req.user.role,
                    requiredRoles: roles
                });
                return res.status(403).json({ message: 'Access denied' });
            }

            console.log('Role check passed:', {
                userId: req.user.id,
                role: req.user.role
            });
            next();
        } catch (err) {
            console.error('Role middleware error:', err);
            res.status(500).json({ message: 'Server error' });
        }
    };
};

module.exports = role; 