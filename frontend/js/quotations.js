/**
 * VEPRS - Quotation Submission & Automatic Calculation (Sprint 2: SCRUM-25)
 */

let currentQRData = null;

document.addEventListener('DOMContentLoaded', () => {
  const submitQuotationForm = document.getElementById('submitQuotationForm');
  if (submitQuotationForm) {
    initSubmitQuotationForm(submitQuotationForm);
  }
});

/**
 * Handle Submit Quotation Form on submit-quotation.html
 */
async function initSubmitQuotationForm(form) {
  const urlParams = new URLSearchParams(window.location.search);
  const qrIdParam = urlParams.get('qrId');

  if (!qrIdParam) {
    showErrorAlert('No Quotation Request specified.');
    return;
  }

  // Set minimum valid until date to tomorrow
  const validUntilInput = document.getElementById('validUntil');
  if (validUntilInput) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    validUntilInput.min = tomorrow.toISOString().split('T')[0];
  }

  // 1. Fetch Quotation Request Details
  try {
    const response = await authFetch(`/api/quotation-requests/${encodeURIComponent(qrIdParam)}`);
    const data = await response.json();

    if (response.ok && data.success && data.quotationRequest) {
      currentQRData = data.quotationRequest;
      const qr = currentQRData;

      document.getElementById('displayQRId').textContent = qr.quotation_request_id;
      document.getElementById('displayPRCode').textContent = qr.purchase_request_code;
      document.getElementById('displayProductName').textContent = qr.product_name;
      document.getElementById('displayCategory').textContent = qr.product_category;
      document.getElementById('displayQuantity').textContent = qr.requested_quantity;
      document.getElementById('displayRequirements').textContent = qr.requirements;
      document.getElementById('displayDeliveryDate').textContent = qr.required_delivery_date;

      // Hidden/Pre-filled inputs
      document.getElementById('quotationRequestId').value = qr.id;
      document.getElementById('productName').value = qr.product_name;
      document.getElementById('quantity').value = qr.requested_quantity;

      // Trigger initial calculation
      calculateTotalPrice();
    } else {
      showErrorAlert(data.message || 'Failed to load quotation request details.');
    }
  } catch (err) {
    console.error('Error fetching QR details:', err);
    showErrorAlert('Error retrieving quotation request.');
  }

  // 2. Real-time Total Price Calculation on Unit Price input
  const unitPriceInput = document.getElementById('unitPrice');
  if (unitPriceInput) {
    unitPriceInput.addEventListener('input', calculateTotalPrice);
    unitPriceInput.addEventListener('change', calculateTotalPrice);
  }

  // 3. Form Submit Handler
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlerts();

    const unitPriceVal = document.getElementById('unitPrice').value.trim();
    const deliveryTimeVal = document.getElementById('deliveryTime').value.trim();
    const validUntilVal = document.getElementById('validUntil').value.trim();
    const warrantyVal = document.getElementById('warranty').value.trim();
    const termsConditionsVal = document.getElementById('termsConditions').value.trim();
    const additionalNotesVal = document.getElementById('additionalNotes').value.trim();

    // Client-side Validations
    if (!unitPriceVal) {
      showErrorAlert('Unit Price is required.');
      document.getElementById('unitPrice').focus();
      return;
    }

    const unitPrice = parseFloat(unitPriceVal);
    if (isNaN(unitPrice) || unitPrice <= 0) {
      showErrorAlert('Unit Price must be a positive number greater than 0.');
      document.getElementById('unitPrice').focus();
      return;
    }

    if (!deliveryTimeVal) {
      showErrorAlert('Delivery Time is required (e.g. 7 Days).');
      document.getElementById('deliveryTime').focus();
      return;
    }

    if (!validUntilVal) {
      showErrorAlert('Valid Until date is required.');
      document.getElementById('validUntil').focus();
      return;
    }

    const validUntilDate = new Date(validUntilVal);
    if (isNaN(validUntilDate.getTime())) {
      showErrorAlert('Please provide a valid date for Valid Until.');
      return;
    }

    const payload = {
      quotationRequestId: currentQRData ? currentQRData.id : qrIdParam,
      unitPrice: unitPrice,
      deliveryTime: deliveryTimeVal,
      validUntil: validUntilVal,
      warranty: warrantyVal,
      termsConditions: termsConditionsVal,
      additionalNotes: additionalNotesVal
    };

    const submitBtn = document.getElementById('submitBtn');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = 'Submitting Quotation...';

    try {
      const response = await authFetch('/api/quotations', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showSuccessModal(data.quotationId || 'QUO-1001');
      } else {
        showErrorAlert(data.message || 'Failed to submit quotation.');
      }
    } catch (err) {
      console.error('Submit quotation error:', err);
      showErrorAlert(err.message || 'Network error while submitting quotation.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  });
}

/**
 * Automatic Real-time Total Price Calculation (Quantity * Unit Price)
 */
function calculateTotalPrice() {
  const quantityInput = document.getElementById('quantity');
  const unitPriceInput = document.getElementById('unitPrice');
  const totalPriceInput = document.getElementById('totalPrice');
  const formattedTotalDisplay = document.getElementById('formattedTotalDisplay');

  if (!quantityInput || !unitPriceInput || !totalPriceInput) return;

  const qty = parseFloat(quantityInput.value) || 0;
  const unitPrice = parseFloat(unitPriceInput.value) || 0;

  const total = qty * unitPrice;

  if (total > 0) {
    totalPriceInput.value = total.toFixed(2);
    if (formattedTotalDisplay) {
      formattedTotalDisplay.textContent = `$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      formattedTotalDisplay.style.color = '#059669';
    }
  } else {
    totalPriceInput.value = '0.00';
    if (formattedTotalDisplay) {
      formattedTotalDisplay.textContent = '$0.00';
      formattedTotalDisplay.style.color = '#64748b';
    }
  }
}

/**
 * Modal & Alert Helpers
 */
function showSuccessModal(quoId) {
  const modal = document.getElementById('quotationSuccessModal');
  const quoIdDisplay = document.getElementById('modalQuoId');

  if (modal && quoIdDisplay) {
    quoIdDisplay.textContent = quoId;
    modal.classList.add('active');
  } else {
    alert(`Quotation submitted successfully!\nQuotation ID: ${quoId}`);
    window.location.href = 'quotation-requests.html';
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
