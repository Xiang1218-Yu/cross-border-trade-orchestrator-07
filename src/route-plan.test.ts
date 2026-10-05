import assert from 'node:assert/strict';
import test from 'node:test';
import { addShipmentEvent, allocateOrder, confirmOrder, createCustomsDeclaration, createOrder, createRoutePlan, dispatchOrder, getOrderRoute, listRoutePlans, lockRoutePlan, publishRoutePlan, replanRoutePlan, replaceRouteLeg, state, timeline, updateCustoms } from './domain.js';

const TENANT = 'tenant-acme';
let seq = 0;
function newOrder(priority: 'standard' | 'urgent' | 'critical' = 'urgent') {
  const order = createOrder(TENANT, { customerId: 'CUS-001', reference: `RPL-${Date.now()}-${seq++}`, origin: '上海保税区', destination: '鹿特丹', priority, items: [{ sku: 'SENSOR-X9', description: '传感器', quantity: 1, unitPrice: 100, weightKg: 2, hsCode: '9025.19' }] });
  confirmOrder(TENANT, order.id, 'test');
  allocateOrder(TENANT, order.id, 'test');
  return order;
}
function clearCustoms(orderId: string) {
  const declaration = createCustomsDeclaration(TENANT, { orderId });
  updateCustoms(TENANT, declaration.id, { documentRefs: declaration.requiredDocuments, status: 'submitted' }, 'test');
  updateCustoms(TENANT, declaration.id, { status: 'cleared' }, 'test');
}
function storedPlan(planId: string) { return state.routePlans.find(item => item.id === planId)!; }
function shipmentOf(orderId: string) { return state.shipments.find(item => item.orderId === orderId)!; }

test('route plan lifecycle: create, replace leg, lock, publish, then dispatch builds shipment from the plan', () => {
  const order = newOrder('urgent');
  clearCustoms(order.id);
  const plan = createRoutePlan(TENANT, order.id, {}, 'test');
  assert.equal(plan.status, 'draft');
  assert.equal(plan.version, 1);
  assert.equal(plan.legs[0].origin, '上海保税区');
  assert.equal(plan.legs[plan.legs.length - 1].destination, '鹿特丹');
  for (let index = 1; index < plan.legs.length; index++) assert.equal(plan.legs[index].origin, plan.legs[index - 1].destination);
  assert.equal(plan.eta, plan.legs[plan.legs.length - 1].forecastArrival);
  const sea = plan.legs.find(leg => leg.mode === 'sea')!;
  const fasterArrival = new Date(Date.parse(sea.plannedDeparture) + 120 * 3600000).toISOString();
  const adjusted = replaceRouteLeg(TENANT, plan.id, sea.id, { plannedArrival: fasterArrival }, 'test');
  assert.ok(Date.parse(adjusted.eta) < Date.parse(plan.eta), '缩短海运段后整体 ETA 应提前');
  assert.equal(lockRoutePlan(TENANT, plan.id, 'test').status, 'locked');
  const published = publishRoutePlan(TENANT, plan.id, 'test');
  assert.equal(published.status, 'published');
  dispatchOrder(TENANT, order.id, 'test');
  const shipment = shipmentOf(order.id);
  assert.equal(shipment.routePlanVersion, 1);
  assert.deepEqual(shipment.legs.map(leg => leg.mode), published.legs.map(leg => leg.mode));
  assert.equal(shipment.eta, published.eta);
  const route = getOrderRoute(TENANT, order.id);
  assert.equal(route.currentVersion, 1);
  assert.equal(route.shipment!.routePlanVersion, 1);
  assert.equal(route.eta, published.eta);
});

test('duplicate publish is idempotent and stale versions are rejected', () => {
  const order = newOrder();
  clearCustoms(order.id);
  const plan = createRoutePlan(TENANT, order.id, {}, 'test');
  lockRoutePlan(TENANT, plan.id, 'test');
  publishRoutePlan(TENANT, plan.id, 'test');
  const publishedEvents = () => state.outbox.filter(event => event.topic === 'route.plan.published' && event.aggregateId === plan.id).length;
  assert.equal(publishedEvents(), 1);
  const again = publishRoutePlan(TENANT, plan.id, 'test');
  assert.equal(again.status, 'published');
  assert.equal(publishedEvents(), 1, '重复发布不能产生重复 outbox 事件');
  const v2 = replanRoutePlan(TENANT, plan.id, { reason: '船期调整' }, 'test');
  assert.equal(v2.version, 2);
  assert.equal(v2.replannedFromVersion, 1);
  assert.throws(() => lockRoutePlan(TENANT, plan.id, 'test'), /最新版本/, '旧版本不能再确认');
  const stillCurrent = publishRoutePlan(TENANT, plan.id, 'test');
  assert.equal(stillCurrent.status, 'published', 'v2 发布前 v1 仍是当前方案，重复发布幂等');
  assert.equal(publishedEvents(), 1, '幂等发布不能产生重复 outbox 事件');
  lockRoutePlan(TENANT, v2.id, 'test');
  publishRoutePlan(TENANT, v2.id, 'test');
  assert.equal(storedPlan(plan.id).status, 'superseded');
  assert.equal(getOrderRoute(TENANT, order.id).currentVersion, 2);
  assert.throws(() => publishRoutePlan(TENANT, plan.id, 'test'), /已被取代/);
  assert.throws(() => replanRoutePlan(TENANT, plan.id, {}, 'test'), /旧版本/);
});

test('customs clearance is required before publishing a route plan to fulfillment', () => {
  const order = newOrder();
  const plan = createRoutePlan(TENANT, order.id, {}, 'test');
  lockRoutePlan(TENANT, plan.id, 'test');
  assert.throws(() => publishRoutePlan(TENANT, plan.id, 'test'), /海关/);
  assert.equal(storedPlan(plan.id).status, 'locked', '发布失败后方案保持锁定态');
  assert.equal(state.outbox.filter(event => event.topic === 'route.plan.published' && event.aggregateId === plan.id).length, 0);
  assert.equal(getOrderRoute(TENANT, order.id).currentVersion, null);
  clearCustoms(order.id);
  assert.equal(publishRoutePlan(TENANT, plan.id, 'test').status, 'published', '放行后可以发布');
});

test('replan after partial departure preserves occurred milestones and re-anchors the remaining route', () => {
  const order = newOrder('urgent');
  clearCustoms(order.id);
  const plan = createRoutePlan(TENANT, order.id, {}, 'test');
  lockRoutePlan(TENANT, plan.id, 'test');
  publishRoutePlan(TENANT, plan.id, 'test');
  dispatchOrder(TENANT, order.id, 'test');
  const shipment = shipmentOf(order.id);
  const first = plan.legs[0];
  const departedAt = new Date(Date.parse(first.plannedDeparture) + 3600000).toISOString();
  const arrivedAt = new Date(Date.parse(first.plannedArrival) + 2 * 3600000).toISOString();
  addShipmentEvent(TENANT, shipment.id, { code: 'DEPARTED', location: first.origin, occurredAt: departedAt }, 'test');
  addShipmentEvent(TENANT, shipment.id, { code: 'ARRIVED', location: first.destination, occurredAt: arrivedAt }, 'test');
  assert.equal(storedPlan(plan.id).legs[0].actualDeparture, departedAt);
  assert.equal(storedPlan(plan.id).legs[0].actualArrival, arrivedAt);
  assert.ok(Date.parse(storedPlan(plan.id).eta) > Date.parse(plan.eta), '首段延误应传导到整体 ETA');
  assert.equal(shipmentOf(order.id).eta, storedPlan(plan.id).eta);
  const v2 = replanRoutePlan(TENANT, plan.id, { reason: '目的港拥堵，改直飞' }, 'test');
  assert.equal(v2.legs[0].actualDeparture, departedAt, '新方案不能覆盖已发生的出发里程碑');
  assert.equal(v2.legs[0].actualArrival, arrivedAt, '新方案不能覆盖已发生的到达里程碑');
  assert.equal(v2.legs[0].frozen, true);
  assert.equal(v2.legs[0].origin, first.origin);
  assert.equal(v2.legs[v2.legs.length - 1].origin, first.destination, '剩余路段从货物实际所在位置重新编排');
  assert.equal(v2.legs[v2.legs.length - 1].destination, '鹿特丹');
  assert.throws(() => replaceRouteLeg(TENANT, v2.id, v2.legs[0].id, { mode: 'air' }, 'test'), /里程碑/);
  lockRoutePlan(TENANT, v2.id, 'test');
  publishRoutePlan(TENANT, v2.id, 'test');
  const view = shipmentOf(order.id);
  assert.equal(view.routePlanVersion, 2);
  assert.equal(view.legs[0].actualArrival, arrivedAt, 'shipment 视图保留已发生里程碑');
  assert.equal(view.eta, storedPlan(v2.id).eta);
  assert.equal(storedPlan(plan.id).status, 'superseded');
});

test('delay events propagate to eta, approvals, timeline and outbox with the same route version', () => {
  const order = newOrder('critical');
  clearCustoms(order.id);
  const plan = createRoutePlan(TENANT, order.id, {}, 'test');
  lockRoutePlan(TENANT, plan.id, 'test');
  publishRoutePlan(TENANT, plan.id, 'test');
  dispatchOrder(TENANT, order.id, 'test');
  const shipment = shipmentOf(order.id);
  const first = plan.legs[0];
  addShipmentEvent(TENANT, shipment.id, { code: 'DEPARTED', location: first.origin, occurredAt: first.plannedDeparture }, 'test');
  const etaBefore = storedPlan(plan.id).eta;
  addShipmentEvent(TENANT, shipment.id, { code: 'DELAYED', location: first.destination, delayMinutes: 360, note: '机场管制' }, 'test');
  assert.ok(Date.parse(storedPlan(plan.id).eta) >= Date.parse(etaBefore) + 360 * 60000 - 1, '延误时长应计入 ETA');
  const view = shipmentOf(order.id);
  assert.equal(view.eta, storedPlan(plan.id).eta, 'shipment 视图与方案 ETA 一致');
  assert.equal(view.status, 'exception');
  const approval = state.approvals.find(item => item.orderId === order.id && item.type === 'delay_compensation');
  assert.ok(approval, '延误应触发延误补偿审批');
  const entries = timeline(TENANT, order.id);
  assert.ok(entries.some(item => item.entityId === plan.id && item.action === 'route.plan.published'), '时间线包含路线方案记录');
  assert.ok(entries.some(item => item.entityId === approval.id), '时间线包含审批记录');
  const event = state.outbox.find(item => item.topic === 'shipment.event.added' && item.aggregateId === shipment.id);
  assert.equal((event!.payload as { routePlanVersion: number }).routePlanVersion, 1, 'outbox 携带当前路线版本');
});

test('failed replan keeps published plan, shipment view and outbox untouched', () => {
  const order = newOrder('standard');
  clearCustoms(order.id);
  const plan = createRoutePlan(TENANT, order.id, {}, 'test');
  lockRoutePlan(TENANT, plan.id, 'test');
  publishRoutePlan(TENANT, plan.id, 'test');
  dispatchOrder(TENANT, order.id, 'test');
  const shipment = shipmentOf(order.id);
  for (const leg of plan.legs) {
    addShipmentEvent(TENANT, shipment.id, { code: 'DEPARTED', location: leg.origin, occurredAt: leg.plannedDeparture }, 'test');
    addShipmentEvent(TENANT, shipment.id, { code: 'ARRIVED', location: leg.destination, occurredAt: leg.plannedArrival }, 'test');
  }
  assert.ok(storedPlan(plan.id).legs.every(leg => leg.status === 'arrived'));
  const etaBefore = storedPlan(plan.id).eta;
  const shipmentEtaBefore = shipmentOf(order.id).eta;
  const outboxBefore = state.outbox.length;
  const plansBefore = state.routePlans.length;
  assert.throws(() => replanRoutePlan(TENANT, plan.id, {}, 'test'), /无法重新规划/);
  assert.equal(state.routePlans.length, plansBefore, '失败的重新规划不能留下半成品版本');
  assert.equal(state.outbox.length, outboxBefore, '失败的重新规划不能产生 outbox 事件');
  assert.equal(storedPlan(plan.id).status, 'published');
  assert.equal(storedPlan(plan.id).eta, etaBefore);
  assert.equal(shipmentOf(order.id).eta, shipmentEtaBefore);
});

test('eta computation handles timezone offsets and date-line crossing', () => {
  const order = newOrder('critical');
  const plan = createRoutePlan(TENANT, order.id, { legs: [{ mode: 'air', origin: '上海保税区', destination: '鹿特丹', plannedDeparture: '2026-10-05T22:00:00+08:00', plannedArrival: '2026-10-06T09:30:00+02:00' }] }, 'test');
  assert.equal(plan.eta, '2026-10-06T07:30:00.000Z', 'ETA 按 UTC 归一计算');
  assert.equal(plan.legs[0].forecastArrivalLocal, '2026-10-06T09:30:00+02:00', '本地时间按计划到达的时区渲染');
  clearCustoms(order.id);
  lockRoutePlan(TENANT, plan.id, 'test');
  publishRoutePlan(TENANT, plan.id, 'test');
  dispatchOrder(TENANT, order.id, 'test');
  const shipment = shipmentOf(order.id);
  addShipmentEvent(TENANT, shipment.id, { code: 'DEPARTED', location: '上海保税区', occurredAt: '2026-10-06T00:30:00+08:00' }, 'test');
  assert.equal(storedPlan(plan.id).eta, '2026-10-06T10:00:00.000Z', '实际出发 + 计划时长（17.5h）= UTC ETA');
  assert.equal(storedPlan(plan.id).legs[0].forecastArrivalLocal, '2026-10-06T12:00:00+02:00');
  assert.equal(shipmentOf(order.id).eta, '2026-10-06T10:00:00.000Z');
  const plansBefore = state.routePlans.filter(item => item.orderId === order.id).length;
  assert.throws(() => createRoutePlan(TENANT, order.id, { legs: [{ mode: 'air', origin: '上海保税区', destination: '鹿特丹', plannedDeparture: '2026-10-06T09:30:00+02:00', plannedArrival: '2026-10-05T22:00:00+08:00' }] }, 'test'), /计划到达必须晚于计划出发/, '时区混淆导致到达早于出发的输入必须被拒绝');
  assert.equal(state.routePlans.filter(item => item.orderId === order.id).length, plansBefore, '非法输入不能留下版本');
});

test('leg replacement enforces draft status and route continuity atomically', () => {
  const order = newOrder();
  const plan = createRoutePlan(TENANT, order.id, {}, 'test');
  const middle = plan.legs[1];
  assert.throws(() => replaceRouteLeg(TENANT, plan.id, middle.id, { destination: '不存在的港口' }, 'test'), /不衔接/);
  assert.equal(storedPlan(plan.id).legs[1].destination, middle.destination, '校验失败时方案保持原样');
  lockRoutePlan(TENANT, plan.id, 'test');
  assert.throws(() => replaceRouteLeg(TENANT, plan.id, middle.id, { mode: 'air' }, 'test'), /草稿/);
  assert.equal(storedPlan(plan.id).legs[1].mode, middle.mode);
});

test('listRoutePlans returns every version newest first', () => {
  const order = newOrder();
  const v1 = createRoutePlan(TENANT, order.id, {}, 'test');
  const v2 = replanRoutePlan(TENANT, v1.id, { reason: '优化' }, 'test');
  const plans = listRoutePlans(TENANT, order.id);
  assert.deepEqual(plans.map(item => item.version), [2, 1]);
  assert.equal(plans[0].id, v2.id);
});
