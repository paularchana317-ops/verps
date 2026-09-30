/**
 * VEPRS - Dashboard Utilities & Module Placeholders
 */

document.addEventListener('DOMContentLoaded', () => {
  const user = getUser();
  if (!user) return;

  // Set welcome message
  const welcomeNameEl = document.getElementById('dashboardUserName');
  if (welcomeNameEl) {
    welcomeNameEl.textContent = user.name;
  }

  const welcomeRoleEl = document.getElementById('dashboardUserRole');
  if (welcomeRoleEl) {
    welcomeRoleEl.textContent = `Role: ${user.role}`;
  }
});

/**
 * Handle clicks on upcoming module placeholders
 * @param {string} moduleName 
 */
function showPlaceholderNotice(moduleName) {
  const modal = document.getElementById('placeholderModal');
  const titleEl = document.getElementById('placeholderModalTitle');
  const bodyEl = document.getElementById('placeholderModalBody');

  if (modal && titleEl && bodyEl) {
    titleEl.textContent = `${moduleName} Module`;
    bodyEl.innerHTML = `
      <p style="margin-bottom: 0.75rem;">
        The <strong>${moduleName}</strong> module is currently under development and will be available soon.
      </p>
      <p style="font-size: 0.85rem; color: #64748b;">
        Current active features: User Registration, Login, Role-Based Access, and Product Requisition Management.
      </p>
    `;
    modal.classList.add('active');
  } else {
    alert(`${moduleName} module is under development and will be activated soon.`);
  }
}

/**
 * Close any active modal
 * @param {string} modalId 
 */
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
  }
}
