'use client';

import { getSupabaseBrowser } from './supabase/browser';

/**
 * A Socket.IO-like object (`on`, `off`, `disconnect`) backed by Supabase Realtime Broadcast,
 * so the screens keep their `socket.on('new-order', …)` code unchanged.
 *
 * The server decides which topics this browser may join (/api/realtime/topics), exactly like
 * the Socket.IO handshake decided which rooms a connection joined; Realtime Authorization
 * (RLS on realtime.messages) enforces it. Only the server can publish.
 */
export function createRealtimeSocket({ customerToken } = {}) {
  const handlers = new Map();
  const channels = [];
  let closed = false;

  const dispatch = (event, payload) => {
    const set = handlers.get(event);
    if (set) [...set].forEach(fn => {
      try { fn(payload); } catch (err) { console.error(`Realtime handler for "${event}" failed`, err); }
    });
  };

  (async () => {
    try {
      const res = await fetch('/api/realtime/topics', {
        headers: customerToken ? { 'X-Customer-Token': customerToken } : {},
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!res.ok || closed) return;
      const { topics = [] } = await res.json();
      const supabase = getSupabaseBrowser();
      // Uses the signed-in staff member's access token, or the anon key for customers
      await supabase.realtime.setAuth();
      if (closed) return;
      topics.forEach(topic => {
        const channel = supabase
          .channel(topic, { config: { private: true, broadcast: { self: false } } })
          .on('broadcast', { event: '*' }, (msg) => dispatch(msg.event, msg.payload))
          .subscribe((status, err) => {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              console.warn(`Realtime channel ${topic}: ${status}`, err || '');
            }
          });
        channels.push(channel);
      });
    } catch (err) {
      console.warn('Realtime connection failed', err);
    }
  })();

  return {
    on(event, fn) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event).add(fn);
      return this;
    },
    // Like Socket.IO: without a handler, removes every handler for the event
    off(event, fn) {
      if (!fn) handlers.delete(event);
      else handlers.get(event)?.delete(fn);
      return this;
    },
    disconnect() {
      closed = true;
      handlers.clear();
      const supabase = getSupabaseBrowser();
      channels.splice(0).forEach(ch => supabase.removeChannel(ch));
    },
  };
}
