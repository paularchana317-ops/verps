/**
 * VEPRS - Vendor Evaluation (Sprint 3: SCRUM-26)
 * Real-time weighted scoring formula:
 * Overall Score = (Price Score × 0.40) + (Quality Score × 0.35) + (Delivery Score × 0.25)
 */

let activeVendors = [];
let vendorQuotations = [];
let editingEvaluationId = null;

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Vendor Evaluation Form if on vendor-evaluation.html
  const evaluationForm = document.getElementById('vendorEvaluationForm');
  if (evaluationForm) {
    initEvaluationForm(evaluationForm);
  }

  // 2. Load Evaluations Table
  const evaluationsTableBody = document.getElementById('evaluationsTableBody');
  if (evaluationsTableBody) {
    loadEvaluationsTable();
  }
});

/**
 * Initialize Evaluation Form
 */
async function initEvaluationForm(form) {
  const vendorSelect = document.getElementById('vendorSelect');
  const priceScoreInput = document.getElementById('priceScore');
  const qualityScoreInput = document.getElementById('qualityScore');
  const deliveryScoreInput = document.getElementById('deliveryScore');

  // Check URL parameters for pre-selected vendor (e.g. ?vendorId=1)
  const urlParams = new URLSearchParams(window.location.search);
  const preSelectedVendorId = urlParams.get('vendorId');

  // Load Active Vendors
  try {
    const res = await authFetch('/api/vendors/active');
    const data = await res.json();

    if (res.ok && data.success) {
      activeVendors = data.vendors || [];
      if (vendorSelect) {
        vendorSelect.innerHTML = '<option value="">-- Choose a vendor to evaluate --</option>' +
          activeVendors.map(v => `
            <option value="${v.id}" ${preSelectedVendorId == v.id || preSelectedVendorId == v.vendor_id ? 'selected' : ''}>
              ${escapeHtml(v.vendor_name)} (${escapeHtml(v.vendor_id)}) - ${escapeHtml(v.product_categories)}
            </option>
          `).join('');

        if (preSelectedVendorId) {
          onVendorSelected(preSelectedVendorId);
        }
      }
    }
  } catch (err) {
    console.error('Error loading active vendors:', err);
  }

  // Attach change listener on vendor select
  if (vendorSelect) {
    vendorSelect.addEventListener('change', (e) => {
      onVendorSelected(e.target.value);
    });
  }

  // Attach real-time score calculation listeners
  [priceScoreInput, qualityScoreInput, deliveryScoreInput].forEach(input => {
    if (input) {
      input.addEventListener('input', updateScorePreview);
      input.addEventListener('change', updateScorePreview);
    }
  });

  // Form Submit Handler
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlerts();

    const selectedVendorId = vendorSelect ? vendorSelect.value : null;
    const quotationRef = document.getElementById('quotationRef') ? document.getElementById('quotationRef').value : null;
    const priceScoreVal = priceScoreInput ? priceScoreInput.value.trim() : '';
    const qualityScoreVal = qualityScoreInput ? qualityScoreInput.value.trim() : '';
    const deliveryScoreVal = deliveryScoreInput ? deliveryScoreInput.value.trim() : '';
    const feedbackVal = document.getElementById('feedback') ? document.getElementById('feedback').value.trim() : '';

    if (!selectedVendorId) {
      showErrorAlert('Please select a vendor to evaluate.');
      if (vendorSelect) vendorSelect.focus();
      return;
    }

    if (!priceScoreVal || isNaN(priceScoreVal) || parseFloat(priceScoreVal) < 0 || parseFloat(priceScoreVal) > 100) {
      showErrorAlert('Price Score must be a valid number between 0 and 100.');
      if (priceScoreInput) priceScoreInput.focus();
      return;
    }

    if (!qualityScoreVal || isNaN(qualityScoreVal) || parseFloat(qualityScoreVal) < 0 || parseFloat(qualityScoreVal) > 100) {
      showErrorAlert('Quality Score must be a valid number between 0 and 100.');
      if (qualityScoreInput) qualityScoreInput.focus();
      return;
    }

    if (!deliveryScoreVal || isNaN(deliveryScoreVal) || parseFloat(deliveryScoreVal) < 0 || parseFloat(deliveryScoreVal) > 100) {
      showErrorAlert('Delivery Score must be a valid number between 0 and 100.');
      if (deliveryScoreInput) deliveryScoreInput.focus();
      return;
    }

    const payload = {
      vendorId: selectedVendorId,
      quotationId: quotationRef || null,
      priceScore: parseFloat(priceScoreVal),
      qualityScore: parseFloat(qualityScoreVal),
      deliveryScore: parseFloat(deliveryScoreVal),
      feedback: feedbackVal
    };

    const submitBtn = document.getElementById('submitEvalBtn');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = editingEvaluationId ? 'Updating Evaluation...' : 'Submitting Evaluation...';

    try {
      const endpoint = editingEvaluationId ? `/api/evaluations/${editingEvaluationId}` : '/api/evaluations';
      const method = editingEvaluationId ? 'PUT' : 'POST';

      const res = await authFetch(endpoint, {
        method,
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (res.ok && data.success) {
        showSuccessModal(data.evaluationId || (data.evaluation ? data.evaluation.evaluationId : 'EVAL-1001'));
        form.reset();
        editingEvaluationId = null;
        updateScorePreview();
        loadEvaluationsTable();
      } else {
        showErrorAlert(data.message || 'Failed to submit evaluation.');
      }
    } catch (err) {
      console.error('Submit evaluation error:', err);
      showErrorAlert(err.message || 'Network error while submitting evaluation.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  });
}

/**
 * Handle vendor selection to load information card and quotation history
 */
async function onVendorSelected(vendorId) {
  const infoCard = document.getElementById('selectedVendorInfoCard');
  if (!vendorId) {
    if (infoCard) infoCard.style.display = 'none';
    return;
  }

  const vendor = activeVendors.find(v => v.id == vendorId || v.vendor_id == vendorId);
  if (vendor && infoCard) {
    document.getElementById('infoVendorName').textContent = vendor.vendor_name;
    document.getElementById('infoVendorId').textContent = vendor.vendor_id;
    document.getElementById('infoContact').textContent = `${vendor.contact_person} (${vendor.phone || 'N/A'})`;
    document.getElementById('infoCategory').textContent = vendor.product_categories || 'Computer Accessories';
    document.getElementById('infoLocation').textContent = `${vendor.city || 'Tamil Nadu'}${vendor.state ? ', ' + vendor.state : ''}`;
    infoCard.style.display = 'block';
  }

  // Fetch quotations for this vendor to link quotation reference
  const quotationSelect = document.getElementById('quotationRef');
  if (quotationSelect) {
    try {
      const res = await authFetch('/api/quotations');
      const data = await res.json();
      if (res.ok && data.success) {
        const vendorQuotes = (data.quotations || []).filter(q => q.vendor_id == vendorId || q.vendor_code == (vendor ? vendor.vendor_id : ''));
        quotationSelect.innerHTML = '<option value="">-- General Evaluation (No specific quote) --</option>' +
          vendorQuotes.map(q => `
            <option value="${q.quotation_id}">
              ${q.quotation_id} - ${escapeHtml(q.product_name)} ($${parseFloat(q.total_price).toFixed(2)}) - ${escapeHtml(q.delivery_time)}
            </option>
          `).join('');
      }
    } catch (e) {
      console.warn('Could not load quotations for vendor:', e);
    }
  }
}

/**
 * Real-time overall score calculation preview
 * Formula: (Price × 40%) + (Quality × 35%) + (Delivery × 25%)
 */
function updateScorePreview() {
  const p = parseFloat(document.getElementById('priceScore')?.value) || 0;
  const q = parseFloat(document.getElementById('qualityScore')?.value) || 0;
  const d = parseFloat(document.getElementById('deliveryScore')?.value) || 0;

  const rawOverall = (p * 0.40) + (q * 0.35) + (d * 0.25);
  const overall = Math.round(rawOverall * 10) / 10;
  const rating = (overall / 20).toFixed(1);

  const displayEl = document.getElementById('previewOverallScore');
  const ratingEl = document.getElementById('previewRating');
  const pWeightEl = document.getElementById('previewPriceContrib');
  const qWeightEl = document.getElementById('previewQualityContrib');
  const dWeightEl = document.getElementById('previewDeliveryContrib');

  if (displayEl) displayEl.textContent = overall.toFixed(1);
  if (ratingEl) ratingEl.textContent = `${rating} / 5.0`;
  if (pWeightEl) pWeightEl.textContent = (p * 0.40).toFixed(1);
  if (qWeightEl) qWeightEl.textContent = (q * 0.35).toFixed(1);
  if (dWeightEl) dWeightEl.textContent = (d * 0.25).toFixed(1);
}

/**
 * Load and render all evaluations in evaluationsTableBody
 */
async function loadEvaluationsTable() {
  const tableBody = document.getElementById('evaluationsTableBody');
  const loadingIndicator = document.getElementById('tableLoading');
  const emptyState = document.getElementById('tableEmpty');
  const countBadge = document.getElementById('totalEvaluationsCount');

  if (!tableBody) return;

  if (loadingIndicator) loadingIndicator.style.display = 'block';
  if (emptyState) emptyState.style.display = 'none';

  try {
    const res = await authFetch('/api/evaluations');
    const data = await res.json();

    if (loadingIndicator) loadingIndicator.style.display = 'none';

    if (res.ok && data.success) {
      const evals = data.evaluations || [];

      if (countBadge) {
        countBadge.textContent = `${evals.length} Evaluation${evals.length === 1 ? '' : 's'}`;
      }

      if (evals.length === 0) {
        if (emptyState) emptyState.style.display = 'block';
        tableBody.innerHTML = '';
        return;
      }

      tableBody.innerHTML = evals.map(ev => {
        const overallScore = parseFloat(ev.overall_score || 0);
        const isHighScore = overallScore >= 85;

        return `
          <tr>
            <td><span class="request-id-tag" style="background: #EFECE6; color: #1F1F1F;">${escapeHtml(ev.evaluation_id)}</span></td>
            <td>
              <strong>${escapeHtml(ev.vendor_name)}</strong>
              <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(ev.vendor_code)}</div>
            </td>
            <td><strong style="color: var(--primary);">${ev.price_score}</strong>/100</td>
            <td><strong style="color: var(--primary);">${ev.quality_score}</strong>/100</td>
            <td><strong style="color: var(--primary);">${ev.delivery_score}</strong>/100</td>
            <td>
              <span class="overall-score-pill ${isHighScore ? 'top' : ''}">
                ${overallScore.toFixed(1)}/100
              </span>
            </td>
            <td>
              <span style="font-size: 0.85rem; color: var(--text-muted);">
                ${escapeHtml(ev.evaluator_name || 'Admin')}
              </span>
            </td>
            <td style="max-width: 220px; font-size: 0.85rem; color: var(--text-body);">
              ${escapeHtml(ev.feedback || '—')}
            </td>
            <td>
              <div style="display: flex; gap: 0.4rem;">
                <button onclick="editEvaluation('${ev.id || ev._id}', ${ev.price_score}, ${ev.quality_score}, ${ev.delivery_score}, '${escapeHtml(ev.feedback || '')}', '${ev.vendor_id}')" class="btn btn-secondary" style="padding: 0.35rem 0.65rem; font-size: 0.8rem;">
                  ✏️ Edit
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    } else {
      showErrorAlert(data.message || 'Failed to load evaluations.');
    }
  } catch (err) {
    if (loadingIndicator) loadingIndicator.style.display = 'none';
    console.error('Load evaluations error:', err);
    showErrorAlert('Error retrieving evaluations.');
  }
}

/**
 * Pre-fill form to edit an existing evaluation
 */
function editEvaluation(evalId, price, quality, delivery, feedback, vendorId) {
  editingEvaluationId = evalId;
  const vendorSelect = document.getElementById('vendorSelect');
  const priceInput = document.getElementById('priceScore');
  const qualityInput = document.getElementById('qualityScore');
  const deliveryInput = document.getElementById('deliveryScore');
  const feedbackInput = document.getElementById('feedback');
  const submitBtn = document.getElementById('submitEvalBtn');

  if (vendorSelect && vendorId) {
    vendorSelect.value = vendorId;
    onVendorSelected(vendorId);
  }

  if (priceInput) priceInput.value = price;
  if (qualityInput) qualityInput.value = quality;
  if (deliveryInput) deliveryInput.value = delivery;
  if (feedbackInput) feedbackInput.value = feedback;

  updateScorePreview();

  if (submitBtn) {
    submitBtn.innerHTML = '💾 Update Evaluation';
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Filter helper for table
 */
function filterEvaluationsTable() {
  const input = document.getElementById('evaluationSearchInput');
  if (!input) return;
  const filter = input.value.toLowerCase();
  const rows = document.querySelectorAll('#evaluationsTableBody tr');

  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(filter) ? '' : 'none';
  });
}

/**
 * Modal & Alert Helpers
 */
function showSuccessModal(evalId) {
  const modal = document.getElementById('evalSuccessModal');
  const idDisplay = document.getElementById('modalEvalId');

  if (modal && idDisplay) {
    idDisplay.textContent = evalId;
    modal.classList.add('active');
  } else {
    alert(`Evaluation saved successfully!\nEvaluation ID: ${evalId}`);
    window.location.reload();
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
