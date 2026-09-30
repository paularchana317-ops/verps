/**
 * VEPRS - Client-side Authentication and Role-Based Access Guard
 */

const AUTH_KEYS = {
  TOKEN: 'veprs_jwt_token',
  USER: 'veprs_user_profile'
};

/**
 * Get current JWT Token
 */
function getToken() {
  return localStorage.getItem(AUTH_KEYS.TOKEN);
}

/**
 * Get current logged in user object
 */
function getUser() {
  const userStr = localStorage.getItem(AUTH_KEYS.USER);
  try {
    return userStr ? JSON.parse(userStr) : null;
  } catch (e) {
    return null;
  }
}

/**
 * Save auth session
 */
function setAuth(token, user) {
  localStorage.setItem(AUTH_KEYS.TOKEN, token);
  localStorage.setItem(AUTH_KEYS.USER, JSON.stringify(user));
}

/**
 * Clear auth session
 */
function clearAuth() {
  localStorage.removeItem(AUTH_KEYS.TOKEN);
  localStorage.removeItem(AUTH_KEYS.USER);
}

/**
 * Log out current user and redirect to login page
 */
function logout() {
  clearAuth();
  window.location.href = '/login.html';
}

/**
 * Normalize role strings for safe comparison
 */
function normalizeRole(role) {
  if (!role) return '';
  const r = role.toLowerCase().trim();
  if (r.includes('requester') || r.includes('user')) return 'User/Requester';
  if (r.includes('admin')) return 'Admin';
  if (r.includes('vendor')) return 'Vendor';
  return role;
}

/**
 * Guard page with role-based access control.
 * Call this at the top of protected pages.
 * @param {Array<string>} allowedRoles 
 */
function checkAuth(allowedRoles = []) {
  const token = getToken();
  const user = getUser();

  // 1. Check if logged in
  if (!token || !user) {
    const currentPath = encodeURIComponent(window.location.pathname);
    window.location.href = `/login.html?redirect=${currentPath}`;
    return false;
  }

  // 2. If allowedRoles specified, verify role
  if (allowedRoles && allowedRoles.length > 0) {
    const normalizedUserRole = normalizeRole(user.role);
    const hasRole = allowedRoles.some(r => normalizeRole(r) === normalizedUserRole);

    if (!hasRole) {
      renderAccessDenied(user);
      return false;
    }
  }

  // 3. Update navbar UI
  updateNavbarUser(user);
  return true;
}

/**
 * Display professional "Access Denied" modal/overlay
 */
function renderAccessDenied(user) {
  // Clear main body and show Access Denied overlay
  document.body.innerHTML = `
    <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #0f172a; padding: 2rem; font-family: 'Inter', sans-serif;">
      <div style="background: white; border-radius: 16px; max-width: 480px; width: 100%; padding: 2.5rem; text-align: center; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);">
        <div style="width: 72px; height: 72px; border-radius: 50%; background: #fee2e2; color: #ef4444; display: flex; align-items: center; justify-content: center; font-size: 2.2rem; margin: 0 auto 1.5rem;">
          🚫
        </div>
        <h1 style="color: #991b1b; font-size: 1.75rem; margin-bottom: 0.5rem; font-weight: 800;">Access Denied</h1>
        <p style="color: #475569; font-size: 0.95rem; margin-bottom: 1.5rem;">
          You do not have authorization to view this page with your current role (<strong>${user ? user.role : 'Guest'}</strong>).
        </p>
        <div style="display: flex; gap: 0.75rem; justify-content: center;">
          <button onclick="goToMyDashboard()" style="padding: 0.75rem 1.5rem; background: #2563eb; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer;">
            Return to My Dashboard
          </button>
          <button onclick="logout()" style="padding: 0.75rem 1.5rem; background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; border-radius: 8px; font-weight: 600; cursor: pointer;">
            Logout
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Redirect user to their own valid dashboard
 */
function goToMyDashboard() {
  const user = getUser();
  if (!user) {
    window.location.href = '/login.html';
    return;
  }
  const role = normalizeRole(user.role);
  if (role === 'Admin') {
    window.location.href = '/admin-dashboard.html';
  } else if (role === 'Vendor') {
    window.location.href = '/vendor-dashboard.html';
  } else {
    window.location.href = '/user-dashboard.html';
  }
}

/**
 * Populate common navbar elements
 */
function updateNavbarUser(user) {
  const nameEl = document.getElementById('navUserName');
  const roleEl = document.getElementById('navUserRole');

  if (nameEl && user) {
    nameEl.textContent = user.name;
  }
  if (roleEl && user) {
    roleEl.textContent = user.role;
    const norm = normalizeRole(user.role).toLowerCase();
    if (norm.includes('admin')) {
      roleEl.className = 'user-role-badge admin';
    } else if (norm.includes('vendor')) {
      roleEl.className = 'user-role-badge vendor';
    } else {
      roleEl.className = 'user-role-badge user';
    }
  }
}

/**
 * Standard fetch helper with JWT Authorization header
 */
async function authFetch(url, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (response.status === 401) {
    clearAuth();
    window.location.href = '/login.html?session_expired=1';
    throw new Error('Session expired. Please log in again.');
  }

  return response;
}
