import Delivery from '../models/Delivery.js';

// Fields that, when edited on a delivery, should surface a "this changed"
// banner to whichever driver ends up assigned to it. Deliberately a subset
// of what CAN be edited — e.g. `driver`/`status` changes already have their
// own dedicated push notifications elsewhere, and `customerId`/`company`
// aren't driver-facing.
//
// Shared by every route that can mutate an existing delivery's
// customer-facing fields — routes/deliveries.js (dispatcher edit + pin
// update) and routes/deliveryChanges.js (the "Delivery Change" upload/apply
// flow, which has its own separate update path). Keeping this in one place
// means a new edit route automatically stays correct instead of silently
// missing the flag the way deliveryChanges.js originally did.
export const CHANGE_TRACKED_FIELDS = [
  'customerName',
  'address',
  'addressDetails',
  'zone',
  'scheduledTime',
  'notes',
  'gpsLocation',
];

const CHANGE_FIELD_LABELS = {
  customerName: 'Customer name',
  address: 'Address',
  addressDetails: 'Address details',
  zone: 'Zone',
  scheduledTime: 'Time window',
  notes: 'Notes',
  gpsLocation: 'Pin location',
};

export function buildChangeNote(changedFields) {
  return changedFields.map((f) => CHANGE_FIELD_LABELS[f] || f).join(', ') + ' updated';
}

// Compares `originalDoc` (the delivery as it was BEFORE this update) against
// `updatedFields` (the delivery's fields AFTER — either a partial fields
// object already in final DB-ready shape, or a full updated document/plain
// object) and, if anything driver-relevant actually changed, sets
// `changeFlag`. Deliberately NOT gated on a driver already being assigned:
// a delivery can get edited (e.g. via a Delivery Change upload) before
// anyone is assigned to it, and the flag should still be there waiting —
// visible to whichever driver ends up assigned, whenever that happens —
// rather than only counting edits made after assignment.
export async function flagDeliveryChangeIfNeeded(originalDoc, updatedFields) {
  if (!originalDoc?._id) return;

  const changedFields = CHANGE_TRACKED_FIELDS.filter((field) =>
    Object.prototype.hasOwnProperty.call(updatedFields, field) &&
    JSON.stringify(originalDoc[field]) !== JSON.stringify(updatedFields[field])
  );
  if (changedFields.length === 0) return;

  await Delivery.findByIdAndUpdate(originalDoc._id, {
    $set: {
      changeFlag: {
        active: true,
        changedAt: new Date(),
        changedFields,
        note: buildChangeNote(changedFields),
        acknowledgedAt: null,
        acknowledgedBy: null,
      },
    },
  });
}
