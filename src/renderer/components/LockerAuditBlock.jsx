import React, { useState } from 'react';

export default function LockerAuditBlock({ townName, scheduleData, onAuditCompleted }) {
  const [step, setStep] = useState(1);
  const [cashAmount, setCashAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const formatMoney = (val) => {
    return new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency: 'PKR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amountVal = parseFloat(cashAmount);
    
    if (isNaN(amountVal) || amountVal < 0) {
      setError('Please enter a valid cash amount.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const systemBalance = scheduleData.systemBalance || 0;
      const discrepancy = amountVal - systemBalance;

      const result = await window.api.submitLockerAudit({
        townName,
        auditDate: scheduleData.scheduledDate,
        systemBalance,
        physicalBalance: amountVal,
        discrepancy,
        auditedBy: 'Accountant',
        report: scheduleData.report || {},
      });

      if (result.error) {
        throw new Error(result.error);
      }

      onAuditCompleted();
    } catch (err) {
      setError(err.message || 'Failed to submit locker audit. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="tamper-lock-overlay">
      <div className="tamper-lock-modal audit-lock-modal">
        {step === 1 ? (
          <div>
            <div className="tamper-header">
              <div className="tamper-icon-wrapper audit-icon-wrapper">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="feather feather-shield-lock">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                  <circle cx="12" cy="11" r="3"></circle>
                  <path d="M12 14v4"></path>
                </svg>
              </div>
              <div>
                <h1 className="tamper-title">System Audit Day</h1>
                <p className="tamper-subtitle">Locker Cash & Balance Verification</p>
              </div>
            </div>

            <div className="tamper-details">
              <p>CEO has scheduled a mandatory physical cash locker audit for <strong>{townName}</strong> today.</p>
              <div className="audit-info-card">
                <div className="info-row">
                  <span>Scheduled Date:</span>
                  <strong>{scheduleData.scheduledDate}</strong>
                </div>
                <div className="info-row">
                  <span>Auditor / Role:</span>
                  <strong>Accountant</strong>
                </div>
              </div>
              <p className="audit-warning-text">All software functions are locked until the physical locker balance matches or discrepancy report is sent.</p>
            </div>

            <div className="tamper-resolution">
              <button 
                type="button"
                className="btn btn-primary w-full py-3"
                onClick={() => setStep(2)}
              >
                Proceed to Audit Verification &rarr;
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="tamper-header">
              <div className="tamper-icon-wrapper audit-icon-wrapper active">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="feather feather-dollar-sign">
                  <line x1="12" y1="1" x2="12" y2="23"></line>
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                </svg>
              </div>
              <div>
                <h1 className="tamper-title">Verify Locker Cash</h1>
                <p className="tamper-subtitle">Step 2: Enter Physical Cash Balance</p>
              </div>
            </div>

            <div className="tamper-details">
              <div className="audit-question-box">
                <p className="question-label">How much cash is in the locker?</p>
                <span className="question-subtext">Count and enter all the cash present in your locker.</span>
              </div>
              
              <div className="form-group mt-4">
                <div className="input-group-pkr">
                  <span className="pkr-prefix">PKR</span>
                  <input
                    type="number"
                    step="any"
                    className="input audit-amount-input"
                    placeholder="Enter total physical cash"
                    value={cashAmount}
                    onChange={(e) => setCashAmount(e.target.value)}
                    disabled={submitting}
                    autoFocus
                    required
                  />
                </div>
                {cashAmount && !isNaN(parseFloat(cashAmount)) && (
                  <p className="formatted-pkr-helper">
                    Amount: {formatMoney(parseFloat(cashAmount))}
                  </p>
                )}
              </div>
            </div>

            {error && <div className="tamper-error mb-4">{error}</div>}

            <div className="tamper-actions mt-6">
              <button
                type="button"
                className="btn tamper-btn-secondary"
                onClick={() => setStep(1)}
                disabled={submitting}
              >
                &larr; Back
              </button>
              <button
                type="submit"
                className="btn tamper-btn-primary"
                disabled={submitting}
              >
                {submitting ? 'Submitting Report...' : 'Submit Audit Report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
