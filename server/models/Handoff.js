import mongoose from 'mongoose';

// A planned second-trip pickup for a bike: either a van hands it the bags
// mid-route, or the bike rides back to the kitchen itself. The bike's
// second-trip deliveries are ALREADY assigned to the bike (that's how the
// kitchen knows which crate is whose); this record is the where/when/with-
// whom (if anyone) of the physical handover. One per bike per shift.
const handoffSchema = new mongoose.Schema({
  // 'kitchen_return' has no van — the bike collects its own second batch.
  type: { type: String, enum: ['van_handoff', 'kitchen_return'], default: 'van_handoff' },
  van: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
  bike: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // Business day (Dubai) the plan is for, as "YYYY-MM-DD" — matches how the
  // dispatcher selects a date, and makes "today's handoffs" a plain equality.
  date: { type: String, required: true },
  // For van_handoff: the snapped POI/van-stop meeting point. For
  // kitchen_return: the depot's own coordinates.
  meetingPoint: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    name: String,
    // fuel | parking | unsnapped | kitchen
    poiType: String,
    osmId: String
  },
  // Seconds from shift start, as planned by the optimizer. van_handoff only.
  plannedVanArrivalSeconds: Number,
  plannedBikeArrivalSeconds: Number,
  expectedWaitSeconds: Number,
  // kitchen_return only: when the bike leaves its last trip-1 stop, and the
  // total extra time (round trip + reload) versus going straight to trip 2.
  plannedBikeDepartSeconds: Number,
  detourSeconds: Number,
  // kitchen_return only: why no van could take this second trip (a van
  // meeting is always tried first, so a kitchen return is a fallback and
  // should never look like an unexplained default).
  vanReason: String,
  // 0-based routeOrder of the van stop AFTER which the van detours to the
  // meeting point (van_handoff only), and of the bike stop after which the
  // bike heads to the meeting point / kitchen.
  vanAfterRouteOrder: Number,
  bikeAfterRouteOrder: Number,
  // The bike's second-trip deliveries (carried by the van, or collected by
  // the bike itself at the kitchen).
  deliveryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Delivery' }],
  status: {
    type: String,
    enum: ['planned', 'van_arrived', 'bike_arrived', 'completed', 'cancelled'],
    default: 'planned'
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

handoffSchema.index({ bike: 1, date: 1 });
handoffSchema.index({ van: 1, date: 1 });

export default mongoose.model('Handoff', handoffSchema);
