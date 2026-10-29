/**
 * VEPRS - Vendor Feedback & Reviews Management (Sprint 5)
 * Handles SCRUM-40 (Feedback Management), SCRUM-31 (Submit Feedback), and SCRUM-32 (View Feedback)
 */

let allFeedbacks = [];
let availableVendors = [];
let availableOrders = [];
let currentVendorStats = null;

document.addEventListener('DOMContentLoaded', async () => {
  setupRoleBasedNavigation();
  await loadFeedbackSources();
  checkUrlParamsForPreFill();
  await loadFeedbacks();
});

/**
 * Configure UI based on current logged in user role
 */
function setupRoleBasedNavigation() {
  const user = getUser();
  if (!user) return;

  const role = user.role;
  const brandLogo = document.getElementById('brandLogoLink');
  const dashNav = document.getElementById('dashboardNavLink');
  const quickSubmit = document.getElementById('quickSubmitBtn');
  const btnTabSubmit = document.getElementById('btnTabSubmit');
  const btnTabMyFeedback = document.getElementById('btnTabMyFeedback');

  if (role === 'Admin') {
    if (brandLogo) brandLogo.href = 'admin-dashboard.html';
    if (dashNav) dashNav.href = 'admin-dashboard.html';
  } else if (role === 'Vendor') {
    if (brandLogo) brandLogo.href = 'vendor-dashboard.html';
    if (dashNav) dashNav.href = 'vendor-dashboard.html';
    // Vendors do not submit reviews on themselves
    if (quickSubmit) quickSubmit.style.display = 'none';
    if (btnTabSubmit) btnTabSubmit.style.display = 'none';
    if (btnTabMyFeedback) btnTabMyFeedback.style.display = 'none';
  } else {
    if (brandLogo) brandLogo.href = 'user-dashboard.html';
    if (dashNav) dashNav.href = 'user-dashboard.html';
  }
}

/**
 * Switch Active Tab
 */
function switchTab(tabId) {
  const tabs = ['browseTab', 'submitTab', 'myTab'];
  tabs.forEach(t => {
    const content = document.getElementById(t + 'Content');
    const btn = document.getElementById('btnTab' + t.replace('Tab', ''));
    if (content) content.style.display = (t === tabId) ? 'block' : 'none';
    if (btn) btn.classList.toggle('active', t === tabId);
  });

  // Highlight specific tab buttons
  const btnBrowse = document.getElementById('btnTabBrowse');
  const btnSubmit = document.getElementById('btnTabSubmit');
  const btnMy = document.getElementById('btnTabMyFeedback');

  if (btnBrowse) btnBrowse.classList.toggle('active', tabId === 'browseTab');
  if (btnSubmit) btnSubmit.classList.toggle('active', tabId === 'submitTab');
  if (btnMy) btnMy.classList.toggle('active', tabId === 'myTab');

  if (tabId === 'browseTab') {
    loadFeedbacks();
  } else if (tabId === 'myTab') {
    loadMyFeedback();
  }
}

/**
 * Fetch Feedback Sources (Vendors and User Orders)
 */
async function loadFeedbackSources() {
  try {
    const token = getToken();
    const res = await fetch('/api/feedback/sources', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (data.success) {
      availableVendors = data.vendors || [];
      availableOrders = data.orders || [];

      // Populate Vendor Selectors
      const vendorSelect = document.getElementById('vendorSelect');
      const filterVendor = document.getElementById('filterVendor');

      if (vendorSelect) {
        vendorSelect.innerHTML = '<option value="">-- Choose a Certified Vendor --</option>' +
          availableVendors.map(v => `
            <option value="${v.id}">${escapeHtml(v.vendor_name)} (${v.vendor_id}) — ${escapeHtml(v.product_categories || 'General')}</option>
          `).join('');
      }

      if (filterVendor) {
        filterVendor.innerHTML = '<option value="">All Certified Vendors</option>' +
          availableVendors.map(v => `
            <option value="${v.id}">${escapeHtml(v.vendor_name)}</option>
          `).join('');
      }

      // Populate Order Selector
      const orderSelect = document.getElementById('orderSelect');
      if (orderSelect) {
        orderSelect.innerHTML = '<option value="">-- No Specific Order / Direct Feedback --</option>' +
          availableOrders.map(o => `
            <option value="${o.id}">${escapeHtml(o.order_id)}: ${escapeHtml(o.product_name)} (${escapeHtml(o.vendor_name)}) — Status: ${escapeHtml(o.status)}</option>
          `).join('');
      }
    }
  } catch (err) {
    console.error('Failed to load feedback sources:', err);
  }
}

/**
 * Pre-fill Form if Query Parameters are Present
 */
function checkUrlParamsForPreFill() {
  const params = new URLSearchParams(window.location.search);
  const vendorIdParam = params.get('vendorId');
  const orderIdParam = params.get('orderId');
  const autoOpenSubmit = params.get('action') === 'review' || vendorIdParam;

  if (vendorIdParam) {
    const vendorSelect = document.getElementById('vendorSelect');
    if (vendorSelect) {
      vendorSelect.value = vendorIdParam;
    }
  }

  if (orderIdParam) {
    const orderSelect = document.getElementById('orderSelect');
    if (orderSelect) {
      orderSelect.value = orderIdParam;
    }
  }

  if (autoOpenSubmit) {
    switchTab('submitTab');
  }
}

/**
 * Handle Auto Vendor Selection when Order is Selected
 */
function onVendorSelectionChanged() {
  // If order is selected that belongs to different vendor, reset order
  const vendorSelect = document.getElementById('vendorSelect');
  const orderSelect = document.getElementById('orderSelect');
  if (!vendorSelect || !orderSelect) return;

  const selVendorId = parseInt(vendorSelect.value, 10);
  if (!selVendorId) return;

  // Filter orders by this vendor if desired
  const matchingOrder = availableOrders.find(o => o.vendor_id === selVendorId);
  if (matchingOrder && !orderSelect.value) {
    orderSelect.value = matchingOrder.id;
  }
}

/**
 * Star Rating Display & Text Helper
 */
function updateStarLabel(rating) {
  const labels = {
    1: '⭐ 1 - Poor (Requires significant improvement)',
    2: '⭐⭐ 2 - Fair (Below expectations)',
    3: '⭐⭐⭐ 3 - Good (Satisfactory service)',
    4: '⭐⭐⭐⭐ 4 - Very Good (Exceeded standard expectations)',
    5: '⭐⭐⭐⭐⭐ 5 - Excellent (Outstanding quality and logistics!)'
  };
  const display = document.getElementById('ratingTextDisplay');
  if (display) {
    display.textContent = labels[rating] || 'Please select a star rating (1 to 5)';
  }
}

/**
 * Character Counter for Comments
 */
function updateCharCount(textarea) {
  const counter = document.getElementById('charCountSpan');
  if (counter) {
    counter.textContent = `${textarea.value.length} / 1000 chars`;
  }
}

/**
 * SCRUM-31: Handle Feedback Submission
 */
async function handleFeedbackSubmit(e) {
  e.preventDefault();
  const alertBox = document.getElementById('formAlert');
  if (alertBox) alertBox.style.display = 'none';

  const vendorId = document.getElementById('vendorSelect').value;
  const orderId = document.getElementById('orderSelect').value;
  const ratingInput = document.querySelector('input[name="rating"]:checked');
  const comments = document.getElementById('commentsText').value.trim();
  const category = document.getElementById('categorySelect').value;

  if (!vendorId) {
    showAlert('Please select a vendor.', 'danger');
    return;
  }

  if (!ratingInput) {
    showAlert('Please select an overall star rating (1 to 5).', 'danger');
    return;
  }

  const rating = parseInt(ratingInput.value, 10);

  if (!comments) {
    showAlert('Please provide comments or evaluation remarks.', 'danger');
    return;
  }

  const submitBtn = document.getElementById('submitFeedbackBtn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting Feedback...';
  }

  try {
    const token = getToken();
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        vendorId,
        orderId: orderId || null,
        rating,
        comments,
        category
      })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      // Reset form
      document.getElementById('feedbackForm').reset();
      updateStarLabel(0);

      // Open Success Modal
      const modalBody = document.getElementById('successNoticeBody');
      if (modalBody) {
        modalBody.innerHTML = `
          <p><strong>Feedback ID:</strong> <span class="order-id-badge">${escapeHtml(data.feedbackId)}</span></p>
          <p><strong>Vendor:</strong> ${escapeHtml(data.feedback.vendorName)}</p>
          <p><strong>Rating:</strong> ${'★'.repeat(data.feedback.rating)}${'☆'.repeat(5 - data.feedback.rating)} (${data.feedback.rating} / 5.0)</p>
          <p><strong>Category:</strong> ${escapeHtml(data.feedback.category)}</p>
          <p style="margin-top: 0.75rem; color: var(--text-body);">Your review has been successfully recorded in the database and the vendor composite rating has been updated!</p>
        `;
      }
      openModal('successNoticeModal');
    } else {
      showAlert(data.message || 'Failed to submit feedback.', 'danger');
    }
  } catch (err) {
    console.error('Error submitting feedback:', err);
    showAlert('Network error while communicating with the server. Please check connection.', 'danger');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = '⭐ Submit Feedback';
    }
  }
}

/**
 * SCRUM-32: Load and Display All Verified Feedback
 */
async function loadFeedbacks() {
  const loading = document.getElementById('feedbackLoadingIndicator');
  const empty = document.getElementById('feedbackEmptyState');
  const container = document.getElementById('feedbackCardsContainer');

  if (loading) loading.style.display = 'block';
  if (empty) empty.style.display = 'none';
  if (container) container.style.display = 'none';

  try {
    const token = getToken();
    const filterVendor = document.getElementById('filterVendor') ? document.getElementById('filterVendor').value : '';
    const filterRating = document.getElementById('filterRating') ? document.getElementById('filterRating').value : '';
    const filterCategory = document.getElementById('filterCategory') ? document.getElementById('filterCategory').value : '';

    let url = '/api/feedback?';
    if (filterVendor) url += `vendorId=${encodeURIComponent(filterVendor)}&`;
    if (filterRating) url += `rating=${encodeURIComponent(filterRating)}&`;
    if (filterCategory) url += `category=${encodeURIComponent(filterCategory)}&`;

    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (loading) loading.style.display = 'none';

    if (data.success) {
      allFeedbacks = data.feedbacks || [];

      // Update Rating Summary Hero
      updateRatingSummary(allFeedbacks);

      if (allFeedbacks.length === 0) {
        if (empty) empty.style.display = 'block';
        if (container) container.innerHTML = '';
      } else {
        renderFeedbackCards(allFeedbacks);
        if (container) container.style.display = 'block';
      }
    } else {
      showAlert(data.message || 'Failed to load feedback records.', 'danger');
    }
  } catch (err) {
    if (loading) loading.style.display = 'none';
    console.error('Error loading feedback:', err);
    showAlert('Network error while retrieving feedback.', 'danger');
  }
}

/**
 * Update Rating Summary Hero Metrics & Breakdown Bars
 */
function updateRatingSummary(feedbacks) {
  const total = feedbacks.length;
  let sum = 0;
  const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };

  feedbacks.forEach(f => {
    sum += f.rating;
    if (counts[f.rating] !== undefined) {
      counts[f.rating]++;
    }
  });

  const avg = total > 0 ? (sum / total).toFixed(1) : '0.0';

  const avgElem = document.getElementById('summaryAvgRating');
  const starsElem = document.getElementById('summaryStarsDisplay');
  const totalElem = document.getElementById('summaryTotalReviews');

  if (avgElem) avgElem.textContent = avg;
  if (starsElem) starsElem.textContent = getStarString(Math.round(parseFloat(avg)));
  if (totalElem) totalElem.textContent = `Based on ${total} verified feedback review${total === 1 ? '' : 's'}`;

  // Update breakdown bars
  for (let r = 1; r <= 5; r++) {
    const countElem = document.getElementById(`count${r}`);
    const barElem = document.getElementById(`bar${r}`);
    const count = counts[r] || 0;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;

    if (countElem) countElem.textContent = count;
    if (barElem) barElem.style.width = `${pct}%`;
  }
}

/**
 * Render Feedback Cards Grid
 */
function renderFeedbackCards(feedbacks) {
  const container = document.getElementById('feedbackCardsContainer');
  if (!container) return;

  container.innerHTML = feedbacks.map(fb => `
    <div class="feedback-card">
      <div class="feedback-header">
        <div>
          <div style="display: flex; align-items: center; gap: 0.65rem; margin-bottom: 0.25rem;">
            <span class="feedback-stars">${'★'.repeat(fb.rating)}${'☆'.repeat(5 - fb.rating)}</span>
            <span style="font-weight: 800; font-size: 0.95rem; color: var(--text-main);">${fb.rating}.0 / 5.0</span>
            <span class="category-badge">${escapeHtml(fb.category || 'General')}</span>
            ${fb.order_code ? `
              <span class="status-badge badge-processing" style="font-size: 0.75rem;">
                📦 PO: ${escapeHtml(fb.order_code)}
              </span>
            ` : ''}
          </div>
          <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-main);">
            Vendor: ${escapeHtml(fb.vendor_name)} <span style="font-size: 0.8rem; color: var(--text-muted);">(${escapeHtml(fb.vendor_code)})</span>
          </div>
        </div>
        <div style="text-align: right;">
          <span class="order-id-badge" style="background: var(--bg-card);">${escapeHtml(fb.feedback_id)}</span>
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">
            ${escapeHtml(fb.feedback_date || 'Recent')}
          </div>
        </div>
      </div>

      <div style="font-size: 0.92rem; color: var(--text-body); line-height: 1.5; margin: 0.65rem 0; white-space: pre-wrap;">
        "${escapeHtml(fb.comments)}"
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-color); padding-top: 0.5rem; margin-top: 0.5rem; font-size: 0.8rem; color: var(--text-muted);">
        <div>
          Reviewed by: <strong>${escapeHtml(fb.user_name || 'Procurement User')}</strong>
        </div>
        <div>
          Status: <span style="color: var(--success); font-weight: 700;">✓ Verified Feedback</span>
        </div>
      </div>
    </div>
  `).join('');
}

/**
 * Load User's Authored Feedback (Tab 3)
 */
async function loadMyFeedback() {
  const loading = document.getElementById('myFeedbackLoading');
  const empty = document.getElementById('myFeedbackEmpty');
  const container = document.getElementById('myFeedbackContainer');

  if (loading) loading.style.display = 'block';
  if (empty) empty.style.display = 'none';
  if (container) container.style.display = 'none';

  try {
    const token = getToken();
    const res = await fetch('/api/feedback/my', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (loading) loading.style.display = 'none';

    if (data.success) {
      const myFeedbacks = data.feedbacks || [];
      if (myFeedbacks.length === 0) {
        if (empty) empty.style.display = 'block';
      } else {
        container.innerHTML = myFeedbacks.map(fb => `
          <div class="feedback-card">
            <div class="feedback-header">
              <div>
                <span class="feedback-stars">${'★'.repeat(fb.rating)}${'☆'.repeat(5 - fb.rating)}</span>
                <span style="font-weight: 700;">${fb.rating}.0 / 5.0</span>
                <span class="category-badge" style="margin-left: 0.5rem;">${escapeHtml(fb.category)}</span>
                <div style="font-weight: 700; margin-top: 0.25rem;">
                  Vendor: ${escapeHtml(fb.vendor_name)} (${escapeHtml(fb.vendor_code)})
                </div>
              </div>
              <div style="text-align: right;">
                <span class="order-id-badge">${escapeHtml(fb.feedback_id)}</span>
                <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(fb.feedback_date)}</div>
              </div>
            </div>
            <p style="font-size: 0.9rem; color: var(--text-body); margin: 0.5rem 0;">"${escapeHtml(fb.comments)}"</p>
          </div>
        `).join('');
        container.style.display = 'block';
      }
    }
  } catch (err) {
    if (loading) loading.style.display = 'none';
    console.error('Error loading my feedback:', err);
  }
}

function applyFilters() {
  loadFeedbacks();
}

function resetFilters() {
  const filterVendor = document.getElementById('filterVendor');
  const filterRating = document.getElementById('filterRating');
  const filterCategory = document.getElementById('filterCategory');

  if (filterVendor) filterVendor.value = '';
  if (filterRating) filterRating.value = '';
  if (filterCategory) filterCategory.value = '';

  loadFeedbacks();
}

function getStarString(num) {
  num = Math.max(0, Math.min(5, num));
  return '★'.repeat(num) + '☆'.repeat(5 - num);
}

function showAlert(message, type) {
  const alertBox = document.getElementById('formAlert');
  if (alertBox) {
    alertBox.className = `alert alert-${type}`;
    alertBox.innerHTML = `<span>${type === 'danger' ? '⚠️' : '✓'} ${escapeHtml(message)}</span>`;
    alertBox.style.display = 'flex';
    window.scrollTo({ top: alertBox.offsetTop - 80, behavior: 'smooth' });
  } else {
    alert(message);
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
