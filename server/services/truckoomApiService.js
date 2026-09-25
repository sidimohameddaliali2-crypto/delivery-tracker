import axios from 'axios';
import dotenv from 'dotenv';
import { cacheGet, cacheSet } from '../config/cache.js';

dotenv.config();

// Live vehicle GPS tracking (Truckoom "Trace") — owner, 2026-09-24. Two
// endpoints are all this integration needs:
//   - getCompanyWiseVehicleData: which vehicles exist (vehicle_no, imei,
//     device_name — the device_name happens to carry the driver's name for
//     most of this fleet, but that's not relied on for matching; a driver
//     is linked to a vehicle_no explicitly via User.profile.truckoomVehicleNo).
//   - getVehiclesWithLocationDetails: each vehicle's current lat/lng.
//
// Both were verified live against the real account before building this:
// getCompanyWiseVehicleData wants a JSON body, getVehiclesWithLocationDetails
// wants plain GET query params — genuinely inconsistent between the two,
// confirmed by testing, not a guess.
//
// Cached briefly (FLEET_CACHE_TTL_SECONDS) so N dispatchers with Live
// Tracking or Driver Routes open, each polling every ~60s client-side,
// don't turn into N real Truckoom calls a minute — one real fetch serves
// all of them.

const FLEET_CACHE_TTL_SECONDS = 20;
const FLEET_CACHE_KEY = 'truckoom:fleet:vehicles';

class TruckoomApiService {
  constructor() {
    this.baseURL = process.env.TRUCKOOM_BASE_URL || 'https://trace.truckoom.com/webservice';
    this.username = process.env.TRUCKOOM_USERNAME;
    this.password = process.env.TRUCKOOM_PASSWORD;
    this.companyName = process.env.TRUCKOOM_COMPANY_NAME;
  }

  assertConfigured() {
    if (!this.username || !this.password || !this.companyName) {
      throw new Error('Truckoom API is not configured (missing TRUCKOOM_USERNAME/TRUCKOOM_PASSWORD/TRUCKOOM_COMPANY_NAME)');
    }
  }

  /** Every vehicle registered under the company — vehicle_no, imei, device_name. */
  async getCompanyVehicles() {
    this.assertConfigured();
    const response = await axios.post(
      `${this.baseURL}?token=getCompanyWiseVehicleData`,
      { username: this.username, password: this.password, company_name: this.companyName },
      { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
    );
    if (response.data?.result !== 1) {
      throw new Error(response.data?.message || 'Failed to fetch Truckoom vehicle list');
    }
    const branches = response.data?.data?.branch || [];
    return branches.flatMap((branch) => (branch.vehicles || []).map((v) => ({
      vehicleNo: String(v.vehicle_no || '').trim(),
      imei: v.imei_no || null,
      deviceName: v.device_name || null,
      deviceModel: v.device_model || null,
    })));
  }

  /** Current lat/lng for every vehicle under the company. */
  async getVehicleLocations() {
    this.assertConfigured();
    const response = await axios.get(this.baseURL, {
      params: {
        token: 'getVehiclesWithLocationDetails',
        username: this.username,
        password: this.password,
        company_name: this.companyName,
      },
      timeout: 15000,
    });
    if (response.data?.result !== 1) {
      throw new Error(response.data?.message || 'Failed to fetch Truckoom vehicle locations');
    }
    const details = response.data?.data?.vehicle_details || [];
    return details.map((d) => ({
      vehicleNo: String(d.vehicle_number || '').trim(),
      imei: d.identifier || null,
      vehicleType: d.vehicle_type || null,
      latitude: Number.parseFloat(d.latitude),
      longitude: Number.parseFloat(d.longitude),
    }));
  }

  /**
   * Merged, cached view: every vehicle with its current location (location
   * fields null if that vehicle didn't come back in the location call).
   * Driver matching is NOT done here — that needs a DB read (User model),
   * which this service deliberately doesn't depend on; routes/truckoomApi.js
   * joins this against User.profile.truckoomVehicleNo.
   */
  async getFleetStatus() {
    const cached = await cacheGet(FLEET_CACHE_KEY);
    if (cached) return cached;

    const [vehicles, locations] = await Promise.all([
      this.getCompanyVehicles(),
      this.getVehicleLocations(),
    ]);
    const locationByVehicleNo = new Map(locations.map((l) => [l.vehicleNo, l]));

    const fleet = vehicles.map((v) => {
      const loc = locationByVehicleNo.get(v.vehicleNo);
      return {
        vehicleNo: v.vehicleNo,
        imei: v.imei,
        deviceName: v.deviceName,
        vehicleType: loc?.vehicleType || null,
        latitude: Number.isFinite(loc?.latitude) ? loc.latitude : null,
        longitude: Number.isFinite(loc?.longitude) ? loc.longitude : null,
      };
    });

    await cacheSet(FLEET_CACHE_KEY, fleet, FLEET_CACHE_TTL_SECONDS);
    return fleet;
  }
}

export default new TruckoomApiService();
