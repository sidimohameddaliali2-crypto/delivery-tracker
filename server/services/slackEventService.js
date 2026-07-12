/**
 * Slack notification service for Events
 * Uses the incoming webhook configured in SLACK_EVENTS_WEBHOOK_URL
 */

import axios from 'axios';

const formatDate = (dateStr) =>
  new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

const post = async (payload) => {
  const webhookUrl = process.env.SLACK_EVENTS_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn('⚠️  SLACK_EVENTS_WEBHOOK_URL not set — event Slack notifications disabled.');
    return;
  }
  if (process.env.ENABLE_SLACK_NOTIFICATIONS === '0') return;
  try {
    await axios.post(webhookUrl, payload, { timeout: 8000 });
  } catch (err) {
    console.error('❌ Slack event notification error:', err.message);
  }
};

// ─────────────────────────────────────────────
// New event created
// ─────────────────────────────────────────────
export const notifyEventCreated = async (event) => {
  const equipment = event.logistics?.equipment?.length > 0
    ? event.logistics.equipment.map((e) => `• ${e.name}${e.quantity > 1 ? ` ×${e.quantity}` : ''}`).join('\n')
    : null;

  const food = event.logistics?.food?.length > 0
    ? event.logistics.food.map((f) => `• ${f.name}${f.quantity > 1 ? ` ×${f.quantity}` : ''}`).join('\n')
    : null;

  const staff = event.logistics?.staffNames?.filter(Boolean).join(', ') || null;

  const fields = [
    { type: 'mrkdwn', text: `*Company*\n${event.companyName}` },
    { type: 'mrkdwn', text: `*Date*\n${formatDate(event.eventDate)}` },
    { type: 'mrkdwn', text: `*Arrival Time*\n${event.arrivalTime}` },
    { type: 'mrkdwn', text: `*Emirate*\n${event.emirate}` },
    { type: 'mrkdwn', text: `*Venue*\n${event.venue?.address || '—'}${event.venue?.area ? ` (${event.venue.area})` : ''}` },
    event.venue?.type ? { type: 'mrkdwn', text: `*Venue Type*\n${event.venue.type}` } : null,
    event.logistics?.numberOfPeople ? { type: 'mrkdwn', text: `*Staff Needed*\n${event.logistics.numberOfPeople} people${staff ? `\n${staff}` : ''}` } : null,
  ].filter(Boolean);

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '🎉 New Event Created', emoji: true },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*${event.eventName}*` },
    },
    { type: 'section', fields: fields.slice(0, 4) },
  ];

  if (fields.length > 4) {
    blocks.push({ type: 'section', fields: fields.slice(4) });
  }

  if (equipment) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*🔧 Equipment*\n${equipment}` },
    });
  }

  if (food) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*🍽️ Food*\n${food}` },
    });
  }

  if (event.logistics?.specialRequests) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*⭐ Special Requests*\n${event.logistics.specialRequests}` },
    });
  }

  if (event.notes) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*📝 Notes*\n${event.notes}` },
    });
  }

  blocks.push({ type: 'divider' });

  await post({ blocks });
  console.log('✅ Slack: event creation notification sent');
};

// ─────────────────────────────────────────────
// Status changed
// ─────────────────────────────────────────────
export const notifyEventStatusChange = async (event, oldStatus, newStatus) => {
  const statusEmoji = {
    pending: '🕐',
    assigned: '🚗',
    in_progress: '🔄',
    completed: '✅',
    cancelled: '❌',
  };

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `${statusEmoji[newStatus] || '🔄'} Event Status Updated`, emoji: true },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Event*\n${event.eventName}` },
        { type: 'mrkdwn', text: `*Company*\n${event.companyName}` },
        { type: 'mrkdwn', text: `*Date*\n${formatDate(event.eventDate)}` },
        { type: 'mrkdwn', text: `*Status*\n~${oldStatus}~ → *${newStatus}*` },
        event.driverName ? { type: 'mrkdwn', text: `*Driver*\n${event.driverName}` } : null,
      ].filter(Boolean),
    },
    { type: 'divider' },
  ];

  await post({ blocks });
  console.log(`✅ Slack: status change notification sent (${oldStatus} → ${newStatus})`);
};
