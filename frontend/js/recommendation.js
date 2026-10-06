/**
 * VEPRS - Vendor Recommendation (Sprint 3: SCRUM-28)
 * Dynamic AI/Rule-based recommendation engine ranking vendors based on actual MongoDB evaluation scores.
 */

document.addEventListener('DOMContentLoaded', () => {
  loadRecommendation();
});

/**
 * Fetch and render the top recommended vendor and ranked alternatives
 */
async function loadRecommendation() {
  const loadingIndicator = document.getElementById('recommendationLoading');
  const heroCard = document.getElementById('recommendationHeroContainer');
  const emptyState = document.getElementById('recommendationEmptyState');
  const alternativesCard = document.getElementById('alternativesContainer');
  const alternativesTableBody = document.getElementById('alternativesTableBody');

  if (loadingIndicator) loadingIndicator.style.display = 'block';
  if (heroCard) heroCard.style.display = 'none';
  if (emptyState) emptyState.style.display = 'none';
  if (alternativesCard) alternativesCard.style.display = 'none';

  try {
    const res = await authFetch('/api/vendors/recommend');
    const data = await res.json();

    if (loadingIndicator) loadingIndicator.style.display = 'none';

    if (res.ok && data.success) {
      const best = data.recommendedVendor;
      const alternatives = data.alternatives || [];

      if (!best) {
        if (emptyState) emptyState.style.display = 'block';
        return;
      }

      // 1. Render Hero Card for Top Recommended Vendor
      if (heroCard) {
        const q = best.quotation;
        heroCard.innerHTML = `
          <div class="recommendation-hero-card">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1.5rem; margin-bottom: 1.5rem;">
              <div>
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                  <span class="rank-badge rank-1">⭐ #1 BEST EVALUATED VENDOR</span>
                  <span class="request-id-tag">${escapeHtml(best.vendor_id)}</span>
                </div>
                <h1 style="font-size: 2.25rem; margin-bottom: 0.35rem; color: var(--text-main); letter-spacing: -0.5px;">
                  ${escapeHtml(best.vendor_name)}
                </h1>
                <p style="font-size: 0.95rem; color: var(--text-muted); margin-bottom: 0;">
                  Contact Person: <strong>${escapeHtml(best.contact_person)}</strong> | 
                  Location: <strong>${escapeHtml(best.city)}${best.state ? ', ' + escapeHtml(best.state) : ''}</strong> | 
                  Category: <strong>${escapeHtml(best.product_categories)}</strong>
                </p>
              </div>

              <!-- Composite Overall Score Badge -->
              <div style="text-align: right; background: var(--primary-light); padding: 1.25rem 2rem; border-radius: var(--radius-lg); border: 2px solid var(--border-color);">
                <div style="font-size: 0.75rem; text-transform: uppercase; font-weight: 800; letter-spacing: 0.5px; color: var(--text-muted);">
                  Composite Overall Score
                </div>
                <div style="font-size: 3rem; font-weight: 800; font-family: monospace; color: var(--primary); line-height: 1.1;">
                  ${parseFloat(best.overall_score).toFixed(1)}<span style="font-size: 1.35rem; color: var(--text-muted); font-weight: 600;">/100</span>
                </div>
                <div style="margin-top: 0.35rem;">
                  <span class="rating-pill">⭐ ${best.rating} / 5.0 Rating</span>
                </div>
              </div>
            </div>

            <!-- Score Metrics Breakdown (40% / 35% / 25%) -->
            <div class="score-metric-grid">
              <div class="score-metric-box">
                <div class="score-metric-label">💰 Price Score</div>
                <div class="score-metric-value">${best.price_score}<span style="font-size: 0.9rem; color: var(--text-muted);">/100</span></div>
                <span class="score-weight-tag">Weight: 40% (Contribution: ${(best.price_score * 0.40).toFixed(1)})</span>
              </div>

              <div class="score-metric-box">
                <div class="score-metric-label">⭐ Quality Score</div>
                <div class="score-metric-value">${best.quality_score}<span style="font-size: 0.9rem; color: var(--text-muted);">/100</span></div>
                <span class="score-weight-tag">Weight: 35% (Contribution: ${(best.quality_score * 0.35).toFixed(1)})</span>
              </div>

              <div class="score-metric-box">
                <div class="score-metric-label">🚚 Delivery Score</div>
                <div class="score-metric-value">${best.delivery_score}<span style="font-size: 0.9rem; color: var(--text-muted);">/100</span></div>
                <span class="score-weight-tag">Weight: 25% (Contribution: ${(best.delivery_score * 0.25).toFixed(1)})</span>
              </div>

              ${q ? `
                <div class="score-metric-box" style="background: #EBF3ED; border-color: #D1E4D6;">
                  <div class="score-metric-label" style="color: #275A36;">Quotation Rate</div>
                  <div class="score-metric-value" style="color: #275A36;">$${parseFloat(q.unit_price).toFixed(2)}</div>
                  <span class="score-weight-tag" style="color: #275A36;">Lead: ${escapeHtml(q.delivery_time)}</span>
                </div>
              ` : ''}
            </div>

            <!-- Recommendation Summary & Rationale -->
            <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem; margin-top: 1.25rem;">
              <h3 style="font-size: 1rem; margin-bottom: 0.35rem; color: var(--text-main);">
                📋 Recommendation Rationale
              </h3>
              <p style="font-size: 0.9rem; color: var(--text-body); margin-bottom: 0.5rem;">
                ${escapeHtml(best.recommendation_reason)}
              </p>
              ${best.feedback ? `
                <p style="font-size: 0.85rem; color: var(--text-muted); font-style: italic; margin-bottom: 0;">
                  " ${escapeHtml(best.feedback)} "
                </p>
              ` : ''}
            </div>

            <!-- Action Controls -->
            <div style="display: flex; gap: 1rem; margin-top: 1.75rem; flex-wrap: wrap;">
              <a href="compare-vendors.html" class="btn btn-secondary">
                ⚖️ Compare with Other Vendors
              </a>
              <a href="vendor-evaluation.html?vendorId=${encodeURIComponent(best.vendor_numeric_id)}" class="btn btn-secondary">
                ✏️ Update Evaluation
              </a>
              <a href="purchase-requests.html" class="btn btn-primary" style="background: var(--primary); color: #FFFFFF !important;">
                📑 View Purchase Requests →
              </a>
            </div>
          </div>
        `;
        heroCard.style.display = 'block';
      }

      // 2. Render Ranked Alternatives Table
      if (alternatives.length > 0 && alternativesCard && alternativesTableBody) {
        alternativesTableBody.innerHTML = alternatives.map(alt => `
          <tr>
            <td>
              <span class="rank-badge ${alt.rank === 2 ? 'rank-2' : (alt.rank === 3 ? 'rank-3' : '')}">
                Rank #${alt.rank}
              </span>
            </td>
            <td>
              <strong>${escapeHtml(alt.vendor_name)}</strong>
              <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(alt.vendor_id)}</div>
            </td>
            <td><strong>${alt.price_score}</strong>/100</td>
            <td><strong>${alt.quality_score}</strong>/100</td>
            <td><strong>${alt.delivery_score}</strong>/100</td>
            <td>
              <span class="overall-score-pill">
                ${parseFloat(alt.overall_score).toFixed(1)}/100
              </span>
            </td>
            <td>⭐ ${alt.rating}</td>
            <td style="font-size: 0.85rem; color: var(--text-muted); max-width: 250px;">
              ${escapeHtml(alt.recommendation_reason)}
            </td>
            <td>
              <a href="vendor-evaluation.html?vendorId=${encodeURIComponent(alt.vendor_numeric_id)}" class="btn btn-secondary" style="padding: 0.35rem 0.65rem; font-size: 0.8rem;">
                ✏️ Re-evaluate
              </a>
            </td>
          </tr>
        `).join('');
        alternativesCard.style.display = 'block';
      }

    } else {
      showErrorAlert(data.message || 'Failed to load recommendation.');
    }
  } catch (err) {
    if (loadingIndicator) loadingIndicator.style.display = 'none';
    console.error('Error fetching recommendation:', err);
    showErrorAlert('Network error while retrieving vendor recommendation.');
  }
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
