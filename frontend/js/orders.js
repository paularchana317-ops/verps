/**
 * VEPRS - Order Management & Tracking Logic (Sprint 4)
 * Handles SCRUM-29 (Create Order), SCRUM-30 (Track Order), and SCRUM-44 (Update Order Status)
 */

let allOrdersList = [];
let availableSourcesData = null;

// ==========================================================
// 1. CREATE ORDER LOGIC (SCRUM-29)
// ==========================================================

/**
 * Initialize Create Order Form Page
 */
async function initCreateOrderPage() {
  const form = document.getElementById('createOrderForm');
  if (!form) return;

  // Real-time calculation binding
  const qtyInput = document.getElementById('quantity');
  const priceInput = document.getElementById('unitPrice');
  if (qtyInput) qtyInput.addEventListener('input', calculateTotal);
  if (priceInput) priceInput.addEventListener('input', calculateTotal);

  // Load available vendors and workflow sources
  await loadOrderSources();

  // Parse URL search parameters (e.g. from vendor-recommendation.html)
  parseUrlParametersForPreFill();

  // Form Submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlerts();

    const vendorId = document.getElementById('vendorSelect').value;
    const productName = document.getElementById('productName').value.trim();
    const productCategory = document.getElementById('productCategory').value;
    const quantity = document.getElementById('quantity').value;
    const unitPrice = document.getElementById('unitPrice').value;
    const deliveryAddress = document.getElementById('deliveryAddress').value.trim();
    const contactPhone = document.getElementById('contactPhone').value.trim();
    const notes = document.getElementById('notes').value.trim();
    const purchaseRequestId = document.getElementById('purchaseRequestId').value;
    const quotationId = document.getElementById('quotationId').value;

    // Client-side Validations
    if (!vendorId) {
      showErrorAlert('Please select a certified vendor for this order.');
      document.getElementById('vendorSelect').focus();
      return;
    }

    if (!productName) {
      showErrorAlert('Please enter the Product Name / Description.');
      document.getElementById('productName').focus();
      return;
    }

    if (!quantity) {
      showErrorAlert('Please enter the Quantity.');
      document.getElementById('quantity').focus();
      return;
    }

    const parsedQty = parseInt(quantity, 10);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      showErrorAlert('Quantity must be a positive integer greater than 0.');
      document.getElementById('quantity').focus();
      return;
    }

    if (!unitPrice) {
      showErrorAlert('Please specify the Unit Price.');
      document.getElementById('unitPrice').focus();
      return;
    }

    const parsedPrice = parseFloat(unitPrice);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      showErrorAlert('Unit Price must be a positive number greater than 0.');
      document.getElementById('unitPrice').focus();
      return;
    }

    if (!deliveryAddress) {
      showErrorAlert('Please enter the delivery destination address.');
      document.getElementById('deliveryAddress').focus();
      return;
    }

    const payload = {
      vendorId,
      productName,
      productCategory,
      quantity: parsedQty,
      unitPrice: parsedPrice,
      deliveryAddress,
      contactPhone: contactPhone || null,
      notes: notes || null,
      purchaseRequestId: purchaseRequestId || null,
      quotationId: quotationId || null
    };

    const submitBtn = document.getElementById('submitOrderBtn');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = 'Placing Order...';

    try {
      const response = await authFetch('/api/orders', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showOrderSuccessModal(data.orderId || 'ORD-1001');
      } else {
        showErrorAlert(data.message || 'Failed to place purchase order.');
      }
    } catch (err) {
      console.error('Create Order Error:', err);
      showErrorAlert(err.message || 'Network error while placing order.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  });
}

/**
 * Load available sources (certified vendors, user requests, quotations)
 */
async function loadOrderSources() {
  const vendorSelect = document.getElementById('vendorSelect');
  const sourceSelect = document.getElementById('orderSourceSelect');
  const sourceGroup = document.getElementById('sourceSelectorGroup');

  try {
    const res = await authFetch('/api/orders/sources');
    const data = await res.json();

    if (res.ok && data.success) {
      availableSourcesData = data;

      // Populate certified vendors
      const vendors = data.vendors || [];
      if (vendorSelect) {
        if (vendors.length === 0) {
          vendorSelect.innerHTML = '<option value="">-- No active vendors found --</option>';
        } else {
          vendorSelect.innerHTML = '<option value="">-- Select Certified Vendor --</option>' +
            vendors.map(v => `
              <option value="${v.id}" data-vendor-code="${escapeHtml(v.vendor_id)}" data-vendor-name="${escapeHtml(v.vendor_name)}" data-phone="${escapeHtml(v.phone || '')}">
                ${escapeHtml(v.vendor_name)} (${escapeHtml(v.vendor_id)}) - ${escapeHtml(v.product_categories || 'Hardware')}
              </option>
            `).join('');
        }
      }

      // Populate workflow sources if user has existing requests/quotations
      const requests = data.requests || [];
      const quotations = data.quotations || [];

      if ((requests.length > 0 || quotations.length > 0) && sourceSelect && sourceGroup) {
        sourceGroup.style.display = 'block';
        let optionsHtml = '<option value="">-- Choose source requisition or quotation to pre-fill --</option>';

        if (quotations.length > 0) {
          optionsHtml += '<optgroup label="📋 Certified Vendor Quotations">';
          quotations.forEach(q => {
            optionsHtml += `
              <option value="QUO_${q.id}" data-type="quotation" data-id="${q.id}">
                ${escapeHtml(q.quotation_id)} | ${escapeHtml(q.product_name)} | ${escapeHtml(q.vendor_name)} ($${parseFloat(q.unit_price).toFixed(2)})
              </option>
            `;
          });
          optionsHtml += '</optgroup>';
        }

        if (requests.length > 0) {
          optionsHtml += '<optgroup label="📑 Department Purchase Requests">';
          requests.forEach(r => {
            optionsHtml += `
              <option value="REQ_${r.id}" data-type="request" data-id="${r.id}">
                ${escapeHtml(r.request_id)} | ${escapeHtml(r.product_name)} (Qty: ${r.quantity}) [${escapeHtml(r.status)}]
              </option>
            `;
          });
          optionsHtml += '</optgroup>';
        }

        sourceSelect.innerHTML = optionsHtml;
      }
    }
  } catch (err) {
    console.error('Error loading order sources:', err);
    if (vendorSelect) {
      vendorSelect.innerHTML = '<option value="">-- Error loading vendors --</option>';
    }
  }
}

/**
 * Handle Source Selection (pre-filling fields)
 */
function handleSourceSelection(val) {
  if (!val || !availableSourcesData) return;

  if (val.startsWith('QUO_')) {
    const qId = parseInt(val.replace('QUO_', ''), 10);
    const q = (availableSourcesData.quotations || []).find(item => item.id === qId);
    if (q) {
      document.getElementById('quotationId').value = q.id;
      document.getElementById('purchaseRequestId').value = q.purchase_request_id || '';
      document.getElementById('productName').value = q.product_name || '';
      document.getElementById('quantity').value = q.quantity || 1;
      document.getElementById('unitPrice').value = q.unit_price || '';
      if (document.getElementById('vendorSelect')) {
        document.getElementById('vendorSelect').value = q.vendor_id;
      }
      calculateTotal();
    }
  } else if (val.startsWith('REQ_')) {
    const rId = parseInt(val.replace('REQ_', ''), 10);
    const r = (availableSourcesData.requests || []).find(item => item.id === rId);
    if (r) {
      document.getElementById('purchaseRequestId').value = r.id;
      document.getElementById('quotationId').value = '';
      document.getElementById('productName').value = r.product_name || '';
      document.getElementById('quantity').value = r.quantity || 1;
      if (r.product_category) {
        document.getElementById('productCategory').value = r.product_category;
      }
      calculateTotal();
    }
  }
}

/**
 * Handle vendor selection change
 */
function handleVendorChange(vendorId) {
  const vendorSelect = document.getElementById('vendorSelect');
  if (!vendorSelect) return;
  const selectedOption = vendorSelect.options[vendorSelect.selectedIndex];
  if (selectedOption && selectedOption.dataset.phone) {
    const phoneInput = document.getElementById('contactPhone');
    if (phoneInput && !phoneInput.value) {
      phoneInput.value = selectedOption.dataset.phone;
    }
  }
}

/**
 * Real-time calculation: Total Amount = Quantity * Unit Price
 */
function calculateTotal() {
  const qtyInput = document.getElementById('quantity');
  const priceInput = document.getElementById('unitPrice');
  const display = document.getElementById('totalAmountDisplay');

  if (!qtyInput || !priceInput || !display) return;

  const qty = parseInt(qtyInput.value, 10);
  const price = parseFloat(priceInput.value);

  if (!isNaN(qty) && qty > 0 && !isNaN(price) && price >= 0) {
    const total = (qty * price).toFixed(2);
    display.textContent = `$${parseFloat(total).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  } else {
    display.textContent = '$0.00';
  }
}

/**
 * Parse URL query parameters to pre-fill from recommendation / comparison
 */
function parseUrlParametersForPreFill() {
  const urlParams = new URLSearchParams(window.location.search);
  const vendorId = urlParams.get('vendorId');
  const vendorName = urlParams.get('vendorName');
  const productName = urlParams.get('productName');
  const unitPrice = urlParams.get('unitPrice');
  const quantity = urlParams.get('quantity');
  const quotationId = urlParams.get('quotationId');
  const purchaseRequestId = urlParams.get('purchaseRequestId');

  if (vendorId || productName || unitPrice) {
    const banner = document.getElementById('sourceContextBanner');
    const details = document.getElementById('sourceContextDetails');
    if (banner) banner.style.display = 'block';

    if (details && vendorName) {
      details.innerHTML = `Order details pre-populated for <strong>${escapeHtml(vendorName)}</strong>. Review specifications and submit order.`;
    }

    if (vendorId) {
      const vSelect = document.getElementById('vendorSelect');
      if (vSelect) {
        // Find matching option by id or vendor_code
        setTimeout(() => {
          for (let i = 0; i < vSelect.options.length; i++) {
            if (vSelect.options[i].value == vendorId || vSelect.options[i].dataset.vendorCode == vendorId) {
              vSelect.selectedIndex = i;
              break;
            }
          }
        }, 150);
      }
    }

    if (productName) {
      document.getElementById('productName').value = productName;
    }

    if (quantity) {
      document.getElementById('quantity').value = quantity;
    } else {
      document.getElementById('quantity').value = 1;
    }

    if (unitPrice) {
      document.getElementById('unitPrice').value = parseFloat(unitPrice).toFixed(2);
    }

    if (quotationId) {
      document.getElementById('quotationId').value = quotationId;
    }

    if (purchaseRequestId) {
      document.getElementById('purchaseRequestId').value = purchaseRequestId;
    }

    calculateTotal();
  }
}

/**
 * Show Success Modal after placing order
 */
function showOrderSuccessModal(orderId) {
  const modal = document.getElementById('orderSuccessModal');
  const idDisplay = document.getElementById('modalOrderId');

  if (modal && idDisplay) {
    idDisplay.textContent = orderId;
    modal.classList.add('active');
  } else {
    alert(`Purchase order ${orderId} placed successfully!`);
    window.location.href = 'orders.html';
  }
}


// ==========================================================
// 2. ORDER TRACKING & LISTING (SCRUM-30)
// ==========================================================

/**
 * Initialize Orders Tracking Page
 */
function initOrdersTrackingPage() {
  const user = getUser();
  if (!user) return;

  const role = normalizeRole(user.role);

  // Customize UI based on role
  const titleEl = document.getElementById('ordersHeaderTitle');
  const subtitleEl = document.getElementById('ordersHeaderSubtitle');
  const createActionEl = document.getElementById('createOrderActionContainer');
  const portalSubtitle = document.getElementById('portalSubtitle');
  const emptyMsg = document.getElementById('emptyStateMessage');
  const emptyAction = document.getElementById('emptyStateAction');

  if (role === 'Vendor') {
    if (titleEl) titleEl.textContent = 'Assigned Purchase Orders';
    if (subtitleEl) subtitleEl.textContent = 'Review incoming purchase orders awarded to your company and update fulfillment milestones.';
    if (createActionEl) createActionEl.style.display = 'none';
    if (portalSubtitle) portalSubtitle.textContent = 'Vendor Portal';
    if (emptyMsg) emptyMsg.textContent = 'No purchase orders have been placed with your company yet.';
    if (emptyAction) emptyAction.style.display = 'none';

    // Update navigation
    const dashLink = document.getElementById('dashboardNavLink');
    if (dashLink) dashLink.href = 'vendor-dashboard.html';
    const brandLink = document.getElementById('brandLogoLink');
    if (brandLink) brandLink.href = 'vendor-dashboard.html';
    const recLink = document.getElementById('recommendationsNavLink');
    if (recLink) recLink.style.display = 'none';

  } else if (role === 'Admin') {
    if (titleEl) titleEl.textContent = 'All Procurement Orders';
    if (subtitleEl) subtitleEl.textContent = 'Enterprise purchase orders tracking, vendor status transitions, and fulfillment oversight.';
    if (portalSubtitle) portalSubtitle.textContent = 'Admin Portal';
    if (emptyMsg) emptyMsg.textContent = 'No procurement orders exist in the system yet.';

    const dashLink = document.getElementById('dashboardNavLink');
    if (dashLink) dashLink.href = 'admin-dashboard.html';
    const brandLink = document.getElementById('brandLogoLink');
    if (brandLink) brandLink.href = 'admin-dashboard.html';
  } else {
    // User / Requester
    if (titleEl) titleEl.textContent = 'My Purchase Orders';
    if (subtitleEl) subtitleEl.textContent = 'Track your active procurement orders, delivery milestones, and order history in real-time.';
  }

  loadOrders();
}

/**
 * Load Orders from Backend
 */
async function loadOrders() {
  const tableBody = document.getElementById('ordersTableBody');
  const table = document.getElementById('ordersTable');
  const loading = document.getElementById('tableLoading');
  const emptyState = document.getElementById('tableEmpty');
  const countBadge = document.getElementById('ordersCountBadge');

  if (loading) loading.style.display = 'block';
  if (emptyState) emptyState.style.display = 'none';
  if (table) table.style.display = 'none';

  const user = getUser();
  const role = user ? normalizeRole(user.role) : 'User/Requester';

  let endpoint = '/api/orders/my-orders';
  if (role === 'Vendor') {
    endpoint = '/api/orders/vendor-orders';
  } else if (role === 'Admin') {
    endpoint = '/api/orders/all';
  }

  try {
    const res = await authFetch(endpoint);
    const data = await res.json();

    if (loading) loading.style.display = 'none';

    if (res.ok && data.success) {
      allOrdersList = data.orders || [];

      if (countBadge) {
        countBadge.textContent = `${allOrdersList.length} Order${allOrdersList.length === 1 ? '' : 's'}`;
      }

      if (allOrdersList.length === 0) {
        if (emptyState) emptyState.style.display = 'block';
        if (tableBody) tableBody.innerHTML = '';
        return;
      }

      if (table) table.style.display = 'table';
      renderOrdersTable(allOrdersList);
    } else {
      showErrorAlert(data.message || 'Failed to retrieve orders.');
    }
  } catch (err) {
    if (loading) loading.style.display = 'none';
    console.error('Error fetching orders:', err);
    showErrorAlert('Network error while retrieving orders.');
  }
}

/**
 * Render Orders Table Rows
 */
function renderOrdersTable(orders) {
  const tableBody = document.getElementById('ordersTableBody');
  if (!tableBody) return;

  const user = getUser();
  const role = user ? normalizeRole(user.role) : 'User/Requester';
  const isVendor = role === 'Vendor';
  const isAdmin = role === 'Admin';
  const isUser = !isVendor && !isAdmin;

  tableBody.innerHTML = orders.map(order => {
    const statusClass = getOrderStatusBadgeClass(order.status);
    const canCancel = (isUser || isAdmin) && order.status === 'Placed';
    const canUpdate = (isVendor && ['Placed', 'Processing', 'Shipped'].includes(order.status)) ||
                      (isAdmin && !['Delivered', 'Cancelled'].includes(order.status));

    return `
      <tr>
        <td>
          <span class="request-id-tag">${escapeHtml(order.order_id)}</span>
          ${order.quotation_code ? `<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.2rem;">Ref: ${escapeHtml(order.quotation_code)}</div>` : ''}
        </td>
        <td>
          <strong style="color: var(--text-main); font-size: 0.95rem;">${escapeHtml(order.vendor_name)}</strong>
          <div style="font-size: 0.75rem; color: var(--text-muted); font-family: monospace;">${escapeHtml(order.vendor_code)}</div>
        </td>
        <td>
          <strong style="color: var(--text-main);">${escapeHtml(order.product_name)}</strong>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(order.product_category)}</div>
        </td>
        <td>
          <strong>${order.quantity}</strong> units
        </td>
        <td>
          $${parseFloat(order.unit_price).toFixed(2)}
        </td>
        <td>
          <strong style="font-size: 1rem; color: var(--primary); font-family: monospace;">
            $${parseFloat(order.total_price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </strong>
        </td>
        <td style="white-space: nowrap;">
          ${escapeHtml(order.order_date || 'N/A')}
        </td>
        <td>
          <span class="badge ${statusClass}">
            ${escapeHtml(order.status)}
          </span>
        </td>
        <td style="white-space: nowrap;">
          <div style="display: flex; gap: 0.4rem; align-items: center;">
            <button onclick="openOrderDetail('${escapeHtml(order.order_id)}')" class="btn btn-secondary" style="padding: 0.35rem 0.65rem; font-size: 0.8rem;" title="View Tracking & PO Details">
              👁️ View
            </button>

            ${canUpdate ? `
              <button onclick="openUpdateStatusModal('${escapeHtml(order.order_id)}', '${escapeHtml(order.status)}')" class="btn btn-primary" style="padding: 0.35rem 0.65rem; font-size: 0.8rem; background: var(--primary); color: #FFFFFF !important;">
                ⚡ Update
              </button>
            ` : ''}

            ${canCancel ? `
              <button onclick="openCancelOrderModal('${escapeHtml(order.order_id)}')" class="btn btn-outline-danger" style="padding: 0.35rem 0.65rem; font-size: 0.8rem;" title="Cancel this placed order">
                ✕ Cancel
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Filter orders in table based on search input and status filter
 */
function filterOrdersTable() {
  const searchInput = document.getElementById('orderSearchInput');
  const statusFilter = document.getElementById('statusFilter');

  const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const selectedStatus = statusFilter ? statusFilter.value : 'ALL';

  const filtered = allOrdersList.filter(o => {
    const matchesSearch = !searchTerm ||
      o.order_id.toLowerCase().includes(searchTerm) ||
      o.product_name.toLowerCase().includes(searchTerm) ||
      o.vendor_name.toLowerCase().includes(searchTerm) ||
      o.vendor_code.toLowerCase().includes(searchTerm) ||
      (o.quotation_code && o.quotation_code.toLowerCase().includes(searchTerm));

    const matchesStatus = selectedStatus === 'ALL' || o.status === selectedStatus;

    return matchesSearch && matchesStatus;
  });

  const tableBody = document.getElementById('ordersTableBody');
  const table = document.getElementById('ordersTable');
  const emptyState = document.getElementById('tableEmpty');

  if (filtered.length === 0) {
    if (table) table.style.display = 'none';
    if (emptyState) emptyState.style.display = 'block';
  } else {
    if (emptyState) emptyState.style.display = 'none';
    if (table) table.style.display = 'table';
    renderOrdersTable(filtered);
  }
}

/**
 * Open detailed tracking & PO modal
 */
function openOrderDetail(orderId) {
  const order = allOrdersList.find(o => o.order_id === orderId);
  if (!order) return;

  const modal = document.getElementById('orderDetailModal');
  const title = document.getElementById('modalOrderIdTitle');
  const trackerContainer = document.getElementById('modalTrackerContainer');
  const body = document.getElementById('modalOrderDetailsBody');
  const actions = document.getElementById('modalOrderActions');

  if (!modal) return;

  if (title) title.textContent = order.order_id;

  // Render Visual Progress Timeline
  if (trackerContainer) {
    trackerContainer.innerHTML = buildOrderTrackerHtml(order.status);
  }

  // Render Order Details Grid
  if (body) {
    body.innerHTML = `
      <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem; margin-bottom: 1.25rem;">
        <div class="form-row" style="margin-bottom: 0.75rem;">
          <div>
            <div style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: var(--text-muted);">Assigned Vendor</div>
            <strong style="font-size: 1rem; color: var(--text-main);">${escapeHtml(order.vendor_name)}</strong>
            <div style="font-size: 0.8rem; color: var(--text-muted); font-family: monospace;">${escapeHtml(order.vendor_code)}</div>
          </div>
          <div>
            <div style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: var(--text-muted);">Requester</div>
            <strong style="font-size: 1rem; color: var(--text-main);">${escapeHtml(order.user_name)}</strong>
            <div style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(order.user_email)}</div>
          </div>
        </div>

        <div class="form-row" style="margin-bottom: 0.75rem;">
          <div>
            <div style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: var(--text-muted);">Product Ordered</div>
            <strong style="color: var(--text-main);">${escapeHtml(order.product_name)}</strong>
            <div style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(order.product_category)}</div>
          </div>
          <div>
            <div style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: var(--text-muted);">Pricing Breakdown</div>
            <div><strong>${order.quantity} units</strong> × $${parseFloat(order.unit_price).toFixed(2)}</div>
            <div style="font-size: 1.15rem; font-weight: 800; color: var(--primary); font-family: monospace;">Total: $${parseFloat(order.total_price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
        </div>

        <div style="margin-bottom: 0.75rem;">
          <div style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: var(--text-muted);">Destination / Delivery Address</div>
          <p style="margin-bottom: 0; font-size: 0.9rem; color: var(--text-body); background: var(--primary-light); padding: 0.65rem 0.85rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
            📍 ${escapeHtml(order.delivery_address)}
          </p>
        </div>

        ${order.notes ? `
          <div style="margin-bottom: 0.75rem;">
            <div style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: var(--text-muted);">Special Instructions / Notes</div>
            <p style="margin-bottom: 0; font-size: 0.85rem; color: var(--text-muted); font-style: italic;">
              "${escapeHtml(order.notes)}"
            </p>
          </div>
        ` : ''}

        <div style="display: flex; gap: 1.5rem; font-size: 0.8rem; color: var(--text-muted); border-top: 1px dashed var(--border-color); padding-top: 0.75rem;">
          <div>Order Date: <strong>${escapeHtml(order.order_date || 'N/A')}</strong></div>
          ${order.contact_phone ? `<div>Contact: <strong>${escapeHtml(order.contact_phone)}</strong></div>` : ''}
          ${order.quotation_code ? `<div>Quotation: <strong>${escapeHtml(order.quotation_code)}</strong></div>` : ''}
        </div>
      </div>
    `;
  }

  modal.classList.add('active');
}

/**
 * Build Visual Tracker Timeline HTML
 */
function buildOrderTrackerHtml(status) {
  if (status === 'Cancelled') {
    return `
      <div style="background: var(--danger-light); border: 1px solid var(--danger-subtle); border-radius: var(--radius-md); padding: 1.25rem; text-align: center; margin-bottom: 1.5rem;">
        <div style="font-size: 2rem; margin-bottom: 0.25rem;">✕</div>
        <div style="font-weight: 800; font-size: 1.15rem; color: var(--danger-text);">Order Cancelled</div>
        <div style="font-size: 0.85rem; color: var(--danger-text); margin-top: 0.25rem;">
          This purchase order was cancelled. No further fulfillment actions will take place.
        </div>
      </div>
    `;
  }

  const steps = ['Placed', 'Processing', 'Shipped', 'Delivered'];
  const currentIndex = steps.indexOf(status);

  let progressWidth = '0%';
  if (currentIndex === 1) progressWidth = '33%';
  if (currentIndex === 2) progressWidth = '66%';
  if (currentIndex === 3) progressWidth = '100%';

  return `
    <div style="margin: 1.5rem 0 2rem;">
      <div class="order-tracker-bar">
        <div class="tracker-progress-line" style="width: calc(${progressWidth} - 2rem);"></div>
        ${steps.map((s, idx) => {
          let stepClass = '';
          if (idx < currentIndex) stepClass = 'completed';
          else if (idx === currentIndex) stepClass = 'active';

          let icon = idx + 1;
          if (idx < currentIndex) icon = '✓';

          return `
            <div class="tracker-step ${stepClass}">
              <div class="tracker-circle">${icon}</div>
              <div class="tracker-label">${s}</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

/**
 * Map Status String to CSS Badge Class
 */
function getOrderStatusBadgeClass(status) {
  if (!status) return 'badge-placed';
  const s = status.toLowerCase();
  if (s === 'placed') return 'badge-placed';
  if (s === 'processing') return 'badge-processing';
  if (s === 'shipped') return 'badge-shipped';
  if (s === 'delivered') return 'badge-delivered';
  if (s === 'cancelled') return 'badge-cancelled';
  return 'badge-placed';
}


// ==========================================================
// 3. STATUS UPDATE & CANCELLATION (SCRUM-44)
// ==========================================================

/**
 * Open Modal to Update Order Status (SCRUM-44)
 */
function openUpdateStatusModal(orderId, currentStatus) {
  const modal = document.getElementById('updateStatusModal');
  const label = document.getElementById('statusOrderLabel');
  const idInput = document.getElementById('statusOrderId');
  const select = document.getElementById('newStatusSelect');
  const helpText = document.getElementById('statusHelpText');

  if (!modal || !select) return;

  label.textContent = orderId;
  idInput.value = orderId;

  const user = getUser();
  const role = user ? normalizeRole(user.role) : 'User/Requester';
  const isVendor = role === 'Vendor';
  const isAdmin = role === 'Admin';

  let optionsHtml = '';

  if (isVendor) {
    if (currentStatus === 'Placed') {
      optionsHtml = '<option value="Processing" selected>Processing (Accept Order & Begin Packaging)</option>';
      if (helpText) helpText.textContent = 'Accepting this order advances it to the Processing stage.';
    } else if (currentStatus === 'Processing') {
      optionsHtml = '<option value="Shipped" selected>Shipped (Dispatched to Courier / In Transit)</option>';
      if (helpText) helpText.textContent = 'Marking this order as Shipped notifies the requester of transit dispatch.';
    } else if (currentStatus === 'Shipped') {
      optionsHtml = '<option value="Delivered" selected>Delivered (Received & Delivered at Destination)</option>';
      if (helpText) helpText.textContent = 'Final fulfillment confirmation: marks goods as delivered.';
    }
  } else if (isAdmin) {
    // Admin can perform forward transitions or administrative cancellation
    const adminAllowed = {
      'Placed': ['Processing', 'Cancelled'],
      'Processing': ['Shipped', 'Cancelled'],
      'Shipped': ['Delivered', 'Cancelled']
    };
    const allowed = adminAllowed[currentStatus] || [];
    optionsHtml = allowed.map(s => `
      <option value="${s}">${s}</option>
    `).join('');
    if (helpText) helpText.textContent = 'Select authorized status transition.';
  }

  select.innerHTML = optionsHtml;
  modal.classList.add('active');
}

/**
 * Submit Status Update (SCRUM-44)
 */
async function handleStatusSubmit(event) {
  event.preventDefault();
  clearAlerts();

  const orderId = document.getElementById('statusOrderId').value;
  const newStatus = document.getElementById('newStatusSelect').value;
  const comment = document.getElementById('statusComment').value.trim();

  if (!orderId || !newStatus) return;

  const saveBtn = document.getElementById('saveStatusBtn');
  const originalText = saveBtn.innerHTML;
  saveBtn.disabled = true;
  saveBtn.innerHTML = 'Updating...';

  try {
    const res = await authFetch(`/api/orders/${encodeURIComponent(orderId)}/status`, {
      method: 'PUT',
      body: JSON.stringify({
        status: newStatus,
        comment: comment || null
      })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      closeModal('updateStatusModal');
      showSuccessAlert(data.message || `Order ${orderId} updated to '${newStatus}'.`);
      await loadOrders();
    } else {
      showErrorAlert(data.message || 'Failed to update order status.');
    }
  } catch (err) {
    console.error('Update status error:', err);
    showErrorAlert(err.message || 'Network error while updating status.');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = originalText;
  }
}

/**
 * Open Cancel Order Confirmation Modal (SCRUM-44)
 */
function openCancelOrderModal(orderId) {
  const modal = document.getElementById('cancelOrderModal');
  const idDisplay = document.getElementById('cancelModalOrderId');
  const hiddenInput = document.getElementById('cancelOrderIdHidden');

  if (modal && idDisplay && hiddenInput) {
    idDisplay.textContent = orderId;
    hiddenInput.value = orderId;
    modal.classList.add('active');
  }
}

/**
 * Confirm cancellation of order
 */
async function confirmCancelOrder() {
  const orderId = document.getElementById('cancelOrderIdHidden').value;
  if (!orderId) return;

  try {
    const res = await authFetch(`/api/orders/${encodeURIComponent(orderId)}/status`, {
      method: 'PUT',
      body: JSON.stringify({
        status: 'Cancelled',
        comment: 'Order cancelled by requester'
      })
    });

    const data = await res.json();

    closeModal('cancelOrderModal');

    if (res.ok && data.success) {
      showSuccessAlert(`Order ${orderId} has been successfully cancelled.`);
      await loadOrders();
    } else {
      showErrorAlert(data.message || 'Failed to cancel order.');
    }
  } catch (err) {
    console.error('Cancel order error:', err);
    showErrorAlert('Network error while cancelling order.');
  }
}

/**
 * Modal & Alert Helpers
 */
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
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

function showSuccessAlert(message) {
  const alertBox = document.getElementById('formAlert');
  if (alertBox) {
    alertBox.className = 'alert alert-success';
    alertBox.innerHTML = `<span>✓ ${escapeHtml(message)}</span>`;
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
