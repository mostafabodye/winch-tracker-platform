const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// In-Memory Storage (Drivers & Active Leads)
// ==========================================
const drivers = new Map();
const activeLeads = new Map();

// Helper: Pre-seed realistic sample winches around Cairo / Giza
function seedSampleDrivers() {
  const samples = [
    {
      id: 'winch-01',
      name: 'كابتن أحمد سامي (ونش التجمع)',
      phone: '01012345678',
      plate: 'ط ر ج ٥٤٢',
      lat: 30.0131,
      lng: 31.4289,
      speed: 45, // km/h
      heading: 120,
      accuracy: 10,
      isOnline: true,
      radiusKm: 7.5,
      vehicleModel: 'مرسيدس أكتروس هيدروليك',
      walletBalance: 450, // رصيد المحفظة بالجنيه
      freeLeadsLeft: 0,
      subscriptionTier: 'pro', // basic | pro | fleet
      completedTrips: 18,
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'winch-02',
      name: 'كابتن محمود الصياد (ونش الدائري / المعادي)',
      phone: '01123456789',
      plate: 'ق م ن ١٩٨',
      lat: 29.9602,
      lng: 31.2569,
      speed: 0, // متوقف وجاهز
      heading: 0,
      accuracy: 8,
      isOnline: true,
      radiusKm: 5.0,
      vehicleModel: 'إيسوزو شوكة سريعة',
      walletBalance: 150,
      freeLeadsLeft: 2, // باقي له طلبين تجربة مجانية
      subscriptionTier: 'trial',
      completedTrips: 1,
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'winch-03',
      name: 'كابتن وائل المنشاوي (ونش ٦ أكتوبر والمحور)',
      phone: '01234567890',
      plate: 'س ب ع ٨٧٦',
      lat: 30.0074,
      lng: 30.9733,
      speed: 30,
      heading: 270,
      accuracy: 12,
      isOnline: false,
      radiusKm: 6.0,
      vehicleModel: 'ميتسوبيشي كانتر قلاب',
      walletBalance: 0,
      freeLeadsLeft: 3,
      subscriptionTier: 'trial',
      completedTrips: 0,
      lastUpdated: new Date().toISOString()
    }
  ];

  samples.forEach(d => drivers.set(d.id, d));
}
seedSampleDrivers();

// ==========================================
// Haversine Distance Calculation (KM)
// ==========================================
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of Earth in KM
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round((R * c) * 10) / 10;
}

// ==========================================
// WebSocket Real-time Broadcast
// ==========================================
function broadcast(type, payload, targetDriverId = null) {
  const message = JSON.stringify({ type, data: payload, timestamp: Date.now() });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      if (targetDriverId) {
        if (client.driverId === targetDriverId || client.clientType === 'dashboard') {
          client.send(message);
        }
      } else {
        client.send(message);
      }
    }
  });
}

wss.on('connection', (ws) => {
  ws.clientType = 'unknown';

  ws.on('message', (messageRaw) => {
    try {
      const msg = JSON.parse(messageRaw);
      if (msg.type === 'register_dashboard') {
        ws.clientType = 'dashboard';
        ws.send(JSON.stringify({
          type: 'init_state',
          data: {
            drivers: Array.from(drivers.values()),
            activeLeads: Array.from(activeLeads.values())
          }
        }));
      } else if (msg.type === 'register_driver') {
        ws.clientType = 'driver';
        ws.driverId = msg.driverId;
      }
    } catch (e) {
      console.error('WebSocket message parsing error:', e);
    }
  });
});

// ==========================================
// REST API Endpoints
// ==========================================

// 1. Get all drivers
app.get('/api/drivers', (req, res) => {
  res.json({
    success: true,
    count: drivers.size,
    drivers: Array.from(drivers.values())
  });
});

// 2. Register or get driver profile
app.post('/api/driver/register', (req, res) => {
  const { id, name, phone, plate, vehicleModel, radiusKm } = req.body;
  const driverId = id || 'driver-' + Math.random().toString(36).substring(2, 8);

  const existing = drivers.get(driverId) || {};
  const updatedDriver = {
    id: driverId,
    name: name || existing.name || 'سائق جديد',
    phone: phone || existing.phone || '01000000000',
    plate: plate || existing.plate || 'أ ب ج ١٢٣',
    vehicleModel: vehicleModel || existing.vehicleModel || 'ونش هيدروليك',
    lat: existing.lat || 30.0444,
    lng: existing.lng || 31.2357,
    speed: existing.speed || 0,
    heading: existing.heading || 0,
    accuracy: existing.accuracy || 10,
    isOnline: existing.isOnline !== undefined ? existing.isOnline : false,
    radiusKm: radiusKm || existing.radiusKm || 5.0,
    walletBalance: existing.walletBalance !== undefined ? existing.walletBalance : 0,
    freeLeadsLeft: existing.freeLeadsLeft !== undefined ? existing.freeLeadsLeft : 3, // 3 free trial leads
    subscriptionTier: existing.subscriptionTier || 'trial',
    completedTrips: existing.completedTrips || 0,
    lastUpdated: new Date().toISOString()
  };

  drivers.set(driverId, updatedDriver);
  broadcast('driver_updated', updatedDriver);

  res.json({ success: true, driver: updatedDriver });
});

// 2b. Recharge Driver Wallet (Vodafone Cash / InstaPay simulator)
app.post('/api/driver/recharge', (req, res) => {
  const { driverId, amount, method } = req.body;
  const driver = drivers.get(driverId);

  if (!driver) {
    return res.status(404).json({ success: false, message: 'Driver not found' });
  }

  const rechargeAmount = parseFloat(amount) || 100;
  driver.walletBalance = (driver.walletBalance || 0) + rechargeAmount;
  drivers.set(driverId, driver);

  broadcast('driver_updated', driver);

  res.json({
    success: true,
    newBalance: driver.walletBalance,
    message: `تم شحن ${rechargeAmount} ج.م بنجاح عبر ${method || 'إنستاباي / فودافون كاش'}`
  });
});

// 2c. Get Smart Ad Campaign Zones Status (Shows how ad budget is protected)
app.get('/api/ad-zones', (req, res) => {
  const zones = [
    { id: 'tagamoa', name: 'التجمع الخامس والقاهرة الجديدة', lat: 30.0131, lng: 31.4289, radiusKm: 10 },
    { id: 'maadi_ring', name: 'المعادي والطريق الدائري', lat: 29.9602, lng: 31.2569, radiusKm: 8 },
    { id: 'october', name: '٦ أكتوبر والشيخ زايد ومحور ٢٦ يوليو', lat: 30.0074, lng: 30.9733, radiusKm: 12 },
    { id: 'heliopolis', name: 'مصر الجديدة ومدينة نصر وصلاح سالم', lat: 30.0871, lng: 31.3325, radiusKm: 8 },
    { id: 'giza_haram', name: 'الجيزة والهرم وفيصل والمريوطية', lat: 29.9870, lng: 31.1500, radiusKm: 8 }
  ];

  const evaluatedZones = zones.map(zone => {
    let availableWinches = 0;
    drivers.forEach(driver => {
      if (driver.isOnline && (driver.freeLeadsLeft > 0 || driver.walletBalance >= 35)) {
        const dist = calculateDistanceKm(zone.lat, zone.lng, driver.lat, driver.lng);
        if (dist <= zone.radiusKm) {
          availableWinches++;
        }
      }
    });

    return {
      ...zone,
      availableWinches,
      adCampaignStatus: availableWinches > 0 ? 'ACTIVE' : 'PAUSED',
      statusText: availableWinches > 0
        ? `🟢 الإعلانات نشطة (${availableWinches} أوناش متاحة)`
        : `🔴 تم إيقاف الإعلانات مؤقتاً لتوفير الميزانية (لا يوجد ونش نشط)`
    };
  });

  res.json({
    success: true,
    totalActiveCampaigns: evaluatedZones.filter(z => z.adCampaignStatus === 'ACTIVE').length,
    zones: evaluatedZones
  });
});

// 3. Update driver location (GPS ping from mobile)
app.post('/api/driver/location', (req, res) => {
  const { driverId, lat, lng, speed, heading, accuracy } = req.body;

  if (!driverId || lat === undefined || lng === undefined) {
    return res.status(400).json({ success: false, message: 'Missing required location fields' });
  }

  let driver = drivers.get(driverId);
  if (!driver) {
    driver = {
      id: driverId,
      name: 'سائق غير مسجل',
      phone: '',
      plate: '',
      radiusKm: 5.0,
      walletBalance: 0,
      freeLeadsLeft: 3,
      isOnline: true
    };
  }

  driver.lat = parseFloat(lat);
  driver.lng = parseFloat(lng);
  driver.speed = speed !== undefined ? Math.round(parseFloat(speed) * 3.6) : 0;
  driver.heading = heading !== undefined ? parseFloat(heading) : 0;
  driver.accuracy = accuracy !== undefined ? Math.round(parseFloat(accuracy)) : 5;
  driver.lastUpdated = new Date().toISOString();

  drivers.set(driverId, driver);

  broadcast('location_update', {
    id: driverId,
    lat: driver.lat,
    lng: driver.lng,
    speed: driver.speed,
    heading: driver.heading,
    accuracy: driver.accuracy,
    isOnline: driver.isOnline,
    lastUpdated: driver.lastUpdated
  });

  res.json({ success: true, message: 'Location updated' });
});

// 4. Update online/offline status
app.post('/api/driver/status', (req, res) => {
  const { driverId, isOnline } = req.body;
  const driver = drivers.get(driverId);

  if (!driver) {
    return res.status(404).json({ success: false, message: 'Driver not found' });
  }

  driver.isOnline = Boolean(isOnline);
  driver.lastUpdated = new Date().toISOString();
  drivers.set(driverId, driver);

  broadcast('status_update', {
    id: driverId,
    isOnline: driver.isOnline,
    lastUpdated: driver.lastUpdated
  });

  res.json({ success: true, isOnline: driver.isOnline });
});

// 5. Update Geofence radius
app.post('/api/driver/radius', (req, res) => {
  const { driverId, radiusKm } = req.body;
  const driver = drivers.get(driverId);

  if (!driver) {
    return res.status(404).json({ success: false, message: 'Driver not found' });
  }

  driver.radiusKm = parseFloat(radiusKm) || 5.0;
  drivers.set(driverId, driver);

  broadcast('driver_updated', driver);
  res.json({ success: true, radiusKm: driver.radiusKm });
});

// 6. Emergency Dispatch: match closest active winch
app.post('/api/dispatch/request', (req, res) => {
  const { customerName, customerPhone, customerLat, customerLng, vehicleType, notes } = req.body;

  if (customerLat === undefined || customerLng === undefined) {
    return res.status(400).json({ success: false, message: 'Customer coordinates required' });
  }

  const cLat = parseFloat(customerLat);
  const cLng = parseFloat(customerLng);

  // Search online drivers who have balance or free trial leads
  const candidates = [];
  drivers.forEach(driver => {
    if (driver.isOnline && driver.lat && driver.lng) {
      const hasEligibility = (driver.freeLeadsLeft > 0) || (driver.walletBalance >= 35);
      const distance = calculateDistanceKm(cLat, cLng, driver.lat, driver.lng);
      const isWithinRadius = distance <= (driver.radiusKm || 5.0);

      candidates.push({
        driver,
        distance,
        isWithinRadius,
        hasEligibility,
        estimatedTimeMinutes: Math.max(3, Math.round((distance / 35) * 60))
      });
    }
  });

  // Sort by eligibility first, then distance (ascending)
  candidates.sort((a, b) => {
    if (a.hasEligibility && !b.hasEligibility) return -1;
    if (!a.hasEligibility && b.hasEligibility) return 1;
    return a.distance - b.distance;
  });

  const bestMatch = candidates.length > 0 ? candidates[0] : null;

  const leadId = 'lead-' + Date.now();
  const leadData = {
    id: leadId,
    customerName: customerName || 'عميل عطلان',
    customerPhone: customerPhone || '01099887766',
    customerLat: cLat,
    customerLng: cLng,
    vehicleType: vehicleType || 'سيدان ملاكي',
    notes: notes || 'عطل مفاجئ في الموتور',
    bestMatch: bestMatch ? {
      driverId: bestMatch.driver.id,
      driverName: bestMatch.driver.name,
      driverPhone: bestMatch.driver.phone,
      driverPlate: bestMatch.driver.plate,
      distance: bestMatch.distance,
      estimatedTime: bestMatch.estimatedTimeMinutes,
      isWithinRadius: bestMatch.isWithinRadius,
      isTrialLead: (bestMatch.driver.freeLeadsLeft || 0) > 0
    } : null,
    allCandidatesCount: candidates.length,
    status: bestMatch ? 'dispatched' : 'no_driver_available',
    createdAt: new Date().toISOString()
  };

  activeLeads.set(leadId, leadData);

  // Notify the assigned driver and the dashboard
  broadcast('new_dispatch_lead', leadData);

  res.json({
    success: true,
    lead: leadData,
    candidates: candidates.map(c => ({
      driverId: c.driver.id,
      driverName: c.driver.name,
      distanceKm: c.distance,
      isWithinRadius: c.isWithinRadius,
      hasEligibility: c.hasEligibility
    }))
  });
});

// 7. Accept a lead with wallet deduction & trial lead accounting
app.post('/api/dispatch/accept', (req, res) => {
  const { leadId, driverId } = req.body;
  const lead = activeLeads.get(leadId);

  if (!lead) {
    return res.status(404).json({ success: false, message: 'Lead not found' });
  }

  const driver = drivers.get(driverId);
  let feeApplied = 0;
  let usedFreeLead = false;

  if (driver) {
    if ((driver.freeLeadsLeft || 0) > 0) {
      driver.freeLeadsLeft -= 1;
      usedFreeLead = true;
    } else {
      const fee = 40; // 40 EGP platform commission per lead
      driver.walletBalance = Math.max(0, (driver.walletBalance || 0) - fee);
      feeApplied = fee;
    }
    driver.completedTrips = (driver.completedTrips || 0) + 1;
    drivers.set(driverId, driver);
    broadcast('driver_updated', driver);
  }

  lead.status = 'accepted';
  lead.acceptedBy = driverId;
  lead.acceptedAt = new Date().toISOString();
  lead.feeApplied = feeApplied;
  lead.usedFreeLead = usedFreeLead;
  activeLeads.set(leadId, lead);

  broadcast('lead_accepted', lead);

  res.json({
    success: true,
    lead,
    driverStats: driver ? {
      walletBalance: driver.walletBalance,
      freeLeadsLeft: driver.freeLeadsLeft,
      completedTrips: driver.completedTrips
    } : null
  });
});

// Restart server helper
server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Winch Tracking & Marketing Dispatch Server v2.0 Started!`);
  console.log(`📍 Listening on: http://localhost:${PORT}`);
  console.log(`🗺️ Dispatcher Dashboard: http://localhost:${PORT}/dashboard.html`);
  console.log(`📱 Driver Mobile App:   http://localhost:${PORT}/driver.html`);
  console.log(`🆘 Customer Emergency:  http://localhost:${PORT}/sos.html`);
  console.log(`====================================================`);
});
