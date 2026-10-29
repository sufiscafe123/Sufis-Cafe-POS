'use client';

import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

// Password field with an eye button to show / hide what was typed.
// Accepts the same props as a normal <input>.
export default function PasswordInput({ className = 'form-input', style, ...props }) {
  const [visible, setVisible] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <input
        {...props}
        className={className}
        type={visible ? 'text' : 'password'}
        style={{ ...style, paddingRight: 44 }}
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        title={visible ? 'Hide password' : 'Show password'}
        style={{
          position: 'absolute',
          right: 4,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 36,
          height: 36,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#718096',
          padding: 0
        }}
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}
