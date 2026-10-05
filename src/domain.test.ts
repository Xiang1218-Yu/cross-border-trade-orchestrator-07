import assert from 'node:assert/strict';
import test from 'node:test';
import { allocateOrder, addShipmentEvent, calculateShipmentEta, confirmOrder, createCustomsDeclaration, createOrder, createRoutePlan, decideApproval, dispatchOrder, generateInvoice, getShipment, lockRoutePlan, operationSummary, publishRoutePlan, recordPayment, replaceRoutePlanLeg, replanRoutePlan, state, updateCustoms } from './domain.js';

function readyOrder(reference: string, priority: 'standard' | 'urgent' | 'critical' = 'standard') {
  const order = createOrder('tenant-acme', { customerId: 'CUS-001', reference: `${reference}-${Date.now()}-${Math.random()}`, origin: '上海', destination: '鹿特丹', priority, items: [{ description: '传感器', sku: 'SENSOR-X9', quantity: 1, unitPrice: 100, weightKg: 1, hsCode: '9025.19' }] });
  confirmOrder('tenant-acme', order.id, 'tester');
  allocateOrder('tenant-acme', order.id, 'tester');
  const declaration = createCustomsDeclaration('tenant-acme', { orderId: order.id });
  updateCustoms('tenant-acme', declaration.id, { documentRefs: declaration.requiredDocuments, status: 'submitted' }, 'tester');
  updateCustoms('tenant-acme', declaration.id, { status: 'cleared' }, 'tester');
  return order;
}

test('order lifecycle preserves credit, inventory, customs, shipment and invoice invariants', () => {
  const order = createOrder('tenant-acme', { customerId: 'CUS-001', reference: `TEST-${Date.now()}`, origin: '上海', destination: '汉堡', items: [{ description: '传感器', sku: 'SENSOR-X9', quantity: 2, unitPrice: 100, weightKg: 1, hsCode: '9025.19' }] });
  assert.equal(order.status, 'draft');
  confirmOrder('tenant-acme', order.id, 'tester');
  allocateOrder('tenant-acme', order.id, 'tester');
  const declaration = createCustomsDeclaration('tenant-acme', { orderId: order.id });
  updateCustoms('tenant-acme', declaration.id, { documentRefs: declaration.requiredDocuments, status: 'submitted' }, 'tester');
  updateCustoms('tenant-acme', declaration.id, { status: 'cleared' }, 'tester');
  const dispatched = dispatchOrder('tenant-acme', order.id, 'tester');
  assert.equal(dispatched.status, 'dispatched');
  const invoice = generateInvoice('tenant-acme', order.id, 'tester');
  assert.ok(invoice.total > invoice.subtotal);
  recordPayment('tenant-acme', { invoiceId: invoice.id, amount: invoice.total, method: 'bank_transfer', reference: `PAY-${Date.now()}` }, 'tester');
  assert.equal(state.invoices.find(item => item.id === invoice.id)?.status, 'paid');
});

test('credit overage creates approval and approval increases only the required limit', () => {
  const order = createOrder('tenant-acme', { customerId: 'CUS-002', reference: `CREDIT-${Date.now()}`, origin: '深圳', destination: '洛杉矶', items: [{ description: '控制模块', sku: 'CONTROL-M2', quantity: 10, unitPrice: 420, weightKg: 2, hsCode: '8537.10' }] });
  assert.throws(() => confirmOrder('tenant-acme', order.id, 'tester'), /需要审批/);
  const approval = state.approvals.find(item => item.orderId === order.id && item.type === 'credit_override');
  assert.ok(approval);
  decideApproval('tenant-acme', approval!.id, { status: 'approved', comment: '额度复核通过' }, 'finance');
  assert.doesNotThrow(() => confirmOrder('tenant-acme', order.id, 'finance'));
});

test('operation summary exposes receivable and reservation metrics', () => {
  const summary = operationSummary('tenant-acme');
  assert.ok(summary.orderCount >= 1);
  assert.ok(summary.receivable >= 0);
  assert.ok(summary.inventory.every(item => item.available >= item.reserved));
});

test('route plans create multimodal legs, lock and publish one current version idempotently', () => {
  const order = readyOrder('ROUTE');
  const draft = createRoutePlan('tenant-acme', { orderId: order.id, startAt: '2026-10-05T00:00:00.000Z' });
  assert.equal(draft.version, 1);
  assert.equal(draft.status, 'draft');
  assert.ok(draft.legs.length >= 3);
  assert.deepEqual(draft.legs.map(leg => leg.mode), ['truck', 'sea', 'truck']);
  assert.ok(draft.localEta.endsWith('[Europe/Amsterdam]'));
  assert.ok(draft.milestones.every(milestone => !milestone.immutable));
  assert.throws(() => createRoutePlan('tenant-acme', { orderId: order.id }), /未归档/);
  assert.throws(() => publishRoutePlan('tenant-acme', draft.id), /锁定/);
  const locked = lockRoutePlan('tenant-acme', draft.id, { expectedVersion: 1 });
  assert.equal(locked.status, 'locked');
  const published = publishRoutePlan('tenant-acme', draft.id, { expectedVersion: 1 });
  assert.equal(published.plan.status, 'published');
  assert.equal(published.shipment.routeVersion, 1);
  const repeated = publishRoutePlan('tenant-acme', draft.id);
  assert.equal(repeated.plan.id, draft.id);
  assert.equal(repeated.shipment.routeVersion, 1);
  const dispatchEvents = state.outbox.filter(event => event.aggregateId === draft.id && event.topic === 'route_plan.published');
  assert.equal(dispatchEvents.length, 1);
});

test('replanning preserves departed milestones, advances ETA and makes old version unconfirmable', () => {
  const order = readyOrder('REPLAN');
  const v1 = publishRoutePlan('tenant-acme', lockRoutePlan('tenant-acme', createRoutePlan('tenant-acme', { orderId: order.id, startAt: '2026-10-05T00:00:00.000Z' }).id, { expectedVersion: 1 }).id, { expectedVersion: 1 });
  const shipmentId = v1.shipment.id;
  const firstLeg = v1.shipment.legs[0];
  addShipmentEvent('tenant-acme', shipmentId, { code: 'DEPARTED', location: firstLeg.origin, legId: firstLeg.id, expectedVersion: 1, occurredAt: '2026-10-05T01:00:00.000Z' }, 'tester');
  addShipmentEvent('tenant-acme', shipmentId, { code: 'ARRIVED', location: firstLeg.destination, legId: firstLeg.id, occurredAt: '2026-10-05T19:00:00.000Z' }, 'tester');
  const v2 = replanRoutePlan('tenant-acme', v1.plan.id, { expectedVersion: 1, reason: '海运跳港' });
  assert.equal(v2.version, 2);
  assert.equal(v2.basedOnVersion, 1);
  assert.equal(v2.legs[0].id, firstLeg.id);
  assert.equal(v2.legs[0].actualArrival, '2026-10-05T19:00:00.000Z');
  assert.notEqual(v2.legs[1].id, v1.shipment.legs[1].id);
  assert.ok(v2.milestones.find(milestone => milestone.legId === firstLeg.id && milestone.code === 'ARRIVED')?.immutable);
  const locked = lockRoutePlan('tenant-acme', v2.id, { expectedVersion: 2 });
  publishRoutePlan('tenant-acme', locked.id, { expectedVersion: 2 });
  const shipment = getShipment('tenant-acme', shipmentId);
  assert.equal(shipment.routeVersion, 2);
  assert.equal(shipment.legs[0].actualArrival, '2026-10-05T19:00:00.000Z');
  assert.throws(() => publishRoutePlan('tenant-acme', v1.plan.id), /已被新版本替代/);
});

test('actual milestones cannot be overwritten and delayed actual departures roll ETA through modes and time zones', () => {
  const order = readyOrder('ETA', 'urgent');
  const { plan, shipment } = publishRoutePlan('tenant-acme', lockRoutePlan('tenant-acme', createRoutePlan('tenant-acme', { orderId: order.id, startAt: '2026-10-05T00:00:00.000Z' }).id, { expectedVersion: 1 }).id, { expectedVersion: 1 });
  const firstLeg = plan.legs[0];
  addShipmentEvent('tenant-acme', shipment.id, { code: 'DEPARTED', location: firstLeg.origin, legId: firstLeg.id, occurredAt: '2026-10-05T00:00:00.000Z' }, 'tester');
  addShipmentEvent('tenant-acme', shipment.id, { code: 'DELAYED', location: firstLeg.origin, legId: firstLeg.id, delayMinutes: 120 }, 'tester');
  const projection = calculateShipmentEta('tenant-acme', shipment.id);
  assert.equal(projection.source, 'reported_delay');
  assert.equal(projection.delayMinutes, 120);
  assert.ok(projection.crossesTimeZones);
  assert.ok((projection.modeHours.rail ?? 0) > (projection.modeHours.truck ?? 0));
  assert.equal(plan.version, 1);
  assert.throws(() => addShipmentEvent('tenant-acme', shipment.id, { code: 'DEPARTED', location: firstLeg.origin, legId: firstLeg.id }), /不能.*覆盖/);
  assert.throws(() => replanRoutePlan('tenant-acme', plan.id, { expectedVersion: 2 }), /版本已变化/);
});

test('publishing before customs clearance fails without changing plan, shipment or outbox', () => {
  const order = createOrder('tenant-acme', { customerId: 'CUS-001', reference: `BLOCKED-${Date.now()}`, origin: '上海', destination: '鹿特丹', items: [{ description: '传感器', sku: 'SENSOR-X9', quantity: 1, unitPrice: 100, weightKg: 1, hsCode: '9025.19' }] });
  confirmOrder('tenant-acme', order.id); allocateOrder('tenant-acme', order.id);
  const plan = lockRoutePlan('tenant-acme', createRoutePlan('tenant-acme', { orderId: order.id }).id);
  const shipmentsBefore = state.shipments.length;
  const outboxBefore = state.outbox.length;
  assert.throws(() => publishRoutePlan('tenant-acme', plan.id), /海关申报尚未放行/);
  assert.equal(state.shipments.length, shipmentsBefore);
  assert.equal(state.outbox.length, outboxBefore);
  assert.equal(state.routePlans.find(item => item.id === plan.id)?.status, 'locked');
});

test('a draft leg can be replaced and downstream legs reschedule as a connected chain', () => {
  const order = readyOrder('LEG');
  const draft = createRoutePlan('tenant-acme', { orderId: order.id, startAt: '2026-10-05T00:00:00.000Z' });
  const seaLeg = draft.legs.find(leg => leg.mode === 'sea')!;
  const changed = replaceRoutePlanLeg('tenant-acme', draft.id, { legId: seaLeg.id, mode: 'rail', expectedVersion: 1 });
  const rail = changed.legs.find(leg => leg.mode === 'rail')!;
  assert.equal(rail.origin, seaLeg.origin);
  assert.equal(rail.destination, seaLeg.destination);
  assert.equal(changed.legs[0].destination, rail.origin);
  assert.equal(changed.legs[2].origin, rail.destination);
  assert.notEqual(rail.id, seaLeg.id);
  assert.ok(new Date(changed.eta).getTime() !== new Date(draft.eta).getTime());
});
