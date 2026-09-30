/**
 * VEPRS - Vendor Management (Sprint 2: SCRUM-22 & SCRUM-23)
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Vendor Table if on vendor-management.html
  const vendorsTableBody = document.getElementById('vendorsTableBody');
  if (vendorsTableBody) {
    loadVendorsTable();
  }

  // 2. Initialize Add Vendor Form if on add-vendor.html
  const addVendorForm = document.getElementById('addVendorForm');
  if (addVendorForm) {
    initAddVendorForm(addVendorForm);
  }

  // 3. Initialize Edit Vendor Form if on edit-vendor.html
  const editVendorForm = document.getElementById('editVendorForm');
  if (editVendorForm) {
    initEditVendorForm(editVendorForm);
  }
});

/**
 * Load and render all vendors on vendor-management.html
 */
async function loadVendorsTable() {
  const tableBody = document.getElementById('vendorsTableBody');
  const loadingIndicator = document.getElementById('tableLoading');
  const emptyState = document.getElementById('tableEmpty');
  const countBadge = document.getElementById('totalVendorsCount');

  if (!tableBody) return;

  if (loadingIndicator) loadingIndicator.style.display = 'block';
  if (emptyState) emptyState.style.display = 'none';

  try {
    const response = await authFetch('/api/vendors');
    const data = await response.json();

    if (loadingIndicator) loadingIndicator.style.display = 'none';

    if (response.ok && data.success) {
      const vendors = data.vendors || [];

      if (countBadge) {
        countBadge.textContent = `${vendors.length} Vendors`;
      }

      if (vendors.length === 0) {
        if (emptyState) emptyState.style.display = 'block';
        tableBody.innerHTML = '';
        return;
      }

      tableBody.innerHTML = vendors.map(v => {
        const isStatusActive = v.status === 'Active';
        const badgeClass = isStatusActive ? 'badge-approved' : 'badge-rejected';
        return `
          <tr>
            <td><span class="request-id-tag">${escapeHtml(v.vendor_id)}</span></td>
            <td>
              <strong>${escapeHtml(v.vendor_name)}</strong>
              ${v.business_registration_number ? `<div style="font-size: 0.75rem; color: #64748b;">Reg: ${escapeHtml(v.business_registration_number)}</div>` : ''}
            </td>
            <td>${escapeHtml(v.contact_person)}</td>
            <td><a href="mailto:${escapeHtml(v.email)}" style="font-size: 0.875rem;">${escapeHtml(v.email)}</a></td>
            <td>${escapeHtml(v.phone)}</td>
            <td>${escapeHtml(v.city || v.state || '—')}</td>
            <td><span style="font-size: 0.85rem; color: #334155;">${escapeHtml(v.product_categories)}</span></td>
            <td><span class="badge ${badgeClass}">${escapeHtml(v.status)}</span></td>
            <td>
              <a href="edit-vendor.html?id=${encodeURIComponent(v.id)}" class="btn btn-secondary" style="padding: 0.35rem 0.75rem; font-size: 0.8rem;">
                ✏️ Edit
              </a>
            </td>
          </tr>
        `;
      }).join('');
    } else {
      showErrorAlert(data.message || 'Failed to load vendors.');
    }
  } catch (err) {
    if (loadingIndicator) loadingIndicator.style.display = 'none';
    console.error('Failed to load vendors:', err);
    showErrorAlert('Error fetching vendor directory.');
  }
}

/**
 * Handle Add Vendor Form (SCRUM-22)
 */
function initAddVendorForm(form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlerts();

    const vendorName = document.getElementById('vendorName').value.trim();
    const contactPerson = document.getElementById('contactPerson').value.trim();
    const email = document.getElementById('email').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const address = document.getElementById('address').value.trim();
    const city = document.getElementById('city').value.trim();
    const state = document.getElementById('state').value.trim();
    const productCategories = document.getElementById('productCategories').value.trim();
    const businessRegistrationNumber = document.getElementById('businessRegistrationNumber').value.trim();
    const description = document.getElementById('description').value.trim();

    // Client-side validations
    if (!vendorName) {
      showErrorAlert('Vendor Name is required.');
      document.getElementById('vendorName').focus();
      return;
    }

    if (!contactPerson) {
      showErrorAlert('Contact Person is required.');
      document.getElementById('contactPerson').focus();
      return;
    }

    if (!email) {
      showErrorAlert('Email address is required.');
      document.getElementById('email').focus();
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showErrorAlert('Please enter a valid email address.');
      document.getElementById('email').focus();
      return;
    }

    if (!phone) {
      showErrorAlert('Phone number is required.');
      document.getElementById('phone').focus();
      return;
    }

    if (!address) {
      showErrorAlert('Address is required.');
      document.getElementById('address').focus();
      return;
    }

    if (!productCategories) {
      showErrorAlert('Product Categories are required.');
      document.getElementById('productCategories').focus();
      return;
    }

    const payload = {
      vendorName,
      contactPerson,
      email,
      phone,
      address,
      city,
      state,
      productCategories,
      businessRegistrationNumber,
      description
    };

    const submitBtn = document.getElementById('submitBtn');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = 'Adding Vendor...';

    try {
      const response = await authFetch('/api/vendors', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showSuccessModal(data.vendorId || 'VEN-1001');
        form.reset();
      } else {
        showErrorAlert(data.message || 'Failed to add vendor.');
      }
    } catch (err) {
      console.error('Add vendor error:', err);
      showErrorAlert(err.message || 'Network error while adding vendor.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  });
}

/**
 * Handle Edit Vendor Form (SCRUM-23)
 */
async function initEditVendorForm(form) {
  const urlParams = new URLSearchParams(window.location.search);
  const vendorIdParam = urlParams.get('id');

  if (!vendorIdParam) {
    showErrorAlert('No vendor specified for editing.');
    return;
  }

  // Fetch current vendor data
  try {
    const response = await authFetch(`/api/vendors/${encodeURIComponent(vendorIdParam)}`);
    const data = await response.json();

    if (response.ok && data.success && data.vendor) {
      const v = data.vendor;
      document.getElementById('vendorIdDisplay').textContent = v.vendor_id;
      document.getElementById('vendorName').value = v.vendor_name || '';
      document.getElementById('contactPerson').value = v.contact_person || '';
      document.getElementById('email').value = v.email || '';
      document.getElementById('phone').value = v.phone || '';
      document.getElementById('address').value = v.address || '';
      document.getElementById('city').value = v.city || '';
      document.getElementById('state').value = v.state || '';
      document.getElementById('productCategories').value = v.product_categories || '';
      document.getElementById('businessRegistrationNumber').value = v.business_registration_number || '';
      document.getElementById('description').value = v.description || '';
      if (document.getElementById('status')) {
        document.getElementById('status').value = v.status || 'Active';
      }
    } else {
      showErrorAlert(data.message || 'Failed to retrieve vendor details.');
    }
  } catch (err) {
    console.error('Fetch vendor details error:', err);
    showErrorAlert('Error loading vendor data.');
  }

  // Handle Form Submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlerts();

    const vendorName = document.getElementById('vendorName').value.trim();
    const contactPerson = document.getElementById('contactPerson').value.trim();
    const email = document.getElementById('email').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const address = document.getElementById('address').value.trim();
    const city = document.getElementById('city').value.trim();
    const state = document.getElementById('state').value.trim();
    const productCategories = document.getElementById('productCategories').value.trim();
    const businessRegistrationNumber = document.getElementById('businessRegistrationNumber').value.trim();
    const description = document.getElementById('description').value.trim();
    const status = document.getElementById('status') ? document.getElementById('status').value : 'Active';

    // Validations
    if (!vendorName || !contactPerson || !email || !phone || !address || !productCategories) {
      showErrorAlert('Please fill in all mandatory fields.');
      return;
    }

    const payload = {
      vendorName,
      contactPerson,
      email,
      phone,
      address,
      city,
      state,
      productCategories,
      businessRegistrationNumber,
      description,
      status
    };

    const submitBtn = document.getElementById('submitBtn');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = 'Updating Vendor...';

    try {
      const response = await authFetch(`/api/vendors/${encodeURIComponent(vendorIdParam)}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showSuccessModal(data.vendorId || vendorIdParam);
      } else {
        showErrorAlert(data.message || 'Failed to update vendor details.');
      }
    } catch (err) {
      console.error('Update vendor error:', err);
      showErrorAlert(err.message || 'Network error while updating vendor.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  });
}

/**
 * Filter vendors in table
 */
function filterVendors() {
  const input = document.getElementById('vendorSearchInput');
  if (!input) return;
  const filter = input.value.toLowerCase();
  const rows = document.querySelectorAll('#vendorsTableBody tr');

  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(filter) ? '' : 'none';
  });
}

/**
 * Modal & Alert Helpers
 */
function showSuccessModal(vendorId) {
  const modal = document.getElementById('vendorSuccessModal');
  const vendorIdDisplay = document.getElementById('modalVendorId');

  if (modal && vendorIdDisplay) {
    vendorIdDisplay.textContent = vendorId;
    modal.classList.add('active');
  } else {
    alert(`Operation completed successfully!\nVendor ID: ${vendorId}`);
    window.location.href = 'vendor-management.html';
  }
}

function showErrorAlert(message) {
  const alertBox = document.getElementById('formAlert');
  if (alertBox) {
    alertBox.className = 'alert alert-danger';
    alertBox.innerHTML = `<span>⚠️ ${escapeHtml(message)}</span>`;
    alertBox.style.display = 'flex';
    alertBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else {
    alert(message);
  }
}

function clearAlerts() {
  const alertBox = document.getElementById('formAlert');
  if (alertBox) {
    alertBox.style.display = 'none';
    alertBox.innerHTML = '';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
