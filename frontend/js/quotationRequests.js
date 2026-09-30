/**
 * VEPRS - Quotation Requests Management (Sprint 2: SCRUM-24 & SCRUM-25)
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Admin Purchase Requests Table if on purchase-requests.html
  const adminPRTableBody = document.getElementById('adminPurchaseRequestsTableBody');
  if (adminPRTableBody) {
    loadAdminPurchaseRequests();
  }

  // 2. Initialize Request Quotation Form if on request-quotation.html
  const requestQuotationForm = document.getElementById('requestQuotationForm');
  if (requestQuotationForm) {
    initRequestQuotationForm(requestQuotationForm);
  }

  // 3. Initialize Vendor Quotation Requests Table if on vendor-quotation-requests.html or quotation-requests.html
  const vendorQRTableBody = document.getElementById('vendorQuotationRequestsTableBody');
  if (vendorQRTableBody) {
    loadVendorQuotationRequests();
  }
});

/**
 * Load all purchase requests for Admin view on purchase-requests.html
 */
async function loadAdminPurchaseRequests() {
  const tableBody = document.getElementById('adminPurchaseRequestsTableBody');
  const loadingIndicator = document.getElementById('tableLoading');
  const emptyState = document.getElementById('tableEmpty');
  const countBadge = document.getElementById('totalPRCount');

  if (!tableBody) return;

  if (loadingIndicator) loadingIndicator.style.display = 'block';
  if (emptyState) emptyState.style.display = 'none';

  try {
    const response = await authFetch('/api/requests/all');
    const data = await response.json();

    if (loadingIndicator) loadingIndicator.style.display = 'none';

    if (response.ok && data.success) {
      const requests = data.requests || [];

      if (countBadge) {
        countBadge.textContent = `${requests.length} Requests`;
      }

      if (requests.length === 0) {
        if (emptyState) emptyState.style.display = 'block';
        tableBody.innerHTML = '';
        return;
      }

      tableBody.innerHTML = requests.map(pr => {
        let badgeClass = 'badge-pending';
        if (pr.status === 'Quotation Requested') badgeClass = 'badge-pending';
        else if (pr.status === 'Quotation Received' || pr.status === 'Approved') badgeClass = 'badge-approved';
        else if (pr.status === 'Rejected') badgeClass = 'badge-rejected';

        return `
          <tr>
            <td><span class="request-id-tag">${escapeHtml(pr.request_id)}</span></td>
            <td>
              <strong>${escapeHtml(pr.requester_name || 'Requester')}</strong>
              <div style="font-size: 0.75rem; color: #64748b;">${escapeHtml(pr.requester_email || '')}</div>
            </td>
            <td>
              <strong>${escapeHtml(pr.product_name)}</strong>
              <div style="font-size: 0.75rem; color: #64748b;">${escapeHtml(pr.product_category)}</div>
            </td>
            <td><strong>${pr.quantity}</strong></td>
            <td style="max-width: 200px; font-size: 0.85rem; color: #334155;">
              ${escapeHtml(pr.requirements)}
            </td>
            <td>${escapeHtml(pr.required_delivery_date)}</td>
            <td><span class="badge ${badgeClass}">${escapeHtml(pr.status)}</span></td>
            <td>
              <a href="request-quotation.html?requestId=${encodeURIComponent(pr.id)}" class="btn btn-primary" style="padding: 0.35rem 0.75rem; font-size: 0.8rem; white-space: nowrap;">
                📤 Request Quotation
              </a>
            </td>
          </tr>
        `;
      }).join('');
    } else {
      showErrorAlert(data.message || 'Failed to load purchase requests.');
    }
  } catch (err) {
    if (loadingIndicator) loadingIndicator.style.display = 'none';
    console.error('Failed to load PRs:', err);
    showErrorAlert('Error fetching purchase requests.');
  }
}

/**
 * Handle Request Quotation Form on request-quotation.html
 */
async function initRequestQuotationForm(form) {
  const urlParams = new URLSearchParams(window.location.search);
  const prIdParam = urlParams.get('requestId');

  if (!prIdParam) {
    showErrorAlert('No purchase request specified.');
    return;
  }

  // 1. Fetch Purchase Request Details
  try {
    const response = await authFetch(`/api/requests/${encodeURIComponent(prIdParam)}`);
    const data = await response.json();

    if (response.ok && data.success && data.request) {
      const pr = data.request;
      document.getElementById('prDisplayId').textContent = pr.request_id;
      document.getElementById('prProductName').textContent = pr.product_name;
      document.getElementById('prCategory').textContent = pr.product_category;
      document.getElementById('prQuantity').textContent = pr.quantity;
      document.getElementById('prRequirements').textContent = pr.requirements;
      document.getElementById('prDeliveryDate').textContent = pr.required_delivery_date;

      // Pre-fill editable request fields
      document.getElementById('requestedQuantity').value = pr.quantity;
      document.getElementById('requirements').value = pr.requirements;
      document.getElementById('requiredDeliveryDate').value = pr.raw_delivery_date || '';
    } else {
      showErrorAlert(data.message || 'Failed to load purchase request details.');
    }
  } catch (err) {
    console.error('Error fetching PR details:', err);
    showErrorAlert('Error loading purchase request information.');
  }

  // 2. Fetch Active Vendors for Checkbox List
  const vendorsListContainer = document.getElementById('vendorsCheckboxList');
  try {
    const vResponse = await authFetch('/api/vendors/active');
    const vData = await vResponse.json();

    if (vResponse.ok && vData.success) {
      const vendors = vData.vendors || [];

      if (vendors.length === 0) {
        vendorsListContainer.innerHTML = `
          <div style="padding: 1rem; color: #94a3b8; font-size: 0.9rem;">
            No active vendors found in directory. <a href="add-vendor.html">Add a vendor first</a>.
          </div>
        `;
      } else {
        vendorsListContainer.innerHTML = vendors.map(v => `
          <label style="display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem; border-bottom: 1px solid var(--border-color); cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
            <input type="checkbox" name="selectedVendors" value="${v.id}" style="width: 18px; height: 18px; accent-color: var(--primary); cursor: pointer;">
            <div style="flex: 1;">
              <div style="font-weight: 600; color: var(--text-main); font-size: 0.95rem;">
                ${escapeHtml(v.vendor_name)} <span style="font-weight: 400; color: #64748b; font-size: 0.8rem;">(${escapeHtml(v.vendor_id)})</span>
              </div>
              <div style="font-size: 0.75rem; color: #64748b;">
                Category: ${escapeHtml(v.product_categories)} | ${escapeHtml(v.city || 'National')}
              </div>
            </div>
          </label>
        `).join('');
      }
    }
  } catch (err) {
    console.error('Error fetching active vendors:', err);
  }

  // 3. Form Submit Handler
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlerts();

    const selectedCheckboxes = document.querySelectorAll('input[name="selectedVendors"]:checked');
    const selectedVendorIds = Array.from(selectedCheckboxes).map(cb => parseInt(cb.value, 10));

    if (selectedVendorIds.length === 0) {
      showErrorAlert('Please select at least one vendor from the list.');
      return;
    }

    const requestedQuantity = document.getElementById('requestedQuantity').value;
    const requirements = document.getElementById('requirements').value.trim();
    const requiredDeliveryDate = document.getElementById('requiredDeliveryDate').value;
    const additionalMessage = document.getElementById('additionalMessage').value.trim();

    if (!requestedQuantity || parseInt(requestedQuantity, 10) <= 0) {
      showErrorAlert('Quantity must be a positive number.');
      return;
    }

    if (!requirements) {
      showErrorAlert('Product Requirements are mandatory.');
      return;
    }

    if (!requiredDeliveryDate) {
      showErrorAlert('Required Delivery Date is mandatory.');
      return;
    }

    const payload = {
      purchaseRequestId: prIdParam,
      vendorIds: selectedVendorIds,
      requestedQuantity: parseInt(requestedQuantity, 10),
      requirements,
      requiredDeliveryDate,
      additionalMessage
    };

    const submitBtn = document.getElementById('submitBtn');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = 'Sending Requests...';

    try {
      const response = await authFetch('/api/quotation-requests', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showSuccessModal(data.quotationRequestId || 'QR-1001');
      } else {
        showErrorAlert(data.message || 'Failed to send quotation request.');
      }
    } catch (err) {
      console.error('Send QR error:', err);
      showErrorAlert(err.message || 'Network error while sending quotation request.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  });
}

/**
 * Load Vendor-Specific Quotation Requests for logged-in vendor
 */
async function loadVendorQuotationRequests() {
  const tableBody = document.getElementById('vendorQuotationRequestsTableBody');
  const loadingIndicator = document.getElementById('tableLoading');
  const emptyState = document.getElementById('tableEmpty');
  const countBadge = document.getElementById('totalQRCount');

  if (!tableBody) return;

  if (loadingIndicator) loadingIndicator.style.display = 'block';
  if (emptyState) emptyState.style.display = 'none';

  try {
    const response = await authFetch('/api/vendor/quotation-requests');
    const data = await response.json();

    if (loadingIndicator) loadingIndicator.style.display = 'none';

    if (response.ok && data.success) {
      const qrs = data.quotationRequests || [];

      if (countBadge) {
        countBadge.textContent = `${qrs.length} Request${qrs.length === 1 ? '' : 's'}`;
      }

      if (qrs.length === 0) {
        if (emptyState) emptyState.style.display = 'block';
        tableBody.innerHTML = '';
        return;
      }

      tableBody.innerHTML = qrs.map(qr => {
        const isPending = qr.status === 'Pending';
        const isResponded = qr.status === 'Responded' || qr.status === 'Submitted';
        const badgeClass = isPending ? 'badge-pending' : 'badge-approved';

        return `
          <tr>
            <td><span class="request-id-tag" style="color: #b45309; background: #fef3c7; border-color: #fde68a;">${escapeHtml(qr.quotation_request_id)}</span></td>
            <td><span style="font-family: monospace; color: #475569; font-weight: 600;">${escapeHtml(qr.purchase_request_code)}</span></td>
            <td><strong>${escapeHtml(qr.product_name)}</strong></td>
            <td><span class="badge" style="background: var(--primary-light); color: var(--primary);">${escapeHtml(qr.product_category)}</span></td>
            <td><strong style="color: #b45309;">${qr.requested_quantity}</strong></td>
            <td>${escapeHtml(qr.required_delivery_date || 'N/A')}</td>
            <td>${escapeHtml(qr.request_date || qr.created_at || 'N/A')}</td>
            <td><span class="badge ${badgeClass}">${escapeHtml(qr.status)}</span></td>
            <td>
              <div style="display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap;">
                <a href="view-quotation-request.html?qrId=${encodeURIComponent(qr.id)}" class="btn btn-secondary" style="padding: 0.35rem 0.75rem; font-size: 0.8rem; white-space: nowrap;">
                  👁️ View
                </a>
                ${isPending ? `
                  <a href="submit-quotation.html?qrId=${encodeURIComponent(qr.id)}" class="btn btn-primary" style="padding: 0.35rem 0.75rem; font-size: 0.8rem; white-space: nowrap; background: linear-gradient(135deg, #d97706, #f59e0b);">
                    📝 Submit Quote
                  </a>
                ` : `
                  <span style="font-size: 0.8rem; color: #059669; font-weight: 600;">✓ Responded</span>
                `}
              </div>
            </td>
          </tr>
        `;
      }).join('');
    } else {
      showErrorAlert(data.message || 'Failed to load quotation requests.');
    }
  } catch (err) {
    if (loadingIndicator) loadingIndicator.style.display = 'none';
    console.error('Failed to load vendor QRs:', err);
    showErrorAlert('Error fetching assigned quotation requests.');
  }
}

/**
 * Handle View Quotation Request Details on view-quotation-request.html
 */
async function initViewQuotationRequest() {
  const urlParams = new URLSearchParams(window.location.search);
  const qrIdParam = urlParams.get('qrId');

  if (!qrIdParam) {
    showErrorAlert('No Quotation Request specified.');
    return;
  }

  try {
    const response = await authFetch(`/api/quotation-requests/${encodeURIComponent(qrIdParam)}`);
    const data = await response.json();

    if (response.ok && data.success && data.quotationRequest) {
      const qr = data.quotationRequest;

      document.getElementById('viewQRId').textContent = qr.quotation_request_id;
      document.getElementById('viewPRCode').textContent = qr.purchase_request_code;
      document.getElementById('viewProductName').textContent = qr.product_name;
      document.getElementById('viewCategory').textContent = qr.product_category;
      document.getElementById('viewQuantity').textContent = qr.requested_quantity;
      document.getElementById('viewDeliveryDate').textContent = qr.required_delivery_date;
      document.getElementById('viewRequestDate').textContent = qr.request_date || qr.created_at;
      document.getElementById('viewRequirements').textContent = qr.requirements;

      const isPending = qr.status === 'Pending';
      const statusBadge = document.getElementById('viewStatusBadge');
      if (statusBadge) {
        statusBadge.innerHTML = `<span class="badge ${isPending ? 'badge-pending' : 'badge-approved'}">${escapeHtml(qr.status)}</span>`;
      }

      // Special Message Container
      if (qr.additional_message && qr.additional_message.trim()) {
        const msgContainer = document.getElementById('additionalMessageContainer');
        const msgEl = document.getElementById('viewAdditionalMessage');
        if (msgContainer && msgEl) {
          msgEl.textContent = qr.additional_message;
          msgContainer.style.display = 'block';
        }
      }

      // Action Button
      const actionContainer = document.getElementById('actionButtonContainer');
      if (actionContainer) {
        if (isPending) {
          actionContainer.innerHTML = `
            <a href="submit-quotation.html?qrId=${encodeURIComponent(qr.id)}" class="btn btn-primary btn-lg" style="background: linear-gradient(135deg, #d97706, #f59e0b);">
              📝 Submit Quotation →
            </a>
          `;
        } else {
          actionContainer.innerHTML = `
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <span class="badge badge-approved" style="font-size: 0.9rem; padding: 0.5rem 1rem;">
                ✓ Quotation Already Submitted
              </span>
            </div>
          `;
        }
      }
    } else {
      showErrorAlert(data.message || 'Failed to load quotation request details.');
    }
  } catch (err) {
    console.error('Error viewing quotation request:', err);
    showErrorAlert('Network error while retrieving quotation request details.');
  }
}

/**
 * Filter helper for table
 */
function filterPRTable(inputId, tbodyId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const filter = input.value.toLowerCase();
  const rows = document.querySelectorAll(`#${tbodyId} tr`);

  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(filter) ? '' : 'none';
  });
}

/**
 * Toggle all vendor checkboxes
 */
function toggleSelectAllVendors(source) {
  const checkboxes = document.querySelectorAll('input[name="selectedVendors"]');
  checkboxes.forEach(cb => cb.checked = source.checked);
}

/**
 * Modal & Alert Helpers
 */
function showSuccessModal(qrId) {
  const modal = document.getElementById('qrSuccessModal');
  const qrIdDisplay = document.getElementById('modalQRId');

  if (modal && qrIdDisplay) {
    qrIdDisplay.textContent = qrId;
    modal.classList.add('active');
  } else {
    alert(`Quotation request sent successfully!\nQuotation Request ID: ${qrId}`);
    window.location.href = 'purchase-requests.html';
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
