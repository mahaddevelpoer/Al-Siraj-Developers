export function renderSalaryReceipt(data) {
  return `
    <div style="max-width: 900px; margin: 0 auto; padding: 40px; font-family: 'Plus Jakarta Sans', Arial;">
      
      <!-- HEADER - CONSTANT FOR ALL RECEIPTS -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 20px;">
        <div style="flex: 1;">
          ${data.logoDataUrl ? `<img src="${data.logoDataUrl}" style="height: 80px; object-fit: contain;" />` : ''}
          <div style="margin-top: 8px; font-size: 14px; font-weight: 700;">
            ${data.projectName || 'AL-SIRAJ DEVELOPERS'}
          </div>
          <div style="font-size: 11px; color: #666; line-height: 1.4;">
            ${data.projectAddress || 'Main Chowk Iqbal Avenue FBR Office Khan Pur'}
          </div>
        </div>
        <div style="text-align: right; font-size: 12px;">
          <div><strong>Receipt #:</strong> ${data.receiptNumber}</div>
          <div><strong>Date:</strong> ${new Date(data.date).toLocaleDateString('en-PK')}</div>
        </div>
      </div>

      <!-- SALARY RECEIPT TITLE -->
      <div style="text-align: center; margin: 24px 0; padding: 16px; background: #f0f9ff; border-left: 4px solid #0066cc;">
        <div style="font-size: 18px; font-weight: 800;">SALARY PAYMENT RECEIPT</div>
        <div style="font-size: 12px; color: #666; margin-top: 4px;">
          Town: ${data.townName} | Month: ${data.month}
        </div>
      </div>

      <!-- EMPLOYEE DETAILS & NOTE -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 24px 0;">
        <div>
          <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #666; margin-bottom: 8px;">Employee Details</div>
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e0e0e0; font-weight: 600;">Name:</td>
              <td style="padding: 8px; border-bottom: 1px solid #e0e0e0;">${data.employeeName}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e0e0e0; font-weight: 600;">Designation:</td>
              <td style="padding: 8px; border-bottom: 1px solid #e0e0e0;">${data.designation}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e0e0e0; font-weight: 600;">Phone:</td>
              <td style="padding: 8px; border-bottom: 1px solid #e0e0e0;">${data.employeePhone || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 8px; font-weight: 600;">CNIC:</td>
              <td style="padding: 8px;">${data.employeeCNIC || 'N/A'}</td>
            </tr>
          </table>
        </div>
        <div>
          <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #666; margin-bottom: 8px;">Payment Details</div>
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e0e0e0; font-weight: 600;">Month:</td>
              <td style="padding: 8px; border-bottom: 1px solid #e0e0e0;">${data.month}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e0e0e0; font-weight: 600;">Base Salary:</td>
              <td style="padding: 8px; border-bottom: 1px solid #e0e0e0;">PKR ${(data.baseSalary || 0).toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e0e0e0; font-weight: 600;">Net Amount:</td>
              <td style="padding: 8px; border-bottom: 1px solid #e0e0e0; font-weight: 700; color: #107c41;">PKR ${(data.netAmount || 0).toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 8px; font-weight: 600;">Status:</td>
              <td style="padding: 8px;"><span style="background: #d1fae5; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700;">PAID</span></td>
            </tr>
          </table>
        </div>
      </div>

      <!-- NOTE SECTION - MOVED UP -->
      ${data.note ? `
        <div style="padding: 12px 16px; background: #fef3c7; border-left: 4px solid #ca8a04; margin: 20px 0; border-radius: 4px;">
          <div style="font-size: 11px; font-weight: 700; color: #92400e; margin-bottom: 4px;">NOTE:</div>
          <div style="font-size: 12px; color: #666;">${data.note}</div>
        </div>
      ` : ''}

      <!-- ADVANCE SALARY DETAILS IF APPLICABLE -->
      ${data.advanceType ? `
        <div style="padding: 12px 16px; background: #fef2f2; border-left: 4px solid #d11a2a; margin: 20px 0; border-radius: 4px;">
          <div style="font-size: 11px; font-weight: 700; color: #991b1b; margin-bottom: 8px;">ADVANCE SALARY RECORD</div>
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <tr>
              <td style="padding: 4px; font-weight: 600;">Advance Type:</td>
              <td style="padding: 4px;">${data.advanceType === 'installment' ? 'Installment Deduction' : 'Single Deduction'}</td>
            </tr>
            ${data.advanceType === 'installment' ? `
              <tr>
                <td style="padding: 4px; font-weight: 600;">Total Advance:</td>
                <td style="padding: 4px;">PKR ${(data.totalAdvance || 0).toLocaleString()}</td>
              </tr>
              <tr>
                <td style="padding: 4px; font-weight: 600;">Installment #:</td>
                <td style="padding: 4px;">${data.currentInstallment} / ${data.totalInstallments}</td>
              </tr>
              <tr>
                <td style="padding: 4px; font-weight: 600;">Monthly Deduction:</td>
                <td style="padding: 4px;">PKR ${(data.monthlyAdvanceDeduction || 0).toLocaleString()}</td>
              </tr>
              <tr>
                <td style="padding: 4px; font-weight: 600;">Remaining Months:</td>
                <td style="padding: 4px;">${data.remainingMonths}</td>
              </tr>
            ` : `
              <tr>
                <td style="padding: 4px; font-weight: 600;">Advance Amount:</td>
                <td style="padding: 4px;">PKR ${(data.advanceAmount || 0).toLocaleString()}</td>
              </tr>
              <tr>
                <td style="padding: 4px; font-weight: 600;">Deducted Today:</td>
                <td style="padding: 4px;">PKR ${(data.advanceAmount || 0).toLocaleString()}</td>
              </tr>
            `}
          </table>
        </div>
      ` : ''}

      <!-- SIGNATURES - AT BOTTOM -->
      <div style="margin-top: 60px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px;">
        <div style="text-align: center;">
          <div style="border-top: 2px solid #000; height: 60px;"></div>
          <div style="font-size: 11px; font-weight: 700; margin-top: 4px;">CEO Signature</div>
        </div>
        <div style="text-align: center;">
          <div style="border-top: 2px solid #000; height: 60px;"></div>
          <div style="font-size: 11px; font-weight: 700; margin-top: 4px;">Accountant Signature</div>
        </div>
      </div>
    </div>
  `;
}

export function generateSignatureSection(lang, role, labelEn, labelUr) {
  return `
    <div style="text-align: center; flex: 1;">
      <div style="border-top: 1px solid black; width: 80%; margin: 28px auto 4px;"></div>
      <div style="font-size: 11px; font-weight: 700;">${lang === 'ur' ? labelUr : labelEn}</div>
    </div>
  `;
}

export function generateSignatureRow(lang, buyers) {
  return `
    <div style="display: flex; gap: 24px; justify-content: center; margin: 10px 0;">
      ${buyers.map(b => `
        <div style="text-align: center; flex: 1;">
          <div style="border-top: 1px solid black; width: 80%; margin: 28px auto 4px;"></div>
          <div style="font-size: 11px; font-weight: 700;">${lang === 'ur' ? b.labelUr : b.labelEn}</div>
        </div>
      `).join('')}
    </div>
  `;
}

export function generateDirectorSignature(lang) {
  return `
    <div style="border-top: 2px solid black; border-bottom: 2px solid black; padding: 6px 4px; font-size: 11px; font-weight: 700; display: flex; justify-content: space-between; align-items: center;">
      <span>
        ${lang === 'ur' ? 'دستخط ڈائریکٹر' : "Director's Signature:"}
        <span style="border-bottom: 1px solid black; display: inline-block; min-width: 140px; margin-left: 4px; padding: 0 6px;"></span>
      </span>
      <span style="text-align: right;">
        ${lang === 'ur' ? 'رابطہ:' : 'Contact:'} Administration
      </span>
    </div>
  `;
}

export function generateAcknowledgment(lang) {
  return `
    <div style="border-top: 1px solid black; border-bottom: 1px solid black; padding: 5px 0; margin: 6px 0; font-size: 11px; font-weight: 600; text-align: center;">
      ${lang === 'ur'
        ? 'ہر دو فریقین نے معاہدہ مذکورہ بالا کو حرف بحرف پڑھ لیا ہے اور اپنے دستخط بطور ثبوت کر دیے ہیں۔'
        : 'Both parties confirm they have read the above agreement in full and have signed it as proof.'
      }
    </div>
  `;
}

export function generateTermsConditions(lang) {
  const items = lang === 'ur' ? [
    'خریدار اندر معیاد بقیہ رقم کی ادائیگی کا پابند ہوگا۔',
    'عدم ادائیگی پر معاہدہ منسوخ تصور ہوگا اور بعانہ ضبط تصور ہوگا۔',
    'معاہدہ منسوخ پلاٹ کسی بھی عدالت میں چیلنج نہیں کیا جاسکے گا۔',
    'چاردیواری ٹاؤن کی ملکیت ہوگی، کوئی توڑنے کا مجاز نہ ہوگا۔',
    'خریدار اپنے مکان کے گیٹ کی اونچائی ٹاؤن کی روڈ سے ایک فٹ تک رکھ سکتا ہے۔',
    'خریدار پلاٹ کو بطور راستہ استعمال نہیں کرسکتا۔',
    'ٹاؤن کے اندر کسی بھی قسم کے جانوروں کی فارمنگ کی اجازت نہیں ہے۔',
  ] : [
    'Buyer is bound to pay remaining amount on time.',
    'Non-payment will cancel agreement & forfeit advance.',
    'Cancelled plot cannot be challenged in any court.',
    'Four boundary walls of town are property\'s limit.',
    'Buyer can keep gate in own lane side of town.',
    'Buyer cannot use plot for farming purposes.',
    'No permission to keep any type of animals in town.',
  ];

  return `
    <div style="border: 1px solid black; padding: 15px; margin-top: 10px;">
      <div style="font-weight: 900; text-decoration: underline; margin-bottom: 5px;">
        ${lang === 'ur' ? 'شرائط!' : 'TERMS & CONDITIONS:'}
      </div>
      <ol style="padding-left: ${lang === 'ur' ? '0' : '20px'}; padding-right: ${lang === 'ur' ? '20px' : '0'}; margin: 0; font-size: 11px; font-weight: 600;">
        ${items.map(item => `<li>${item}</li>`).join('')}
      </ol>
    </div>
  `;
}

export const fmtPkr = (n) => `PKR ${(parseFloat(n) || 0).toLocaleString()}`;

export const paymentMethodLabel = (method, lang) => {
  if (lang === 'ur') {
    if (method === 'Cash') return 'نقد';
    if (method === 'Cheque') return 'چیک';
    if (method === 'Bank Transfer') return 'بینک ٹرانسفر';
    return method || 'نقد';
  }
  return method || 'Cash';
};

export default {
  renderSalaryReceipt,
  generateSignatureSection,
  generateSignatureRow,
  generateDirectorSignature,
  generateAcknowledgment,
  generateTermsConditions,
  fmtPkr,
  paymentMethodLabel,
};
