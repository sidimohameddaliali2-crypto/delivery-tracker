import express from 'express';
import mongoose from 'mongoose';
import Bag from '../models/Bag.js';
import Delivery from '../models/Delivery.js';
import User from '../models/User.js';
import { protect, authorize } from '../middleware/auth.js'; //

const router = express.Router();

router.use(protect);

function resolveUserDisplayName(user) {
  if (!user) {
    return undefined;
  }

  const nameParts = [
    user.profile?.firstName,
    user.profile?.lastName,
  ].filter(Boolean);

  if (nameParts.length > 0) {
    return nameParts.join(' ').trim();
  }

  return user.name || user.email || undefined;
}

function normalizeReturnLocation(raw) {
  if (!raw) {
    return null;
  }

  let payload = raw;
  if (typeof raw === 'string') {
    try {
      payload = JSON.parse(raw);
    } catch {
      return null;
    }
  }

  if (payload && typeof payload === 'object') {
    const lat =
      typeof payload.lat === 'number'
        ? payload.lat
        : typeof payload.latitude === 'number'
        ? payload.latitude
        : typeof payload.coords?.latitude === 'number'
        ? payload.coords.latitude
        : undefined;

    const lng =
      typeof payload.lng === 'number'
        ? payload.lng
        : typeof payload.longitude === 'number'
        ? payload.longitude
        : typeof payload.coords?.longitude === 'number'
        ? payload.coords.longitude
        : undefined;

    const accuracy =
      typeof payload.accuracy === 'number'
        ? payload.accuracy
        : typeof payload.coords?.accuracy === 'number'
        ? payload.coords.accuracy
        : undefined;

    if (typeof lat === 'number' && typeof lng === 'number') {
      return { lat, lng, accuracy };
    }
  }

  return null;
}

// Get all bags with pagination and filters
router.get('/', protect, async (req, res) => {
  try {
    const parsedPage = Number.parseInt(req.query.page, 10);
    const parsedLimit = Number.parseInt(req.query.limit, 10);
    const page = Number.isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;
    const MAX_LIMIT = 10000;
    const limit = Number.isNaN(parsedLimit) || parsedLimit < 1 ? 50 : Math.min(parsedLimit, MAX_LIMIT);
    const skipIndex = (page - 1) * limit;
    const search = req.query.search;
    const status = req.query.status;
    const isFlagged = req.query.isFlagged;
    const location = req.query.location;
    const driverId = req.query.driverId;
    const bagType = req.query.bagType;

    let query = {};

    // Add isFlagged filter if provided
    if (isFlagged === 'true') {
      query.isFlagged = true;
    }

    if (bagType && ['standard', 'on_time_use'].includes(bagType)) {
      query.bagType = bagType;
    }

    // Add status filter if provided and not 'all'
    if (status && status !== 'all') {
      // Model field is `status` (not `condition`)
      query.status = status;
    }

    if (location && ['warehouse', 'driver', 'customer'].includes(location)) {
      query.location = location;
    }

    if (driverId && mongoose.Types.ObjectId.isValid(driverId)) {
      query['assignedTo.driver'] = driverId;
    }

    // Add search filter if provided
    if (search) {
      query.$or = [
        { bagId: { $regex: search, $options: 'i' } },
        { status: { $regex: search, $options: 'i' } },
        { notes: { $regex: search, $options: 'i' } },
        { 'assignedTo.customer.customerName': { $regex: search, $options: 'i' } }
      ];
    }

    // Debug: log resolved query and pagination params
    console.log('GET /bags -> query:', JSON.stringify(query), { page, limit, search, status, location, driverId });

    const totalBags = await Bag.countDocuments(query);
    let bags = await Bag.find(query)
      .populate('assignedTo.driver', 'profile name email')
      .populate('assignedTo.assignedBy', 'profile name email')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skipIndex)
      .lean();

    // Auto-populate missing customer addresses from deliveries
    const Delivery = mongoose.model('Delivery');
    bags = await Promise.all(bags.map(async (bag) => {
      if (bag.assignedTo?.customer && !bag.assignedTo.customer.address) {
        try {
          const delivery = await Delivery.findOne({
            customerId: bag.assignedTo.customer.customerId || undefined,
            customerName: bag.assignedTo.customer.customerName || undefined
          }).select('address company').lean();
          
          if (delivery) {
            bag.assignedTo.customer.address = delivery.address;
            bag.assignedTo.customer.company = delivery.company;
            // Also update the database for future queries
            await Bag.updateOne(
              { _id: bag._id },
              { 
                $set: {
                  'assignedTo.customer.address': delivery.address,
                  'assignedTo.customer.company': delivery.company
                }
              }
            ).catch(err => console.log('Could not update bag address:', err.message));
          }
        } catch (err) {
          console.log('Could not fetch delivery for bag address:', err.message);
        }
      }
      return bag;
    }));

    res.json({
      success: true,
      count: totalBags,
      data: bags,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(totalBags / limit)
      }
    });
  } catch (error) {
    console.error('Error in GET /bags:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: error.message 
    });
  }
});

// Create single bag
router.post('/', authorize(['admin', 'super_admin', 'dispatcher']), async (req, res) => {
  try {
    const { bagId, condition, location, notes, bagType } = req.body;

    // Check if bag already exists
    const existingBag = await Bag.findOne({ bagId });
    if (existingBag) {
      return res.status(400).json({
        success: false,
        message: 'Bag with this ID already exists'
      });
    }

    const bag = new Bag({
      bagId,
      condition,
      location,
      notes,
      bagType
    });

    await bag.save();
    await bag.populate('assignedTo.driver', 'profile name email');

    res.status(201).json({
      success: true,
      data: bag
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Create bulk bags
router.post('/bulk', authorize(['admin', 'super_admin', 'dispatcher']), async (req, res) => {
  try {
    const { bags } = req.body;

    if (!bags || !Array.isArray(bags)) {
      return res.status(400).json({
        success: false,
        message: 'Bags array is required'
      });
    }

    // Check for existing bag IDs
    const existingBags = await Bag.find({
      bagId: { $in: bags.map(b => b.bagId) }
    });

    if (existingBags.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Some bag IDs already exist',
        existingBags: existingBags.map(b => b.bagId)
      });
    }

    const createdBags = await Bag.insertMany(bags);
    await Bag.populate(createdBags, { path: 'assignedTo.driver', select: 'profile' });

    res.status(201).json({
      success: true,
      count: createdBags.length,
      data: createdBags
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// List drivers available for bag assignment
router.get('/assignable-drivers', protect, async (req, res) => {
  try {
    const { search } = req.query;
    const criteria = {
      role: 'driver',
      isActive: true,
    };

    if (search) {
      const term = new RegExp(search, 'i');
      criteria.$or = [
        { 'profile.firstName': term },
        { 'profile.lastName': term },
        { email: term },
      ];
    }

    const drivers = await User.find(criteria)
      .select('profile.firstName profile.lastName profile.status email location')
      .lean();

    res.json({
      success: true,
      data: drivers.map((driver) => ({
        _id: driver._id,
        name: `${driver.profile?.firstName || ''} ${driver.profile?.lastName || ''}`.trim(),
        email: driver.email,
        status: driver.profile?.status || 'offline',
        location: driver.location,
      })),
    });
  } catch (error) {
    console.error('Error fetching assignable drivers:', error);
    res.status(500).json({
      success: false,
      message: 'Unable to load drivers',
    });
  }
});

// Assign bag to driver
router.patch('/:id/assign', authorize(['admin', 'super_admin', 'dispatcher', 'store_keeper']), async (req, res) => {
  try {
    const { driverId, customerId, customerName, notes, deliveryId } = req.body;

    const bag = await Bag.findById(req.params.id);
    if (!bag) {
      return res.status(404).json({
        success: false,
        message: 'Bag not found'
      });
    }

    let trimmedDriverId = typeof driverId === 'string' ? driverId.trim() : driverId;
    
    // For store_keeper assignments, use the authenticated user's ID if no valid driver ID provided
    if (trimmedDriverId === 'store-keeper' && req.user) {
      trimmedDriverId = req.user._id.toString();
    }
    
    if (!trimmedDriverId || !mongoose.Types.ObjectId.isValid(trimmedDriverId)) {
      return res.status(400).json({
        success: false,
        message: 'Valid driver ID is required to assign a bag'
      });
    }

    const driver = await User.findById(trimmedDriverId).select('profile name email').lean();
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    const driverName = resolveUserDisplayName(driver) || 'Driver';
    const assignedByName = resolveUserDisplayName(req.user);

    bag.status = 'assigned';
    bag.location = 'driver';
    
    // Fetch delivery to get customer address if available
    let customerAddress = '';
    let customerCompany = 'Matter';
    const trimmedDeliveryId = typeof deliveryId === 'string' ? deliveryId.trim() : deliveryId;
    if (trimmedDeliveryId && mongoose.Types.ObjectId.isValid(trimmedDeliveryId)) {
      try {
        const delivery = await mongoose.model('Delivery').findById(trimmedDeliveryId);
        if (delivery) {
          customerAddress = delivery.address || '';
          customerCompany = delivery.company || 'Matter';
        }
      } catch (err) {
        console.log('Could not fetch delivery for address:', err.message);
      }
    }
    
    bag.assignedTo = {
      driver: trimmedDriverId,
      assignedBy: req.user?._id,
      assignedByName: assignedByName || undefined,
      customer: {
        customerId: customerId?.trim() || undefined,
        customerName: customerName?.trim() || undefined,
        address: customerAddress,
        company: customerCompany
      },
      assignmentTime: new Date()
    };
    bag.notes = notes ?? bag.notes;

    if (!bag.$locals) {
      bag.$locals = {};
    }

    bag.$locals.historyEntryOverride = {
      eventType: 'assigned_to_driver',
      status: bag.status,
      location: bag.location,
      assignedBy: {
        user: req.user?._id,
        name: assignedByName || undefined,
      },
      assignedTo: {
        driver: trimmedDriverId,
        driverName,
        customer: {
          customerId: customerId?.trim() || undefined,
          customerName: customerName?.trim() || undefined,
        },
      },
      notes: notes || `Bag assigned to ${driverName}`,
      timestamp: new Date(),
    };

    if (trimmedDeliveryId) {
      if (!mongoose.Types.ObjectId.isValid(trimmedDeliveryId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid delivery ID'
        });
      }
      bag.currentDelivery = trimmedDeliveryId;
    } else {
      bag.set('currentDelivery', undefined);
    }

    await bag.save();
    await bag.populate('assignedTo.driver', 'profile name email');
    await bag.populate('assignedTo.assignedBy', 'profile name email');

    res.json({
      success: true,
      data: bag
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Bulk assign multiple bags to one driver
router.post('/assign/bulk', authorize(['admin', 'super_admin', 'dispatcher', 'store_keeper']), async (req, res) => {
  try {
    const { bagIds, driverId, notes } = req.body;

    if (!Array.isArray(bagIds) || bagIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'bagIds array is required'
      });
    }

    if (!driverId || !mongoose.Types.ObjectId.isValid(driverId)) {
      return res.status(400).json({
        success: false,
        message: 'Valid driverId is required'
      });
    }

    const driver = await User.findById(driverId).select('profile name email').lean();
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    const driverName = resolveUserDisplayName(driver) || 'Driver';
    const assignedByName = resolveUserDisplayName(req.user);
    const successes = [];
    const failures = [];

    for (const rawId of bagIds) {
      const value = typeof rawId === 'string' ? rawId.trim() : rawId;
      if (!value) {
        continue;
      }

      let bag = null;
      if (typeof value === 'string' && mongoose.Types.ObjectId.isValid(value)) {
        bag = await Bag.findById(value);
      }

      if (!bag) {
        const bagCode = String(value).toUpperCase();
        bag = await Bag.findOne({ bagId: bagCode });
      }

      if (!bag) {
        failures.push({ bagId: String(value), reason: 'Bag not found' });
        continue;
      }

      try {
        bag.status = 'assigned';
        bag.location = 'driver';
        bag.assignedTo = {
          ...bag.assignedTo,
          driver: driverId,
          assignedBy: req.user?._id,
          assignedByName: assignedByName || undefined,
          assignmentTime: new Date(),
        };

        if (!bag.$locals) {
          bag.$locals = {};
        }

        bag.$locals.historyEntryOverride = {
          eventType: 'assigned_to_driver',
          status: bag.status,
          location: bag.location,
          assignedBy: {
            user: req.user?._id,
            name: assignedByName || undefined,
          },
          assignedTo: {
            driver: driverId,
            driverName,
            customer: {
              customerId: bag.assignedTo?.customer?.customerId,
              customerName: bag.assignedTo?.customer?.customerName,
            },
          },
          notes: notes || `Bag assigned to ${driverName}`,
          timestamp: new Date(),
        };

        if (notes) {
          bag.notes = notes;
        }

        await bag.save();
        successes.push({ bagId: bag.bagId, _id: bag._id });
      } catch (error) {
        failures.push({ bagId: bag.bagId, reason: error.message || 'Assignment failed' });
      }
    }

    res.json({
      success: failures.length === 0,
      message: `Assigned ${successes.length} bag(s) to ${driverName}`,
      data: {
        assignedCount: successes.length,
        failedCount: failures.length,
        successes,
        failures,
      },
    });
  } catch (error) {
    console.error('Error in bulk bag assignment:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
});

// Return bag to warehouse by scanning bag ID
router.post('/return', authorize(['admin', 'super_admin', 'dispatcher', 'driver']), async (req, res) => {
  try {
    const { bagId, bagQRCode, notes, location } = req.body;
    const identifier = bagId ?? bagQRCode;
    const lookupId = identifier ? String(identifier).toUpperCase() : '';

    if (!lookupId) {
      return res.status(400).json({
        success: false,
        message: 'bagId or bagQRCode is required',
      });
    }

    const bag = await Bag.findOne({ bagId: lookupId });

    if (!bag) {
      return res.status(404).json({
        success: false,
        message: 'Bag not found',
      });
    }

    const normalizedLocation = normalizeReturnLocation(location);
    const userName = resolveUserDisplayName(req.user);
    const historyNote = `Bag returned to warehouse${userName ? ` by ${userName}` : ''}`;
    const updatedBag = await bag.returnToWarehouse({
      returnedBy: req.user?._id,
      returnedByName: userName,
      location: normalizedLocation,
      notes,
      historyNote,
    });

    // Update related deliveries so bag assignment reflects returned status
    const deliveriesToUpdate = await Delivery.find({
      'bagAssignment.bagId': lookupId,
      'bagAssignment.status': { $ne: 'returned' },
    });

    const bagReturnedAt = updatedBag.returnedAt || new Date();

    for (const delivery of deliveriesToUpdate) {
      if (delivery.bagAssignment) {
        delivery.bagAssignment.status = 'returned';
        delivery.bagAssignment.returnedAt = bagReturnedAt;
      }

      if (!Array.isArray(delivery.timeline)) {
        delivery.timeline = [];
      }

      delivery.timeline.push({
        status: 'bag_returned',
        timestamp: bagReturnedAt,
        notes: `Bag ${lookupId} returned to warehouse`,
      });

      if (delivery.bag) {
        delivery.bag.returnedAt = bagReturnedAt;
      }

      await delivery.save();
    }

    await updatedBag.populate('assignedTo.driver', 'profile name email');

    res.json({
      success: true,
      message: 'Bag returned to warehouse',
      data: updatedBag,
    });
  } catch (error) {
    console.error('Error returning bag:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
});

// Mark bag as available after collection/return
router.patch('/:id/return', protect, async (req, res) => {
  try {
    const { status = 'available', notes } = req.body;

    const paramId = req.params.id;
    const bagId = paramId.toUpperCase();
    const isObjectId = mongoose.Types.ObjectId.isValid(paramId);
    const query = isObjectId ? { $or: [{ bagId }, { _id: paramId }] } : { bagId };

    let bag = await Bag.findOne(query);
    if (!bag) {
      // Only auto-provision when the param is clearly a scanned bag code —
      // not a database _id, which was expected to already exist.
      if (isObjectId || !/^BAG[-_]/.test(bagId)) {
        console.log('Bag not found:', paramId);
        return res.status(404).json({
          success: false,
          message: 'Bag not found'
        });
      }
      bag = new Bag({
        bagId,
        notes: 'Auto-created on first scan — bag was not pre-registered in inventory',
      });
      if (!bag.$locals) bag.$locals = {};
      bag.$locals.historyNote = 'Auto-created via bag return (bag ID not found in inventory)';
      await bag.save();
    }

    const updateOps = {
      $set: {
        status,
        returnedAt: new Date(),
        returnedBy: req.user._id
      }
    };

    if (status === 'available') {
      updateOps.$set.location = 'warehouse';
      updateOps.$unset = {
        'assignedTo.driver': '',
        'assignedTo.customer.customerId': '',
        'assignedTo.customer.customerName': '',
        'assignedTo.assignmentTime': '',
        'assignedTo.expectedReturn': '',
        'currentDelivery': ''
      };
    }

    if (notes) {
      const combinedNotes = bag.notes ? `${bag.notes} | ${notes}` : notes;
      updateOps.$set.notes = combinedNotes;
    }

    const updatedBag = await Bag.findByIdAndUpdate(bag._id, updateOps, { new: true });

    console.log('Bag returned:', updatedBag?.bagId, 'Status:', updatedBag?.status);

    res.json({
      success: true,
      message: `Bag ${status === 'available' ? 'returned to available' : 'status updated'}`,
      data: updatedBag
    });
  } catch (error) {
    console.error('Bag return error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Delete a bag
router.delete('/bulk-by-bag-ids', authorize(['admin', 'super_admin', 'dispatcher']), async (req, res) => {
  try {
    const input = Array.isArray(req.body?.bagIds) ? req.body.bagIds : [];
    const bagIds = Array.from(
      new Set(
        input
          .map((value) => String(value || '').trim())
          .filter(Boolean)
      )
    );

    if (bagIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one bag ID is required'
      });
    }

    const existingBags = await Bag.find({ bagId: { $in: bagIds } }).select('_id bagId').lean();
    const existingBagIds = existingBags.map((bag) => bag.bagId);
    const missingBagIds = bagIds.filter((bagId) => !existingBagIds.includes(bagId));

    let deletedCount = 0;
    if (existingBags.length > 0) {
      const idsToDelete = existingBags.map((bag) => bag._id);
      const deleteResult = await Bag.deleteMany({ _id: { $in: idsToDelete } });
      deletedCount = deleteResult.deletedCount || 0;
    }

    return res.json({
      success: true,
      message: `Deleted ${deletedCount} bag(s)`,
      deletedCount,
      requestedCount: bagIds.length,
      missingBagIds
    });
  } catch (error) {
    console.error('Error deleting bags by IDs:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Delete a bag
router.delete('/:id', authorize(['admin', 'super_admin', 'dispatcher']), async (req, res) => {
  try {
    const bag = await Bag.findById(req.params.id);
    if (!bag) {
      return res.status(404).json({ success: false, message: 'Bag not found' });
    }

    await Bag.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: 'Bag deleted', data: bag });
  } catch (error) {
    console.error('Error deleting bag:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Delete all bags
router.delete('/', authorize(['admin', 'super_admin']), async (req, res) => {
  try {
    const result = await Bag.deleteMany({});
    
    res.json({ 
      success: true, 
      message: `${result.deletedCount} bags deleted successfully`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Error deleting all bags:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Reassign bag to new customer
router.patch('/reassign', protect, async (req, res) => {
  try {
    const { bagId: rawBagId, customerId, customerName, deliveryId } = req.body;

    if (!rawBagId) {
      return res.status(400).json({
        success: false,
        message: 'Bag ID is required'
      });
    }

    // Normalize before querying — the schema stores bagId uppercased, so a
    // scanned code with different casing/whitespace would otherwise silently
    // fail to match an existing bag.
    const bagId = rawBagId.toString().trim().toUpperCase();

    let bag = await Bag.findOne({ bagId });
    if (!bag) {
      // Drivers scan physical bag tags that may not have been registered in
      // inventory yet. Auto-provision instead of blocking delivery
      // completion, but still reject scans that aren't a bag code at all.
      if (!/^BAG[-_]/.test(bagId)) {
        return res.status(404).json({
          success: false,
          message: 'Bag not found'
        });
      }
      bag = new Bag({
        bagId,
        notes: 'Auto-created on first scan — bag was not pre-registered in inventory',
      });
      if (!bag.$locals) bag.$locals = {};
      bag.$locals.historyNote = 'Auto-created via bag reassignment (bag ID not found in inventory)';
    }

    // Update customer information
    if (!bag.assignedTo) {
      bag.assignedTo = {};
    }
    
    bag.assignedTo.customer = {
      customerId: customerId?.trim() || undefined,
      customerName: customerName?.trim() || undefined
    };
    bag.assignedTo.assignmentTime = new Date();

    // Update delivery link if provided
    if (deliveryId) {
      if (!mongoose.Types.ObjectId.isValid(deliveryId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid delivery ID'
        });
      }
      bag.currentDelivery = deliveryId;
    }

    // Change bag status from 'available' to 'assigned' when customer is assigned
    if (customerId || customerName) {
      bag.status = 'assigned';
    }

    await bag.save();
    await bag.populate('assignedTo.driver', 'profile name email');

    res.json({
      success: true,
      message: 'Bag reassigned successfully',
      data: bag
    });
  } catch (error) {
    console.error('Error reassigning bag:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Populate customer addresses for all existing bags from their deliveries
router.post('/populate-addresses', authorize(['admin', 'super_admin']), async (req, res) => {
  try {
    const Delivery = mongoose.model('Delivery');
    const bags = await Bag.find({ 'assignedTo.customer': { $exists: true } });
    
    let updated = 0;
    for (const bag of bags) {
      // Try to find delivery for this customer
      const delivery = await Delivery.findOne({
        customerId: bag.assignedTo.customer.customerId || undefined,
        customerName: bag.assignedTo.customer.customerName || undefined
      }).select('address company');

      if (delivery && !bag.assignedTo.customer.address) {
        bag.assignedTo.customer.address = delivery.address;
        bag.assignedTo.customer.company = delivery.company;
        await bag.save();
        updated++;
      }
    }

    res.json({
      success: true,
      message: `Updated ${updated} bags with customer addresses`,
      updated
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Override bag quantity (for flagged bags)
router.patch('/:bagId/override-quantity', protect, authorize(['store_keeper', 'admin', 'super_admin']), async (req, res) => {
  try {
    const { bagId } = req.params;
    const { newQuantity, reason, changedByName } = req.body;

    if (!newQuantity || newQuantity < 1) {
      return res.status(400).json({
        success: false,
        message: 'New quantity must be at least 1'
      });
    }

    const bag = await Bag.findById(bagId);
    if (!bag) {
      return res.status(404).json({
        success: false,
        message: 'Bag not found'
      });
    }

    const oldQuantity = bag.quantity || 1;

    // Add to quantity history
    if (!bag.quantityHistory) {
      bag.quantityHistory = [];
    }

    bag.quantityHistory.push({
      oldQuantity,
      newQuantity: parseInt(newQuantity),
      changedByName: changedByName || req.user?.name || 'System',
      reason: reason || 'Manual override',
      timestamp: new Date()
    });

    // Update quantity
    bag.quantity = parseInt(newQuantity);

    await bag.save();

    res.json({
      success: true,
      message: `Quantity updated from ${oldQuantity} to ${newQuantity}`,
      data: bag
    });
  } catch (error) {
    console.error('Error overriding bag quantity:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Unflag a bag
router.patch('/:id/unflag', protect, authorize(['store_keeper', 'admin', 'super_admin']), async (req, res) => {
  try {
    const bag = await Bag.findById(req.params.id);

    if (!bag) {
      return res.status(404).json({
        success: false,
        message: 'Bag not found'
      });
    }

    // Remove flag
    bag.isFlagged = false;
    bag.flagReason = undefined;
    bag.flaggedAt = undefined;

    await bag.save();

    res.json({
      success: true,
      message: 'Flag removed successfully',
      data: bag
    });
  } catch (error) {
    console.error('Error unflagging bag:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Update flag reason for a bag
router.patch('/:id/update-flag', protect, authorize(['store_keeper', 'admin', 'super_admin']), async (req, res) => {
  try {
    const { flagReason } = req.body;

    if (!flagReason || !flagReason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Flag reason is required'
      });
    }

    const bag = await Bag.findById(req.params.id);

    if (!bag) {
      return res.status(404).json({
        success: false,
        message: 'Bag not found'
      });
    }

    // Update flag reason
    bag.flagReason = flagReason.trim();
    // If bag wasn't flagged, flag it now
    if (!bag.isFlagged) {
      bag.isFlagged = true;
      bag.flaggedAt = new Date();
    }

    await bag.save();

    res.json({
      success: true,
      message: 'Flag reason updated successfully',
      data: bag
    });
  } catch (error) {
    console.error('Error updating flag reason:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

export default router;
