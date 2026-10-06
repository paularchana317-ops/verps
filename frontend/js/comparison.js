/**
 * VEPRS - Vendor Comparison (Sprint 3: SCRUM-27)
 * Side-by-side comparison across Price, Quality, Delivery, Quotations, and Composite Overall Score.
 */

let allComparedVendors = [];

document.addEventListener('DOMContentLoaded', () => {
  loadComparisonData();
});

/**
 * Fetch comparison data from backend and render views
 */
async function loadComparisonData() {
  const tableBody = document.getElementById('comparisonTableBody');
  const loadingIndicator = document.getElementById('tableLoading');
  const emptyState = document.getElementById('tableEmpty');
  const totalCountBadge = document.getElementById('totalCompareCount');
  const bestVendorHero = document.getElementById('bestVendorBanner');

  if (loadingIndicator) loadingIndicator.style.display = 'block';
  if (emptyState) emptyState.style.display = 'none';

  try {
    const res = await authFetch('/api/vendors/compare');
    const data = await res.json();

    if (loadingIndicator) loadingIndicator.style.display = 'none';

    if (res.ok && data.success) {
      allComparedVendors = data.vendors || [];

      if (totalCountBadge) {
        totalCountBadge.textContent = `${allComparedVendors.length} Vendors Compared`;
      }

      if (allComparedVendors.length === 0) {
        if (emptyState) emptyState.style.display = 'block';
        if (tableBody) tableBody.innerHTML = '';
        return;
      }

      // 1. Render Best Vendor Banner if an evaluated vendor exists
      if (data.bestVendor && bestVendorHero) {
        const bv = data.bestVendor;
        bestVendorHero.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
            <div>
              <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.35rem;">
                <span class="rank-badge rank-1">🏆 Ranked #1 Top Vendor</span>
                <span class="request-id-tag">${escapeHtml(bv.vendor_id)}</span>
              </div>
              <h2 style="font-size: 1.65rem; margin-bottom: 0.25rem; color: var(--text-main);">
                ${escapeHtml(bv.vendor_name)}
              </h2>
              <p style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 0;">
                Category: <strong>${escapeHtml(bv.product_categories)}</strong> | Location: <strong>${escapeHtml(bv.city || 'Tamil Nadu')}</strong>
              </p>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 0.8rem; text-transform: uppercase; font-weight: 700; color: var(--text-muted);">Overall Score</div>
              <div style="font-size: 2.25rem; font-weight: 800; font-family: monospace; color: #92400E;">
                ${bv.overallScore.toFixed(1)}<span style="font-size: 1.1rem; color: var(--text-muted);">/100</span>
              </div>
              <a href="vendor-recommendation.html" class="btn btn-primary" style="margin-top: 0.5rem;">
                View Full Recommendation →
              </a>
            </div>
          </div>
        `;
        bestVendorHero.style.display = 'block';
      } else if (bestVendorHero) {
        bestVendorHero.style.display = 'none';
      }

      // 2. Render Comparison Table Rows
      renderComparisonTable(allComparedVendors);

    } else {
      showErrorAlert(data.message || 'Failed to load comparison data.');
    }
  } catch (err) {
    if (loadingIndicator) loadingIndicator.style.display = 'none';
    console.error('Error fetching comparison data:', err);
    showErrorAlert('Network error while retrieving vendor comparison data.');
  }
}

/**
 * Render Comparison Table Rows
 */
function renderComparisonTable(vendors) {
  const tableBody = document.getElementById('comparisonTableBody');
  if (!tableBody) return;

  tableBody.innerHTML = vendors.map(v => {
    const isEvaluated = v.isEvaluated;
    const isBest = v.isBest;
    const ev = v.evaluation;
    const qu = v.quotation;

    let rankHtml = '<span style="color: var(--text-light); font-size: 0.85rem;">Pending</span>';
    if (isBest) {
      rankHtml = '<span class="rank-badge rank-1">⭐ #1 Best</span>';
    } else if (v.rank === 2) {
      rankHtml = '<span class="rank-badge rank-2">#2</span>';
    } else if (v.rank === 3) {
      rankHtml = '<span class="rank-badge rank-3">#3</span>';
    } else if (v.rank) {
      rankHtml = `<span class="rank-badge">#${v.rank}</span>`;
    }

    return `
      <tr style="${isBest ? 'background-color: #FEFDF9;' : ''}">
        <td>${rankHtml}</td>
        <td>
          <strong style="color: var(--text-main); font-size: 0.95rem;">${escapeHtml(v.vendor_name)}</strong>
          <div style="font-size: 0.75rem; color: var(--text-muted); font-family: monospace;">${escapeHtml(v.vendor_id)}</div>
        </td>
        <td>
          ${qu ? `
            <div><strong>$${parseFloat(qu.unit_price).toFixed(2)}</strong></div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(qu.product_name)}</div>
          ` : '<span style="color: var(--text-light); font-size: 0.85rem;">No active quote</span>'}
        </td>
        <td>
          ${qu ? `
            <span style="font-size: 0.85rem; font-weight: 600; color: #0284c7;">⚡ ${escapeHtml(qu.delivery_time)}</span>
          ` : '<span style="color: var(--text-light); font-size: 0.85rem;">—</span>'}
        </td>
        <td>
          ${isEvaluated ? `
            <strong style="font-size: 1rem; color: var(--primary);">${ev.price_score}</strong>
            <span style="font-size: 0.75rem; color: var(--text-light);">/100</span>
          ` : '<span style="color: var(--text-light);">—</span>'}
        </td>
        <td>
          ${isEvaluated ? `
            <strong style="font-size: 1rem; color: var(--primary);">${ev.quality_score}</strong>
            <span style="font-size: 0.75rem; color: var(--text-light);">/100</span>
          ` : '<span style="color: var(--text-light);">—</span>'}
        </td>
        <td>
          ${isEvaluated ? `
            <strong style="font-size: 1rem; color: var(--primary);">${ev.delivery_score}</strong>
            <span style="font-size: 0.75rem; color: var(--text-light);">/100</span>
          ` : '<span style="color: var(--text-light);">—</span>'}
        </td>
        <td>
          ${isEvaluated ? `
            <span class="overall-score-pill ${isBest ? 'top' : ''}">
              ${v.overallScore.toFixed(1)}/100
            </span>
          ` : '<span class="badge badge-pending">Unrated</span>'}
        </td>
        <td>
          ${isEvaluated ? `
            <span style="font-weight: 700; color: #92400E; font-size: 0.9rem;">⭐ ${ev.rating}</span>
          ` : '<span style="color: var(--text-light);">—</span>'}
        </td>
        <td>
          <a href="vendor-evaluation.html?vendorId=${encodeURIComponent(v.id)}" class="btn btn-secondary" style="padding: 0.35rem 0.65rem; font-size: 0.8rem; white-space: nowrap;">
            ${isEvaluated ? '✏️ Re-evaluate' : '➕ Evaluate'}
          </a>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Filter vendors in comparison table
 */
function filterComparisonTable() {
  const input = document.getElementById('compareSearchInput');
  if (!input) return;
  const filter = input.value.toLowerCase();

  const filtered = allComparedVendors.filter(v => {
    return v.vendor_name.toLowerCase().includes(filter) ||
           v.vendor_id.toLowerCase().includes(filter) ||
           (v.product_categories && v.product_categories.toLowerCase().includes(filter)) ||
           (v.city && v.city.toLowerCase().includes(filter));
  });

  renderComparisonTable(filtered);
}

function showErrorAlert(message) {
  const alertBox = document.getElementById('formAlert');
  if (alertBox) {
    alertBox.className = 'alert alert-danger';
    alertBox.innerHTML = `<span>⚠️ ${escapeHtml(message)}</span>`;
    alertBox.style.display = 'flex';
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
