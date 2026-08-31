import express from 'express';
import Customer from '../models/Customer.js';
import Delivery from '../models/Delivery.js';

const router = express.Router();

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const buildEmailRegex = (email) => {
  const cleaned = String(email || '').trim();
  return new RegExp(`^${escapeRegex(cleaned)}$`, 'i');
};

const normalizeMealExclusions = (exclusions) => {
  const raw = String(exclusions || '').trim();
  if (!raw) return '';

  const lowered = raw.toLowerCase();
  if (['none', 'n/a', 'na', '-', 'null'].includes(lowered)) {
    return '';
  }

  const ingredients = raw
    .split(/[\s,;|]+/)
    .map((value) => value.trim())
    .filter(Boolean);

  return [...new Set(ingredients)].join(', ');
};

/**
 * Upload customers from email list (Excel/CSV)
 * POST /api/customers/upload-emails
 */
router.post('/upload-emails', async (req, res) => {
  try {
    const { customers, emails } = req.body;

    // Support both new format (with name and id) and old format (emails only)
    let customersToProcess = [];
    
    if (customers && Array.isArray(customers)) {
      customersToProcess = customers;
    } else if (emails && Array.isArray(emails)) {
      // Legacy format - emails only
      customersToProcess = emails.map((email, index) => ({
        customerId: email.toLowerCase().replace(/[^a-z0-9]/g, '_'),
        name: email.split('@')[0],
        email: email
      }));
    } else {
      return res.status(400).json({
        success: false,
        message: 'Please provide customer data (customers array with customerId, name, email)'
      });
    }

    if (customersToProcess.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No customers provided'
      });
    }

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];

    // Process each customer
    for (const customerData of customersToProcess) {
      try {
        const { customerId, name, email } = customerData;

        // Validate required fields
        if (!customerId || !name || !email) {
          errors.push(`Missing fields for customer: ${JSON.stringify(customerData)}`);
          continue;
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          errors.push(`Invalid email format: ${email}`);
          continue;
        }

        // Check if customer already exists by email or customerId
        let existingCustomer = await Customer.findOne({ 
          $or: [
            { email: buildEmailRegex(email) },
            { customerId: customerId.trim() }
          ]
        });
        
        if (existingCustomer) {
          // Update existing customer with new data
          existingCustomer.customerId = customerId.trim();
          existingCustomer.email = email;
          existingCustomer.firstName = name.trim().split(' ')[0] || 'Unknown';
          existingCustomer.lastName = name.trim().split(' ').slice(1).join(' ') || '';
          existingCustomer.dataSource = 'ImportedFromExcel';
          
          await existingCustomer.save();
          updated++;
          continue;
        }

        // Create new customer
        const newCustomer = new Customer({
          customerId: customerId.trim(),
          email: email,
          firstName: name.trim().split(' ')[0] || 'Unknown',
          lastName: name.trim().split(' ').slice(1).join(' ') || '',
          dataSource: 'ImportedFromExcel'
        });

        await newCustomer.save();
        imported++;
      } catch (error) {
        console.error(`Error processing customer:`, error.message);
        if (error.code === 11000) {
          // Duplicate key error - already handled above but shouldn't reach here
          skipped++;
        } else {
          errors.push(`Error processing customer: ${error.message}`);
        }
      }
    }

    res.json({
      success: true,
      message: `Successfully processed ${customersToProcess.length} customers`,
      imported,
      updated,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
      totalProcessed: imported + updated
    });
  } catch (error) {
    console.error('Error uploading customers:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading customers',
      error: error.message
    });
  }
});

/**
 * Bulk upload customers with detailed information
 * POST /api/customers/upload-bulk
 */
router.post('/upload-bulk', async (req, res) => {
  try {
    const { customers } = req.body;

    if (!customers || !Array.isArray(customers)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide customer data as an array'
      });
    }

    if (customers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No customers provided'
      });
    }

    const errors = [];
    const ops = [];
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    for (const customerData of customers) {
      const {
        customerId, name, mealPlan, starterDate, macroC, macroP, macroF, exclusions,
        noOfMeals, breakfast, phone, email,
        cycleDuration, amountPaid, discount, snackCount
      } = customerData;

      if (!customerId || !name || !email) {
        errors.push(`Missing required fields (ID/Name/Email): ${customerId || '?'}`);
        continue;
      }
      if (!emailRegex.test(email)) {
        errors.push(`Invalid email: ${email}`);
        continue;
      }

      let planStart = null;
      if (starterDate) {
        // MM/DD/YYYY or MM-DD-YYYY (as used in Excel exports)
        const mmddyyyy = String(starterDate).match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (mmddyyyy) {
          planStart = new Date(Number(mmddyyyy[3]), Number(mmddyyyy[1]) - 1, Number(mmddyyyy[2]));
        } else {
          planStart = new Date(starterDate);
        }
      }
      const parsedBreakfast = breakfast === true || breakfast === 'true' || breakfast === '1' || String(breakfast).toLowerCase() === 'yes';

      const doc = {
        customerId: customerId.trim(),
        email: email.trim().toLowerCase(),
        firstName: name.trim().split(' ')[0] || 'Unknown',
        lastName: name.trim().split(' ').slice(1).join(' ') || '',
        mealPlan: mealPlan || 'Standard',
        mealExclusion: normalizeMealExclusions(exclusions),
        mealPerDay: parseInt(noOfMeals) || 1,
        breakfastInclude: parsedBreakfast,
        snackCount: parseInt(snackCount) || 0,
        phone: phone || '',
        macros: { C: Number(macroC) || 0, P: Number(macroP) || 0, F: Number(macroF) || 0 },
        planStartDate: planStart && !isNaN(planStart) ? planStart : null,
        cycleDuration: parseInt(cycleDuration) || 0,
        amountPaid: amountPaid || '',
        discount: discount || '',
        dataSource: 'ImportedFromExcel',
        updatedAt: new Date()
      };

      ops.push({
        updateOne: {
          filter: { $or: [{ customerId: doc.customerId }, { email: doc.email }] },
          update: { $set: doc, $setOnInsert: { createdAt: new Date() } },
          upsert: true
        }
      });
    }

    let created = 0;
    let updated = 0;

    if (ops.length > 0) {
      const result = await Customer.bulkWrite(ops, { ordered: false });
      created = result.upsertedCount || 0;
      updated = (result.modifiedCount || 0) + (result.matchedCount || 0) - created;
    }

    res.json({
      success: true,
      message: `Successfully processed ${ops.length} customers`,
      created,
      updated,
      errors: errors.length > 0 ? errors : undefined,
      totalProcessed: created + updated
    });
  } catch (error) {
    console.error('Error uploading customers:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading customers',
      error: error.message
    });
  }
});

/**
 * Bulk upload macros for customers
 * POST /api/customers/upload-macros
 */
router.post('/upload-macros', async (req, res) => {
  try {
    const { records } = req.body;

    if (!records || !Array.isArray(records)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide macro records as an array'
      });
    }

    if (records.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No macro records provided'
      });
    }

    const errors = [];
    const operations = [];
    const seenIds = new Set();

    for (const record of records) {
      const { customerId, customerName, C, P, F } = record;
      if (!customerId || C === undefined || P === undefined || F === undefined) {
        errors.push(`Missing required fields for macro record: ${JSON.stringify(record)}`);
        continue;
      }

      const normalizedCustomerId = String(customerId).trim();
      if (!normalizedCustomerId) {
        errors.push(`Row missing valid customerId: ${JSON.stringify(record)}`);
        continue;
      }

      if (seenIds.has(normalizedCustomerId)) {
        errors.push(`Duplicate customerId found: ${normalizedCustomerId}`);
        continue;
      }
      seenIds.add(normalizedCustomerId);

      const macroC = Number(C);
      const macroP = Number(P);
      const macroF = Number(F);

      if (Number.isNaN(macroC) || Number.isNaN(macroP) || Number.isNaN(macroF)) {
        errors.push(`Invalid macro numbers for record: ${JSON.stringify(record)}`);
        continue;
      }

      const nameParts = (String(customerName || '').trim() || '').split(' ').filter(Boolean);
      const firstName = nameParts[0] || 'Unknown';
      const lastName = nameParts.slice(1).join(' ');

      operations.push({
        updateOne: {
          filter: { customerId: normalizedCustomerId },
          update: {
            $set: {
              customerId: normalizedCustomerId,
              firstName,
              lastName,
              macros: { C: macroC, P: macroP, F: macroF },
              dataSource: 'ImportedFromExcel'
            }
          },
          upsert: true
        }
      });
    }

    if (operations.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid macro records to process',
        errors
      });
    }

    const bulkResult = await Customer.bulkWrite(operations, { ordered: false });
    const created = bulkResult.upsertedCount || 0;
    const updated = bulkResult.modifiedCount || bulkResult.nModified || 0;

    res.json({
      success: true,
      message: `Processed ${operations.length} macro records`,
      created,
      updated,
      errors: errors.length > 0 ? errors : undefined,
      totalProcessed: operations.length
    });
  } catch (error) {
    console.error('Error uploading macro records:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading macro records',
      error: error.message
    });
  }
});

/**
 * Create a new customer
 * POST /api/customers
 */
router.post('/', async (req, res) => {
  try {
    const { customerId, firstName, lastName, email, phone, company } = req.body;

    // Validate required fields
    if (!customerId || !firstName || !email) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: customerId, firstName, and email are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // Check if customer already exists
    const existingCustomer = await Customer.findOne({
      $or: [
        { email: buildEmailRegex(email) },
        { customerId: customerId.trim() }
      ]
    });

    if (existingCustomer) {
      return res.status(409).json({
        success: false,
        message: existingCustomer.email.toLowerCase() === email.toLowerCase() 
          ? `Customer with email ${email} already exists`
          : `Customer with ID ${customerId} already exists`
      });
    }

    // Create new customer
    const newCustomer = new Customer({
      customerId: customerId.trim(),
      firstName: firstName.trim(),
      lastName: lastName?.trim() || '',
      email: email.trim(),
      phone: phone?.trim() || '',
      company: company?.trim() || '',
      dataSource: 'ManualEntry'
    });

    await newCustomer.save();

    res.status(201).json({
      success: true,
      message: 'Customer created successfully',
      data: newCustomer
    });
  } catch (error) {
    console.error('Error creating customer:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating customer',
      error: error.message
    });
  }
});

/**
 * Create a new customer
 * POST /api/customers
 */
router.post('/', async (req, res) => {
  try {
    const { customerId, firstName, lastName, email, phone, company } = req.body;

    // Validate required fields
    if (!customerId || !firstName || !email) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: customerId, firstName, and email are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // Check if customer already exists
    const existingCustomer = await Customer.findOne({
      $or: [
        { email: buildEmailRegex(email) },
        { customerId: customerId.trim() }
      ]
    });

    if (existingCustomer) {
      return res.status(409).json({
        success: false,
        message: existingCustomer.email.toLowerCase() === email.toLowerCase() 
          ? `Customer with email ${email} already exists`
          : `Customer with ID ${customerId} already exists`
      });
    }

    // Create new customer
    const newCustomer = new Customer({
      customerId: customerId.trim(),
      firstName: firstName.trim(),
      lastName: lastName?.trim() || '',
      email: email.trim(),
      phone: phone?.trim() || '',
      company: company?.trim() || '',
      dataSource: 'ManualEntry'
    });

    await newCustomer.save();

    res.status(201).json({
      success: true,
      message: 'Customer created successfully',
      data: newCustomer
    });
  } catch (error) {
    console.error('Error creating customer:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating customer',
      error: error.message
    });
  }
});

/**
 * Get all customers
 * GET /api/customers
 */
router.get('/', async (req, res) => {
  try {
    const { search, limit } = req.query;
    const query = {};

    if (search && search.trim().length > 0) {
      const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      query.$or = [
        { customerId: regex },
        { firstName: regex },
        { lastName: regex },
        { email: regex }
      ];
    }

    const maxLimit = Math.min(parseInt(limit, 10) || 10000, 10000);

    const customers = await Customer.find(query)
      .select('customerId email cpf macros firstName lastName phone company planStartDate cycleDuration amountPaid discount')
      .sort({ createdAt: -1 })
      .limit(maxLimit);

    res.json({
      success: true,
      data: customers,
      count: customers.length
    });
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching customers',
      error: error.message
    });
  }
});

/**
 * Send WhatsApp renewal reminder via Gallabox
 * POST /api/customers/send-whatsapp-reminder
 */
router.post('/send-whatsapp-reminder', async (req, res) => {
  try {
    const { customerId, customerName, mealPlan, lastDeliveryDate, remaining, discount, phone } = req.body;

    // Always send to the default recipient; falls back to customer phone if not set
    const recipientPhone = (process.env.GALLABOX_DEFAULT_PHONE || phone || '').replace(/\s+/g, '');

    if (!recipientPhone) {
      return res.status(400).json({ success: false, message: 'No recipient phone number available' });
    }

    // Use the same date already shown to the user in the Renewal table (actual last
    // delivery, or projected last day for active plans) rather than recomputing it
    let endDate = 'N/A';
    if (lastDeliveryDate) {
      const date = new Date(lastDeliveryDate);
      if (!Number.isNaN(date.getTime())) {
        endDate = date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
      }
    }

    // Gallabox expects phone without leading +
    const formattedPhone = recipientPhone.startsWith('+') ? recipientPhone.slice(1) : recipientPhone;

    const payload = {
      channelId: process.env.GALLABOX_CHANNEL_ID,
      channelType: 'whatsapp',
      recipient: {
        name: customerName || 'Customer',
        phone: formattedPhone,
      },
      whatsapp: {
        type: 'template',
        template: {
          templateName: 'renewal_reminder2_clone',
          bodyValues: {
            name: customerName || 'Customer',
            variable_2: mealPlan || 'Standard',
            variable_3: endDate,
            variable_4: String(remaining ?? 0),
            variable_5: discount || '0',
            variable_6: 'CIRCLE',
          },
          buttonValues: [
            { index: 0, sub_type: 'quick_reply', parameters: { type: 'payload', payload: 'www.matternutrition.xyz' } },
            { index: 1, sub_type: 'quick_reply', parameters: { type: 'payload', payload: 'No Renewal' } },
          ],
        },
      },
    };

    console.log('Gallabox payload:', JSON.stringify(payload, null, 2));

    const response = await fetch('https://server.gallabox.com/devapi/messages/whatsapp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apiKey: process.env.GALLABOX_API_KEY,
        apiSecret: process.env.GALLABOX_API_SECRET,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    console.log('Gallabox response:', response.status, JSON.stringify(data));

    if (!response.ok) {
      return res.status(response.status).json({ success: false, message: data?.message || 'Gallabox API error', details: data });
    }

    console.log(`WhatsApp reminder sent to ${customerName} (${recipientPhone})`);
    res.json({ success: true, message: 'Reminder sent', data });
  } catch (error) {
    console.error('Error sending WhatsApp reminder:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Update customer fields
 * PATCH /api/customers/:customerId
 */
router.patch('/:customerId', async (req, res) => {
  try {
    const allowed = [
      'planStartDate', 'cycleDuration', 'amountPaid', 'discount',
      // Identity / contact details editable from the customer detail page
      'firstName', 'lastName', 'phone', 'company', 'address', 'email',
    ];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

    // Never write an empty-string email: it would collide on the unique sparse
    // index with every other customer that has no email.
    if (updates.email === '' || updates.email === null) delete updates.email;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'No valid fields to update' });
    }

    // upsert so a customer that only exists on delivery records (no Customer
    // document yet) can still be edited — the edit creates the record.
    const customer = await Customer.findOneAndUpdate(
      { customerId: req.params.customerId },
      { $set: updates, $setOnInsert: { customerId: req.params.customerId } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json({ success: true, data: customer });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ success: false, message: 'That email is already used by another customer' });
    }
    console.error('Error updating customer:', error);
    res.status(500).json({ success: false, message: 'Error updating customer' });
  }
});

const normalizePhoneDigits = (value) => String(value || '').replace(/\D/g, '');
const phoneSuffix = (value, len = 9) => normalizePhoneDigits(value).slice(-len);
const MATCH_PROJECTION = 'customerId email firstName lastName phone company planStartDate cycleDuration amountPaid discount mealExclusion';

/**
 * Match a customer against an external record (e.g. a Matter website
 * subscription) by cascading through email -> phone -> name, in that order
 * of confidence. Stops at the first level that finds a match.
 * GET /api/customers/match?email=&phone=&name=
 */
router.get('/match', async (req, res) => {
  try {
    const { email, phone, name } = req.query;
    let customer = null;
    let matchedBy = null;

    if (email && String(email).trim()) {
      customer = await Customer.findOne({ email: buildEmailRegex(email) }).select(MATCH_PROJECTION);
      if (customer) matchedBy = 'email';
    }

    if (!customer && phone) {
      const suffix = phoneSuffix(phone);
      if (suffix) {
        const candidates = await Customer.find({ phone: { $exists: true, $ne: '' } }).select(MATCH_PROJECTION);
        customer = candidates.find((c) => phoneSuffix(c.phone) === suffix) || null;
        if (customer) matchedBy = 'phone';
      }
    }

    if (!customer && name && String(name).trim()) {
      const parts = String(name).trim().split(/\s+/);
      const firstName = parts[0];
      const lastName = parts.slice(1).join(' ');
      const query = lastName
        ? { firstName: new RegExp(`^${escapeRegex(firstName)}$`, 'i'), lastName: new RegExp(`^${escapeRegex(lastName)}$`, 'i') }
        : { firstName: new RegExp(`^${escapeRegex(firstName)}$`, 'i') };
      customer = await Customer.findOne(query).select(MATCH_PROJECTION);
      if (customer) matchedBy = 'name';
    }

    res.json({ success: true, data: { customer, matchedBy } });
  } catch (error) {
    console.error('Error matching customer:', error);
    res.status(500).json({ success: false, message: 'Error matching customer', error: error.message });
  }
});

/**
 * Get customer by email
 * GET /api/customers/email/:email
 */
router.get('/email/:email', async (req, res) => {
  try {
    const customer = await Customer.findOne({ email: buildEmailRegex(req.params.email) });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    res.json({
      success: true,
      data: customer
    });
  } catch (error) {
    console.error('Error fetching customer:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching customer',
      error: error.message
    });
  }
});

/**
 * Get location (address, zone, GPS) from a customer's most recent delivery
 * GET /api/customers/:customerId/location
 */
router.get('/:customerId/location', async (req, res) => {
  try {
    const delivery = await Delivery.findOne(
      { customerId: req.params.customerId, address: { $exists: true, $ne: '' } },
      { address: 1, zone: 1, gpsLocation: 1 }
    ).sort({ scheduledTime: -1 }).lean();

    if (!delivery) {
      return res.json({ success: true, data: null });
    }

    res.json({
      success: true,
      data: {
        address: delivery.address || '',
        zone: delivery.zone || '',
        gpsLocation: delivery.gpsLocation || null
      }
    });
  } catch (error) {
    console.error('Error fetching customer location:', error);
    res.status(500).json({ success: false, message: 'Error fetching customer location' });
  }
});

export default router;
