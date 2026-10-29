'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';

// Colours for the small category label on dish cards (by category position)
const PALETTE = ['#FF6B35', '#3182ce', '#38a169', '#805ad5', '#e53e3e', '#ED8936', '#319795', '#D53F8C', '#2B6CB0', '#718096'];

// The restaurant's categories from Admin → Menu, in their order, for the staff order screens.
// Returns the filter list ('All' + categories that have dishes), a colour per category and a
// sort function that puts dishes in menu order.
export function useMenuCategories(menuItems) {
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    axios.get('/api/categories')
      .then(r => setCategories((r.data || []).map(c => c.name)))
      .catch(() => setCategories([]));
  }, []);

  const withDishes = new Set(menuItems.map(i => i.category).filter(Boolean));
  // Categories in admin order, then any dish category the list doesn't know yet
  const ordered = [...categories.filter(c => withDishes.has(c)), ...[...withDishes].filter(c => !categories.includes(c)).sort()];
  const rank = new Map(ordered.map((c, i) => [c, i]));

  return {
    categoryTabs: ['All', ...ordered],
    categoryColor: (name) => PALETTE[(rank.get(name) ?? PALETTE.length - 1) % PALETTE.length],
    sortByMenu: (a, b) => (rank.get(a.category) ?? 999) - (rank.get(b.category) ?? 999) || a.name.localeCompare(b.name),
  };
}
