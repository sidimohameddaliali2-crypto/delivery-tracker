import { Expo } from 'expo-server-sdk';
import User from '../models/User.js';

const expo = new Expo();

const formatTime = (scheduledTime) => {
  if (!scheduledTime) return '';
  const date = new Date(scheduledTime);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

const COPY = {
  delivery_created: (delivery) => {
    const time = formatTime(delivery.scheduledTime);
    return {
      title: 'New delivery assigned',
      body: `${delivery.customerName || 'A customer'} — ${delivery.zone || delivery.address || 'no zone'}${time ? `, ${time}` : ''}`
    };
  },
  delivery_reassigned: (delivery) => ({
    title: 'Delivery reassigned to you',
    body: `${delivery.customerName || 'A customer'} — ${delivery.zone || delivery.address || 'no zone'}`
  }),
  delivery_removed: (delivery) => ({
    title: 'Delivery removed from your list',
    body: `${delivery.customerName || 'A delivery'} was reassigned to another driver`
  }),
  delivery_updated: (delivery) => ({
    title: 'Delivery updated',
    body: `${delivery.customerName || 'A delivery'}: status changed to ${delivery.status}`
  })
};

/**
 * Send an Expo push notification to every device registered to a driver.
 * Self-contained (does its own DB lookup) and never throws past its own
 * boundary — callers should fire this with `.catch(...)`, never `await`
 * it in a way that would block the HTTP response, same pattern as
 * `sendAndLogSlack`.
 *
 * @param {Object} params
 * @param {string} params.driverId
 * @param {'delivery_created'|'delivery_reassigned'|'delivery_removed'|'delivery_updated'} params.type
 * @param {Object} params.delivery - plain delivery fields used for message copy (customerName, zone, address, deliveryTime, status) and the deep-link id (_id)
 */
export async function sendDeliveryPushToDriver({ driverId, type, delivery }) {
  try {
    if (!driverId) return;

    const user = await User.findById(driverId).select('pushTokens');
    if (!user || !user.pushTokens || user.pushTokens.length === 0) return;

    const buildCopy = COPY[type];
    if (!buildCopy) {
      console.warn('pushNotificationService: unknown notification type', type);
      return;
    }
    const { title, body } = buildCopy(delivery);

    const validTokens = user.pushTokens
      .map((entry) => entry.token)
      .filter((token) => Expo.isExpoPushToken(token));

    if (validTokens.length === 0) return;

    const messages = validTokens.map((token) => ({
      to: token,
      sound: 'default',
      title,
      body,
      data: { type, deliveryId: delivery._id?.toString?.() || String(delivery._id) }
    }));

    const chunks = expo.chunkPushNotifications(messages);
    const staleTokens = [];

    for (const chunk of chunks) {
      try {
        const tickets = await expo.sendPushNotificationsAsync(chunk);
        tickets.forEach((ticket, i) => {
          if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
            staleTokens.push(chunk[i].to);
          }
        });
      } catch (chunkError) {
        console.warn('pushNotificationService: chunk send failed:', chunkError?.message || chunkError);
      }
    }

    if (staleTokens.length > 0) {
      await User.findByIdAndUpdate(driverId, {
        $pull: { pushTokens: { token: { $in: staleTokens } } }
      });
    }
  } catch (error) {
    console.warn('pushNotificationService: failed to send push:', error?.message || error);
  }
}
