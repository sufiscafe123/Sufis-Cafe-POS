'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

const DEFAULT_CATEGORIES = [
  { name: 'Starters', icon: '🥟' },
  { name: 'Main Course', icon: '🍲' },
  { name: 'Pizza', icon: '🍕' },
  { name: 'Burgers', icon: '🍔' },
  { name: 'Beverages', icon: '🥤' },
  { name: 'Desserts', icon: '🍰' }
];

export const VegBadge = ({ isVeg, size = 16 }) => {
  const dotSize = Math.round(size * 0.44);
  return (
    <span
      title={isVeg ? 'Vegetarian' : 'Non-Vegetarian'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        border: `2px solid ${isVeg ? '#10B981' : '#EF4444'}`,
        borderRadius: 3,
        background: 'white',
        flexShrink: 0
      }}
    >
      <span
        style={{
          width: dotSize,
          height: dotSize,
          borderRadius: '50%',
          backgroundColor: isVeg ? '#10B981' : '#EF4444'
        }}
      />
    </span>
  );
};

const emptyForm = {
  name: '',
  category: 'Main Course',
  customCategory: '',
  price: '',
  description: '',
  available: true,
  isVeg: true,
  image: ''
};

export default function Menu() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [showModal, setShowModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [activeCategory, setActiveCategory] = useState('All');
  const [dietFilter, setDietFilter] = useState('ALL'); // 'ALL' | 'VEG' | 'NON_VEG'
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // New category form inside modal
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('🍽️');
  const [addingCategory, setAddingCategory] = useState(false);

  const loadMenu = async () => {
    try {
      const res = await axios.get('/api/menu');
      setItems(res.data || []);
    } catch (err) {
      console.warn('Failed to load menu items:', err.message);
    }
  };

  const loadCategories = async () => {
    try {
      const res = await axios.get('/api/categories');
      if (res.data && res.data.length > 0) {
        setCategories(res.data);
      }
    } catch (err) {
      console.warn('Failed to load categories:', err.message);
    }
  };

  useEffect(() => {
    loadMenu();
    loadCategories();
  }, []);

  const openAdd = () => {
    const firstCat = categories[0]?.name || 'Main Course';
    setForm({ ...emptyForm, category: firstCat });
    setEditId(null);
    setShowModal(true);
  };

  const openEdit = (item) => {
    setForm({
      name: item.name,
      category: item.category,
      customCategory: '',
      price: item.price,
      description: item.description || '',
      available: item.available !== false,
      isVeg: item.isVeg !== false,
      image: item.image || ''
    });
    setEditId(item._id);
    setShowModal(true);
  };

  const handleAddCategory = async (e) => {
    e.preventDefault();
    const clean = newCatName.trim();
    if (!clean) return toast.error('Category name is required');
    try {
      setAddingCategory(true);
      await axios.post('/api/categories', {
        name: clean,
        icon: newCatIcon || '🍽️'
      });
      toast.success(`Category "${clean}" added!`);
      setNewCatName('');
      setNewCatIcon('🍽️');
      await loadCategories();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add category');
    } finally {
      setAddingCategory(false);
    }
  };

  const handleDeleteCategory = async (catId, catName) => {
    if (!window.confirm(`Delete category "${catName}"? Menu items will keep this category name.`)) return;
    try {
      await axios.delete(`/api/categories/${catId}`);
      toast.success(`Category "${catName}" deleted`);
      await loadCategories();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete category');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    const finalCategory = form.category === '__NEW__'
      ? form.customCategory.trim()
      : form.category.trim();

    if (!finalCategory) {
      return toast.error('Please select or specify a category');
    }

    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        category: finalCategory,
        price: parseFloat(form.price),
        description: form.description.trim(),
        available: form.available,
        isVeg: form.isVeg,
        image: (form.image || '').trim()
      };

      if (editId) {
        await axios.put(`/api/menu/${editId}`, payload);
        toast.success('Menu item updated!');
      } else {
        await axios.post('/api/menu', payload);
        toast.success('Menu item added successfully!');
      }

      setShowModal(false);
      await loadMenu();
      await loadCategories();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error saving menu item');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this item from menu?')) return;
    try {
      await axios.delete(`/api/menu/${id}`);
      toast.success('Item deleted');
      loadMenu();
    } catch (err) {
      toast.error('Failed to delete item');
    }
  };

  const toggleAvail = async (item) => {
    try {
      await axios.put(`/api/menu/${item._id}`, { ...item, available: !item.available });
      toast.success(`Item is now ${!item.available ? 'available' : 'unavailable'}`);
      loadMenu();
    } catch (err) {
      toast.error('Failed to update availability');
    }
  };

  const filtered = items.filter(i => {
    const matchesCat = activeCategory === 'All' || i.category === activeCategory;
    const matchesSearch = i.name.toLowerCase().includes(search.toLowerCase()) ||
      (i.description && i.description.toLowerCase().includes(search.toLowerCase()));
    const isVeg = i.isVeg !== false;
    const matchesDiet = dietFilter === 'ALL' || (dietFilter === 'VEG' && isVeg) || (dietFilter === 'NON_VEG' && !isVeg);
    return matchesCat && matchesSearch && matchesDiet;
  });

  const categoryNames = Array.from(new Set([
    ...categories.map(c => c.name),
    ...items.map(i => i.category).filter(Boolean)
  ]));

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1>Menu Management</h1>
          <p style={{ color: '#64748B', fontSize: '0.88rem', margin: '4px 0 0' }}>
            Add, update dishes and manage categories for your digital QR and POS menu
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn btn-secondary"
            onClick={() => setShowCategoryModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
          >
            📁 Manage Categories
          </button>
          <button
            className="btn btn-primary"
            onClick={openAdd}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800 }}
          >
            ➕ Add Menu Item
          </button>
        </div>
      </div>

      <div className="page-body">
        {/* Search & Filters */}
        <div className="card mb-16">
          <div className="flex-gap" style={{ flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
            <input
              className="form-input"
              placeholder="Search items..."
              style={{ maxWidth: 220 }}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />

            {/* Diet Filter */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setDietFilter(dietFilter === 'VEG' ? 'ALL' : 'VEG')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  border: dietFilter === 'VEG' ? '2px solid #10B981' : '1px solid #CBD5E1',
                  background: dietFilter === 'VEG' ? '#ECFDF5' : 'white',
                  color: dietFilter === 'VEG' ? '#065F46' : '#475569',
                  fontWeight: dietFilter === 'VEG' ? 700 : 500
                }}
              >
                <VegBadge isVeg={true} size={14} /> Veg
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setDietFilter(dietFilter === 'NON_VEG' ? 'ALL' : 'NON_VEG')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  border: dietFilter === 'NON_VEG' ? '2px solid #EF4444' : '1px solid #CBD5E1',
                  background: dietFilter === 'NON_VEG' ? '#FEF2F2' : 'white',
                  color: dietFilter === 'NON_VEG' ? '#991B1B' : '#475569',
                  fontWeight: dietFilter === 'NON_VEG' ? 700 : 500
                }}
              >
                <VegBadge isVeg={false} size={14} /> Non-Veg
              </button>
            </div>

            {/* Category Filter Pills */}
            <div className="flex-gap" style={{ flexWrap: 'wrap' }}>
              <button
                className={`btn btn-sm ${activeCategory === 'All' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setActiveCategory('All')}
              >
                All Items ({items.length})
              </button>
              {categoryNames.map(cat => (
                <button
                  key={cat}
                  className={`btn btn-sm ${activeCategory === cat ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setActiveCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Menu Items Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {filtered.map(item => (
            <div
              key={item._id}
              className="card"
              style={{
                opacity: item.available ? 1 : 0.6,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                border: '1px solid #E2E8F0',
                borderRadius: 14
              }}
            >
              <div>
                <div className="flex-between mb-12">
                  <span className="badge badge-blue" style={{ fontSize: '0.74rem' }}>
                    {item.category}
                  </span>
                  <span style={{ fontWeight: 800, fontSize: '1.15rem', color: '#087F45' }}>
                    ₹{item.price}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <VegBadge isVeg={item.isVeg !== false} size={16} />
                  <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#1E293B' }}>
                    {item.name}
                  </h4>
                </div>

                {item.description && (
                  <p style={{ color: '#64748B', fontSize: '0.82rem', margin: '4px 0 12px', lineHeight: 1.4 }}>
                    {item.description}
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #F1F5F9', paddingTop: 12, marginTop: 8 }}>
                <button
                  onClick={() => toggleAvail(item)}
                  style={{
                    background: item.available ? '#DCFCE7' : '#FEE2E2',
                    color: item.available ? '#166534' : '#991B1B',
                    border: 'none',
                    borderRadius: 6,
                    padding: '4px 8px',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {item.available ? '✓ In Stock' : '✕ Out of Stock'}
                </button>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => openEdit(item)}
                    style={{ background: '#F1F5F9', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
                  >
                    ✏️ Edit
                  </button>
                  <button
                    onClick={() => handleDelete(item._id)}
                    style={{ background: '#FEE2E2', color: '#B91C1C', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="empty-state">
            <div className="icon">🍽️</div>
            <p>No dishes found matching your criteria</p>
          </div>
        )}
      </div>

      {/* CATEGORY MANAGER MODAL */}
      {showCategoryModal && (
        <div className="modal-overlay" onClick={() => setShowCategoryModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 540 }}>
            <div className="modal-header">
              <h3>📁 Manage Menu Categories</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCategoryModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {/* Add New Category Input */}
              <form onSubmit={handleAddCategory} style={{ display: 'flex', gap: 10, marginBottom: 20, background: '#F8FAF8', padding: 14, borderRadius: 12, border: '1px solid #C7E3D0' }}>
                <input
                  type="text"
                  placeholder="Category Name (e.g. Biryani, Tandoori)"
                  className="form-input"
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  style={{ flex: 1 }}
                  required
                />
                <input
                  type="text"
                  placeholder="Icon (🍲)"
                  className="form-input"
                  value={newCatIcon}
                  onChange={e => setNewCatIcon(e.target.value)}
                  style={{ width: 60, textAlign: 'center', fontSize: '1.1rem' }}
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={addingCategory}
                  style={{ whiteSpace: 'nowrap', fontWeight: 800 }}
                >
                  {addingCategory ? 'Adding...' : '➕ Add'}
                </button>
              </form>

              {/* List of existing categories */}
              <h4 style={{ fontSize: '0.92rem', fontWeight: 800, color: '#1E293B', marginBottom: 10 }}>
                Existing Categories ({categories.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
                {categories.map(cat => (
                  <div
                    key={cat._id || cat.name}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 14px',
                      background: '#FFFFFF',
                      borderRadius: 10,
                      border: '1px solid #E2E8F0'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 20 }}>{cat.icon || '🍽️'}</span>
                      <span style={{ fontWeight: 800, color: '#1E293B', fontSize: '0.92rem' }}>{cat.name}</span>
                    </div>

                    {cat._id && (
                      <button
                        onClick={() => handleDeleteCategory(cat._id, cat.name)}
                        style={{
                          background: '#FEE2E2',
                          color: '#B91C1C',
                          border: 'none',
                          borderRadius: 6,
                          padding: '4px 10px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-primary" onClick={() => setShowCategoryModal(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD / EDIT MENU ITEM MODAL */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 540 }}>
            <div className="modal-header">
              <h3>{editId ? '✏️ Edit Menu Item' : '➕ Add Menu Item'}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Item / Dish Name</label>
                  <input
                    className="form-input"
                    placeholder="e.g. Kaju Curry, Paneer Tikka"
                    required
                    value={form.name}
                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  />
                </div>

                {/* Food Type: Veg / Non-Veg */}
                <div className="form-group">
                  <label className="form-label">Food Type</label>
                  <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                    <button
                      type="button"
                      onClick={() => setForm(p => ({ ...p, isVeg: true }))}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        border: form.isVeg ? '2px solid #10B981' : '1px solid #CBD5E1',
                        background: form.isVeg ? '#ECFDF5' : 'white',
                        color: form.isVeg ? '#065F46' : '#64748B',
                        fontWeight: form.isVeg ? 800 : 500,
                        borderRadius: 8,
                        padding: '8px 18px',
                        cursor: 'pointer'
                      }}
                    >
                      <VegBadge isVeg={true} size={15} /> Veg
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm(p => ({ ...p, isVeg: false }))}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        border: !form.isVeg ? '2px solid #EF4444' : '1px solid #CBD5E1',
                        background: !form.isVeg ? '#FEF2F2' : 'white',
                        color: !form.isVeg ? '#991B1B' : '#64748B',
                        fontWeight: !form.isVeg ? 800 : 500,
                        borderRadius: 8,
                        padding: '8px 18px',
                        cursor: 'pointer'
                      }}
                    >
                      <VegBadge isVeg={false} size={15} /> Non-Veg
                    </button>
                  </div>
                </div>

                {/* Category & Price */}
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Category</label>
                    <select
                      className="form-select"
                      value={form.category}
                      onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                    >
                      {categoryNames.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                      <option value="__NEW__">➕ Add New Category...</option>
                    </select>

                    {form.category === '__NEW__' && (
                      <input
                        type="text"
                        placeholder="Type new category name..."
                        className="form-input"
                        style={{ marginTop: 8 }}
                        value={form.customCategory}
                        onChange={e => setForm(p => ({ ...p, customCategory: e.target.value }))}
                        required
                      />
                    )}
                  </div>

                  <div className="form-group">
                    <label className="form-label">Price (₹)</label>
                    <input
                      className="form-input"
                      type="number"
                      placeholder="220"
                      required
                      value={form.price}
                      onChange={e => setForm(p => ({ ...p, price: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea
                    className="form-textarea"
                    placeholder="Short appetizing description..."
                    rows={2}
                    value={form.description}
                    onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  />
                </div>

                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={form.available}
                      onChange={e => setForm(p => ({ ...p, available: e.target.checked }))}
                    />
                    Available for ordering (In Stock)
                  </label>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)} disabled={submitting}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Saving...' : editId ? 'Update Item' : 'Add Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
