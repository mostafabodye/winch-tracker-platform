// Winch Driver Client Logic

let driverId = localStorage.getItem('winch_driver_id');
let driverName = localStorage.getItem('winch_driver_name') || 'كابتن محمد سعيد (ونش)';
let driverPhone = localStorage.getItem('winch_driver_phone') || '01098765432';
let driverPlate = localStorage.getItem('winch_driver_plate') || 'ب ط ص ٨٣١';
let driverRadius = localStorage.getItem('winch_driver_radius') || '5';
let walletBalance = 0;
let freeLeadsLeft = 3;

if (!driverId) {
  driverId = 'driver-' + Math.random().toString(36).substring(2, 8);
  localStorage.setItem('winch_driver_id', driverId);
}

let isOnline = false;
let watchId = null;
let wakeLock = null;
let socket = null;
let currentLead = null;
let audioCtx = null;

// Initialize UI
function updateDriverHeader() {
  document.getElementById('displayDriverName').textContent = driverName;
  document.getElementById('displayPlate').textContent = `لوحة: ${driverPlate}`;
  document.getElementById('inputDriverName').value = driverName;
  document.getElementById('inputDriverPhone').value = driverPhone;
  document.getElementById('inputDriverPlate').value = driverPlate;
  document.getElementById('inputDriverRadius').value = driverRadius;
  updateWalletUI();
}

function updateWalletUI(balance, freeLeads) {
  if (balance !== undefined) walletBalance = balance;
  if (freeLeads !== undefined) freeLeadsLeft = freeLeads;

  document.getElementById('displayWalletBalance').textContent = walletBalance;
  const trialBanner = document.getElementById('trialLeadsBanner');
  const trialCountSpan = document.getElementById('displayTrialLeads');

  if (freeLeadsLeft > 0) {
    if (trialCountSpan) trialCountSpan.textContent = freeLeadsLeft;
    if (trialBanner) {
      trialBanner.style.display = 'block';
      trialBanner.innerHTML = `🎁 هدية ترحيبية: باقي لك <b>${freeLeadsLeft}</b> طلبات إنقاذ مجانية للتجربة!`;
    }
  } else {
    if (trialBanner) {
      trialBanner.innerHTML = `⚡ يتم خصم 40 ج.م عمولة ثابتة فقط عند قبول كل طلب إنقاذ.`;
    }
  }
}

// Initial driver registration/fetch
function fetchDriverProfile() {
  fetch('/api/driver/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: driverId,
      name: driverName,
      phone: driverPhone,
      plate: driverPlate,
      radiusKm: parseFloat(driverRadius)
    })
  })
  .then(res => res.json())
  .then(data => {
    if (data.success && data.driver) {
      updateWalletUI(data.driver.walletBalance, data.driver.freeLeadsLeft);
    }
  })
  .catch(console.error);
}

// Web Audio API Synthesizer (Emergency siren)
function playEmergencyTone() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(440, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.3);
    osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.6);

    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 1.2);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 1.2);
  } catch (e) {
    console.log('AudioContext could not play:', e);
  }
}

function triggerVibration() {
  if (navigator.vibrate) {
    navigator.vibrate([400, 200, 400, 200, 600]);
  }
}

// Screen Wake Lock API
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
      });
      document.getElementById('wakeLockBanner').innerHTML = '✅ وضع القيادة نشط: الشاشة ستبقى مستيقظة لتتبع مستمر.';
    }
  } catch (err) {
    console.warn('Wake Lock error:', err);
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().catch(console.error);
    wakeLock = null;
  }
  document.getElementById('wakeLockBanner').innerHTML = '💡 الشاشة ستظل نشطة تلقائياً أثناء التتبع لضمان عدم توقف إرسال الموقع.';
}

// WebSocket Connection
function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    socket.send(JSON.stringify({
      type: 'register_driver',
      driverId: driverId
    }));
  };

  socket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'new_dispatch_lead') {
        const lead = msg.data;
        if (lead.bestMatch && lead.bestMatch.driverId === driverId) {
          showIncomingOrder(lead);
        }
      } else if (msg.type === 'driver_updated' && msg.data.id === driverId) {
        updateWalletUI(msg.data.walletBalance, msg.data.freeLeadsLeft);
      }
    } catch (e) {
      console.error('Socket message parse error:', e);
    }
  };

  socket.onclose = () => {
    if (isOnline) {
      setTimeout(connectWebSocket, 3000);
    }
  };
}

// Show incoming order alert
function showIncomingOrder(lead) {
  currentLead = lead;
  document.getElementById('leadCustomerName').textContent = `${lead.customerName} (${lead.customerPhone})`;
  document.getElementById('leadVehicle').textContent = lead.vehicleType;
  document.getElementById('leadNotes').textContent = lead.notes;
  document.getElementById('leadDistance').textContent = `${lead.bestMatch.distance} كم (حوالي ${lead.bestMatch.estimatedTime} دقيقة)`;

  document.getElementById('incomingOrderOverlay').style.display = 'flex';
  playEmergencyTone();
  triggerVibration();
}

// Toggle Online/Offline
function toggleTracking() {
  if (!isOnline) {
    startTracking();
  } else {
    stopTracking();
  }
}

function startTracking() {
  if (!('geolocation' in navigator)) {
    alert('عذراً، متصفحك أو جهازك لا يدعم تحديد الموقع GPS.');
    return;
  }

  fetchDriverProfile();
  document.getElementById('gpsStatus').textContent = 'جاري التقاط الإشارة...';

  watchId = navigator.geolocation.watchPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const speed = position.coords.speed || 0;
      const speedKmH = Math.round(speed * 3.6);
      const accuracy = Math.round(position.coords.accuracy || 10);
      const heading = position.coords.heading || 0;

      document.getElementById('gpsStatus').textContent = 'نشط ومحدد بدقة 🟢';
      document.getElementById('gpsSpeed').textContent = `${speedKmH} كم/س`;
      document.getElementById('gpsAccuracy').textContent = `±${accuracy} متر`;
      document.getElementById('lastPingTime').textContent = new Date().toLocaleTimeString('ar-EG');

      fetch('/api/driver/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverId,
          lat,
          lng,
          speed,
          heading,
          accuracy
        })
      });
    },
    (err) => {
      console.warn('Geolocation error:', err);
      if (err.code === 1) {
        alert('يرجى السماح بصلاحية الموقع GPS لنتمكن من توجيه الطلبات لسيارتك.');
        stopTracking();
      } else {
        document.getElementById('gpsStatus').textContent = 'إشارة ضعيفة 🟡';
        sendFallbackLocation();
      }
    },
    {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 10000
    }
  );

  isOnline = true;
  updateToggleButtonUI(true);
  requestWakeLock();
  connectWebSocket();

  fetch('/api/driver/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ driverId, isOnline: true })
  });
}

function sendFallbackLocation() {
  const fallbackLat = 30.0444 + (Math.random() - 0.5) * 0.02;
  const fallbackLng = 31.2357 + (Math.random() - 0.5) * 0.02;

  fetch('/api/driver/location', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      driverId,
      lat: fallbackLat,
      lng: fallbackLng,
      speed: 0,
      heading: 0,
      accuracy: 15
    })
  });
  document.getElementById('lastPingTime').textContent = new Date().toLocaleTimeString('ar-EG');
}

function stopTracking() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  isOnline = false;
  updateToggleButtonUI(false);
  releaseWakeLock();

  document.getElementById('gpsStatus').textContent = 'متوقف 🔴';
  document.getElementById('gpsSpeed').textContent = '0 كم/س';

  fetch('/api/driver/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ driverId, isOnline: false })
  });
}

function updateToggleButtonUI(online) {
  const btn = document.getElementById('mainToggleBtn');
  if (online) {
    btn.className = 'main-toggle-btn online';
    btn.querySelector('.btn-icon').textContent = '🟢';
    btn.querySelector('.btn-text').textContent = 'متاح للطلبات';
    btn.querySelector('.btn-subtext').textContent = 'جاري إرسال الموقع واستقبال طلبات الإنقاذ';
  } else {
    btn.className = 'main-toggle-btn offline';
    btn.querySelector('.btn-icon').textContent = '🔴';
    btn.querySelector('.btn-text').textContent = 'غير متصل';
    btn.querySelector('.btn-subtext').textContent = 'اضغط لبدء التتبع واستقبال الطلبات';
  }
}

// Order Acceptance
document.getElementById('btnAcceptOrder').onclick = () => {
  if (!currentLead) return;

  fetch('/api/dispatch/accept', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leadId: currentLead.id, driverId })
  })
  .then(res => res.json())
  .then(data => {
    if (data.driverStats) {
      updateWalletUI(data.driverStats.walletBalance, data.driverStats.freeLeadsLeft);
    }
  });

  document.getElementById('incomingOrderOverlay').style.display = 'none';

  const destLat = currentLead.customerLat;
  const destLng = currentLead.customerLng;
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}`;

  if (confirm(`تم قبول الطلب بنجاح! 🎉\nهل تريد فتح خرائط Google للملاحة إلى موقع العميل الآن؟`)) {
    window.open(mapsUrl, '_blank');
  }
};

document.getElementById('btnDeclineOrder').onclick = () => {
  document.getElementById('incomingOrderOverlay').style.display = 'none';
  currentLead = null;
};

// Settings Modal
const settingsModal = document.getElementById('settingsModal');
document.getElementById('btnOpenSettings').onclick = () => settingsModal.style.display = 'flex';
document.getElementById('btnCloseSettings').onclick = () => settingsModal.style.display = 'none';

document.getElementById('btnSaveSettings').onclick = () => {
  driverName = document.getElementById('inputDriverName').value.trim() || driverName;
  driverPhone = document.getElementById('inputDriverPhone').value.trim() || driverPhone;
  driverPlate = document.getElementById('inputDriverPlate').value.trim() || driverPlate;
  driverRadius = document.getElementById('inputDriverRadius').value;

  localStorage.setItem('winch_driver_name', driverName);
  localStorage.setItem('winch_driver_phone', driverPhone);
  localStorage.setItem('winch_driver_plate', driverPlate);
  localStorage.setItem('winch_driver_radius', driverRadius);

  updateDriverHeader();
  settingsModal.style.display = 'none';

  fetch('/api/driver/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: driverId,
      name: driverName,
      phone: driverPhone,
      plate: driverPlate,
      radiusKm: parseFloat(driverRadius)
    })
  });
};

// Recharge Modal
const rechargeModal = document.getElementById('rechargeModal');
document.getElementById('btnOpenRechargeModal').onclick = () => rechargeModal.style.display = 'flex';
document.getElementById('btnCloseRecharge').onclick = () => rechargeModal.style.display = 'none';

document.getElementById('btnConfirmRecharge').onclick = () => {
  const amount = document.getElementById('rechargeAmount').value;
  const method = document.getElementById('rechargeMethod').value;

  fetch('/api/driver/recharge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      driverId,
      amount,
      method
    })
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      updateWalletUI(data.newBalance, freeLeadsLeft);
      rechargeModal.style.display = 'none';
      alert(`🎉 ${data.message}!\nرصيدك الحالي أصبح: ${data.newBalance} ج.م`);
    }
  });
};

document.getElementById('mainToggleBtn').onclick = toggleTracking;

document.addEventListener('DOMContentLoaded', () => {
  updateDriverHeader();
  fetchDriverProfile();
});
