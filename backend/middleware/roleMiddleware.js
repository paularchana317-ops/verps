/**
 * Role-based authorization middleware
 * @param {Array<string>|string} allowedRoles - Single role or array of allowed roles
 */
function authorizeRole(allowedRoles) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({
        success: false,
        message: 'Access Denied'
      });
    }

    // Normalizing role checks for flexibility (e.g., 'User/Requester', 'Requester', 'User')
    const userRole = req.user.role;
    const isAuthorized = roles.some(role => {
      if (role === userRole) return true;
      if ((role === 'User/Requester' || role === 'Requester' || role === 'User') &&
          (userRole === 'User/Requester' || userRole === 'Requester' || userRole === 'User')) {
        return true;
      }
      return false;
    });

    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: 'Access Denied'
      });
    }

    next();
  };
}

module.exports = authorizeRole;
