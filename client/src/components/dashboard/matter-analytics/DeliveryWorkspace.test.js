import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

import api from '../../../utils/api';
import DeliveryWorkspace from './DeliveryWorkspace';
import WorkspaceChart, { labelSteps } from './WorkspaceChart';
import { groupHours, groupDays } from '../../../utils/deliveryTimingModel';

// react-router v7 ships an `exports` map that CRA's Jest cannot resolve, so it is mocked.
jest.mock('react-router-dom', () => ({ useNavigate: () => jest.fn() }), { virtual: true });
jest.mock('../../../utils/api', () => ({ __esModule: true, default: { get: jest.fn() } }));

global.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = window.matchMedia || ((query) => ({
  matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
}));
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});

const TODAY = '2026-10-10';
const hours = Array.from({ length: 24 }, (_, hour) => ({
  hour, early: hour === 6 ? 2 : 0, on: hour === 6 ? 9 : 0, late: hour === 6 ? 1 : 0, unknown: hour === 9 ? 3 : 0,
  total: hour === 6 ? 12 : hour === 9 ? 3 : 0,
}));
const overview = {
  days: [{ day: TODAY, early: 2, on: 9, late: 1, unknown: 3, total: 15 }],
  hours,
  lateness: { median: 22, over: { 15: 1, 30: 0, 60: 0 } },
  facets: { zones: ['JVC', 'Marina'], drivers: [{ id: 'd1', name: 'Ali Driver' }], statuses: ['delivered', 'pending'] },
  updatedAt: '2026-10-10T08:00:00.000Z',
};
const row = (id, timing) => ({
  _id: id, customerName: `Customer ${id}`, customerId: `C${id}`, zone: 'JVC', driverName: 'Ali Driver', status: 'delivered',
  timing, varianceMinutes: timing === 'late' ? 12 : 0, scheduledTime: '2026-10-10T02:00:00Z', deliveredTime: '2026-10-10T02:12:00Z',
});

let container;
let root;
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const mount = async (ui) => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(ui); });
  await flush();
};
const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await flush(); };
const text = () => document.body.textContent;

beforeEach(() => {
  api.get.mockReset();
  api.get.mockImplementation((url, { params }) => {
    if (url === '/deliveries/timing-history') return Promise.resolve({ data: { data: overview } });
    const records = params.timing === 'late' ? [row(3, 'late')] : [row(1, 'on'), row(2, 'early'), row(3, 'late')];
    return Promise.resolve({ data: { data: { records, total: records.length, pages: 1, page: 1, counts: { early: 2, on: 9, late: 1, unknown: 3, total: 15 } } } });
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.body.innerHTML = '';
});

describe('DeliveryWorkspace', () => {
  test('renders the delivery overview from the API: metrics, coverage, table, chart', async () => {
    await mount(<DeliveryWorkspace today={TODAY} />);
    expect(text()).toContain('Delivery overview');
    expect(text()).toContain('Total deliveries');
    expect(text()).toContain('15');                       // total
    expect(text()).toContain('75.0%');                    // 9 on time of 12 recorded
    expect(text()).toContain('12 of 15 records have accepted timing');
    expect(text()).toContain('Deliveries by scheduled hour');
    expect(document.querySelectorAll('.mo-chart-column')).toHaveLength(24);
    expect(document.querySelectorAll('.mo-ws-table tbody tr')).toHaveLength(3);
    expect(document.querySelector('.mo-ws-table').textContent).toContain('Ali Driver');
    expect([...document.querySelectorAll('.mo-filters option')].map((o) => o.textContent)).toEqual(
      expect.arrayContaining(['JVC', 'Marina', 'Ali Driver', 'delivered', 'pending'])
    );
  });

  test('puts the date navigation in the top-bar slot when the layout provides one', async () => {
    const slot = document.createElement('div');
    slot.id = 'mo-header-slot';
    document.body.appendChild(slot);
    await mount(<DeliveryWorkspace today={TODAY} />);
    expect(slot.querySelector('.mo-ws-controls')).not.toBeNull();
    expect(slot.textContent).toContain('Dubai time');
    expect(document.querySelector('.mo-ws-head .mo-ws-controls')).toBeNull();
    expect(document.querySelector('.mo-ws-head').textContent).toContain('Export CSV');
  });

  test('without a slot the controls fall back into the page header', async () => {
    await mount(<DeliveryWorkspace today={TODAY} />);
    expect(document.querySelector('.mo-ws-head .mo-ws-controls')).not.toBeNull();
  });

  test('selecting a chart segment narrows the table only, not the metrics', async () => {
    await mount(<DeliveryWorkspace today={TODAY} />);
    const historyCalls = () => api.get.mock.calls.filter(([url]) => url === '/deliveries/timing-history').length;
    const before = historyCalls();
    const segment = document.querySelector('.mo-chart-column:nth-child(7) .mo-segment.mo-late');
    await click(segment);
    const lastRecords = api.get.mock.calls.filter(([url]) => url === '/deliveries/timing-records').pop()[1].params;
    expect(lastRecords).toMatchObject({ hour: 6, timing: 'late', start: TODAY, end: TODAY });
    expect(historyCalls()).toBe(before);                  // overview untouched
    expect(text()).toContain('Table only');
    expect(document.querySelectorAll('.mo-ws-table tbody tr')).toHaveLength(1);
  });

  test('timing tabs and filters send the right query', async () => {
    await mount(<DeliveryWorkspace today={TODAY} />);
    const tab = [...document.querySelectorAll('.mo-timing-tabs button')].find((b) => b.textContent === 'Missing timing');
    await click(tab);
    expect(api.get.mock.calls.filter(([url]) => url === '/deliveries/timing-records').pop()[1].params.timing).toBe('unknown');

    const zone = document.querySelector('select[aria-label="Record zone"]');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(zone, 'Marina');
      zone.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();
    const historyParams = api.get.mock.calls.filter(([url]) => url === '/deliveries/timing-history').pop()[1].params;
    expect(historyParams).toMatchObject({ zone: 'Marina' });
  });

  test('opening a row shows the record panel with zone, driver and a customer link', async () => {
    await mount(<DeliveryWorkspace today={TODAY} />);
    await click(document.querySelector('.mo-ws-table tbody tr td button'));
    const panel = document.querySelector('.mo-detail');
    expect(panel).not.toBeNull();
    expect(panel.textContent).toContain('Customer 1');
    expect(panel.textContent).toContain('Ali Driver');
    expect(panel.textContent).toContain('View customer records');
  });

  test('a failed history load clears stale numbers and offers a retry', async () => {
    await mount(<DeliveryWorkspace today={TODAY} />);
    api.get.mockImplementation(() => Promise.reject(new Error('boom')));
    const preset = [...document.querySelectorAll('.mo-menu-list button, .mo-card-menu button')].find((b) => b.textContent.includes('Delivery period') || b.getAttribute('aria-label')?.startsWith('Delivery period'));
    await click(preset);
    const sevenDays = [...document.querySelectorAll('.mo-menu-list button')].find((b) => b.textContent.startsWith('7 days'));
    await click(sevenDays);
    expect(text()).toContain('Could not load delivery data.');
    expect(text()).toContain('Delivery data is unavailable.');
    expect(text()).toContain('Retry');
  });
});

describe('WorkspaceChart', () => {
  const noop = () => {};

  test('label thinning keeps about 15 labels on wide and 6 on narrow screens', () => {
    expect(labelSteps(24)).toEqual({ wide: 2, narrow: 4 });
    expect(labelSteps(7)).toEqual({ wide: 1, narrow: 2 });
    expect(labelSteps(30)).toEqual({ wide: 2, narrow: 5 });
    expect(labelSteps(90)).toEqual({ wide: 6, narrow: 15 });
  });

  test('hourly chart stacks missing timing, daily chart does not', async () => {
    await mount(<WorkspaceChart grouped={groupHours(hours, TODAY)} selectedKey={null} selectedTiming="all" onSelect={noop} />);
    expect(document.querySelectorAll('.mo-segment.mo-unknown')).toHaveLength(1);
    await act(async () => root.unmount());
    container.remove();

    const days = [{ day: '2026-10-01', early: 1, on: 4, late: 1, unknown: 2, total: 8 }];
    await mount(<WorkspaceChart grouped={groupDays(days, { start: '2026-10-01', end: '2026-10-05' })} selectedKey={null} selectedTiming="all" onSelect={noop} />);
    expect(document.querySelectorAll('.mo-segment.mo-unknown')).toHaveLength(0);
    expect(document.querySelectorAll('.mo-segment')).toHaveLength(3);
  });

  test('every bucket stays selectable even when its label is thinned', async () => {
    const onSelect = jest.fn();
    await mount(<WorkspaceChart grouped={groupHours(hours, TODAY)} selectedKey={null} selectedTiming="all" onSelect={onSelect} />);
    const labels = [...document.querySelectorAll('.mo-period-label')];
    expect(labels).toHaveLength(24);
    expect(labels.filter((l) => l.classList.contains('mo-skip'))).toHaveLength(12);
    await click(labels[7]);                                // a thinned label is still a button
    expect(onSelect).toHaveBeenCalledWith('all', expect.objectContaining({ hour: 7 }));
  });

  test('chart fits its container: no fixed bucket width', async () => {
    await mount(<WorkspaceChart grouped={groupHours(hours, TODAY)} selectedKey="x" selectedTiming="all" onSelect={noop} />);
    expect(document.querySelector('.mo-count-columns')).not.toBeNull();
    expect(document.querySelector('.mo-count-columns').style.width).toBe('');
  });
});
