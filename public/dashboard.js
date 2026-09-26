// Winch Dispatcher Dashboard Logic

let map;
const driverMarkers = new Map(); // driverId -> { marker, circle }
const leadMarkers = new Map();   // leadId -> marker
let driversData = new Map();
let socket;
let simulationInterval = null;

// Initialize Map
function initMap() {
  map = L.map('map', {
    zoomControl: false
  }).setView([30.0444, 31.2357], 11);

  L.control.zoom({ position: 'topright' }).addTo(map);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 19
  }).addTo(map);

  map.on('click', (e) => {
    const lat = e.latlng.lat.toFixed(5);
    const lng = e.latlng.lng.toFixed(5);
    document.getElementById('custLat').value = lat;
    document.getElementById('custLng').value = lng;
    document.getElementById('simulateModal').style.display = 'flex';
  });
}

function createWinchIcon(driver) {
  const isOnline = driver.isOnline;
  const html = `
    <div class="custom-winch-marker">
      <div class="winch-icon-wrapper ${isOnline ? 'online' : 'offline'}">
        🚚
      </div>
      <div class="winch-plate-tag">${driver.plate || driver.name}</div>
    </div>
  `;
  return L.divIcon({
    html: html,
    className: '',
    iconSize: [42, 54],
    iconAnchor: [21, 48]
  });
}

function updateDriverOnMap(driver) {
  if (!driver.lat || !driver.lng) return;

  const latLng = [driver.lat, driver.lng];
  const radiusMeters = (driver.radiusKm || 5.0) * 1000;
  const isOnline = driver.isOnline;

  if (driverMarkers.has(driver.id)) {
    const { marker, circle } = driverMarkers.get(driver.id);
    marker.setLatLng(latLng);
    marker.setIcon(createWinchIcon(driver));

    circle.setLatLng(latLng);
    circle.setRadius(radiusMeters);
    circle.setStyle({
      color: isOnline ? '#22c55e' : '#ef4444',
      fillColor: isOnline ? '#22c55e' : '#ef4444',
      fillOpacity: isOnline ? 0.08 : 0.02
    });

    marker.setPopupContent(buildPopupContent(driver));
  } else {
    const marker = L.marker(latLng, { icon: createWinchIcon(driver) }).addTo(map);
    marker.bindPopup(buildPopupContent(driver));

    const circle = L.circle(latLng, {
      radius: radiusMeters,
      color: isOnline ? '#22c55e' : '#ef4444',
      fillColor: isOnline ? '#22c55e' : '#ef4444',
      fillOpacity: isOnline ? 0.08 : 0.02,
      weight: 1.5,
      dashArray: '4, 6'
    }).addTo(map);

    driverMarkers.set(driver.id, { marker, circle });
  }
}

function buildPopupContent(driver) {
  return `
    <div style="font-family: Cairo, sans-serif; text-align: right; direction: rtl; min-width: 200px;">
      <h4 style="margin: 0 0 6px; color: #0f172a;">${driver.name}</h4>
      <p style="margin: 2px 0; font-size: 13px;">📞 ${driver.phone}</p>
      <p style="margin: 2px 0; font-size: 13px;">🚙 لوحة: <b>${driver.plate}</b></p>
      <p style="margin: 2px 0; font-size: 13px;">💰 رصيد المحفظة: <b style="color: #2563eb;">${driver.walletBalance || 0} ج.م</b></p>
      <p style="margin: 2px 0; font-size: 13px;">⭕ نطاق التغطية: <b>${driver.radiusKm || 5} كم</b></p>
      <p style="margin: 4px 0 0; font-size: 12px; font-weight: bold; color: ${driver.isOnline ? '#16a34a' : '#dc2626'};">
        الحالة: ${driver.isOnline ? 'متاح للطلبات 🟢' : 'متوقف 🔴'}
      </p>
    </div>
  `;
}

// Render Sidebar Driver List
function renderDriverList() {
  const container = document.getElementById('driverList');
  container.innerHTML = '';

  let onlineCount = 0;
  const list = Array.from(driversData.values());

  list.forEach(driver => {
    if (driver.isOnline) onlineCount++;

    const card = document.createElement('div');
    card.className = 'driver-card';
    card.onclick = () => {
      if (driver.lat && driver.lng) {
        map.flyTo([driver.lat, driver.lng], 13, { duration: 1.2 });
        const item = driverMarkers.get(driver.id);
        if (item) item.marker.openPopup();
      }
    };

    const hasTrial = (driver.freeLeadsLeft || 0) > 0;

    card.innerHTML = `
      <div class="driver-card-header">
        <span class="driver-name">${driver.name}</span>
        <span class="driver-status-badge ${driver.isOnline ? 'online' : 'offline'}">
          ${driver.isOnline ? 'متاح 🟢' : 'متوقف 🔴'}
        </span>
      </div>
      <div class="driver-details">
        <div>🚙 ${driver.plate || '---'}</div>
        <div>📞 ${driver.phone || '---'}</div>
        <div>💰 رصيد: <b style="color: #38bdf8;">${driver.walletBalance || 0} ج.م</b></div>
        <div>✅ نقلات: <b>${driver.completedTrips || 0}</b></div>
      </div>
      ${hasTrial ? `
        <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 6px; padding: 4px 8px; font-size: 0.75rem; color: #facc15; margin-bottom: 8px;">
          🎁 باقة تجريبية: باقي له <b>${driver.freeLeadsLeft}</b> طلبات مجانية
        </div>
      ` : ''}
      <div class="driver-actions" onclick="event.stopPropagation()">
        <div class="radius-control">
          <span>نطاق الإعلان:</span>
          <select onchange="updateDriverRadius('${driver.id}', this.value)">
            <option value="3" ${driver.radiusKm == 3 ? 'selected' : ''}>3 كم</option>
            <option value="5" ${driver.radiusKm == 5 ? 'selected' : ''}>5 كم</option>
            <option value="7.5" ${driver.radiusKm == 7.5 ? 'selected' : ''}>7.5 كم</option>
            <option value="10" ${driver.radiusKm == 10 ? 'selected' : ''}>10 كم</option>
            <option value="15" ${driver.radiusKm == 15 ? 'selected' : ''}>15 كم</option>
          </select>
        </div>
        <button class="btn-sm btn-ghost" onclick="toggleDriverOnline('${driver.id}', ${!driver.isOnline})">
          ${driver.isOnline ? 'تعطيل' : 'تفعيل'}
        </button>
      </div>
    `;
    container.appendChild(card);
  });

  document.getElementById('activeWinchCount').textContent = onlineCount;
  document.getElementById('totalWinchCount').textContent = list.length;
  document.getElementById('driverListCount').textContent = list.length;
}

// Render Smart Ad Zones Protection Tab
function renderAdZones() {
  fetch('/api/ad-zones')
    .then(res => res.json())
    .then(data => {
      if (!data.success) return;
      const container = document.getElementById('adZonesList');
      container.innerHTML = '';

      data.zones.forEach(zone => {
        const isActive = zone.adCampaignStatus === 'ACTIVE';
        const card = document.createElement('div');
        card.style.background = '#0f172a';
        card.style.border = `1px solid ${isActive ? '#22c55e' : '#64748b'}`;
        card.style.borderRadius = '10px';
        card.style.padding = '12px';

        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <strong style="color: #fff; font-size: 0.9rem;">📍 ${zone.name}</strong>
            <span style="font-size: 0.75rem; font-weight: 700; padding: 2px 8px; border-radius: 9999px; background: ${isActive ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}; color: ${isActive ? '#22c55e' : '#ef4444'}; border: 1px solid ${isActive ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)'};">
              ${isActive ? 'حملة جوجل نشطة 🟢' : 'متوقف لحماية الميزانية 🔴'}
            </span>
          </div>
          <div style="font-size: 0.8rem; color: #94a3b8; line-height: 1.4;">
            الأوناش المتاحة في النطاق: <b style="color: #f1f5f9;">${zone.availableWinches}</b><br>
            نصف قطر التغطية: <b>${zone.radiusKm} كم</b>
          </div>
          <div style="margin-top: 8px; font-size: 0.75rem; color: ${isActive ? '#86efac' : '#cbd5e1'};">
            ${zone.statusText}
          </div>
        `;
        container.appendChild(card);
      });
    })
    .catch(console.error);
}

// WebSocket Connection
function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    document.getElementById('wsStatus').textContent = 'متصل 🟢';
    document.getElementById('wsStatus').className = 'stat-val text-green';
    socket.send(JSON.stringify({ type: 'register_dashboard' }));
  };

  socket.onclose = () => {
    document.getElementById('wsStatus').textContent = 'جاري إعادة الاتصال... 🟡';
    document.getElementById('wsStatus').className = 'stat-val';
    setTimeout(connectWebSocket, 3000);
  };

  socket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleSocketMessage(msg);
    } catch (e) {
      console.error('Error handling WS message:', e);
    }
  };
}

function handleSocketMessage(msg) {
  if (msg.type === 'init_state') {
    const { drivers, activeLeads } = msg.data;
    drivers.forEach(d => {
      driversData.set(d.id, d);
      updateDriverOnMap(d);
    });
    renderDriverList();
    renderAdZones();
    if (activeLeads) {
      activeLeads.forEach(renderLeadCard);
    }
  } else if (msg.type === 'location_update' || msg.type === 'driver_updated') {
    const d = msg.data;
    const existing = driversData.get(d.id) || {};
    const merged = { ...existing, ...d };
    driversData.set(d.id, merged);
    updateDriverOnMap(merged);
    renderDriverList();
    renderAdZones();
  } else if (msg.type === 'status_update') {
    const { id, isOnline } = msg.data;
    if (driversData.has(id)) {
      const d = driversData.get(id);
      d.isOnline = isOnline;
      updateDriverOnMap(d);
      renderDriverList();
      renderAdZones();
    }
  } else if (msg.type === 'new_dispatch_lead') {
    handleNewLead(msg.data);
  }
}

// Lead Management
function handleNewLead(lead) {
  renderLeadCard(lead);

  if (lead.customerLat && lead.customerLng) {
    const custLatLng = [lead.customerLat, lead.customerLng];
    const icon = L.divIcon({
      html: '<div class="customer-marker">🚨</div>',
      iconSize: [36, 36],
      iconAnchor: [18, 36]
    });

    const marker = L.marker(custLatLng, { icon }).addTo(map);
    marker.bindPopup(`
      <div style="font-family: Cairo; direction: rtl; text-align: right;">
        <h4 style="color: #b91c1c;">عطل سيارة: ${lead.vehicleType}</h4>
        <p>العميل: <b>${lead.customerName}</b> (${lead.customerPhone})</p>
        <p>الوصف: ${lead.notes}</p>
        ${lead.bestMatch ? `
          <div style="background: #e0f2fe; padding: 6px; border-radius: 6px; margin-top: 6px; font-size: 13px;">
            🚚 أقرب ونش: <b>${lead.bestMatch.driverName}</b><br>
            المسافة: <b>${lead.bestMatch.distance} كم</b> (حوالي ${lead.bestMatch.estimatedTime} دقيقة)<br>
            ${lead.bestMatch.isTrialLead ? '🎁 طلب تجريبي مجاني' : '💵 عمولة المنصة: 40 ج.م'}
          </div>
        ` : '<p style="color: red;">لا يوجد ونش متاح في النطاق!</p>'}
      </div>
    `).openPopup();

    if (lead.bestMatch) {
      const driver = driversData.get(lead.bestMatch.driverId);
      if (driver && driver.lat && driver.lng) {
        const polyline = L.polyline([custLatLng, [driver.lat, driver.lng]], {
          color: '#f59e0b',
          weight: 3,
          dashArray: '6, 8'
        }).addTo(map);

        map.fitBounds(polyline.getBounds(), { padding: [50, 50] });
      }
    }
  }

  document.querySelector('[data-tab="leadsTab"]').click();
}

function renderLeadCard(lead) {
  const container = document.getElementById('leadsList');
  const emptyState = container.querySelector('.empty-state');
  if (emptyState) emptyState.remove();

  const card = document.createElement('div');
  card.className = 'lead-card';
  card.innerHTML = `
    <div class="lead-header">
      <span class="lead-customer">🚨 ${lead.customerName} - ${lead.vehicleType}</span>
      <span class="lead-time">${new Date(lead.createdAt).toLocaleTimeString('ar-EG')}</span>
    </div>
    <div style="font-size: 0.8rem; color: #94a3b8; margin-bottom: 4px;">
      📞 ${lead.customerPhone} | ${lead.notes}
    </div>
    ${lead.bestMatch ? `
      <div class="lead-assigned">
        ✅ تم التوجيه إلى: <b>${lead.bestMatch.driverName}</b><br>
        المسافة: <b>${lead.bestMatch.distance} كم</b> | الوقت المقدر: <b>${lead.bestMatch.estimatedTime} دقيقة</b>
      </div>
    ` : `
      <div style="color: #ef4444; font-size: 0.8rem; margin-top: 6px;">
        ⚠️ لا يوجد ونش متصل في نطاق الموقع!
      </div>
    `}
  `;

  container.insertBefore(card, container.firstChild);
}

// Global actions
window.updateDriverRadius = function(driverId, radiusKm) {
  fetch('/api/driver/radius', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ driverId, radiusKm })
  });
};

window.toggleDriverOnline = function(driverId, isOnline) {
  fetch('/api/driver/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ driverId, isOnline })
  });
};

window.setPreset = function(lat, lng, name) {
  document.getElementById('custLat').value = lat;
  document.getElementById('custLng').value = lng;
};

// Movement Simulator
function toggleSimulation() {
  const btn = document.getElementById('btnSimulateMovement');
  if (simulationInterval) {
    clearInterval(simulationInterval);
    simulationInterval = null;
    btn.textContent = '🚗 تشغيل محاكاة حركة الأوناش';
    btn.style.color = '#94a3b8';
  } else {
    btn.textContent = '⏸️ إيقاف المحاكاة';
    btn.style.color = '#f59e0b';

    simulationInterval = setInterval(() => {
      driversData.forEach(d => {
        if (d.isOnline) {
          const dLat = (Math.random() - 0.5) * 0.003;
          const dLng = (Math.random() - 0.5) * 0.003;
          const newLat = d.lat + dLat;
          const newLng = d.lng + dLng;
          const newSpeed = Math.floor(Math.random() * 40) + 20;

          fetch('/api/driver/location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              driverId: d.id,
              lat: newLat,
              lng: newLng,
              speed: newSpeed / 3.6,
              heading: Math.floor(Math.random() * 360)
            })
          });
        }
      });
    }, 2500);
  }
}

// Setup Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  connectWebSocket();
  renderAdZones();

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
      if (btn.dataset.tab === 'adZonesTab') {
        renderAdZones();
      }
    });
  });

  // Modal open/close
  const modal = document.getElementById('simulateModal');
  document.getElementById('btnOpenSimulateModal').onclick = () => modal.style.display = 'flex';
  document.getElementById('btnCloseModal').onclick = () => modal.style.display = 'none';
  document.getElementById('btnCancelModal').onclick = () => modal.style.display = 'none';

  // Submit Dispatch
  document.getElementById('btnSubmitDispatch').onclick = () => {
    const payload = {
      customerName: document.getElementById('custName').value,
      customerPhone: document.getElementById('custPhone').value,
      vehicleType: document.getElementById('custVehicle').value,
      notes: document.getElementById('custNotes').value,
      customerLat: parseFloat(document.getElementById('custLat').value),
      customerLng: parseFloat(document.getElementById('custLng').value)
    };

    fetch('/api/dispatch/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(res => res.json()).then(data => {
      modal.style.display = 'none';
    });
  };

  document.getElementById('btnSimulateMovement').onclick = toggleSimulation;
  document.getElementById('btnResetView').onclick = () => {
    map.setView([30.0444, 31.2357], 11);
  };
});
