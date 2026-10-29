'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import TableQRModal, { printTableQRs, COUNTER_QR } from '../../components/shared/TableQR';

export default function Tables() {
  const socket = useSocket();
  const { restaurant } = useAuth();
  const [qrTable, setQrTable] = useState(null);
  const [tables, setTables] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTable, setEditTable] = useState(null);
  const [editCapacity, setEditCapacity] = useState(4);
  const [form, setForm] = useState({ tableNumber: '', capacity: 4 });

  const load = async () => {
    const res = await axios.get('/api/tables');
    setTables(res.data);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on('table-updated', load);
    return () => socket.off('table-updated', load);
  }, [socket]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/api/tables', form);
      toast.success('Table added');
      setShowAddModal(false);
      setForm({ tableNumber: '', capacity: 4 });
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error adding table');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this table?')) return;
    try {
      await axios.delete(`/api/tables/${id}`);
      toast.success('Table deleted');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not delete the table');
    }
  };

  const handleStatusChange = async (id, status) => {
    try {
      await axios.put(`/api/tables/${id}`, { status });
      toast.success('Status updated');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not update the table');
    }
  };

  // ✅ Open edit modal
  const openEditModal = (table) => {
    setEditTable(table);
    setEditCapacity(table.capacity);
    setShowEditModal(true);
  };

  // ✅ Save edited capacity
  const handleEditSave = async (e) => {
    e.preventDefault();
    try {
      await axios.put(`/api/tables/${editTable._id}`, { capacity: Number(editCapacity) });
      toast.success(`Table T${editTable.tableNumber} capacity updated to ${editCapacity} seats`);
      setShowEditModal(false);
      setEditTable(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error updating table');
    }
  };

  const available = tables.filter(t => t.status === 'available').length;
  const occupied = tables.filter(t => t.status === 'occupied').length;

  return (
    <div>
      <div className="page-header">
        <h1>Table Management</h1>
        <div className="flex-gap">
          <button className="btn btn-ghost" onClick={() => setQrTable({ tableNumber: COUNTER_QR })} title="QR for guests who order through the captain">🏪 Counter QR</button>
          <button className="btn btn-ghost" onClick={() => printTableQRs(tables, restaurant?.name)} disabled={tables.length === 0}>🖨️ Print All QR</button>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>+ Add Table</button>
        </div>
      </div>

      <div className="page-body">
        {/* Stats */}
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-icon blue">🪑</div>
            <div><div className="stat-value">{tables.length}</div><div className="stat-label">Total Tables</div></div>
          </div>
          <div className="stat-card">
            <div className="stat-icon green">✅</div>
            <div><div className="stat-value">{available}</div><div className="stat-label">Available</div></div>
          </div>
          <div className="stat-card">
            <div className="stat-icon red">🔴</div>
            <div><div className="stat-value">{occupied}</div><div className="stat-label">Occupied</div></div>
          </div>
        </div>

        {/* Restaurant Layout Grid */}
        <div className="card">
          <h3 style={{ marginBottom: 20, fontSize: '1rem', fontFamily: 'Inter', fontWeight: 700 }}>Restaurant Layout</h3>
          <div className="table-grid">
            {tables.map(t => (
              <div key={t._id} className={`table-card ${t.status}`}>
                <div style={{ fontSize: 11, color: '#718096', marginBottom: 4 }}>TABLE</div>
                <div className="table-number">T{t.tableNumber}</div>
                <div style={{ fontSize: 12, marginTop: 6 }}>
                  <span className={`table-status-dot dot-${t.status === 'available' ? 'green' : t.status === 'occupied' ? 'red' : 'yellow'}`}></span>
                  {t.status}
                </div>
                <div style={{ fontSize: 11, color: '#718096', marginTop: 4 }}>Capacity: {t.capacity}</div>
                {t.billRequested && (
                  <div className="badge badge-orange" style={{ marginTop: 6, fontWeight: 700 }}>🙋 Bill requested</div>
                )}
                <div style={{ marginTop: 10, display: 'flex', gap: 5, justifyContent: 'center', flexWrap: 'wrap' }}>
                  {/* ✅ Edit button in card */}
                  <button
                    onClick={() => openEditModal(t)}
                    style={{
                      fontSize: 10, padding: '3px 7px', borderRadius: 5,
                      border: '1.5px solid #3182ce', background: '#ebf8ff',
                      color: '#2c5282', cursor: 'pointer', fontWeight: 600
                    }}
                  >✏️ Edit</button>
                  <button
                    onClick={() => setQrTable(t)}
                    title={`QR code for table ${t.tableNumber}`}
                    style={{
                      fontSize: 10, padding: '3px 7px', borderRadius: 5,
                      border: '1.5px solid #FF6B35', background: '#fff3ee',
                      color: '#c05621', cursor: 'pointer', fontWeight: 600
                    }}
                  >📱 QR</button>
                  {t.status !== 'available' && (
                    <button className="btn btn-sm btn-ghost" onClick={() => handleStatusChange(t._id, 'available')} style={{ fontSize: 10, padding: '3px 7px' }}>Free</button>
                  )}
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(t._id)} style={{ fontSize: 10, padding: '3px 7px' }}>Del</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Table List */}
        <div className="card mt-24">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>TABLE #</th>
                  <th>CAPACITY</th>
                  <th>STATUS</th>
                  <th>CUSTOMERS</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {tables.map(t => (
                  <tr key={t._id}>
                    <td><strong>T{t.tableNumber}</strong></td>
                    <td>{t.capacity} seats</td>
                    <td>
                      <span className={`badge ${t.status === 'available' ? 'badge-green' : t.status === 'occupied' ? 'badge-orange' : 'badge-yellow'}`}>
                        {t.status}
                      </span>
                    </td>
                    <td>{t.customerCount || 0}</td>
                    <td>
                      <div className="flex-gap">
                        <select
                          className="form-select"
                          style={{ width: 130, padding: '4px 8px', fontSize: 12 }}
                          value={t.status}
                          onChange={e => handleStatusChange(t._id, e.target.value)}
                        >
                          <option value="available">Available</option>
                          <option value="occupied">Occupied</option>
                          <option value="reserved">Reserved</option>
                        </select>

                        {/* ✅ Edit button in list row */}
                        <button
                          onClick={() => openEditModal(t)}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                            border: '1.5px solid #3182ce', background: '#ebf8ff',
                            color: '#2c5282', cursor: 'pointer', whiteSpace: 'nowrap',
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#3182ce'; e.currentTarget.style.color = 'white'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = '#ebf8ff'; e.currentTarget.style.color = '#2c5282'; }}
                        >
                          ✏️ Edit
                        </button>

                        <button className="btn btn-sm btn-ghost" onClick={() => setQrTable(t)}>📱 QR</button>

                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(t._id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ─── ADD TABLE MODAL ─── */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add New Table</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAddModal(false)}>✕</button>
            </div>
            <form onSubmit={handleAdd}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Table Number</label>
                  <input className="form-input" type="number" placeholder="e.g. 16" required
                    value={form.tableNumber} onChange={e => setForm(p => ({ ...p, tableNumber: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Seating Capacity</label>
                  <select className="form-select" value={form.capacity} onChange={e => setForm(p => ({ ...p, capacity: e.target.value }))}>
                    <option value={2}>2 Seats</option>
                    <option value={4}>4 Seats</option>
                    <option value={6}>6 Seats</option>
                    <option value={8}>8 Seats</option>
                    <option value={10}>10 Seats</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Add Table</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── TABLE QR CODE MODAL ─── */}
      {qrTable && (
        <TableQRModal table={qrTable} restaurantName={restaurant?.name} onClose={() => setQrTable(null)} />
      )}

      {/* ─── ✅ EDIT CAPACITY MODAL ─── */}
      {showEditModal && editTable && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>✏️ Edit Table T{editTable.tableNumber}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowEditModal(false)}>✕</button>
            </div>
            <form onSubmit={handleEditSave}>
              <div className="modal-body">

                {/* Info banner */}
                <div style={{
                  background: '#EBF8FF', border: '1px solid #BEE3F8',
                  borderRadius: 8, padding: '10px 14px', marginBottom: 18,
                  fontSize: 13, color: '#2c5282'
                }}>
                  <strong>Table T{editTable.tableNumber}</strong> &nbsp;•&nbsp;
                  Current capacity: <strong>{editTable.capacity} seats</strong> &nbsp;•&nbsp;
                  Status: <strong style={{ textTransform: 'capitalize' }}>{editTable.status}</strong>
                </div>

                <div className="form-group">
                  <label className="form-label">New Seating Capacity</label>
                  <select
                    className="form-select"
                    value={editCapacity}
                    onChange={e => setEditCapacity(e.target.value)}
                    style={{ fontSize: '1rem', padding: '10px 14px' }}
                  >
                    <option value={2}>2 Seats</option>
                    <option value={4}>4 Seats</option>
                    <option value={6}>6 Seats</option>
                    <option value={8}>8 Seats</option>
                    <option value={10}>10 Seats</option>
                    <option value={12}>12 Seats</option>
                  </select>
                </div>

                {/* Visual preview */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 24, marginTop: 10, padding: '14px 0',
                  borderTop: '1px dashed #E2E8F0'
                }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#718096', marginBottom: 4 }}>BEFORE</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#718096' }}>{editTable.capacity}</div>
                    <div style={{ fontSize: 11, color: '#718096' }}>seats</div>
                  </div>
                  <div style={{ fontSize: 20, color: '#CBD5E0' }}>→</div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#FF6B35', marginBottom: 4 }}>AFTER</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#FF6B35' }}>{editCapacity}</div>
                    <div style={{ fontSize: 11, color: '#FF6B35' }}>seats</div>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowEditModal(false)}>Cancel</button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={Number(editCapacity) === editTable.capacity}
                  style={{ opacity: Number(editCapacity) === editTable.capacity ? 0.5 : 1 }}
                >
                  ✅ Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}