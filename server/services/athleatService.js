import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

class AthleatService {
  constructor() {
    this.baseURL = process.env.ATHLEAT_BASE_URL || 'http://fmserver19.hulexo.online:3000';
    this.database = process.env.ATHLEAT_DATABASE || 'Athleat%20Dev';
    this.basicAuth = process.env.ATHLEAT_BASIC_AUTH || 'V2ViQVBJOldlYkFQSUF0aGxlYXQ=';
    this.sessionToken = null;
    this.sessionTokenExpiry = null;
  }

  /**
   * Get a valid session token from Athleat API
   */
  async getSessionToken() {
    try {
      // Check if we have a valid cached token
      if (this.sessionToken && this.sessionTokenExpiry > new Date()) {
        return this.sessionToken;
      }

      const response = await axios.post(
        `${this.baseURL}/fmi/data/vLatest/databases/${this.database}/sessions`,
        {},
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${this.basicAuth}`
          }
        }
      );

      if (response.data?.response?.token) {
        this.sessionToken = response.data.response.token;
        // Set expiry to 15 minutes from now (FileMaker tokens typically last longer)
        this.sessionTokenExpiry = new Date(Date.now() + 15 * 60 * 1000);
        return this.sessionToken;
      }

      throw new Error('Failed to get session token from Athleat API');
    } catch (error) {
      console.error('Error getting Athleat session token:', error.message);
      throw new Error(`Athleat authentication failed: ${error.message}`);
    }
  }

  /**
   * Get customer data by Athleat recordId from Athleat API
   */
  async getCustomerByAthleatId(athleatId) {
    try {
      const token = await this.getSessionToken();

      const response = await axios.get(
        `${this.baseURL}/fmi/data/vLatest/databases/${this.database}/layouts/Customer%3A%20Web%20Data/records/${athleatId}`,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }
      );

      // GET single record returns data as single object, not array
      if (response.data?.response?.data?.[0]) {
        return this.parseCustomerRecord(response.data.response.data[0]);
      }

      return null;
    } catch (error) {
      console.error('Error fetching customer by Athleat ID:', error.message);
      // Don't throw error, just return null if not found
      return null;
    }
  }

  /**
   * Get customer data by email from Athleat API
   */
  async getCustomerByEmail(email) {
    try {
      console.log('\n=== CUSTOMER LAYOUT FETCH ===');
      console.log(`Searching Customer layout for email: ${email}`);
      
      const token = await this.getSessionToken();

      const response = await axios.post(
        `${this.baseURL}/fmi/data/vLatest/databases/${this.database}/layouts/Customer%3A%20Web%20Data/_find`,
        {
          query: [
            { contactEmail: email }
          ],
          limit: 100,
          offset: 1
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }
      );

      console.log(`Response status: ${response.status}`);
      console.log(`Response messages:`, response.data?.response?.messages);
      console.log(`Records found: ${response.data?.response?.data?.length || 0}`);
      
      if (response.data?.response?.data) {
        const records = response.data.response.data;
        if (records.length > 0) {
          const record = records[0];
          console.log(`Customer record fieldData keys:`, Object.keys(record.fieldData));
          
          // Log portal data if it exists (Orders, Lead, etc.)
          if (record.portalData && Object.keys(record.portalData).length > 0) {
            console.log(`\n=== PORTAL DATA AVAILABLE ===`);
            Object.keys(record.portalData).forEach(portalName => {
              const portalRecords = record.portalData[portalName];
              console.log(`Portal: "${portalName}" - Records: ${portalRecords.length}`);
              if (portalRecords.length > 0) {
                console.log(`  Fields in ${portalName}:`, Object.keys(portalRecords[0].fieldData));
                portalRecords.slice(0, 2).forEach((portalRec, idx) => {
                  console.log(`  Record ${idx + 1}:`, portalRec.fieldData);
                });
                if (portalRecords.length > 2) {
                  console.log(`  ... and ${portalRecords.length - 2} more records`);
                }
              }
            });
          } else {
            console.log('No portal data in response');
          }
          
          return this.parseCustomerRecord(record);
        }
      }

      console.log('No Customer data found');
      return null;
    } catch (error) {
      console.error('Error fetching customer from Athleat:', error.message);
      throw new Error(`Failed to fetch customer data: ${error.message}`);
    }
  }

  /**
   * Get leads data by email from Athleat API
   */
  async getLeadByEmail(email) {
    try {
      const token = await this.getSessionToken();

      console.log('\n=== LEAD LAYOUT FETCH BY EMAIL ===');
      console.log(`Searching Leads: Web Data layout for contactEmail: ${email}`);

      const response = await axios.post(
        `${this.baseURL}/fmi/data/vLatest/databases/${this.database}/layouts/Leads%3A%20Web%20Data/_find`,
        {
          query: [
            { contactEmail: email }
          ],
          limit: 100
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }
      );

      console.log(`Response status: ${response.status}`);
      console.log(`Records found: ${response.data?.response?.data?.length || 0}`);

      if (response.data?.response?.data) {
        const records = response.data.response.data;
        if (records.length > 0) {
          const record = records[0];
          console.log(`\n=== LEAD RECORD FOUND ===`);
          console.log(`Record ID: ${record.recordId}`);
          console.log(`All available fields in Lead record:`, Object.keys(record.fieldData || {}));
          console.log(`\n=== COMPLETE LEAD FIELD DATA ===`);
          Object.keys(record.fieldData || {}).forEach(field => {
            console.log(`  ${field}: ${record.fieldData[field]}`);
          });
          
          return this.parseLeadRecord(record);
        } else {
          console.log(`No Lead records found for contactEmail: ${email}`);
        }
      }

      return null;
    } catch (error) {
      console.error('Error fetching lead from Athleat:', error.message);
      return null;
    }
  }

  /**
   * Get leads data by customer ID (fallback when email search fails)
   */
  async getLeadByCustomerId(customerId) {
    try {
      const token = await this.getSessionToken();

      console.log('\n=== LEAD LAYOUT FETCH BY CUSTOMER ID ===');
      console.log(`Searching Lead layout for customerId: ${customerId}`);

      // Try different possible field names for customer ID reference
      const fieldNamesToTry = ['customerId', 'customerID', 'id', 'customerRecordID', 'recordID'];
      
      for (const fieldName of fieldNamesToTry) {
        console.log(`\nAttempting search with field: ${fieldName}`);
        
        try {
          const response = await axios.post(
            `${this.baseURL}/fmi/data/vLatest/databases/${this.database}/layouts/Leads%3A%20Web%20Data/_find`,
            {
              query: [
                { [fieldName]: customerId }
              ],
              limit: 100
            },
            {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              }
            }
          );

          console.log(`Response status: ${response.status}`);
          console.log(`Records found with ${fieldName}: ${response.data?.response?.data?.length || 0}`);

          if (response.data?.response?.data) {
            const records = response.data.response.data;
            if (records.length > 0) {
              const record = records[0];
              console.log(`\n=== LEAD RECORD FOUND (${fieldName}) ===`);
              console.log(`Record ID: ${record.recordId}`);
              console.log(`All available fields in Lead record:`, Object.keys(record.fieldData || {}));
              console.log(`\n=== COMPLETE LEAD FIELD DATA ===`);
              console.log(JSON.stringify(record.fieldData, null, 2));
              
              return this.parseLeadRecord(record);
            }
          }
        } catch (innerError) {
          console.log(`Failed with ${fieldName}: ${innerError.message}`);
          continue;
        }
      }

      console.log(`No Lead records found for customerId: ${customerId} using any field name`);
      return null;
    } catch (error) {
      console.error('Error fetching lead by customerId from Athleat:', error.message);
      if (error.response?.data) {
        console.error('FileMaker error details:', JSON.stringify(error.response.data, null, 2));
      }
      // Don't throw - this is a fallback method
      return null;
    }
  }

  /**
   * Get lead data by UUID (the actual link field from Customer)
   */
  async getLeadByUUID(uuid) {
    try {
      if (!uuid) {
        console.log('UUID is empty - no Lead record linked to this customer');
        return null;
      }

      const token = await this.getSessionToken();

      console.log('\n=== LEAD LAYOUT FETCH BY UUID ===');
      console.log(`Searching Lead layout for uuid: ${uuid}`);

      const response = await axios.post(
        `${this.baseURL}/fmi/data/vLatest/databases/${this.database}/layouts/Leads%3A%20Web%20Data/_find`,
        {
          query: [
            { uuid: uuid }
          ],
          limit: 10
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }
      );

      console.log(`Response status: ${response.status}`);
      console.log(`Records found with uuid: ${response.data?.response?.data?.length || 0}`);

      if (response.data?.response?.data) {
        const records = response.data.response.data;
        if (records.length > 0) {
          const record = records[0];
          console.log(`\n=== LEAD RECORD FOUND (by uuid) ===`);
          console.log(`Record ID: ${record.recordId}`);
          console.log(`All available fields in Lead record:`, Object.keys(record.fieldData || {}));
          
          return this.parseLeadRecord(record);
        }
      }

      console.log(`No Lead records found for uuid: ${uuid}`);
      return null;
    } catch (error) {
      console.error('Error fetching lead by uuid from Athleat:', error.message);
      return null;
    }
  }

  /**
   * Get raw Customer: Web Data records by email
   */
  async getCustomerRawByEmail(email) {
    try {
      if (!email) {
        return [];
      }

      const token = await this.getSessionToken();
      const response = await axios.post(
        `${this.baseURL}/fmi/data/vLatest/databases/${this.database}/layouts/Customer%3A%20Web%20Data/_find`,
        {
          query: [{ contactEmail: email }],
          limit: 100
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }
      );

      return response.data?.response?.data || [];
    } catch (error) {
      console.error('Error fetching raw customer data:', error.message);
      return [];
    }
  }

  /**
   * Get raw Leads: Web Data records by email
   */
  async getLeadRawByEmail(email) {
    try {
      if (!email) {
        console.log('=== LEAD RAW FETCH ===');
        console.log('Email is empty, returning empty array');
        return [];
      }

      console.log('\n=== LEAD RAW FETCH ===');
      console.log(`Searching Leads: Web Data layout for email: ${email}`);

      const token = await this.getSessionToken();
      const response = await axios.post(
        `${this.baseURL}/fmi/data/vLatest/databases/${this.database}/layouts/Leads%3A%20Web%20Data/_find`,
        {
          query: [{ contactEmail: email }],
          limit: 100
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }
      );

      console.log(`Response status: ${response.status}`);
      console.log(`Records found: ${response.data?.response?.data?.length || 0}`);
      
      if (response.data?.response?.data && response.data.response.data.length > 0) {
        const leadRecord = response.data.response.data[0];
        console.log(`Lead record fieldData keys:`, Object.keys(leadRecord.fieldData || {}));
      }
      
      return response.data?.response?.data || [];
    } catch (error) {
      console.error('Error fetching raw lead data:', error.message);
      if (error.response?.data) {
        console.error('FileMaker error details:', error.response.data);
      }
      // Return empty array instead of throwing so other fetches continue
      return [];
    }
  }

  /**
   * Get raw Order: Web Data records by email
   */
  async getOrderRawByEmail(email) {
    try {
      if (!email) {
        return [];
      }

      const token = await this.getSessionToken();
      
      // Step 1: Get customer uuid from Customer: Web Data using contactEmail (which is searchable)
      const customerResponse = await axios.post(
        `${this.baseURL}/fmi/data/vLatest/databases/${this.database}/layouts/Customer%3A%20Web%20Data/_find`,
        {
          query: [{ contactEmail: email }],
          limit: 1
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (!customerResponse.data?.response?.data || customerResponse.data.response.data.length === 0) {
        console.warn(`No customer found with email: ${email}`);
        return [];
      }

      const customerUuid = customerResponse.data.response.data[0].fieldData.uuid;
      console.log(`Found customer uuid: ${customerUuid} for email: ${email}`);

      // Step 2: Query Order: Web Data using uuid_Customer (which is searchable)
      const orderResponse = await axios.post(
        `${this.baseURL}/fmi/data/vLatest/databases/${this.database}/layouts/Order%3A%20Web%20Data/_find`,
        {
          query: [{ uuid_Customer: customerUuid }],
          limit: 10000
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }
      );

      return orderResponse.data?.response?.data || [];
    } catch (error) {
      console.error('Error fetching raw order data:', error.message);
      return [];
    }
  }

  /**
   * Get raw Order: Web Data records by uuid_Customer
   */
  async getOrderRawByUUID(uuidCustomer) {
    try {
      if (!uuidCustomer) {
        return [];
      }

      const token = await this.getSessionToken();
      const response = await axios.post(
        `${this.baseURL}/fmi/data/vLatest/databases/${this.database}/layouts/Order%3A%20Web%20Data/_find`,
        {
          query: [{ uuid_Customer: uuidCustomer }],
          limit: 10000
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }
      );

      return response.data?.response?.data || [];
    } catch (error) {
      console.error('Error fetching raw order data by UUID:', error.message);
      return [];
    }
  }

  /**
   * Get raw Order: Schedule Meal - Web Data records by uuid_Customer
   */
  async getOrderScheduleRawByUUID(uuidCustomer, startDate = null, endDate = null) {
    try {
      if (!uuidCustomer) {
        return [];
      }

      const token = await this.getSessionToken();
      const query = { uuid_Customer: uuidCustomer };

      if (startDate && endDate) {
        query.date = `${startDate}...${endDate}`;
      } else if (startDate) {
        query.date = startDate;
      }

      const response = await axios.post(
        `${this.baseURL}/fmi/data/vLatest/databases/${this.database}/layouts/Order%3A%20Schedule%20Meal%20-%20Web%20Data/_find`,
        {
          query: [query],
          limit: 500
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }
      );

      return response.data?.response?.data || [];
    } catch (error) {
      console.error('Error fetching raw schedule data:', error.message);
      return [];
    }
  }

  /**
   * Get meal preferences from Order layout (CORRECT SOURCE FOR MEAL PREFS)
   */
  async getOrderMealData(customerEmail) {
    try {
      if (!customerEmail) {
        console.log('No email provided for Order meal search');
        return null;
      }

      const token = await this.getSessionToken();

      console.log('\n=== ORDER LAYOUT FETCH ===');
      console.log(`Searching Order: Web Data layout for customerEmail: ${customerEmail}`);

      // Step 1: Get customer uuid from Customer: Web Data using contactEmail
      const customerResponse = await axios.post(
        `${this.baseURL}/fmi/data/vLatest/databases/${this.database}/layouts/Customer%3A%20Web%20Data/_find`,
        {
          query: [{ contactEmail: customerEmail }],
          limit: 1
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (!customerResponse.data?.response?.data || customerResponse.data.response.data.length === 0) {
        console.log(`No customer found with email: ${customerEmail}`);
        return null;
      }

      const customerUuid = customerResponse.data.response.data[0].fieldData.uuid;
      console.log(`Found customer uuid: ${customerUuid}`);

      // Step 2: Query Order: Web Data using uuid_Customer (get all to find earliest dateStart)
      const response = await axios.post(
        `${this.baseURL}/fmi/data/vLatest/databases/${this.database}/layouts/Order%3A%20Web%20Data/_find`,
        {
          query: [
            { uuid_Customer: customerUuid }
          ],
          limit: 10000
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }
      );

      console.log(`Response status: ${response.status}`);
      console.log(`Total records found: ${response.data?.response?.data?.length || 0}`);

      if (response.data?.response?.data && response.data.response.data.length > 0) {
        const allRecords = response.data.response.data;
        
        // Sort records by dateStart in descending order (most recent first)
        allRecords.sort((a, b) => {
          const dateA = a.fieldData?.dateStart;
          const dateB = b.fieldData?.dateStart;
          
          // Handle missing dates
          if (!dateA && !dateB) return 0;
          if (!dateA) return 1;  // Move records without dates to the end
          if (!dateB) return -1;
          
          // Parse dates (format: MM/DD/YYYY or YYYY-MM-DD)
          const parseDate = (dateStr) => {
            if (!dateStr) return new Date(0);
            // Try parsing as is first
            const direct = new Date(dateStr);
            if (!isNaN(direct.getTime())) return direct;
            
            // Try MM/DD/YYYY format
            const parts = dateStr.split('/');
            if (parts.length === 3) {
              return new Date(parts[2], parts[0] - 1, parts[1]); // Year, Month (0-indexed), Day
            }
            return new Date(0);
          };
          
          const timestampA = parseDate(dateA).getTime();
          const timestampB = parseDate(dateB).getTime();
          
          return timestampB - timestampA; // Descending order (newest first)
        });
        
        // Log all records with their sorted order
        console.log(`\n=== ALL ${allRecords.length} ORDER RECORDS (SORTED BY DATE) ===`);
        allRecords.forEach((rec, idx) => {
          console.log(`Record ${idx + 1}: ID=${rec.recordId}, dateStart=${rec.fieldData?.dateStart}, mealPerDay=${rec.fieldData?.mealPerDay}`);
        });
        
        // Return all records for the client to use
        const allOrderData = {
          totalRecords: allRecords.length,
          records: allRecords.map(record => {
            const fieldData = record.fieldData || {};
            return {
              recordId: record.recordId,
              modId: record.modId,
              dateStart: fieldData.dateStart,
              dateEnd: fieldData.dateEnd,
              mealPerDay: fieldData.mealPerDay,
              breakfastInclude: fieldData.breakfastInclude,
              mealSnack: fieldData.mealSnack,
              mealPlan: fieldData.mealPlan,
              deliveryNumber: fieldData.deliveryNumber,
              mealExclusion: fieldData.mealExclusion,
              allFieldData: fieldData
            };
          })
        };
        
        // Use the FIRST record (most recent after sorting) for meal preferences
        const latestRecord = allRecords[0];
        const latestFieldData = latestRecord.fieldData || {};
        
        console.log(`\n✅ USING LATEST RECORD: ID=${latestRecord.recordId}, dateStart=${latestFieldData.dateStart}, mealPerDay=${latestFieldData.mealPerDay}`);
        
        return {
          // Use LATEST record (first in sorted array)
          mealPerDay: latestFieldData.mealPerDay !== undefined ? Number(latestFieldData.mealPerDay) : undefined,
          breakfastInclude: latestFieldData.breakfastInclude === 'Yes' || latestFieldData.breakfastInclude === 'yes' || latestFieldData.breakfastInclude === true,
          mealSnack: latestFieldData.mealSnack !== undefined ? Number(latestFieldData.mealSnack) : undefined,
          mealPlan: latestFieldData.mealPlan || undefined,
          mealExclusion: latestFieldData.mealExclusion || '',
          // ALL records data
          allOrders: allOrderData.records
        };
      }

      console.log(`No Order records found for customerEmail: ${customerEmail}`);
      return null;
    } catch (error) {
      console.error('Error fetching order meal data:', error.message);
      return null;
    }
  }

  /**
   * Parse order record to extract meal preferences and order details
   */
  parseOrderRecord(record) {
    const fieldData = record.fieldData || {};

    const parseNumber = (value) => {
      if (value === null || value === undefined || value === '') return undefined;
      const direct = Number(value);
      if (Number.isFinite(direct) && direct > 0) return direct;
      const match = String(value).match(/\d+/);
      if (match) {
        const num = Number(match[0]);
        return Number.isFinite(num) && num > 0 ? num : undefined;
      }
      return undefined;
    };

    const parseBoolean = (value) => {
      if (value === true || value === false) return value;
      if (value === null || value === undefined || value === '') return undefined;
      if (typeof value === 'number') return value > 0;
      const normalized = String(value).trim().toLowerCase();
      if (['yes', 'y', 'true', '1'].includes(normalized)) return true;
      if (['no', 'n', 'false', '0'].includes(normalized)) return false;
      return undefined;
    };
    
    console.log('\n=== PARSING ORDER RECORD ===');
    console.log('All available fields:', Object.keys(fieldData));
    
    const mealPerDayField = Object.keys(fieldData).find((key) =>
      /meal.*per.*day|meals.*per.*day|mealperday|mealsperday|meals?_?day/i.test(key)
    );

    const mealPerDay =
      parseNumber(fieldData.mealPerDay) ||
      parseNumber(fieldData.mealsPerDay) ||
      parseNumber(mealPerDayField ? fieldData[mealPerDayField] : undefined) ||
      parseNumber(fieldData.deliveryNumber) ||
      parseNumber(fieldData.mealCount);

    return {
      customerEmail: fieldData.customerEmail || '',
      dateStart: fieldData.dateStart || '',
      deliveryNumber: fieldData.deliveryNumber !== undefined ? Number(fieldData.deliveryNumber) : undefined,
      mealPerDay,
      breakfastInclude: parseBoolean(fieldData.breakfastInclude),
      mealSnack: parseBoolean(fieldData.mealSnack),
      mealPlan: fieldData.mealPlan || undefined,
      paymentStatus: fieldData.paymentStatus || '',
      remarks: fieldData.remakrs || '',
      mealExclusion: fieldData.mealExclusion || ''
    };
  }

  /**
   * Get meal schedule data from Order: Schedule Meal - Web Data layout
   * @param {string} uuidCustomer - The uuid_Customer field from Customer record
   * @param {string} startDate - Start date in m/d/yyyy format (optional)
   * @param {string} endDate - End date in m/d/yyyy format (optional)
   */
  async getOrderScheduleMealData(uuidCustomer, startDate = null, endDate = null) {
    try {
      if (!uuidCustomer) {
        console.log('No uuid_Customer provided for Order Schedule Meal search');
        return null;
      }

      const token = await this.getSessionToken();

      console.log('\n=== ORDER SCHEDULE MEAL LAYOUT FETCH ===');
      console.log(`Searching Order: Schedule Meal - Web Data for uuid_Customer: ${uuidCustomer}`);
      
      // Build query
      const query = { uuid_Customer: uuidCustomer };
      
      // Add date range if provided (format: "2/3/2025...2/4/2025")
      if (startDate && endDate) {
        query.date = `${startDate}...${endDate}`;
        console.log(`Date range: ${startDate} to ${endDate}`);
      } else if (startDate) {
        query.date = startDate;
        console.log(`Single date: ${startDate}`);
      }

      const response = await axios.post(
        `${this.baseURL}/fmi/data/vLatest/databases/${this.database}/layouts/Order%3A%20Schedule%20Meal%20-%20Web%20Data/_find`,
        {
          query: [query],
          limit: 100 // Get up to 100 scheduled meals
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }
      );

      console.log(`Response status: ${response.status}`);
      console.log(`Records found: ${response.data?.response?.data?.length || 0}`);

      if (response.data?.response?.data && response.data.response.data.length > 0) {
        const records = response.data.response.data;
        console.log(`\n=== ORDER SCHEDULE MEAL RECORDS FOUND: ${records.length} ===`);
        console.log(`Fields available:`, Object.keys(records[0].fieldData || {}));
        
        // Show first 3 records
        records.slice(0, 3).forEach((record, idx) => {
          console.log(`  Meal ${idx + 1}:`, {
            date: record.fieldData.date,
            mealType: record.fieldData.mealType,
            meal: record.fieldData.meal
          });
        });
        
        if (records.length > 3) {
          console.log(`  ... and ${records.length - 3} more scheduled meals`);
        }
        
        // Return all scheduled meals
        return records.map(rec => rec.fieldData);
      }

      console.log(`No Order Schedule Meal records found for uuid_Customer: ${uuidCustomer}`);
      return null;
    } catch (error) {
      console.error('Error fetching order schedule meal data:', error.message);
      if (error.response?.data) {
        console.error('FileMaker error:', error.response.data);
      }
      return null;
    }
  }

  /**
   * Parse order schedule meal record to extract meal preferences
   */
  parseOrderScheduleMealRecord(record) {
    const fieldData = record.fieldData || {};
    
    console.log('\n=== PARSING ORDER SCHEDULE MEAL RECORD ===');
    console.log('All available fields:', Object.keys(fieldData));
    
    return {
      mealPerDay: fieldData.mealPerDay !== undefined ? Number(fieldData.mealPerDay) : undefined,
      breakfastInclude: fieldData.breakfastInclude === 'Yes' || fieldData.breakfastInclude === true,
      mealSnack: fieldData.mealSnack !== undefined ? Number(fieldData.mealSnack) : undefined,
      mealPlan: fieldData.mealPlan || undefined,
      mealExclusion: fieldData.mealExclusion || ''
    };
  }

  /**
   * Get menu items for a specific date range and meal plan
   */
  async getMenuItems(startDate, endDate, mealPlan = 'Customized') {
    try {
      const token = await this.getSessionToken();

      const response = await axios.post(
        `${this.baseURL}/fmi/data/vLatest/databases/${this.database}/layouts/Menu%3A%20Item%20-%20Web%20Data/_find`,
        {
          query: [
            {
              itemDate: `${startDate}...${endDate}`,
              mealPlan: mealPlan
            }
          ],
          sort: [
            { fieldName: 'itemDate', sortOrder: 'ascend' },
            { fieldName: 'mealName', sortOrder: 'ascend' }
          ],
          limit: 1000
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (response.data?.response?.data) {
        return response.data.response.data.map(item => this.parseMenuRecord(item));
      }

      return [];
    } catch (error) {
      console.error('Error fetching menu items from Athleat:', error.message);
      throw new Error(`Failed to fetch menu items: ${error.message}`);
    }
  }

  /**
   * Get raw Menu: Item - Web Data records by date range
   */
  async getMenuItemsRaw(startDate, endDate) {
    try {
      const token = await this.getSessionToken();

      const query = {};
      if (startDate && endDate) {
        query.itemDate = `${startDate}...${endDate}`;
      } else if (startDate) {
        query.itemDate = startDate;
      }

      const response = await axios.post(
        `${this.baseURL}/fmi/data/vLatest/databases/${this.database}/layouts/Menu%3A%20Item%20-%20Web%20Data/_find`,
        {
          query: [query],
          sort: [
            { fieldName: 'itemDate', sortOrder: 'descend' }
          ],
          limit: 500
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }
      );

      return response.data?.response?.data || [];
    } catch (error) {
      console.error('Error fetching raw menu items:', error.message);
      return [];
    }
  }

  /**
   * Parse customer record from Athleat API
   */
  parseCustomerRecord(record) {
    const fieldData = record.fieldData || {};
    const portalData = record.portalData || {};

    const parseNumber = (value) => {
      if (value === null || value === undefined || value === '') return undefined;
      const direct = Number(value);
      if (Number.isFinite(direct) && direct > 0) return direct;
      const match = String(value).match(/\d+/);
      if (match) {
        const num = Number(match[0]);
        return Number.isFinite(num) && num > 0 ? num : undefined;
      }
      return undefined;
    };

    const parseBoolean = (value) => {
      if (value === true || value === false) return value;
      if (value === null || value === undefined || value === '') return undefined;
      if (typeof value === 'number') return value > 0;
      const normalized = String(value).trim().toLowerCase();
      if (['yes', 'y', 'true', '1'].includes(normalized)) return true;
      if (['no', 'n', 'false', '0'].includes(normalized)) return false;
      return undefined;
    };

    const mealPerDayField = Object.keys(fieldData).find((key) =>
      /meal.*per.*day|meals.*per.*day|mealperday|mealsperday|meals?_?day/i.test(key)
    );

    const mealPerDay =
      parseNumber(fieldData.mealPerDay) ||
      parseNumber(fieldData.mealsPerDay) ||
      parseNumber(mealPerDayField ? fieldData[mealPerDayField] : undefined) ||
      parseNumber(fieldData.deliveryNumber) ||
      parseNumber(fieldData.mealCount);
    
    console.log('\n=== PARSING CUSTOMER RECORD ===');
    console.log('recordId:', record.recordId);
    console.log('modId:', record.modId);
    console.log('uuid (uuid_Customer):', fieldData.uuid);
    console.log('All available fields in Customer record:', Object.keys(fieldData));
    
    // Extract all portal data if available
    const allPortals = {};
    Object.keys(portalData).forEach(portalName => {
      if (Array.isArray(portalData[portalName])) {
        allPortals[portalName] = portalData[portalName].map(rec => ({
          recordId: rec.recordId,
          modId: rec.modId,
          fieldData: rec.fieldData || {}
        }));
      }
    });

    // Customer layout field names: nameFirst, nameLast, contactEmail, contactNumber, Address, birthdate, customerAge, gender, dataSource
    return {
      // Record metadata
      recordId: record.recordId,
      modId: record.modId,
      
      // Parsed/mapped fields
      athleatId: record.recordId,
      uuid: fieldData.uuid || '',
      email: fieldData.contactEmail || '',
      firstName: fieldData.nameFirst || '',
      lastName: fieldData.nameLast || '',
      phone: fieldData.contactNumber || '',
      birthDate: fieldData.birthdate || fieldData.birthDate || '',
      age: fieldData.customerAge || '',
      gender: fieldData.gender || '',
      address: fieldData.address || fieldData.Address || '',
      dataSource: 'WebData',
      uuidLead: fieldData.uuid_Lead || '',
      mealPerDay,
      breakfastInclude: parseBoolean(fieldData.breakfastInclude),
      mealSnack: parseBoolean(fieldData.mealSnack),
      mealPlan: fieldData.mealPlan || undefined,
      mealExclusion: fieldData.mealExclusion || '',
      // Map weekend flag if present in FileMaker (field name may vary)
      weekend: (() => {
        const weekendKey = Object.keys(fieldData).find(k => /weekend|show.*weekend|week.*end/i.test(k));
        const val = weekendKey ? fieldData[weekendKey] : fieldData.weekend;
        return parseBoolean(val);
      })(),
      
      // COMPLETE RAW FIELD DATA - ALL FIELDS FROM FILEMAKER
      allFieldData: fieldData,
      
      // COMPLETE PORTAL DATA - ALL RELATED RECORDS
      allPortalData: allPortals
    };
  }

  /**
   * Update customer meal preferences in Athleat
   */
  async updateCustomerInAthleat(athleatId, customerData) {
    try {
      const token = await this.getSessionToken();

      // Prepare field data for Athleat
      const fieldData = {};
      
      if (customerData.email !== undefined) fieldData.contactEmail = customerData.email;
      if (customerData.firstName !== undefined) fieldData.nameFirst = customerData.firstName;
      if (customerData.lastName !== undefined) fieldData.nameLast = customerData.lastName;
      if (customerData.phone !== undefined) fieldData.contactNumber = customerData.phone;
      if (customerData.mealPerDay !== undefined) fieldData.mealPerDay = customerData.mealPerDay;
      if (customerData.breakfastInclude !== undefined) {
        fieldData.breakfastInclude = customerData.breakfastInclude ? 'Yes' : 'No';
      }
      if (customerData.mealSnack !== undefined) {
        fieldData.mealSnack = customerData.mealSnack ? 'Yes' : 'No';
      }
      if (customerData.mealPlan !== undefined) fieldData.mealPlan = customerData.mealPlan;
      if (customerData.mealExclusion !== undefined) fieldData.mealExclusion = customerData.mealExclusion;

      const response = await axios.patch(
        `${this.baseURL}/fmi/data/vLatest/databases/${this.database}/layouts/Customer%3A%20Web%20Data/records/${athleatId}`,
        {
          fieldData,
          dateformats: 2 // ISO8601
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (response.data?.response?.modId) {
        return {
          success: true,
          modId: response.data.response.modId
        };
      }

      return { success: false };
    } catch (error) {
      console.error('Error updating customer in Athleat:', error.response?.data || error.message);
      throw new Error(`Failed to update customer in Athleat: ${error.message}`);
    }
  }

  /**
   * Create a new lead in Athleat
   */
  async createLeadInAthleat(customerData) {
    try {
      const token = await this.getSessionToken();

      // Prepare required and optional field data for Lead layout
      const fieldData = {
        // Required fields
        contactNameFirst: customerData.firstName || '',
        contactNameLast: customerData.lastName || '',
        contactEmail: customerData.email || '',
        contactMobile: customerData.phone || '',
        contactAddress: customerData.address || 'N/A',
        contactGender: customerData.gender || 'N/A',
        leadDate: new Date().toISOString().split('T')[0], // Today's date
        leadBy: 'Web Data',
        leadSource: 'Web Data',
        leadStatus: 'New',
        leadReferral: customerData.referral || '',
        contactHeight: customerData.height || 0,
        contactWeight: customerData.weight || 0,
        contactAge: customerData.age || 0,
        contactNationality: customerData.nationality || '',
        // Optional meal preference fields
        mealPerDay: customerData.mealPerDay || 1,
        breakfastInclude: customerData.breakfastInclude ? 'Yes' : 'No',
        mealSnack: customerData.mealSnack ? 'Yes' : 'No',
        mealPlan: customerData.mealPlan || 'Standard',
        mealExclusion: customerData.mealExclusion || ''
      };

      const response = await axios.post(
        `${this.baseURL}/fmi/data/vLatest/databases/${this.database}/layouts/Leads%3A%20Web%20Data/records`,
        {
          fieldData,
          dateformats: 2 // ISO8601
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (response.data?.response?.recordId) {
        return {
          success: true,
          recordId: response.data.response.recordId,
          modId: response.data.response.modId
        };
      }

      return { success: false };
    } catch (error) {
      console.error('Error creating lead in Athleat:', error.response?.data || error.message);
      throw new Error(`Failed to create lead in Athleat: ${error.message}`);
    }
  }

  /**
   * Parse lead record from Athleat API
   */
  parseLeadRecord(record) {
    const fieldData = record.fieldData || {};
    const portalData = record.portalData || {};
    
    console.log('\n=== PARSING LEAD RECORD ===');
    console.log('recordId:', record.recordId);
    console.log('modId:', record.modId);
    console.log('All available fields in Lead record:', Object.keys(fieldData));
    console.log('\n=== ALL LEAD FIELD DATA ===');
    Object.keys(fieldData).forEach(field => {
      console.log(`  ${field}: ${fieldData[field]}`);
    });
    
    // Extract all portal data if available
    const allPortals = {};
    Object.keys(portalData).forEach(portalName => {
      if (Array.isArray(portalData[portalName])) {
        allPortals[portalName] = portalData[portalName].map(rec => ({
          recordId: rec.recordId,
          modId: rec.modId,
          fieldData: rec.fieldData || {}
        }));
      }
    });
    
    // Lead layout field names: contactNameFirst, contactNameLast, contactEmail, contactMobile
    // Lead layout HAS optional meal preference fields
    return {
      // Record metadata
      recordId: record.recordId,
      modId: record.modId,
      
      // Parsed/mapped fields
      athleatId: record.recordId,
      email: fieldData.contactEmail || '',
      mealPerDay: fieldData.mealPerDay !== undefined && fieldData.mealPerDay !== null && fieldData.mealPerDay !== '' 
        ? Number(fieldData.mealPerDay) 
        : undefined,
      breakfastInclude: fieldData.breakfastInclude === 'Yes' || fieldData.breakfastInclude === 'yes' || fieldData.breakfastInclude === true,
      mealSnack: fieldData.mealSnack !== undefined && fieldData.mealSnack !== null && fieldData.mealSnack !== ''
        ? Number(fieldData.mealSnack)
        : undefined,
      mealPlan: fieldData.mealPlan || undefined,
      mealExclusion: fieldData.mealExclusion || '',
      firstName: fieldData.contactNameFirst || fieldData.firstName || '',
      lastName: fieldData.contactNameLast || fieldData.lastName || '',
      phone: fieldData.contactMobile || fieldData.phone || '',
      
      // COMPLETE RAW FIELD DATA - ALL FIELDS FROM FILEMAKER
      allFieldData: fieldData,
      
      // COMPLETE PORTAL DATA - ALL RELATED RECORDS
      allPortalData: allPortals
    };
  }

  /**
   * Parse menu record from Athleat API
   */
  parseMenuRecord(record) {
    const fieldData = record.fieldData || {};
    return {
      athleatId: record.recordId,
      itemDate: fieldData.itemDate || '',
      mealName: fieldData.mealName || '',
      mealPlan: fieldData.mealPlan || '',
      description: fieldData.description || '',
      ingredients: fieldData.ingredients || '',
      calories: fieldData.calories || 0,
      protein: fieldData.protein || 0,
      carbs: fieldData.carbs || 0,
      fat: fieldData.fat || 0
    };
  }

  /**
   * Get Lead records by uuid_Customer and date range
   */
  async getLeadByUUIDAndDate(uuid_Customer, startDate, endDate) {
    try {
      if (!uuid_Customer) {
        console.log('uuid_Customer is empty, returning empty array');
        return [];
      }

      console.log('\n=== LEAD LAYOUT FETCH BY UUID_CUSTOMER AND DATE ===');
      console.log(`Searching Lead: Web Data layout for uuid_Customer: ${uuid_Customer}`);
      console.log(`Date range: ${startDate} to ${endDate}`);

      const token = await this.getSessionToken();

      // Try different date field names that might exist
      const dateFieldsToTry = ['date', 'leadDate', 'createdDate', 'created_date', 'Date'];
      
      // First, just try uuid_Customer to see what records match
      let response = await axios.post(
        `${this.baseURL}/fmi/data/vLatest/databases/${this.database}/layouts/Leads%3A%20Web%20Data/_find`,
        {
          query: [{ uuid_Customer: uuid_Customer }],
          limit: 50
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }
      );

      console.log(`\nBasic query (uuid_Customer only) - Records found: ${response.data?.response?.data?.length || 0}`);
      
      if (response.data?.response?.data && response.data.response.data.length > 0) {
        const leadRecord = response.data.response.data[0];
        console.log(`Lead record fieldData keys:`, Object.keys(leadRecord.fieldData || {}));
        console.log(`First record fieldData:`, JSON.stringify(leadRecord.fieldData, null, 2));
      }

      return response.data?.response?.data || [];
    } catch (error) {
      console.error('Error fetching lead by uuid_Customer and date:', error.message);
      if (error.response?.data) {
        console.error('FileMaker error details:', error.response.data);
      }
      return [];
    }
  }

  /**
   * Invalidate session token
   */
  async invalidateToken() {
    try {
      if (this.sessionToken) {
        await axios.delete(
          `${this.baseURL}/fmi/data/vLatest/databases/${this.database}/sessions/${this.sessionToken}`,
          {
            headers: {
              'Authorization': `Basic ${this.basicAuth}`
            }
          }
        );
        this.sessionToken = null;
        this.sessionTokenExpiry = null;
      }
    } catch (error) {
      console.error('Error invalidating Athleat token:', error.message);
    }
  }

  /**
   * Test Customer layout field queryability
   */
  async testCustomerFieldQueryability() {
    try {
      const token = await this.getSessionToken();

      // First get a sample record
      const sampleResp = await axios.get(
        `${this.baseURL}/fmi/data/vLatest/databases/${this.database}/layouts/Customer%3A%20Web%20Data/records?_limit=1`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (!sampleResp.data?.response?.data || sampleResp.data.response.data.length === 0) {
        console.log('No Customer records found');
        return;
      }

      const sampleRecord = sampleResp.data.response.data[0].fieldData;
      console.log('\n=== TESTING CUSTOMER QUERY FIELDS ===\n');
      console.log('Sample Record Data:');
      console.log(`- id: ${sampleRecord.id}`);
      console.log(`- uuid: ${sampleRecord.uuid}`);
      console.log(`- contactEmail: ${sampleRecord.contactEmail}`);
      console.log(`- nameFull: ${sampleRecord.nameFull}`);
      console.log(`- nameFirst: ${sampleRecord.nameFirst}\n`);

      // Test different fields
      const fieldsToTest = [
        { name: 'uuid', value: sampleRecord.uuid },
        { name: 'id', value: sampleRecord.id },
        { name: 'contactEmail', value: sampleRecord.contactEmail },
        { name: 'nameFull', value: sampleRecord.nameFull },
        { name: 'nameFirst', value: sampleRecord.nameFirst }
      ];

      for (const field of fieldsToTest) {
        try {
          const response = await axios.post(
            `${this.baseURL}/fmi/data/vLatest/databases/${this.database}/layouts/Customer%3A%20Web%20Data/_find`,
            {
              query: [{ [field.name]: field.value }]
            },
            {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              }
            }
          );

          console.log(`✅ Query ${field.name} = "${field.value}"`);
          console.log(`   Results: ${response.data?.response?.data?.length || 0} records\n`);
        } catch (error) {
          console.log(`❌ Query ${field.name} = "${field.value}"`);
          console.log(`   Error: ${error.response?.data?.messages?.[0]?.message || error.message}\n`);
        }
      }
    } catch (error) {
      console.error('Error testing Customer fields:', error.message);
    }
  }
}

export default new AthleatService();
