'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppUser } from '../lib/queries/users';

interface DashboardActionsProps {
  users: AppUser[];
  selectedUserId: string;
  selectedMonth: string;
}

export default function DashboardActions({ users, selectedUserId, selectedMonth }: DashboardActionsProps) {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Form State
  const [lineUserId, setLineUserId] = useState('');
  const [shopOrBankName, setShopOrBankName] = useState('');
  const [amount, setAmount] = useState('');
  const [transactionDate, setTransactionDate] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState('other');
  const [description, setDescription] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Handle Sync Now
  const handleSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const res = await fetch('/api/sync/trigger', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        router.refresh();
      } else {
        alert('Sync failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err: any) {
      alert('Sync error: ' + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  // Open Add Transaction modal
  const openModal = () => {
    // Preset user if selectedUserId matches a user's ID
    const matchingUser = users.find(u => String(u.id) === selectedUserId || u.line_user_id === selectedUserId);
    setLineUserId(matchingUser?.line_user_id || users[0]?.line_user_id || '');
    setShopOrBankName('');
    setAmount('');
    setTransactionDate(new Date().toISOString().slice(0, 10));
    setCategory('other');
    setDescription('');
    setReferenceNo('');
    setErrorMessage('');
    setIsModalOpen(true);
  };

  // Handle Add Transaction form submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lineUserId || !amount || !transactionDate) {
      setErrorMessage('Please fill in all required fields.');
      return;
    }
    
    setIsSubmitting(true);
    setErrorMessage('');

    try {
      // 1. Append to Google Sheets
      const createRes = await fetch('/api/transactions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lineUserId,
          shopOrBankName,
          amount: parseFloat(amount),
          transactionDate,
          category,
          description,
          referenceNo
        })
      });

      const createData = await createRes.json();
      if (!createRes.ok || createData.error) {
        throw new Error(createData.error || 'Failed to append to Google Sheets');
      }

      // 2. Automatically trigger sync so it updates database immediately
      setIsSyncing(true);
      setIsModalOpen(false);
      
      const syncRes = await fetch('/api/sync/trigger', { method: 'POST' });
      const syncData = await syncRes.json();
      
      if (syncData.success) {
        router.refresh();
      } else {
        alert('Transaction added to Google Sheets, but local database sync failed. Please click "Sync Now" to retry.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred.');
    } finally {
      setIsSubmitting(false);
      setIsSyncing(false);
    }
  };

  const exportUrl = `/api/transactions/export?userId=${selectedUserId}&month=${selectedMonth}`;

  return (
    <>
      <div className="dashboard-actions-row">
        <button 
          onClick={openModal} 
          className="btn-action btn-primary"
          disabled={isSyncing || isSubmitting}
        >
          <span>➕</span> Add Transaction
        </button>
        <button 
          onClick={handleSync} 
          className="btn-action btn-secondary"
          disabled={isSyncing || isSubmitting}
        >
          <span>🔄</span> {isSyncing ? 'Syncing...' : 'Sync Now'}
        </button>
        <a 
          href={exportUrl} 
          className="btn-action btn-secondary"
          download
        >
          <span>📥</span> Export CSV
        </a>
      </div>

      {/* Syncing Overlay */}
      {isSyncing && (
        <div className="sync-overlay">
          <div className="sync-spinner-box">
            <div className="sync-spinner"></div>
            <p>Syncing data from Google Sheets...</p>
            <p className="sync-subtext">Updating local database. Please wait.</p>
          </div>
        </div>
      )}

      {/* Add Transaction Modal */}
      {isModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add New Transaction</h3>
              <button className="close-button" onClick={() => setIsModalOpen(false)}>✕</button>
            </div>
            
            <form onSubmit={handleSubmit} className="modal-form">
              {errorMessage && (
                <div className="form-error">
                  {errorMessage}
                </div>
              )}

              <div className="form-grid">
                <label className="form-field">
                  <span>User (Sender) *</span>
                  <select 
                    value={lineUserId} 
                    onChange={(e) => setLineUserId(e.target.value)}
                    required
                  >
                    {users.map(u => (
                      <option key={u.id} value={u.line_user_id}>
                        {u.display_name} ({u.line_user_id.substring(0, 8)}...)
                      </option>
                    ))}
                  </select>
                </label>

                <div className="form-row-split">
                  <label className="form-field">
                    <span>Date *</span>
                    <input 
                      type="date" 
                      value={transactionDate} 
                      onChange={(e) => setTransactionDate(e.target.value)}
                      required 
                    />
                  </label>

                  <label className="form-field">
                    <span>Amount (THB) *</span>
                    <input 
                      type="number" 
                      step="0.01" 
                      min="0.01" 
                      placeholder="0.00"
                      value={amount} 
                      onChange={(e) => setAmount(e.target.value)}
                      required 
                    />
                  </label>
                </div>

                <div className="form-row-split">
                  <label className="form-field">
                    <span>Category</span>
                    <select 
                      value={category} 
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      <option value="food">Food</option>
                      <option value="fuel">Fuel</option>
                      <option value="transport">Transport</option>
                      <option value="shopping">Shopping</option>
                      <option value="utility">Utility</option>
                      <option value="health">Health</option>
                      <option value="transfer">Transfer</option>
                      <option value="other">Other</option>
                    </select>
                  </label>

                  <label className="form-field">
                    <span>Reference No</span>
                    <input 
                      type="text" 
                      placeholder="e.g. 20261102..."
                      value={referenceNo} 
                      onChange={(e) => setReferenceNo(e.target.value)}
                    />
                  </label>
                </div>

                <label className="form-field">
                  <span>Shop / Bank Name</span>
                  <input 
                    type="text" 
                    placeholder="e.g. Seven Eleven, Kasikornbank"
                    value={shopOrBankName} 
                    onChange={(e) => setShopOrBankName(e.target.value)}
                  />
                </label>

                <label className="form-field">
                  <span>Description / Notes</span>
                  <textarea 
                    placeholder="e.g. Office lunch"
                    value={description} 
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                  />
                </label>
              </div>

              <div className="modal-actions">
                <button 
                  type="button" 
                  className="btn-modal btn-cancel"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn-modal btn-submit"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Saving...' : 'Save & Sync'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
