/**
 * VEPRS - Purchase Request Management (Submit Request & My Requests)
 * Strictly restricted to Computer Accessories category and 15 approved products.
 */

const APPROVED_COMPUTER_ACCESSORIES = [
  'Keyboard',
  'Mouse',
  'Monitor',
  'Webcam',
  'Headset',
  'USB Hub',
  'External Hard Drive',
  'SSD',
  'RAM',
  'Graphics Card',
  'Laptop Stand',
  'Printer',
  'HDMI Cable',
  'USB Cable',
  'Power Adapter'
];

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Request Product Form if on request-product.html
  const requestForm = document.getElementById('purchaseRequestForm');
  if (requestForm) {
    initRequestForm(requestForm);
  }

  // Initialize My Requests Table if on my-requests.html
  const myRequestsTableBody = document.getElementById('myRequestsTableBody');
  if (myRequestsTableBody) {
    loadMyRequests();
  }
});

/**
 * Handle Purchase Request Form Submission & Client-Side Validation
 */
function initRequestForm(form) {
  // Set minimum delivery date to today
  const deliveryDateInput = document.getElementById('requiredDeliveryDate');
  if (deliveryDateInput) {
    const today = new Date().toISOString().split('T')[0];
    deliveryDateInput.min = today;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlerts();

    const productCategory = document.getElementById('productCategory').value.trim();
    const productName = document.getElementById('productName').value.trim();
    const quantity = document.getElementById('quantity').value.trim();
    const requirements = document.getElementById('requirements').value.trim();
    const requiredDeliveryDate = document.getElementById('requiredDeliveryDate').value.trim();
    const additionalNotes = document.getElementById('additionalNotes').value.trim();

    // 1. Validation checks
    if (!productCategory || productCategory !== 'Computer Accessories') {
      showErrorAlert('Product Category must be "Computer Accessories".');
      document.getElementById('productCategory').focus();
      return;
    }

    if (!productName || !APPROVED_COMPUTER_ACCESSORIES.includes(productName)) {
      showErrorAlert('Please select an approved Computer Accessory from the dropdown.');
      document.getElementById('productName').focus();
      return;
    }

    if (!quantity) {
      showErrorAlert('Please specify the Quantity.');
      document.getElementById('quantity').focus();
      return;
    }

    const qtyNumber = parseInt(quantity, 10);
    if (isNaN(qtyNumber) || qtyNumber <= 0) {
      showErrorAlert('Quantity must be a positive integer greater than 0.');
      document.getElementById('quantity').focus();
      return;
    }

    if (!requirements) {
      showErrorAlert('Please specify the Product Requirements / Specifications.');
      document.getElementById('requirements').focus();
      return;
    }

    if (!requiredDeliveryDate) {
      showErrorAlert('Please select a Required Delivery Date.');
      document.getElementById('requiredDeliveryDate').focus();
      return;
    }

    // 2. Submit payload
    const payload = {
      productCategory: 'Computer Accessories',
      productName,
      quantity: qtyNumber,
      requirements,
      requiredDeliveryDate,
      additionalNotes: additionalNotes || null
    };

    const submitBtn = document.getElementById('submitBtn');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = 'Submitting Request...';

    try {
      const response = await authFetch('/api/requests', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showSuccessModal(data.requestId || 'REQ-1001');
      } else {
        showErrorAlert(data.message || 'Failed to submit purchase request.');
      }
    } catch (err) {
      console.error('Request submission error:', err);
      showErrorAlert(err.message || 'Network error while submitting purchase request.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  });
}

/**
 * Load User Purchase Requests for my-requests.html
 */
async function loadMyRequests() {
  const tableBody = document.getElementById('myRequestsTableBody');
  const loadingIndicator = document.getElementById('tableLoading');
  const emptyIndicator = document.getElementById('tableEmpty');
  const totalCountBadge = document.getElementById('totalRequestsCount');

  if (!tableBody) return;

  if (loadingIndicator) loadingIndicator.style.display = 'block';
  if (emptyIndicator) emptyIndicator.style.display = 'none';
  tableBody.innerHTML = '';

  try {
    const response = await authFetch('/api/requests/my-requests');
    const data = await response.json();

    if (loadingIndicator) loadingIndicator.style.display = 'none';

    if (response.ok && data.success) {
      const requests = data.requests || [];

      if (totalCountBadge) {
        totalCountBadge.textContent = `${requests.length} Request${requests.length === 1 ? '' : 's'}`;
      }

      if (requests.length === 0) {
        if (emptyIndicator) emptyIndicator.style.display = 'block';
        return;
      }

      tableBody.innerHTML = requests.map(req => {
        const statusClass = getStatusBadgeClass(req.status);
        return `
          <tr>
            <td><span class="request-id-tag">${escapeHtml(req.request_id)}</span></td>
            <td><strong>${escapeHtml(req.product_name)}</strong></td>
            <td><span class="badge" style="background: var(--primary-light); color: var(--primary);">${escapeHtml(req.product_category)}</span></td>
            <td><strong>${escapeHtml(req.quantity)}</strong> units</td>
            <td style="max-width: 250px; font-size: 0.85rem; color: #475569;">
              ${escapeHtml(req.requirements || 'N/A')}
            </td>
            <td>${escapeHtml(req.required_delivery_date || 'N/A')}</td>
            <td>${escapeHtml(req.request_date || 'N/A')}</td>
            <td><span class="badge ${statusClass}">${escapeHtml(req.status)}</span></td>
          </tr>
        `;
      }).join('');
    } else {
      showErrorAlert(data.message || 'Failed to load purchase requests.');
    }
  } catch (err) {
    if (loadingIndicator) loadingIndicator.style.display = 'none';
    console.error('Error fetching requests:', err);
    showErrorAlert('Network error while retrieving purchase requests.');
  }
}

/**
 * Filter My Requests Table
 */
function filterRequestsTable() {
  const input = document.getElementById('requestSearchInput');
  const filter = input ? input.value.toLowerCase() : '';
  const tableBody = document.getElementById('myRequestsTableBody');
  if (!tableBody) return;

  const rows = tableBody.getElementsByTagName('tr');
  for (let i = 0; i < rows.length; i++) {
    const text = rows[i].textContent || rows[i].innerText;
    if (text.toLowerCase().indexOf(filter) > -1) {
      rows[i].style.display = '';
    } else {
      rows[i].style.display = 'none';
    }
  }
}

/**
 * Helper: Map Status String to CSS Badge Class
 */
function getStatusBadgeClass(status) {
  if (!status) return 'badge-pending';
  const s = status.toLowerCase();
  if (s.includes('approved') || s.includes('received') || s.includes('submitted')) {
    return 'badge-approved';
  }
  if (s.includes('reject') || s.includes('cancel')) {
    return 'badge-rejected';
  }
  return 'badge-pending';
}

/**
 * Show Success Modal
 */
function showSuccessModal(requestId) {
  const modal = document.getElementById('requestSuccessModal');
  const modalRequestId = document.getElementById('modalRequestId');

  if (modal && modalRequestId) {
    modalRequestId.textContent = requestId;
    modal.classList.add('active');
  } else {
    alert(`Purchase request submitted successfully!\nRequest ID: ${requestId}`);
    window.location.href = 'my-requests.html';
  }
}

/**
 * Show Error Alert
 */
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

/**
 * Clear Alerts
 */
function clearAlerts() {
  const alertBox = document.getElementById('formAlert');
  if (alertBox) {
    alertBox.style.display = 'none';
    alertBox.innerHTML = '';
  }
}

/**
 * Helper: Escape HTML to prevent XSS
 */
function escapeHtml(str) {
  if (!str) return '';
  return str.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
