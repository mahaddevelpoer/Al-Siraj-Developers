import React, { useEffect, useState } from 'react';
import { BriefcaseIcon, PlusIcon, DollarIcon } from './Icons';
import OfficialReceipt from './OfficialReceipt';
import PaymentAccountSelect from './PaymentAccountSelect';

const CATEGORIES = ['Sewerage', 'Road', 'Office construction', 'Boundary wall', 'Electricity', 'Gate', 'Other'];
const fmt = (n) => `PKR ${(parseFloat(n) || 0).toLocaleString()}`;

export default function ConstructionDashboard({ townName, showToast, refreshKey = 0 }) {
  const [projects, setProjects] = useState([]);
  const [payments, setPayments] = useState([]);
  const [project, setProject] = useState({ Category: 'Sewerage', Constructor_Name: '', Phone_Number: '', Company_Name: '', Material_Name: '', Material_Quantity: '', Material_Rate: '', Deal_Amount: '', Notes: '' });
  const [payment, setPayment] = useState({ Project_ID: '', Amount: '', Payment_Date: new Date().toISOString().split('T')[0], Material_Name: '', Material_Quantity: '', Material_Rate: '', Notes: '' });
  const [loading, setLoading] = useState(false);
  const [receiptData, setReceiptData] = useState(null);
  const [paymentAccount, setPaymentAccount] = useState(null);

  const load = async () => {
    const [p, pay] = await Promise.all([
      window.api?.getConstructionProjects?.(townName),
      window.api?.getConstructionPayments?.(townName),
    ]);
    setProjects(Array.isArray(p) ? p : []);
    setPayments(Array.isArray(pay) ? pay : []);
  };
  useEffect(() => { load(); }, [townName, refreshKey]);

  const u = (key) => (e) => setProject(f => ({ ...f, [key]: e.target.value }));
  const pu = (key) => (e) => setPayment(f => ({ ...f, [key]: e.target.value }));

  const addProject = async (e) => {
    e.preventDefault();
    setLoading(true);
    const result = await window.api.addConstructionProject({ ...project, Town_Name: townName });
    setLoading(false);
    if (result?.error) return showToast?.(result.error, 'error');
    showToast?.('Construction project added');
    setReceiptData({
      type: 'construction_deal',
      townName,
      date: result.Start_Date,
      receiptNumber: result.Deal_Receipt_Number || `CON-DEAL-${result.Project_ID}`,
      category: result.Category,
      constructorName: result.Constructor_Name,
      phoneNumber: result.Phone_Number,
      companyName: result.Company_Name,
      materialName: result.Material_Name,
      materialQuantity: result.Material_Quantity,
      materialRate: result.Material_Rate,
      dealAmount: result.Deal_Amount,
      paidAmount: result.Paid_Amount,
      remainingAmount: result.Remaining_Amount,
      note: result.Notes,
    });
    setProject({ Category: 'Sewerage', Constructor_Name: '', Phone_Number: '', Company_Name: '', Material_Name: '', Material_Quantity: '', Material_Rate: '', Deal_Amount: '', Notes: '' });
    load();
  };

  const postPayment = async (e) => {
    e.preventDefault();
    setLoading(true);
    const result = await window.api.recordConstructionPayment({ ...payment, ...paymentAccount });
    setLoading(false);
    if (result?.error) return showToast?.(result.error, 'error');
    showToast?.('Construction payment saved');
    setReceiptData({
      type: 'construction_payment',
      townName,
      date: result.Payment_Date,
      receiptNumber: result.Receipt_Number,
      category: result.Category,
      constructorName: result.Constructor_Name,
      materialName: result.Material_Name,
      materialQuantity: result.Material_Quantity,
      materialRate: result.Material_Rate,
      amount: result.Amount,
      remainingAmount: result.Remaining_After,
      paymentAccountName: result.Payment_Account_Name || paymentAccount?.paymentAccountName,
      paymentAccountType: result.Payment_Account_Type || paymentAccount?.paymentAccountType,
      note: result.Notes,
    });
    setPayment({ Project_ID: '', Amount: '', Payment_Date: new Date().toISOString().split('T')[0], Material_Name: '', Material_Quantity: '', Material_Rate: '', Notes: '' });
    load();
  };

  const activeProjects = projects.filter(p => String(p.Status || 'Active') !== 'Completed');
  const totalDeal = projects.reduce((s, p) => s + (parseFloat(p.Deal_Amount) || 0), 0);
  const totalPaid = projects.reduce((s, p) => s + (parseFloat(p.Paid_Amount) || 0), 0);

  const openDealReceipt = (row) => setReceiptData({
    type: 'construction_deal',
    townName,
    date: row.Start_Date,
    receiptNumber: row.Deal_Receipt_Number || `CON-DEAL-${row.Project_ID}`,
    category: row.Category,
    constructorName: row.Constructor_Name,
    phoneNumber: row.Phone_Number,
    companyName: row.Company_Name,
    materialName: row.Material_Name,
    materialQuantity: row.Material_Quantity,
    materialRate: row.Material_Rate,
    dealAmount: row.Deal_Amount,
    paidAmount: row.Paid_Amount,
    remainingAmount: row.Remaining_Amount,
    note: row.Notes,
  });

  const openPaymentReceipt = (row) => setReceiptData({
    type: 'construction_payment',
    townName,
    date: row.Payment_Date,
    receiptNumber: row.Receipt_Number,
    category: row.Category,
    constructorName: row.Constructor_Name,
    materialName: row.Material_Name,
    materialQuantity: row.Material_Quantity,
    materialRate: row.Material_Rate,
    amount: row.Amount,
    remainingAmount: row.Remaining_After,
    note: row.Notes,
  });

  return (
    <div>
      {receiptData && (
        <OfficialReceipt
          data={receiptData}
          townName={townName}
          onClose={() => setReceiptData(null)}
        />
      )}

      <div className="stat-cards mb-6">
        <div className="stat-card"><div className="card-label">Deal Total</div><div className="card-value">{fmt(totalDeal)}</div></div>
        <div className="stat-card red"><div className="card-label">Paid</div><div className="card-value loss">{fmt(totalPaid)}</div></div>
        <div className="stat-card green"><div className="card-label">Active Projects</div><div className="card-value">{activeProjects.length}</div></div>
      </div>

      <div className="form-container mb-6">
        <div className="form-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><BriefcaseIcon size={16} /> Construction Deal</div>
        <form onSubmit={addProject}>
          <div className="form-grid">
            <div className="form-group"><label>Category</label><select value={project.Category} onChange={u('Category')}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
            <div className="form-group"><label>Constructor *</label><input value={project.Constructor_Name} onChange={u('Constructor_Name')} required /></div>
            <div className="form-group"><label>Phone</label><input value={project.Phone_Number} onChange={u('Phone_Number')} /></div>
            <div className="form-group"><label>Company</label><input value={project.Company_Name} onChange={u('Company_Name')} /></div>
            <div className="form-group"><label>Material</label><input value={project.Material_Name} onChange={u('Material_Name')} /></div>
            <div className="form-group"><label>Quantity</label><input value={project.Material_Quantity} onChange={u('Material_Quantity')} /></div>
            <div className="form-group"><label>Rate</label><input value={project.Material_Rate} onChange={u('Material_Rate')} /></div>
            <div className="form-group"><label>Deal Amount *</label><input type="number" value={project.Deal_Amount} onChange={u('Deal_Amount')} required /></div>
            <div className="form-group full"><label>Notes</label><input value={project.Notes} onChange={u('Notes')} /></div>
          </div>
          <button className="btn btn-primary" disabled={loading} style={{ marginTop: 12 }}><PlusIcon size={13} /> Add Deal</button>
        </form>
      </div>

      <div className="form-container mb-6">
        <div className="form-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><DollarIcon size={16} /> Construction Payment</div>
        <form onSubmit={postPayment}>
          <div className="form-grid">
            <div className="form-group"><label>Active Construction</label><select value={payment.Project_ID} onChange={pu('Project_ID')} required><option value="">Select project</option>{activeProjects.map(p => <option key={p.Project_ID} value={p.Project_ID}>{p.Category} - {p.Constructor_Name} - Remaining {fmt(p.Remaining_Amount)}</option>)}</select></div>
            <div className="form-group"><label>Amount *</label><input type="number" value={payment.Amount} onChange={pu('Amount')} required /></div>
            <div className="form-group"><label>Date</label><input type="date" value={payment.Payment_Date} onChange={pu('Payment_Date')} /></div>
            <div className="form-group"><label>Material</label><input value={payment.Material_Name} onChange={pu('Material_Name')} /></div>
            <div className="form-group"><label>Quantity</label><input value={payment.Material_Quantity} onChange={pu('Material_Quantity')} /></div>
            <div className="form-group"><label>Rate</label><input value={payment.Material_Rate} onChange={pu('Material_Rate')} /></div>
            <div className="form-group full"><label>Notes</label><input value={payment.Notes} onChange={pu('Notes')} /></div>
          </div>
          <PaymentAccountSelect
            townName={townName}
            value={paymentAccount}
            onChange={setPaymentAccount}
            label="Pay Constructor From"
          />
          <button className="btn btn-primary" disabled={loading} style={{ marginTop: 12 }}>Save Payment</button>
        </form>
      </div>

      <div className="table-container">
        <div className="table-header"><h3>Construction Deals</h3></div>
        <table className="data-table">
          <thead><tr><th>Date</th><th>Category</th><th>Constructor</th><th>Deal</th><th>Paid</th><th>Remaining</th><th>Receipt</th><th>Action</th></tr></thead>
          <tbody>{projects.map(p => (
            <tr key={p.Project_ID}>
              <td>{p.Start_Date}</td>
              <td>{p.Category}</td>
              <td>{p.Constructor_Name}</td>
              <td>{fmt(p.Deal_Amount)}</td>
              <td>{fmt(p.Paid_Amount)}</td>
              <td>{fmt(p.Remaining_Amount)}</td>
              <td>{p.Deal_Receipt_Number || `CON-DEAL-${p.Project_ID}`}</td>
              <td><button type="button" className="btn btn-sm" onClick={() => openDealReceipt(p)}>View / Print</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      <div className="table-container" style={{ marginTop: 18 }}>
        <div className="table-header"><h3>Construction Payments</h3></div>
        <table className="data-table">
          <thead><tr><th>Date</th><th>Category</th><th>Constructor</th><th>Amount</th><th>Remaining</th><th>Receipt</th><th>Action</th></tr></thead>
          <tbody>{payments.map(p => (
            <tr key={p.Payment_ID}>
              <td>{p.Payment_Date}</td>
              <td>{p.Category}</td>
              <td>{p.Constructor_Name}</td>
              <td>{fmt(p.Amount)}</td>
              <td>{fmt(p.Remaining_After)}</td>
              <td>{p.Receipt_Number}</td>
              <td><button type="button" className="btn btn-sm" onClick={() => openPaymentReceipt(p)}>View / Print</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
