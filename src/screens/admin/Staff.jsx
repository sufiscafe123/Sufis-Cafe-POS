'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import PasswordInput from '../../components/shared/PasswordInput';

const emptyForm = { name: '', email: '', password: '', role: 'waiter' };

export default function Staff() {
  const [users, setUsers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);

  const load = async () => {
    const res = await axios.get('/api/users');
    setUsers(res.data);
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => { setForm(emptyForm); setEditId(null); setShowModal(true); };
  const openEdit = (u) => {
    setForm({ name: u.name, email: u.email, password: '', role: u.role });
    setEditId(u._id);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editId) {
        await axios.put(`/api/users/${editId}`, form);
        toast.success('Staff updated');
      } else {
        await axios.post('/api/users', form);
        toast.success('Staff added');
      }
      setShowModal(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this staff member?')) return;
    try {
      await axios.delete(`/api/users/${id}`);
      toast.success('Staff removed');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not remove staff member');
    }
  };

  const toggleActive = async (u) => {
    try {
      await axios.put(`/api/users/${u._id}`, { active: !u.active });
      toast.success(u.active ? 'Account deactivated' : 'Account activated');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not update account');
    }
  };

  const roleColors = { admin: 'badge-purple', waiter: 'badge-blue', kitchen: 'badge-orange' };
  const roleIcons = { admin: '👑', waiter: '🧑‍🍳', kitchen: '👨‍🍳' };

  return (
    <div>
      <div className="page-header">
        <h1>Staff Management</h1>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Staff</button>
      </div>
      <div className="page-body">
        <div className="stat-grid">
          {['admin', 'waiter', 'kitchen'].map(role => (
            <div key={role} className="stat-card">
              <div className={`stat-icon ${role === 'admin' ? 'purple' : role === 'waiter' ? 'blue' : 'orange'}`}>{roleIcons[role]}</div>
              <div>
                <div className="stat-value">{users.filter(u => u.role === role).length}</div>
                <div className="stat-label" style={{ textTransform: 'capitalize' }}>{role}s</div>
              </div>
            </div>
          ))}
        </div>

        <div className="table-wrapper">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u._id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="user-avatar" style={{ width: 32, height: 32, fontSize: 12 }}>{u.name.charAt(0)}</div>
                      <strong>{u.name}</strong>
                    </div>
                  </td>
                  <td className="text-sm">{u.email}</td>
                  <td><span className={`badge ${roleColors[u.role]}`}>{roleIcons[u.role]} {u.role}</span></td>
                  <td>
                    <span className={`badge ${u.active ? 'badge-green' : 'badge-red'}`}>
                      {u.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div className="flex-gap">
                      <button className="btn btn-sm btn-ghost" onClick={() => openEdit(u)}>Edit</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => toggleActive(u)}
                        style={{ color: u.active ? '#e53e3e' : '#38a169' }}>
                        {u.active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(u._id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editId ? 'Edit Staff' : 'Add Staff Member'}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input className="form-input" required placeholder="e.g. Raj Kumar"
                    value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-input" type="email" required placeholder="email@restaurant.com"
                    value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Password {editId && <span className="text-muted">(leave blank to keep current)</span>}</label>
                  <PasswordInput placeholder="••••••••" required={!editId} autoComplete="new-password"
                    value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Role</label>
                  <select className="form-select" value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
                    <option value="waiter">👨‍🍳 Waiter</option>
                    <option value="kitchen">🍳 Kitchen Staff</option>
                    <option value="admin">👑 Admin</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editId ? 'Update' : 'Add Staff'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
