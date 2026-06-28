const checkAdminAuth = (req, res, next) => {
    // Izinkan akses ke aset statis publik sebelum login
    if (
        req.path.startsWith('/images/') || 
        req.path.startsWith('/stylesheets/') || 
        req.path.startsWith('/icons/') || 
        req.path.startsWith('/models/') || 
        req.path === '/favicon.png' || 
        req.path === '/manifest.json'
    ) {
        return next();
    }

    if (req.session && req.session.adminId) {
        return next();
    }
    
    // Jika request adalah API (AJAX), kembalikan error JSON 401
    if (req.path.startsWith('/api/') || req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized. Session expired or not logged in.' });
    }
    
    res.redirect('/login');
};

module.exports = checkAdminAuth;
