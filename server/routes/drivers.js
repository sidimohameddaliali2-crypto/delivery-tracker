import express from 'express';
import User from '../models/User.js';
import Delivery from '../models/Delivery.js';
import { protect, admin } from '../middleware/auth.js';

const router = express.Router();

// Get all drivers
router.get('/', protect, async (req, res) => {
  try {
    const drivers = await User.find({ role: 'driver' })
      .select('-password')
      .populate('profile')
      .lean();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const driverIds = drivers.map(d => d._id);

    // Batch fetch today's deliveries and all-time deliveries in two queries
    const [todayAllDeliveries, allTimeDeliveries] = await Promise.all([
      Delivery.find({
        driver: { $in: driverIds },
        scheduledTime: { $gte: today, $lt: tomorrow }
      }).select('driver type status lateMinutes complaint').lean(),

      Delivery.find({
        driver: { $in: driverIds },
        type: { $ne: 'Task' }
      }).select('driver type status lateMinutes complaint').lean()
    ]);

    // Group by driver id
    const todayByDriver = {};
    for (const d of todayAllDeliveries) {
      const key = d.driver.toString();
      if (!todayByDriver[key]) todayByDriver[key] = [];
      todayByDriver[key].push(d);
    }

    const allTimeByDriver = {};
    for (const d of allTimeDeliveries) {
      const key = d.driver.toString();
      if (!allTimeByDriver[key]) allTimeByDriver[key] = [];
      allTimeByDriver[key].push(d);
    }

    const driversWithStats = drivers.map((driver) => {
      const driverKey = driver._id.toString();
      const todayDeliveries = todayByDriver[driverKey] || [];
      const onlyDeliveries = allTimeByDriver[driverKey] || [];

      const deliveriesCount = todayDeliveries.filter(d => d.type !== 'Task').length;
      const tasksCount = todayDeliveries.filter(d => d.type === 'Task').length;
      const performedCount = todayDeliveries.filter(d =>
        d.status === 'delivered' || d.status === 'completed' || d.status === 'collected'
      ).length;

      const lateDeliveries = onlyDeliveries.filter(d => d.lateMinutes > 0);
      const avgLateTime = onlyDeliveries.length > 0
        ? Math.round(onlyDeliveries.reduce((sum, d) => sum + (d.lateMinutes || 0), 0) / onlyDeliveries.length)
        : 0;

      const complaintsCount = onlyDeliveries.filter(d => d.complaint?.hasComplaint).length;
      const kpiScore = calculateKpiScore(driver, onlyDeliveries, lateDeliveries);

      return {
        ...driver,
        todayDeliveries: deliveriesCount,
        deliveriesCount,
        tasksCount,
        performedCount,
        kpi: {
          score: kpiScore,
          avgLateTime,
          accuracyRate: calculateAccuracyRate(onlyDeliveries),
          complaintsCount
        }
      };
    });

    res.json(driversWithStats);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get driver locations for live map (must be declared before :id route)
router.get('/locations', protect, async (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';

    const drivers = await User.find({
      role: 'driver',
      ...(includeInactive ? {} : { isActive: true })
    })
      .select('-password')
      .select('email profile location isActive kpi lastLogin updatedAt createdAt')
      .lean();

    const driverLocations = drivers.map((driver) => {
      const rawLat = driver.location?.latitude;
      const rawLng = driver.location?.longitude;
      const latitude = rawLat !== undefined && rawLat !== null ? Number(rawLat) : null;
      const longitude = rawLng !== undefined && rawLng !== null ? Number(rawLng) : null;
      const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);

      return {
        _id: driver._id,
        email: driver.email,
        profile: driver.profile || {},
        isActive: driver.isActive,
        kpi: driver.kpi || {},
        lastLogin: driver.lastLogin,
        location: hasCoordinates
          ? {
              latitude,
              longitude,
              lastUpdated: driver.location?.lastUpdated || driver.updatedAt || driver.createdAt,
              address: driver.location?.address || 'Location updated'
            }
          : null
      };
    });

    res.json(driverLocations);
  } catch (error) {
    console.error('Error fetching driver locations:', error);
    res.status(500).json({ message: 'Failed to fetch driver locations', error: error.message });
  }
});

// Update driver location (drivers can update themselves, admins can update any driver)
router.put('/:id/location', protect, async (req, res) => {
  try {
    const driverId = req.params.id;

    const canUpdate =
      req.user.role === 'super_admin' ||
      req.user.role === 'admin' ||
      req.user.id === driverId;

    if (!canUpdate) {
      return res.status(403).json({ message: 'You do not have permission to update this driver location' });
    }

    const normalizedLocation = normalizeDriverLocationPayload(req.body);

    if (!normalizedLocation) {
      return res.status(400).json({ message: 'Valid latitude and longitude are required' });
    }

    // This endpoint is hit every ~10-30s per active driver (live location
    // tracking), so it's worth a targeted partial update instead of loading
    // the full User document (profile, kpi, dashboardLayout, etc.), mutating
    // one field, and re-validating/re-saving the whole thing.
    const driver = await User.findOneAndUpdate(
      { _id: driverId, role: 'driver' },
      {
        $set: {
          location: {
            ...normalizedLocation,
            lastUpdated: normalizedLocation.lastUpdated || new Date()
          }
        }
      },
      { new: true, select: '_id email profile isActive kpi location' }
    );

    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    res.json({
      success: true,
      driverId: driver._id,
      driver,
      location: driver.location
    });
  } catch (error) {
    console.error('Error updating driver location:', error);
    res.status(500).json({ message: 'Failed to update driver location', error: error.message });
  }
});

// Get driver by ID
router.get('/:id', protect, async (req, res) => {
  try {
    const driver = await User.findById(req.params.id)
      .select('-password')
      .populate('profile');

    if (!driver || driver.role !== 'driver') {
      return res.status(404).json({ message: 'Driver not found' });
    }

    // Get driver statistics
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayDeliveries = await Delivery.find({
      driver: driver._id,
      scheduledTime: {
        $gte: today,
        $lt: tomorrow
      }
    }).sort({ scheduledTime: 1 });

    const recentDeliveries = await Delivery.find({ driver: driver._id })
      .sort({ scheduledTime: -1 })
      .limit(30);

    const allDeliveries = await Delivery.find({ driver: driver._id });
    const lateDeliveries = allDeliveries.filter(d => d.lateMinutes > 0);

    const driverWithStats = {
      ...driver.toObject(),
      todayDeliveries: todayDeliveries.map(d => ({
        id: d._id,
        customer: d.customerName,
        scheduled: d.scheduledTime.toLocaleTimeString(),
        status: d.status,
        late: d.lateMinutes
      })),
      recentDeliveries: recentDeliveries.map(d => ({
        id: d._id,
        date: d.scheduledTime,
        customer: d.customerName,
        status: d.status,
        lateMinutes: d.lateMinutes || 0,
        proof: d.proof?.images || []
      })),
      kpi: {
        score: calculateKpiScore(driver, allDeliveries, lateDeliveries),
        avgLateTime: allDeliveries.length > 0 
          ? Math.round(allDeliveries.reduce((sum, d) => sum + d.lateMinutes, 0) / allDeliveries.length)
          : 0,
        accuracyRate: calculateAccuracyRate(allDeliveries),
        complaintsCount: await getComplaintsCount(driver._id)
      }
    };

    res.json(driverWithStats);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get weekly delivery statistics
router.get('/:id/stats/weekly', protect, async (req, res) => {
  try {
    const driver = await User.findById(req.params.id);
    if (!driver || driver.role !== 'driver') {
      return res.status(404).json({ message: 'Driver not found' });
    }

    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay()); // Start of current week (Sunday)
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    // Get deliveries for this week
    const weekDeliveries = await Delivery.find({
      driver: driver._id,
      scheduledTime: { $gte: weekStart, $lt: weekEnd }
    });

    // Get last week's deliveries
    const lastWeekStart = new Date(weekStart);
    lastWeekStart.setDate(weekStart.getDate() - 7);
    const lastWeekEnd = new Date(weekStart);

    const lastWeekDeliveries = await Delivery.find({
      driver: driver._id,
      scheduledTime: { $gte: lastWeekStart, $lt: lastWeekEnd }
    });

    const calculateWeeklyStats = (deliveries) => {
      const onTime = deliveries.filter(d => 
        d.status === 'delivered' && d.lateMinutes <= 0
      ).length;
      const late = deliveries.filter(d => 
        d.status === 'delivered' && d.lateMinutes > 0
      ).length;

      return {
        total: deliveries.length,
        completed: deliveries.filter(d => d.status === 'delivered').length,
        pending: deliveries.filter(d => d.status !== 'delivered').length,
        onTime,
        late,
        avgLateMinutes: deliveries.length > 0 
          ? Math.round(deliveries.reduce((sum, d) => sum + d.lateMinutes, 0) / deliveries.length)
          : 0
      };
    };

    res.json({
      period: 'weekly',
      currentWeek: {
        startDate: weekStart.toISOString().split('T')[0],
        endDate: new Date(weekEnd.getTime() - 1).toISOString().split('T')[0],
        stats: calculateWeeklyStats(weekDeliveries)
      },
      lastWeek: {
        startDate: lastWeekStart.toISOString().split('T')[0],
        endDate: new Date(lastWeekEnd.getTime() - 1).toISOString().split('T')[0],
        stats: calculateWeeklyStats(lastWeekDeliveries)
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get monthly delivery statistics
router.get('/:id/stats/monthly', protect, async (req, res) => {
  try {
    const driver = await User.findById(req.params.id);
    if (!driver || driver.role !== 'driver') {
      return res.status(404).json({ message: 'Driver not found' });
    }

    const today = new Date();
    
    // Current month
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1);

    // Last month
    const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 1);

    const currentMonthDeliveries = await Delivery.find({
      driver: driver._id,
      scheduledTime: { $gte: monthStart, $lt: monthEnd }
    });

    const lastMonthDeliveries = await Delivery.find({
      driver: driver._id,
      scheduledTime: { $gte: lastMonthStart, $lt: lastMonthEnd }
    });

    const calculateMonthlyStats = (deliveries) => {
      const onTime = deliveries.filter(d => 
        d.status === 'delivered' && d.lateMinutes <= 0
      ).length;
      const late = deliveries.filter(d => 
        d.status === 'delivered' && d.lateMinutes > 0
      ).length;

      return {
        total: deliveries.length,
        completed: deliveries.filter(d => d.status === 'delivered').length,
        pending: deliveries.filter(d => d.status !== 'delivered').length,
        onTime,
        late,
        avgLateMinutes: deliveries.length > 0 
          ? Math.round(deliveries.reduce((sum, d) => sum + d.lateMinutes, 0) / deliveries.length)
          : 0
      };
    };

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    res.json({
      period: 'monthly',
      currentMonth: {
        month: monthNames[today.getMonth()],
        year: today.getFullYear(),
        startDate: monthStart.toISOString().split('T')[0],
        endDate: new Date(monthEnd.getTime() - 1).toISOString().split('T')[0],
        stats: calculateMonthlyStats(currentMonthDeliveries)
      },
      lastMonth: {
        month: monthNames[today.getMonth() - 1 < 0 ? 11 : today.getMonth() - 1],
        year: today.getMonth() - 1 < 0 ? today.getFullYear() - 1 : today.getFullYear(),
        startDate: lastMonthStart.toISOString().split('T')[0],
        endDate: new Date(lastMonthEnd.getTime() - 1).toISOString().split('T')[0],
        stats: calculateMonthlyStats(lastMonthDeliveries)
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get delivery statistics for custom date range
router.get('/:id/stats', protect, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const driver = await User.findById(req.params.id);
    if (!driver || driver.role !== 'driver') {
      return res.status(404).json({ message: 'Driver not found' });
    }

    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'startDate and endDate query parameters are required (YYYY-MM-DD format)' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setDate(end.getDate() + 1); // Include the entire end date

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ message: 'Invalid date format. Use YYYY-MM-DD' });
    }

    const deliveries = await Delivery.find({
      driver: driver._id,
      scheduledTime: { $gte: start, $lt: end }
    });

    const onTime = deliveries.filter(d => 
      d.status === 'delivered' && d.lateMinutes <= 0
    ).length;
    const late = deliveries.filter(d => 
      d.status === 'delivered' && d.lateMinutes > 0
    ).length;

    const stats = {
      total: deliveries.length,
      completed: deliveries.filter(d => d.status === 'delivered').length,
      pending: deliveries.filter(d => d.status !== 'delivered').length,
      onTime,
      late,
      avgLateMinutes: deliveries.length > 0 
        ? Math.round(deliveries.reduce((sum, d) => sum + d.lateMinutes, 0) / deliveries.length)
        : 0
    };

    res.json({
      period: 'custom',
      startDate: startDate,
      endDate: endDate,
      stats
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create new driver
router.post('/', protect, admin, async (req, res) => {
  try {
    const {
      email, password, firstName, lastName, phone, status, colorCode, picture,
      licenseNumber, licenseExpiry, nationalId,
      assignedZone, shiftTiming,
      vehicleId, vehicleType, vehiclePaper,
      baseSalary, contractType, joiningDate
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    const driver = new User({
      email,
      password,
      role: 'driver',
      profile: {
        firstName,
        lastName,
        phone,
        status: status ?? 'offline',
        colorCode: colorCode ?? '#000000',
        picture,
        licenseNumber,
        licenseExpiry,
        nationalId,
        assignedZone,
        shiftTiming,
        vehicleId,
        vehicleType,
        vehiclePaper,
        baseSalary,
        contractType,
        joiningDate
      }
    });

    await driver.save();

    // Return driver without password
    const driverResponse = await User.findById(driver._id).select('-password');
    res.status(201).json(driverResponse);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update driver
router.put('/:id', protect, admin, async (req, res) => {
  try {
    const { firstName, lastName, phone, status, email, colorCode, profile } = req.body;

    const driver = await User.findById(req.params.id);
    if (!driver || driver.role !== 'driver') {
      return res.status(404).json({ message: 'Driver not found' });
    }

    if (email) {
      driver.email = email;
    }

    if (!driver.profile) {
      driver.profile = {};
    }

    const directProfileUpdates = { firstName, lastName, phone, status, colorCode };
    Object.entries(directProfileUpdates).forEach(([field, value]) => {
      if (value !== undefined) {
        driver.profile[field] = value;
      }
    });

    if (profile && typeof profile === 'object') {
      Object.entries(profile).forEach(([field, value]) => {
        if (value !== undefined) {
          driver.profile[field] = value;
        }
      });
    }

    await driver.save();

    const updatedDriver = await User.findById(driver._id).select('-password');
    res.json(updatedDriver);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Disable/enable driver
router.patch('/:id/status', protect, admin, async (req, res) => {
  try {
    const { isActive } = req.body;

    const driver = await User.findById(req.params.id);
    if (!driver || driver.role !== 'driver') {
      return res.status(404).json({ message: 'Driver not found' });
    }

    driver.isActive = isActive;
    await driver.save();

    res.json({ message: `Driver ${isActive ? 'enabled' : 'disabled'} successfully` });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});


// Add this route to your existing driver routes
router.post('/returns',  async (req, res) => {
  try {
    const { bagId, reason, notes, location, driverId, driverName } = req.body;

    console.log('Bag return request:', req.body);

    // For now, just return success to test
    // Later you'll add database logic here
    res.status(200).json({
      message: 'Bag returned successfully',
      bagId: bagId,
      status: 'returned',
      timestamp: new Date().toISOString(),
      returnId: 'temp-' + Date.now()
    });

  } catch (error) {
    console.error('Return bag error:', error);
    res.status(500).json({ message: 'Server error during bag return' });
  }
});
// Helper functions
function calculateKpiScore(driver, allDeliveries, lateDeliveries) {
  if (allDeliveries.length === 0) return 100;

  const onTimeRate = (allDeliveries.length - lateDeliveries.length) / allDeliveries.length;
  const avgLateTime = allDeliveries.reduce((sum, d) => sum + d.lateMinutes, 0) / allDeliveries.length;
  
  let score = 100;
  score -= lateDeliveries.length * 2; // -2 points per late delivery
  score -= Math.max(0, avgLateTime - 5) * 0.5; // -0.5 points per minute over 5min average late
  
  return Math.max(0, Math.round(score));
}

function calculateAccuracyRate(allDeliveries) {
  if (allDeliveries.length === 0) return 100;
  
  const successfulDeliveries = allDeliveries.filter(d => 
    d.status === 'delivered' && !d.complaint?.hasComplaint
  );
  
  return Math.round((successfulDeliveries.length / allDeliveries.length) * 100);
}

async function getComplaintsCount(driverId) {
  return await Delivery.countDocuments({
    driver: driverId,
    'complaint.hasComplaint': true
  });
}

// DEBUG endpoint - check deliveries with drivers
router.get('/debug/deliveries', protect, admin, async (req, res) => {
  try {
    const deliveries = await Delivery.find({})
      .select('_id customerId customerName driver scheduledTime status')
      .populate('driver', 'email profile.firstName profile.lastName')
      .limit(50)
      .sort({ scheduledTime: -1 })
      .lean();

    const stats = {
      total: deliveries.length,
      withDriver: deliveries.filter(d => d.driver).length,
      withoutDriver: deliveries.filter(d => !d.driver).length,
      deliveries: deliveries.map(d => ({
        id: d._id.toString(),
        customer: d.customerName,
        driverId: d.driver?._id?.toString() || null,
        driverName: d.driver ? `${d.driver.profile?.firstName || ''} ${d.driver.profile?.lastName || ''}`.trim() : 'No driver',
        scheduledTime: d.scheduledTime,
        status: d.status
      }))
    };

    res.json(stats);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

function normalizeDriverLocationPayload(payload = {}) {
  if (!payload || typeof payload !== 'object') return null;

  const source = payload.coords || payload.location || payload;

  const rawLat = source.latitude ?? source.lat;
  const rawLng = source.longitude ?? source.lng;

  const latitude = rawLat !== undefined && rawLat !== null ? Number(rawLat) : null;
  const longitude = rawLng !== undefined && rawLng !== null ? Number(rawLng) : null;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return {
    latitude,
    longitude,
    accuracy: source.accuracy ?? source.precision ?? null,
    heading: source.heading ?? null,
    speed: source.speed ?? null,
    altitude: source.altitude ?? null,
    address: payload.address ?? source.address ?? payload.formattedAddress ?? null,
    lastUpdated: payload.timestamp
      ? new Date(payload.timestamp)
      : source.timestamp
        ? new Date(source.timestamp)
        : new Date()
  };
}

export default router;
