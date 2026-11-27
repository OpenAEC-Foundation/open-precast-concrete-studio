// Each open editor writes to its own slot. Older apps still use the single legacy key.
(() => {
  'use strict';
  const prefix = 'openaec.precast.drafts.v1.';
  const active = 'openaec.precast.activeDraft.v1';
  const legacy = 'openaec.precast.design.v2';
  let selected = null;
  let writable = null;

  function entries() {
    const result = [];
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(prefix)) continue;
      const raw = localStorage.getItem(key);
      try {
        const record = JSON.parse(raw);
        if (typeof record?.content !== 'string' || !Number.isFinite(record.savedAt)) throw new Error();
        result.push({key, savedAt:record.savedAt, content:record.content});
      } catch {
        // Keep an unknown or damaged storage record available for a raw download.
        result.push({key, content:raw, savedAt:0});
      }
    }
    const original = localStorage.getItem(legacy);
    if (original !== null && !result.some(entry => entry.content === original)) {
      result.push({key:legacy, savedAt:0, content:original});
    }
    return result.sort((a,b) => b.savedAt - a.savedAt);
  }

  function select(key) {
    selected = key;
    writable = null;
    // If the pointer cannot be updated, the record itself is still accessible in Werkversies.
    try { localStorage.setItem(active, key); } catch { /* Storage can be full. */ }
    try { sessionStorage.setItem(active, key); } catch { /* The shared pointer is enough after a restart. */ }
  }

  function initial() {
    const available = entries();
    const old = available.find(entry => entry.key === legacy);
    if (old) {
      // Retain edits made during a downgrade, even when this version cannot decode them.
      try {
        const key = prefix + PrecastIFC.newIdentity();
        localStorage.setItem(key, JSON.stringify({savedAt:Date.now(), content:old.content}));
        old.key = key;
      } catch { /* A full store can still read and export the original through entries(). */ }
    }
    let tabKey;
    try { tabKey = sessionStorage.getItem(active); } catch { /* Use the last opened draft. */ }
    const chosen = available.find(e => e.key === tabKey) ||
      available.find(e => e.key === localStorage.getItem(active)) || available[0];
    selected = chosen?.key || null;
    if (chosen) {
      try { localStorage.setItem(active, chosen.key); } catch { /* Raw records remain recoverable. */ }
      try { sessionStorage.setItem(active, chosen.key); } catch { /* Optional tab-specific resume. */ }
    }
    return chosen;
  }

  function write(content) {
    const key = writable || prefix + PrecastIFC.newIdentity();
    localStorage.setItem(key, JSON.stringify({savedAt:Date.now(),content}));
    if (key !== selected) select(key);
    writable = key;
  }

  function open(content) {
    // Reopening an unchanged file or selecting it repeatedly should not fill the list.
    writable = null;
    const existing = entries().find(record => record.content === content);
    if (existing) select(existing.key);
    else write(content);
  }

  window.PrecastDrafts = {initial, entries, select, write, open, current:() => selected};
})();
