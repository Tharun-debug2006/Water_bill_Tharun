const API_BASE = '/api';
const page = location.pathname.split('/').pop() || 'dashboard.html';

function token() { return localStorage.getItem('wbms_token'); }
function admin() { return JSON.parse(localStorage.getItem('wbms_admin') || 'null'); }
function setSession(tokenValue, adminValue) {
  localStorage.setItem('wbms_token', tokenValue);
  localStorage.setItem('wbms_admin', JSON.stringify(adminValue));
}
function clearSession() {
  localStorage.removeItem('wbms_token');
  localStorage.removeItem('wbms_admin');
}
function requireLogin() {
  if (page !== 'login.html' && !token()) location.href = '/login.html';
}
async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) {
    clearSession();
    location.href = '/login.html';
    throw new Error(body.error || 'Unauthorized');
  }
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}
const qs = (s, root = document) => root.querySelector(s);
const qsa = (s, root = document) => [...root.querySelectorAll(s)];
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const litres = (n) => Number(n || 0).toLocaleString('en-IN');
const params = new URLSearchParams(location.search);
let currentRecord = null;

function wireNavigation() {
  const links = [
    ['dashboard', '/dashboard.html'],
    ['domain', '/dashboard.html#buildings'],
    ['assessment', '/summary.html'],
    ['settings', '/settings.html'],
  ];
  qsa('a,button').forEach((el) => {
    const icon = el.querySelector('.material-symbols-outlined') || el;
    const text = `${el.textContent || ''} ${icon.textContent || ''}`.toLowerCase();
    for (const [key, href] of links) {
      if (text.includes(key) && !text.includes('add') && !text.includes('save')) {
        if (el.tagName === 'A') el.href = href;
        else el.addEventListener('click', () => { location.href = href; });
      }
    }
    if (text.includes('logout')) el.addEventListener('click', logout);
  });
  qsa('button').forEach((button) => {
    if ((button.textContent || '').toLowerCase().includes('sign out')) button.addEventListener('click', logout);
  });
}
function logout() {
  clearSession();
  location.href = '/login.html';
}
function showError(err) {
  console.error(err);
  alert(err.message || 'Something went wrong.');
}

// --- Lightweight modal / toast system --------------------------------------
// Built purely from JS + the page's existing Tailwind tokens/glass-card style
// so it visually matches the rest of the app without touching any static
// markup or adding new stylesheets.
function closeModal() {
  const existing = document.getElementById('wbms-modal-overlay');
  if (existing) existing.remove();
}
function openModal(innerHTML) {
  closeModal();
  const overlay = document.createElement('div');
  overlay.id = 'wbms-modal-overlay';
  overlay.className = 'fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-sm';
  overlay.innerHTML = `<div class="glass-card bg-surface-container-lowest w-full max-w-md rounded-xl shadow-lg p-md">${innerHTML}</div>`;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  document.body.appendChild(overlay);
  return overlay;
}
function confirmDialog(title, message, { confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = {}) {
  return new Promise((resolve) => {
    const overlay = openModal(`
      <h3 class="font-headline-sm text-headline-sm text-on-surface mb-sm">${title}</h3>
      <p class="font-body-sm text-body-sm text-on-surface-variant mb-md">${message}</p>
      <div class="flex justify-end gap-sm">
        <button id="wbms-modal-cancel" class="px-sm py-2 rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container font-label-md text-label-md transition-colors">${cancelLabel}</button>
        <button id="wbms-modal-confirm" class="px-sm py-2 rounded-lg font-label-md text-label-md text-white transition-colors ${danger ? 'bg-error hover:opacity-90' : 'bg-primary hover:bg-primary-container'}">${confirmLabel}</button>
      </div>
    `);
    overlay.querySelector('#wbms-modal-cancel').addEventListener('click', () => { closeModal(); resolve(false); });
    overlay.querySelector('#wbms-modal-confirm').addEventListener('click', () => { closeModal(); resolve(true); });
  });
}
function showToast(message, type = 'success') {
  const existing = document.getElementById('wbms-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'wbms-toast';
  const bg = type === 'error' ? 'bg-error text-white' : 'bg-green-700 text-white';
  toast.className = `fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-md py-3 rounded-xl shadow-lg font-label-md text-label-md flex items-center gap-2 ${bg}`;
  toast.innerHTML = `<span class="material-symbols-outlined text-[18px]">${type === 'error' ? 'error' : 'check_circle'}</span><span>${message}</span>`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}
function openExportMenu(title, onSelect) {
  const overlay = openModal(`
    <h3 class="font-headline-sm text-headline-sm text-on-surface mb-sm">${title}</h3>
    <p class="font-body-sm text-body-sm text-on-surface-variant mb-md">Choose a format to download.</p>
    <div class="flex flex-col gap-2">
      <button data-fmt="pdf" class="wbms-export-fmt flex items-center gap-2 px-sm py-3 rounded-lg border border-outline-variant hover:bg-surface-container font-label-md text-label-md transition-colors"><span class="material-symbols-outlined text-[18px]">picture_as_pdf</span>Export as PDF</button>
      <button data-fmt="xlsx" class="wbms-export-fmt flex items-center gap-2 px-sm py-3 rounded-lg border border-outline-variant hover:bg-surface-container font-label-md text-label-md transition-colors"><span class="material-symbols-outlined text-[18px]">table_view</span>Export as Excel (.xlsx)</button>
      <button data-fmt="csv" class="wbms-export-fmt flex items-center gap-2 px-sm py-3 rounded-lg border border-outline-variant hover:bg-surface-container font-label-md text-label-md transition-colors"><span class="material-symbols-outlined text-[18px]">description</span>Export as CSV</button>
      <button id="wbms-modal-cancel" class="mt-2 px-sm py-2 rounded-lg text-on-surface-variant hover:bg-surface-container font-label-md text-label-md transition-colors">Cancel</button>
    </div>
  `);
  overlay.querySelector('#wbms-modal-cancel').addEventListener('click', closeModal);
  overlay.querySelectorAll('.wbms-export-fmt').forEach((btn) => {
    btn.addEventListener('click', () => { closeModal(); onSelect(btn.dataset.fmt); });
  });
}
// Downloads use fetch (not a plain <a href>) because the API is authenticated
// with a Bearer token rather than cookies, so the browser needs the header
// attached to the request before the file bytes ever arrive.
async function downloadExport(path, fallbackFilename) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { ...(token() ? { Authorization: `Bearer ${token()}` } : {}) },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Export failed (${res.status})`);
    }
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match ? match[1] : fallbackFilename;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('Export downloaded successfully.');
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Export failed. Please try again.', 'error');
  }
}
function setAdminLabels() {
  const a = admin();
  if (!a) return;
  qsa('p').forEach((p) => {
    if (['Admin User', 'Alex Rivero', 'Alexander Draper'].includes(p.textContent.trim())) p.textContent = a.full_name;
    if (p.textContent.includes('admin@waterbill.com') || p.textContent.includes('waterbill.admin')) p.textContent = a.email;
  });
}

async function initLogin() {
  if (token()) return (location.href = '/dashboard.html');
  qs('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = qs('#login-error');
    err.classList.add('hidden');
    try {
      const data = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: qs('#email').value.trim(), password: qs('#password').value }),
      });
      setSession(data.token, data.admin);
      location.href = '/dashboard.html';
    } catch (ex) {
      err.textContent = ex.message;
      err.classList.remove('hidden');
    }
  });
}

function buildingCard(b) {
  const image = b.image_url || 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=900&q=80';
  return `<div class="lg:col-span-6 glass-card rounded-xl overflow-hidden hover:shadow-lg transition-all duration-300 group">
    <div class="h-48 relative overflow-hidden"><div class="w-full h-full bg-cover bg-center group-hover:scale-105 transition-transform duration-500" style="background-image: url('${image}')"></div>
    <div class="absolute top-4 right-4 bg-white/90 backdrop-blur rounded-full px-sm py-1 flex items-center gap-1 shadow-sm"><span class="w-2 h-2 rounded-full bg-green-500"></span><span class="font-label-md text-label-md text-on-surface">${b.status || 'Active'}</span></div></div>
    <div class="p-md"><div class="flex justify-between items-start mb-sm"><h4 class="font-headline-lg text-headline-lg text-on-surface">${b.name}</h4><div class="p-2 bg-surface-container rounded-lg text-on-surface-variant"><span class="material-symbols-outlined">domain</span></div></div>
    <div class="flex items-center gap-xl mb-lg"><div class="flex flex-col"><span class="font-label-md text-label-md text-on-surface-variant uppercase">Units</span><span class="font-headline-sm text-headline-sm text-primary">${b.unit_count || 0} Houses</span></div><div class="flex flex-col border-l border-outline-variant pl-xl"><span class="font-label-md text-label-md text-on-surface-variant uppercase">Usage</span><span class="font-headline-sm text-headline-sm text-on-surface">${litres(b.total_usage_l)} L</span></div></div>
    <div class="flex items-center gap-sm"><button data-open-building="${b.id}" class="flex-grow py-3 bg-primary text-on-primary rounded-lg font-label-md text-label-md flex items-center justify-center gap-xs hover:bg-primary-container transition-colors active:scale-[0.98]">Open Building <span class="material-symbols-outlined text-[18px]">arrow_forward</span></button>
    <button data-add-house="${b.id}" class="p-3 border border-primary text-primary rounded-lg hover:bg-primary-fixed transition-colors active:scale-95" title="Add New House"><span class="material-symbols-outlined">add_home</span></button></div></div></div>`;
}

async function initDashboard() {
  const [summary, buildings] = await Promise.all([api('/summary'), api('/buildings')]);
  const stats = qsa('h3.font-display-lg');
  if (stats[0]) stats[0].innerHTML = `${litres(summary.total_consumption_l)} <span class="text-body-md font-normal text-on-surface-variant">Ltrs</span>`;
  if (stats[1]) stats[1].textContent = summary.pending_bills || 0;
  const grid = qs('.grid.grid-cols-1.md\\:grid-cols-2.lg\\:grid-cols-12');
  const heading = qsa('h3').find((h) => h.textContent.includes('Your Properties'));
  if (grid && heading) {
    let start = [...grid.children].indexOf(heading.parentElement) + 1;
    while (grid.children[start] && grid.children[start].className.includes('lg:col-span-6')) grid.children[start].remove();
    heading.parentElement.insertAdjacentHTML('afterend', buildings.map(buildingCard).join(''));
  }
  qsa('[data-open-building]').forEach((b) => b.addEventListener('click', () => location.href = `/building-details.html?id=${b.dataset.openBuilding}`));
  qsa('[data-add-house]').forEach((b) => b.addEventListener('click', async () => {
    const house_number = prompt('House number');
    if (!house_number) return;
    await api('/houses', { method: 'POST', body: JSON.stringify({ building_id: b.dataset.addHouse, house_number }) });
    location.href = `/building-details.html?id=${b.dataset.addHouse}`;
  }));
  qsa('button').forEach((button) => {
    const text = button.textContent.toLowerCase();
    if (text.includes('export report')) button.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify({ summary, buildings }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'waterbill-report.json';
      a.click();
      URL.revokeObjectURL(a.href);
    });
    if (text.includes('register now')) button.addEventListener('click', addBuilding);
  });
}

function houseCard(h) {
  const paid = h.status === 'Paid';
  return `<div class="glass-card p-sm rounded-xl hover:shadow-md transition-all group flex flex-col justify-between ${paid ? '' : 'border-l-4 border-l-error'}">
    <div class="flex justify-between items-start mb-md"><div class="w-12 h-12 ${paid ? 'bg-primary-fixed text-on-primary-fixed' : 'bg-secondary-fixed text-on-secondary-fixed'} rounded-xl flex items-center justify-center font-bold text-headline-sm">${h.house_number}</div>
    <span class="px-3 py-1 rounded-full ${paid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-error'} font-label-md text-label-md flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full ${paid ? 'bg-green-700' : 'bg-error'}"></span>${h.status}</span></div>
    <div class="mb-lg"><h3 class="font-headline-sm text-headline-sm text-on-surface mb-base">${h.resident_name || 'Vacant'}</h3><p class="text-on-surface-variant font-body-sm text-body-sm flex items-center gap-2"><span class="material-symbols-outlined text-[18px]">water_drop</span>Usage: ${litres(Math.max(0, h.current_reading - h.previous_reading))} L</p></div>
    <div class="flex items-center gap-2">
    <button data-house-id="${h.id}" class="flex-grow py-2 border border-primary text-primary hover:bg-primary-fixed rounded-lg transition-colors font-label-md text-label-md flex items-center justify-center gap-2 active:scale-[0.98]">View Details <span class="material-symbols-outlined text-[18px]">arrow_forward</span></button>
    <button data-edit-house="${h.id}" title="Edit House" class="p-2 border border-outline-variant text-on-surface-variant hover:text-primary hover:border-primary rounded-lg transition-colors active:scale-95"><span class="material-symbols-outlined text-[18px]">edit</span></button>
    <button data-delete-house="${h.id}" data-house-number="${h.house_number}" title="Delete House" class="p-2 border border-outline-variant text-on-surface-variant hover:text-error hover:border-error rounded-lg transition-colors active:scale-95"><span class="material-symbols-outlined text-[18px]">delete</span></button>
    </div></div>`;
}

// Builds the payload for the Edit House modal from a house record.
function editHouseModalHTML(h) {
  return `
    <h3 class="font-headline-sm text-headline-sm text-on-surface mb-md">Edit House ${h.house_number}</h3>
    <div class="space-y-3">
      <label class="block"><span class="font-label-md text-label-md text-on-surface-variant">House Number</span>
        <input id="edit-house-number" type="text" value="${h.house_number}" class="w-full mt-1 px-3 py-2 border border-outline-variant rounded-lg bg-surface-container-low outline-none focus:border-primary" disabled />
      </label>
      <label class="block"><span class="font-label-md text-label-md text-on-surface-variant">Owner Name</span>
        <input id="edit-resident-name" type="text" value="${h.resident_name || ''}" class="w-full mt-1 px-3 py-2 border border-outline-variant rounded-lg bg-surface outline-none focus:border-primary" />
      </label>
      <label class="block"><span class="font-label-md text-label-md text-on-surface-variant">Phone Number</span>
        <input id="edit-phone-number" type="text" value="${h.phone_number || ''}" class="w-full mt-1 px-3 py-2 border border-outline-variant rounded-lg bg-surface outline-none focus:border-primary" />
      </label>
      <div class="grid grid-cols-2 gap-3">
        <label class="block"><span class="font-label-md text-label-md text-on-surface-variant">Previous Reading (L)</span>
          <input id="edit-previous-reading" type="number" value="${h.previous_reading}" class="w-full mt-1 px-3 py-2 border border-outline-variant rounded-lg bg-surface outline-none focus:border-primary" />
        </label>
        <label class="block"><span class="font-label-md text-label-md text-on-surface-variant">Current Reading (L)</span>
          <input id="edit-current-reading" type="number" value="${h.current_reading}" class="w-full mt-1 px-3 py-2 border border-outline-variant rounded-lg bg-surface outline-none focus:border-primary" />
        </label>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <label class="block"><span class="font-label-md text-label-md text-on-surface-variant">Free Limit (L)</span>
          <input id="edit-free-limit" type="number" value="${h.free_limit_l}" class="w-full mt-1 px-3 py-2 border border-outline-variant rounded-lg bg-surface outline-none focus:border-primary" />
        </label>
        <label class="block"><span class="font-label-md text-label-md text-on-surface-variant">Rate / Litre (₹)</span>
          <input id="edit-rate" type="number" step="0.01" value="${h.rate_per_litre}" class="w-full mt-1 px-3 py-2 border border-outline-variant rounded-lg bg-surface outline-none focus:border-primary" />
        </label>
      </div>
      <label class="block"><span class="font-label-md text-label-md text-on-surface-variant">Payment Status</span>
        <select id="edit-status" class="w-full mt-1 px-3 py-2 border border-outline-variant rounded-lg bg-surface outline-none focus:border-primary">
          <option value="Pending" ${h.status === 'Pending' ? 'selected' : ''}>Pending</option>
          <option value="Paid" ${h.status === 'Paid' ? 'selected' : ''}>Paid</option>
        </select>
      </label>
    </div>
    <div class="flex justify-end gap-sm mt-md">
      <button id="wbms-modal-cancel" class="px-sm py-2 rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container font-label-md text-label-md transition-colors">Cancel</button>
      <button id="edit-house-save" class="px-sm py-2 rounded-lg bg-primary text-on-primary hover:bg-primary-container font-label-md text-label-md transition-colors">Save Changes</button>
    </div>
  `;
}

function openEditHouseModal(house, onSaved) {
  const overlay = openModal(editHouseModalHTML(house));
  overlay.querySelector('#wbms-modal-cancel').addEventListener('click', closeModal);
  overlay.querySelector('#edit-house-save').addEventListener('click', async () => {
    const saveBtn = overlay.querySelector('#edit-house-save');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      const body = {
        resident_name: overlay.querySelector('#edit-resident-name').value,
        phone_number: overlay.querySelector('#edit-phone-number').value,
        previous_reading: Number(overlay.querySelector('#edit-previous-reading').value),
        current_reading: Number(overlay.querySelector('#edit-current-reading').value),
        free_limit_l: Number(overlay.querySelector('#edit-free-limit').value),
        rate_per_litre: Number(overlay.querySelector('#edit-rate').value),
        status: overlay.querySelector('#edit-status').value,
        version: house.version,
      };
      await api(`/houses/${house.id}`, { method: 'PUT', body: JSON.stringify(body) });
      closeModal();
      showToast(`House ${house.house_number} updated successfully.`);
      if (onSaved) await onSaved();
    } catch (err) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Changes';
      showToast(err.message || 'Failed to save house.', 'error');
    }
  });
}

async function handleDeleteHouse(id, houseNumber, onDeleted) {
  const confirmed = await confirmDialog(
    'Delete House?',
    `Are you sure you want to delete House ${houseNumber}? This action cannot be undone.`,
    { confirmLabel: 'Delete', cancelLabel: 'Cancel', danger: true }
  );
  if (!confirmed) return;
  try {
    await api(`/houses/${id}`, { method: 'DELETE' });
    showToast(`House ${houseNumber} deleted successfully.`);
    if (onDeleted) await onDeleted();
  } catch (err) {
    showToast(err.message || 'Failed to delete house.', 'error');
  }
}

async function initBuildingDetails() {
  const id = params.get('id');
  if (!id) return (location.href = '/dashboard.html');
  let b = await api(`/buildings/${id}`);
  const grid = qs('.grid.grid-cols-1.sm\\:grid-cols-2.lg\\:grid-cols-3.xl\\:grid-cols-4');

  function renderHeader() {
    qsa('h1, nav span, p').forEach((el) => {
      if (el.textContent.includes('Prabhakar Building')) el.textContent = el.textContent.replace('Prabhakar Building', b.name);
      if (el.textContent.includes('Managing 12 Residential Units')) el.textContent = `Managing ${b.houses.length} Residential Units • ${b.location || ''}`;
      if (/^Managing \d+ Residential Units/.test(el.textContent)) el.textContent = `Managing ${b.houses.length} Residential Units • ${b.location || ''}`;
    });
  }

  function renderHouses() {
    grid.innerHTML = b.houses.map(houseCard).join('');
    qsa('[data-house-id]', grid).forEach((btn) => btn.addEventListener('click', () => location.href = `/house-details.html?id=${btn.dataset.houseId}`));
    qsa('[data-edit-house]', grid).forEach((btn) => btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const house = b.houses.find((h) => String(h.id) === btn.dataset.editHouse);
      if (!house) return;
      openEditHouseModal(house, refresh);
    }));
    qsa('[data-delete-house]', grid).forEach((btn) => btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleDeleteHouse(btn.dataset.deleteHouse, btn.dataset.houseNumber, refresh);
    }));
  }

  async function refresh() {
    b = await api(`/buildings/${id}`);
    renderHeader();
    renderHouses();
  }

  renderHeader();
  renderHouses();

  qsa('button').forEach((button) => {
    if (button.textContent.toLowerCase().includes('add house')) {
      button.addEventListener('click', async () => {
        const house_number = prompt('House number');
        if (!house_number) return;
        await api('/houses', { method: 'POST', body: JSON.stringify({ building_id: id, house_number }) });
        await refresh();
        showToast(`House ${house_number} added successfully.`);
      });
    }
  });

  const exportBtn = qs('#export-building-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      openExportMenu(`Export ${b.name}`, (format) => {
        downloadExport(`/export/building/${id}?format=${format}`, `${b.name}-export.${format}`);
      });
    });
  }

  const search = qs('input[type="text"]');
  search.addEventListener('input', () => {
    const term = search.value.toLowerCase();
    qsa('.glass-card', grid).forEach((card) => { card.style.display = card.textContent.toLowerCase().includes(term) ? 'flex' : 'none'; });
  });
}

function fillInputs(values) {
  const inputs = qsa('input, textarea, select');
  const byLabel = {};
  inputs.forEach((input) => {
    const label = input.closest('div')?.querySelector('label')?.textContent.toLowerCase() || '';
    byLabel[label] = input;
  });
  Object.entries(values).forEach(([key, value]) => { if (byLabel[key]) byLabel[key].value = value ?? ''; });
}

async function initHouseDetails() {
  const id = params.get('id');
  if (!id) return history.back();
  const h = await api(`/houses/${id}`);
  currentRecord = h;
  qsa('p').forEach((p) => { if (p.textContent.includes('House #204')) p.textContent = `Manage billing cycle and resident information for House #${h.house_number}.`; });
  fillInputs({
    'house number': h.house_number,
    'resident name': h.resident_name,
    'previous reading (litres)': h.previous_reading,
    'current reading (litres)': h.current_reading,
    'additional notes': h.notes || '',
  });
  const freeBox = qsa('label').find((l) => l.textContent.includes('Free Limit'))?.parentElement?.querySelector('div');
  if (freeBox) freeBox.textContent = `${litres(h.free_limit_l)} L`;
  const rateInput = qsa('input').find((i) => i.value === '0.20' || i.previousElementSibling?.textContent.includes('₹'));
  if (rateInput) rateInput.value = h.rate_per_litre;
  calculateHouseBill();
  qsa('button').forEach((button) => {
    const text = button.textContent.toLowerCase();
    if (text.includes('save')) button.addEventListener('click', saveHouse);
    if (text.includes('print')) button.addEventListener('click', () => window.print());
  });
  const exportBtn = qs('#export-house-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      openExportMenu(`Export House ${h.house_number}`, (format) => {
        downloadExport(`/export/house/${id}?format=${format}`, `house-${h.house_number}-export.${format}`);
      });
    });
  }
  const statusWrap = qsa('span').find((s) => s.textContent === 'Draft');
  if (statusWrap) {
    statusWrap.textContent = h.status;
    statusWrap.addEventListener('click', async () => {
      await api(`/houses/${id}`, { method: 'PUT', body: JSON.stringify({ status: h.status === 'Paid' ? 'Pending' : 'Paid', version: currentRecord.version }) });
      location.reload();
    });
    statusWrap.style.cursor = 'pointer';
    statusWrap.title = 'Click to toggle payment status';
  }
}
function calculateHouseBill() {
  const prev = Number(qs('#prev_reading')?.value || 0);
  const curr = Number(qs('#curr_reading')?.value || 0);
  const free = Number(currentRecord?.free_limit_l ?? 5000);
  const rate = Number(currentRecord?.rate_per_litre ?? 0.2);
  const consumed = Math.max(0, curr - prev);
  const billable = Math.max(0, consumed - free);
  if (qs('#consumed')) qs('#consumed').value = consumed;
  if (qs('#extra_water')) qs('#extra_water').value = billable;
  if (qs('#total_amount')) qs('#total_amount').textContent = (billable * rate).toFixed(2);
}
async function saveHouse() {
  const body = {
    resident_name: qsa('input')[1]?.value,
    previous_reading: Number(qs('#prev_reading').value),
    current_reading: Number(qs('#curr_reading').value),
    notes: qs('textarea')?.value || '',
    version: currentRecord.version,
  };
  currentRecord = await api(`/houses/${currentRecord.id}`, { method: 'PUT', body: JSON.stringify(body) });
  await api('/bills', { method: 'POST', body: JSON.stringify({ house_id: currentRecord.id, amount: currentRecord.bill.total, status: currentRecord.status }) });
  alert('House details and bill saved.');
  location.reload();
}

async function initSummary() {
  const s = await api('/summary');
  const metricValues = qsa('section h3.font-headline-md');
  if (metricValues[0]) metricValues[0].textContent = s.total_houses || 0;
  if (metricValues[1]) metricValues[1].textContent = s.paid_bills || 0;
  if (metricValues[2]) metricValues[2].textContent = s.pending_bills || 0;
  if (metricValues[3]) metricValues[3].textContent = litres(s.total_consumption_l);
  if (metricValues[4]) metricValues[4].textContent = inr(s.collected);
  const tbody = qs('tbody');
  tbody.innerHTML = (s.recent_activity || []).map((r) => `<tr class="hover:bg-surface-container/50 transition-colors"><td class="px-md py-sm font-body-sm text-body-sm font-medium">${r.house_number}</td><td class="px-md py-sm font-body-sm text-body-sm text-on-surface-variant">${r.building}</td><td class="px-md py-sm font-body-sm text-body-sm">${inr(r.amount)}</td><td class="px-md py-sm"><span class="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold ${r.status === 'Paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'} uppercase">${r.status}</span></td><td class="px-md py-sm font-body-sm text-body-sm text-on-surface-variant">${new Date(r.updated_at).toLocaleDateString()}</td><td class="px-md py-sm"><button onclick="location.href='/house-details.html?id=${r.id}'" class="material-symbols-outlined text-primary text-sm">open_in_new</button></td></tr>`).join('') || '<tr><td colspan="6" class="px-md py-sm">No activity yet.</td></tr>';
}

async function initSettings() {
  const [settings, buildings] = await Promise.all([api('/settings'), api('/buildings')]);
  currentRecord = settings;
  const inputs = qsa('input, select');
  inputs[1].value = settings.water_free_limit_l;
  inputs[2].value = settings.rate_per_litre;
  qs('select').value = settings.billing_cycle;
  const a = admin();
  if (a) {
    inputs[3].value = a.full_name;
    inputs[4].value = a.email;
  }
  const grid = qsa('.grid.grid-cols-1.md\\:grid-cols-2.xl\\:grid-cols-3')[0];
  if (grid) grid.innerHTML = buildings.map((b) => `<div class="p-md rounded-xl bg-surface border border-outline-variant flex items-start justify-between group"><div><h3 class="font-body-lg font-semibold text-on-surface">${b.name}</h3><p class="font-body-sm text-on-surface-variant">${b.unit_count || 0} Units • ${b.location || ''}</p><span class="inline-block mt-2 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-bold uppercase tracking-wider">${b.status}</span></div><button data-delete-building="${b.id}" class="material-symbols-outlined text-on-surface-variant hover:text-primary transition-colors">delete</button></div>`).join('');
  qsa('button').forEach((button) => {
    const text = button.textContent.toLowerCase();
    if (text.includes('save billing')) button.addEventListener('click', saveSettings);
    if (text.includes('add building')) button.addEventListener('click', addBuilding);
    if (text.includes('save building list')) button.addEventListener('click', () => alert('Building list is already saved.'));
  });
  qsa('[data-delete-building]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Delete this building and its houses?')) return;
    await api(`/buildings/${b.dataset.deleteBuilding}`, { method: 'DELETE' });
    location.reload();
  }));
}
async function saveSettings() {
  const inputs = qsa('input, select');
  currentRecord = await api('/settings', {
    method: 'PUT',
    body: JSON.stringify({ water_free_limit_l: Number(inputs[1].value), rate_per_litre: Number(inputs[2].value), billing_cycle: qs('select').value, version: currentRecord.version }),
  });
  alert('Settings saved.');
}
async function addBuilding() {
  const name = prompt('Building name');
  if (!name) return;
  const buildingLocation = prompt('Location') || '';
  await api('/buildings', { method: 'POST', body: JSON.stringify({ name, location: buildingLocation }) });
  window.location.reload();
}

window.addEventListener('DOMContentLoaded', async () => {
  try {
    if (page === 'login.html') return initLogin();
    requireLogin();
    await api('/auth/me');
    wireNavigation();
    setAdminLabels();
    if (page === 'dashboard.html') await initDashboard();
    if (page === 'building-details.html') await initBuildingDetails();
    if (page === 'house-details.html') await initHouseDetails();
    if (page === 'summary.html') await initSummary();
    if (page === 'settings.html') await initSettings();
  } catch (err) {
    showError(err);
  }
});
