// Fixed, non-configurable selection-deadline policy for weekly menus.
//
// Each delivery day's meal selection locks a fixed number of calendar days
// before the delivery date, at a fixed time — this is a company-wide rule,
// not something set per menu. Every weekly menu gets exactly this table on
// create (see routes/menus.js POST /), and it's re-applied on every update
// too, so it can never drift or be hand-edited into something inconsistent.
//
//   Monday    -> locks the preceding Friday    at 15:00 (3 days before)
//   Tuesday   -> locks the preceding Sunday    at 00:00 (2 days before)
//   Wednesday -> locks the preceding Monday    at 00:00 (2 days before)
//   Thursday  -> locks the preceding Tuesday   at 00:00 (2 days before)
//   Friday    -> locks the preceding Wednesday at 00:00 (2 days before)
//   Saturday  -> locks the preceding Wednesday at 00:00 (3 days before)
//   Sunday    -> locks the preceding Wednesday at 00:00 (4 days before)
//
// `daysBefore` + `deadlineTime` follow WeeklyMenu.selectionDeadlines' shape
// (see models/WeeklyMenu.js): the deadline instant is
// (delivery date - daysBefore calendar days) at deadlineTime, local time.
export const FIXED_SELECTION_DEADLINES = [
  { deliveryDay: 'Monday', daysBefore: 3, deadlineTime: '15:00' },
  { deliveryDay: 'Tuesday', daysBefore: 2, deadlineTime: '00:00' },
  { deliveryDay: 'Wednesday', daysBefore: 2, deadlineTime: '00:00' },
  { deliveryDay: 'Thursday', daysBefore: 2, deadlineTime: '00:00' },
  { deliveryDay: 'Friday', daysBefore: 2, deadlineTime: '00:00' },
  { deliveryDay: 'Saturday', daysBefore: 3, deadlineTime: '00:00' },
  { deliveryDay: 'Sunday', daysBefore: 4, deadlineTime: '00:00' },
];
