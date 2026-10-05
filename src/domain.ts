import { randomUUID } from 'node:crypto';

export type OrderStatus = 'draft' | 'confirmed' | 'allocated' | 'dispatched' | 'delivered' | 'closed' | 'cancelled';
export type CustomsStatus = 'draft' | 'submitted' | 'inspection' | 'cleared' | 'rejected';
export type InvoiceStatus = 'issued' | 'partially_paid' | 'paid' | 'void';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type TransportMode = 'truck' | 'rail' | 'sea' | 'air';
export type RoutePlanStatus = 'draft' | 'locked' | 'published' | 'superseded';

type Tenant = { id: string; name: string; creditLimit: number; creditUsed: number; currency: string };
type Customer = { id: string; tenantId: string; name: string; creditLimit: number; creditUsed: number; blocked: boolean };
type OrderItem = { sku: string; description: string; quantity: number; unitPrice: number; weightKg: number; hsCode: string };
export type Order = { id: string; tenantId: string; customerId: string; reference: string; origin: string; destination: string; priority: 'standard' | 'urgent' | 'critical'; status: OrderStatus; items: OrderItem[]; totalWeightKg: number; subtotal: number; totalAmount: number; currency: string; version: number; shipmentId?: string; customsDeclarationId?: string; invoiceId?: string; createdAt: string; updatedAt: string };
type InventoryLot = { id: string; tenantId: string; warehouse: string; sku: string; available: number; reserved: number; lotCode: string; expiresAt?: string };
type Reservation = { id: string; tenantId: string; orderId: string; lotId: string; sku: string; quantity: number; status: 'active' | 'released' | 'consumed'; createdAt: string };
export type RoutePlanLeg = { id: string; sequence: number; mode: TransportMode; carrier: string; origin: string; destination: string; originTimeZone: string; destinationTimeZone: string; plannedDeparture: string; plannedArrival: string; localPlannedDeparture: string; localPlannedArrival: string; durationHours: number; layoverHoursAfter: number; actualDeparture?: string; actualArrival?: string; localActualDeparture?: string; localActualArrival?: string; delayMinutes?: number; status: 'planned' | 'in_transit' | 'arrived' | 'delayed' };
export type RouteMilestone = { id: string; code: 'DEPARTED' | 'ARRIVED' | 'DELAYED'; legId: string; sequence: number; location: string; timeZone: string; plannedAt: string; localPlannedAt: string; actualAt?: string; localActualAt?: string; kind: 'departure' | 'arrival' | 'exception'; immutable: boolean };
export type RouteProjection = { eta: string; localEta: string; finalTimeZone: string; source: 'planned' | 'actual' | 'actual_milestone' | 'reported_delay'; delayMinutes: number; totalElapsedHours: number; crossesTimeZones: boolean; modeHours: Partial<Record<TransportMode, number>>; projectedLegs: { legId: string; projectedDeparture: string; projectedArrival: string }[] };
export type RoutePlan = { id: string; tenantId: string; orderId: string; version: number; status: RoutePlanStatus; basedOnVersion?: number; reason?: string; origin: string; destination: string; priority: Order['priority']; legs: RoutePlanLeg[]; milestones: RouteMilestone[]; eta: string; localEta: string; totalTransitHours: number; createdAt: string; updatedAt: string; lockedAt?: string; publishedAt?: string; supersededByVersion?: number };
export type ShipmentLeg = RoutePlanLeg;
type ShipmentEvent = { id: string; code: string; location: string; occurredAt: string; note?: string; legId?: string; routePlanId?: string; routeVersion?: number; delayMinutes?: number };
type Shipment = { id: string; tenantId: string; orderId: string; trackingNo: string; routePlanId?: string; routeVersion?: number; legs: ShipmentLeg[]; milestones: RouteMilestone[]; currentLocation: string; eta: string; localEta?: string; etaContext?: RouteProjection; status: 'planned' | 'in_transit' | 'delivered' | 'exception'; events: ShipmentEvent[] };
type CustomsDeclaration = { id: string; tenantId: string; orderId: string; country: string; status: CustomsStatus; documentRefs: string[]; requiredDocuments: string[]; riskScore: number; rejectionReason?: string; updatedAt: string };
type InvoiceLine = { code: string; description: string; quantity: number; unitPrice: number; amount: number };
type Invoice = { id: string; tenantId: string; orderId: string; number: string; status: InvoiceStatus; currency: string; lines: InvoiceLine[]; subtotal: number; tax: number; total: number; paid: number; dueDate: string; createdAt: string };
type Payment = { id: string; tenantId: string; invoiceId: string; amount: number; method: 'bank_transfer' | 'card' | 'credit_note'; reference: string; receivedAt: string };
type Approval = { id: string; tenantId: string; orderId: string; type: 'credit_override' | 'customs_exception' | 'delay_compensation'; reason: string; status: ApprovalStatus; decidedBy?: string; comment?: string; shipmentId?: string; routePlanId?: string; routeVersion?: number; eta?: string; delayMinutes?: number; createdAt: string; decidedAt?: string };
export type AuditEvent = { id: string; tenantId: string; actor: string; action: string; entityType: string; entityId: string; before?: unknown; after?: unknown; at: string };
export type OutboxEvent = { id: string; tenantId: string; topic: string; aggregateId: string; payload: unknown; status: 'pending' | 'published'; attempts: number; createdAt: string };

type State = { tenants: Tenant[]; customers: Customer[]; orders: Order[]; inventory: InventoryLot[]; reservations: Reservation[]; routePlans: RoutePlan[]; shipments: Shipment[]; customs: CustomsDeclaration[]; invoices: Invoice[]; payments: Payment[]; approvals: Approval[]; audit: AuditEvent[]; outbox: OutboxEvent[] };
const now = () => new Date().toISOString();
const clone = <T>(value: T): T => structuredClone(value);
const id = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`;
const money = (value: number) => Math.round(value * 100) / 100;

export const state: State = {
  tenants: [{ id: 'tenant-acme', name: 'Acme Global Trading', creditLimit: 250000, creditUsed: 36200, currency: 'USD' }],
  customers: [{ id: 'CUS-001', tenantId: 'tenant-acme', name: 'Northstar Retail GmbH', creditLimit: 100000, creditUsed: 12000, blocked: false }, { id: 'CUS-002', tenantId: 'tenant-acme', name: 'Pacific Parts Inc.', creditLimit: 50000, creditUsed: 49000, blocked: false }],
  orders: [], inventory: [
    { id: 'LOT-001', tenantId: 'tenant-acme', warehouse: 'SHANGHAI-FTZ', sku: 'SENSOR-X9', available: 80, reserved: 10, lotCode: 'SX9-2608' },
    { id: 'LOT-002', tenantId: 'tenant-acme', warehouse: 'SHANGHAI-FTZ', sku: 'CONTROL-M2', available: 36, reserved: 4, lotCode: 'CM2-2607' },
    { id: 'LOT-003', tenantId: 'tenant-acme', warehouse: 'ROTTERDAM-DC', sku: 'SENSOR-X9', available: 12, reserved: 0, lotCode: 'SX9-2606' }
  ], reservations: [], routePlans: [], shipments: [], customs: [], invoices: [], payments: [], approvals: [], audit: [], outbox: []
};

function tenant(id: string) { const value = state.tenants.find(item => item.id === id); if (!value) throw new Error('租户不存在'); return value; }
function assertTenant<T extends { tenantId: string }>(item: T, tenantId: string) { if (item.tenantId !== tenantId) throw new Error('无权访问其他租户的数据'); return item; }
function customerFor(tenantId: string, customerId: string) { const customer = state.customers.find(item => item.id === customerId && item.tenantId === tenantId); if (!customer) throw new Error('客户不存在'); return customer; }
function orderFor(tenantId: string, orderId: string) { const order = state.orders.find(item => item.id === orderId); if (!order) throw new Error('订单不存在'); return assertTenant(order, tenantId); }
function record(tenantId: string, actor: string, action: string, entityType: string, entityId: string, before?: unknown, after?: unknown) { state.audit.unshift({ id: id('AUD'), tenantId, actor, action, entityType, entityId, before: before === undefined ? undefined : clone(before), after: after === undefined ? undefined : clone(after), at: now() }); }
function emit(tenantId: string, topic: string, aggregateId: string, payload: unknown) { state.outbox.unshift({ id: id('EVT'), tenantId, topic, aggregateId, payload: clone(payload), status: 'pending', attempts: 0, createdAt: now() }); }
function mutate(tenantId: string, actor: string, action: string, type: string, entityId: string, before: unknown, after: unknown, topic: string) { record(tenantId, actor, action, type, entityId, before, after); emit(tenantId, topic, entityId, after); }
function transition(order: Order, next: OrderStatus) { const allowed: Record<OrderStatus, OrderStatus[]> = { draft: ['confirmed', 'cancelled'], confirmed: ['allocated', 'cancelled'], allocated: ['dispatched', 'cancelled'], dispatched: ['delivered'], delivered: ['closed'], closed: [], cancelled: [] }; if (!allowed[order.status].includes(next)) throw new Error(`订单不能从 ${order.status} 变更为 ${next}`); order.status = next; order.version += 1; order.updatedAt = now(); }

const HOUR_MS = 3_600_000;
const timeZoneForPlace = (place: string) => {
  if (/上海|深圳|宁波|西安|中国|保税|洋山|浦东/.test(place)) return 'Asia/Shanghai';
  if (/新加坡/.test(place)) return 'Asia/Singapore';
  if (/鹿特丹|阿姆斯特丹|荷兰|欧洲/.test(place)) return 'Europe/Amsterdam';
  if (/汉堡|德国|柏林/.test(place)) return 'Europe/Berlin';
  if (/洛杉矶|长滩|美国/.test(place)) return 'America/Los_Angeles';
  if (/纽约|芝加哥/.test(place)) return 'America/New_York';
  return 'UTC';
};
const zonedTime = (value: string | Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
};
const withOffset = (value: string | Date, timeZone: string) => `${zonedTime(value, timeZone)}[${timeZone}]`;
const isoAfterHours = (start: string, hours: number) => new Date(new Date(start).getTime() + hours * HOUR_MS).toISOString();
const durationHours: Record<Order['priority'], Record<TransportMode, number>> = {
  standard: { truck: 18, rail: 18 * 24, sea: 36 * 24, air: 30 },
  urgent: { truck: 12, rail: 16 * 24, sea: 32 * 24, air: 24 },
  critical: { truck: 8, rail: 14 * 24, sea: 28 * 24, air: 18 }
};
const layoverHours: Record<Order['priority'], Record<TransportMode, number>> = {
  standard: { truck: 8, rail: 36, sea: 48, air: 12 },
  urgent: { truck: 6, rail: 24, sea: 36, air: 8 },
  critical: { truck: 4, rail: 18, sea: 24, air: 6 }
};
const carrierFor = (mode: TransportMode) => ({ truck: '公路卡航承运人', rail: '中欧班列运营商', sea: '远洋班轮承运人', air: '国际航空承运人' })[mode];
type RoutePoint = { location: string; mode: TransportMode };
function routePoints(origin: string, destination: string, priority: Order['priority']): RoutePoint[] {
  if (/鹿特丹|阿姆斯特丹|汉堡|德国|荷兰|欧洲/.test(destination)) {
    if (priority === 'critical') return [{ location: origin, mode: 'truck' }, { location: '上海浦东机场', mode: 'air' }, { location: '阿姆斯特丹史基浦机场', mode: 'truck' }];
    if (priority === 'urgent') return [{ location: origin, mode: 'truck' }, { location: '西安国际港', mode: 'rail' }, { location: '鹿特丹铁路枢纽', mode: 'truck' }];
    return [{ location: origin, mode: 'truck' }, { location: '上海洋山港', mode: 'sea' }, { location: '鹿特丹港', mode: 'truck' }];
  }
  if (/洛杉矶|长滩|纽约|芝加哥|美国/.test(destination)) {
    if (priority === 'standard') return [{ location: origin, mode: 'truck' }, { location: '宁波舟山港', mode: 'sea' }, { location: '长滩港', mode: 'truck' }];
    return [{ location: origin, mode: 'truck' }, { location: '上海浦东机场', mode: 'air' }, { location: '洛杉矶国际机场', mode: 'truck' }];
  }
  return [{ location: origin, mode: 'truck' }, { location: '新加坡港', mode: 'sea' }, { location: '新加坡内陆港', mode: 'truck' }];
}
function continuationPoints(origin: string, from: string, destination: string, priority: Order['priority']): RoutePoint[] {
  if (from === origin || !from) return routePoints(origin, destination, priority);
  if (/机场|航空/.test(from)) {
    const importAirport = /美国|洛杉矶|长滩|纽约|芝加哥/.test(destination) ? '洛杉矶国际机场' : '阿姆斯特丹史基浦机场';
    return [{ location: from, mode: 'air' }, { location: importAirport, mode: 'truck' }, { location: destination, mode: 'truck' }];
  }
  if (/西安|铁路|班列/.test(from)) return [{ location: from, mode: 'rail' }, { location: '鹿特丹铁路枢纽', mode: 'truck' }, { location: destination, mode: 'truck' }];
  if (/长滩港/.test(from)) return [{ location: from, mode: 'truck' }, { location: destination, mode: 'truck' }];
  if (/鹿特丹港/.test(from)) return [{ location: from, mode: 'truck' }, { location: destination, mode: 'truck' }];
  if (/新加坡港|新加坡内陆港/.test(from)) return [{ location: from, mode: 'truck' }, { location: destination, mode: 'truck' }];
  if (/洋山|舟山|港/.test(from)) {
    if (/美国|洛杉矶|长滩|纽约|芝加哥/.test(destination)) return [{ location: from, mode: 'sea' }, { location: '长滩港', mode: 'truck' }, { location: destination, mode: 'truck' }];
    if (/鹿特丹|阿姆斯特丹|汉堡|德国|荷兰|欧洲/.test(destination)) return [{ location: from, mode: 'sea' }, { location: '鹿特丹港', mode: 'truck' }, { location: destination, mode: 'truck' }];
    return [{ location: from, mode: 'sea' }, { location: '新加坡港', mode: 'truck' }, { location: destination, mode: 'truck' }];
  }
  return [{ location: from, mode: 'truck' }, { location: destination, mode: 'truck' }];
}
function makeLeg(priority: Order['priority'], sequence: number, point: RoutePoint, nextLocation: string, departure: string, preserveId?: string): RoutePlanLeg {
  const hours = durationHours[priority][point.mode];
  const arrival = isoAfterHours(departure, hours);
  const originTimeZone = timeZoneForPlace(point.location);
  const destinationTimeZone = timeZoneForPlace(nextLocation);
  return { id: preserveId ?? id('LEG'), sequence, mode: point.mode, carrier: carrierFor(point.mode), origin: point.location, destination: nextLocation, originTimeZone, destinationTimeZone, plannedDeparture: departure, plannedArrival: arrival, localPlannedDeparture: withOffset(departure, originTimeZone), localPlannedArrival: withOffset(arrival, destinationTimeZone), durationHours: hours, layoverHoursAfter: nextLocation ? layoverHours[priority][point.mode] : 0, status: 'planned' };
}
function makeMilestones(leg: RoutePlanLeg): RouteMilestone[] {
  return [{ id: id('MST'), code: 'DEPARTED', legId: leg.id, sequence: leg.sequence * 2 - 1, location: leg.origin, timeZone: leg.originTimeZone, plannedAt: leg.plannedDeparture, localPlannedAt: leg.localPlannedDeparture, kind: 'departure', immutable: false }, { id: id('MST'), code: 'ARRIVED', legId: leg.id, sequence: leg.sequence * 2, location: leg.destination, timeZone: leg.destinationTimeZone, plannedAt: leg.plannedArrival, localPlannedAt: leg.localPlannedArrival, kind: 'arrival', immutable: false }];
}
function buildLegs(origin: string, destination: string, priority: Order['priority'], startAt: string, points: RoutePoint[] = routePoints(origin, destination, priority)) {
  let cursor = startAt;
  const legs = points.map((point, index) => {
    const nextLocation = index === points.length - 1 ? destination : points[index + 1].location;
    const leg = makeLeg(priority, index + 1, point, nextLocation, cursor);
    cursor = isoAfterHours(leg.plannedArrival, leg.layoverHoursAfter);
    return leg;
  });
  const milestones = legs.flatMap(makeMilestones);
  return { legs, milestones, eta: legs[legs.length - 1].plannedArrival, localEta: legs[legs.length - 1].localPlannedArrival, totalTransitHours: Math.round((new Date(legs[legs.length - 1].plannedArrival).getTime() - new Date(startAt).getTime()) / HOUR_MS) };
}
function rescheduleLegs(priority: Order['priority'], legs: RoutePlanLeg[], startAt: string) {
  let cursor = startAt;
  for (const leg of legs) {
    const hours = leg.durationHours > 0 ? leg.durationHours : durationHours[priority][leg.mode];
    leg.plannedDeparture = cursor;
    leg.plannedArrival = isoAfterHours(cursor, hours);
    leg.originTimeZone = leg.originTimeZone || timeZoneForPlace(leg.origin);
    leg.destinationTimeZone = leg.destinationTimeZone || timeZoneForPlace(leg.destination);
    leg.localPlannedDeparture = withOffset(cursor, leg.originTimeZone);
    leg.localPlannedArrival = withOffset(leg.plannedArrival, leg.destinationTimeZone);
    leg.layoverHoursAfter = leg.sequence === legs.length ? 0 : (leg.layoverHoursAfter || layoverHours[priority][leg.mode]);
    leg.actualDeparture = undefined; leg.actualArrival = undefined; leg.localActualDeparture = undefined; leg.localActualArrival = undefined; leg.delayMinutes = undefined; leg.status = 'planned';
    cursor = isoAfterHours(leg.plannedArrival, leg.layoverHoursAfter);
  }
  const milestones = legs.flatMap(makeMilestones);
  return { legs, milestones, eta: legs[legs.length - 1].plannedArrival, localEta: legs[legs.length - 1].localPlannedArrival, totalTransitHours: Math.round((new Date(legs[legs.length - 1].plannedArrival).getTime() - new Date(legs[0].plannedDeparture).getTime()) / HOUR_MS) };
}
type RoutePlanPlanCompatible = Pick<RoutePlan, 'legs' | 'eta' | 'localEta' | 'totalTransitHours'>;
function projectEta(inputLegs: readonly RoutePlanLeg[]): RouteProjection {
  const legs = inputLegs.map(clone);
  let cursor = legs[0].plannedDeparture;
  let source: RouteProjection['source'] = 'planned';
  const modeHours: Partial<Record<TransportMode, number>> = {};
  for (const leg of legs) {
    modeHours[leg.mode] = (modeHours[leg.mode] ?? 0) + leg.durationHours;
    if (leg.actualArrival) source = 'actual';
    else if (leg.delayMinutes) source = 'reported_delay';
    else if (leg.actualDeparture) source = 'actual_milestone';
    let projectedDeparture = leg.actualDeparture ?? (leg.sequence === 1 ? leg.plannedDeparture : cursor);
    let projectedArrival: string;
    if (leg.actualArrival) projectedArrival = leg.actualArrival;
    else projectedArrival = isoAfterHours(projectedDeparture, leg.durationHours + (leg.delayMinutes ?? 0) / 60);
    leg.plannedDeparture = projectedDeparture;
    leg.plannedArrival = projectedArrival;
    cursor = isoAfterHours(projectedArrival, leg.sequence === legs.length ? 0 : leg.layoverHoursAfter);
  }
  const finalLeg = legs[legs.length - 1];
  const plannedEta = inputLegs[inputLegs.length - 1].plannedArrival;
  const delayMinutes = Math.max(0, Math.round((new Date(finalLeg.plannedArrival).getTime() - new Date(plannedEta).getTime()) / 60000));
  return { eta: finalLeg.plannedArrival, localEta: withOffset(finalLeg.plannedArrival, finalLeg.destinationTimeZone), finalTimeZone: finalLeg.destinationTimeZone, source, delayMinutes, totalElapsedHours: Math.round((new Date(finalLeg.plannedArrival).getTime() - new Date(inputLegs[0].plannedDeparture).getTime()) / HOUR_MS), crossesTimeZones: new Set(legs.flatMap(leg => [leg.originTimeZone, leg.destinationTimeZone])).size > 1, modeHours, projectedLegs: legs.map(leg => ({ legId: leg.id, projectedDeparture: leg.plannedDeparture, projectedArrival: leg.plannedArrival })) };
}
function routePlanFor(tenantId: string, planId: string) { const plan = state.routePlans.find(item => item.id === planId); if (!plan) throw new Error('路线计划不存在'); return assertTenant(plan, tenantId); }
function latestRoutePlan(tenantId: string, orderId: string) { return state.routePlans.filter(item => item.tenantId === tenantId && item.orderId === orderId).sort((a, b) => b.version - a.version)[0]; }
function shipmentForOrder(tenantId: string, orderId: string) { const shipment = state.shipments.find(item => item.orderId === orderId); return shipment ? assertTenant(shipment, tenantId) : undefined; }
function attachPlanEta(plan: RoutePlanPlanCompatible) { const projection = projectEta(plan.legs); plan.eta = projection.eta; plan.localEta = projection.localEta; return projection; }

export function listOrders(tenantId: string, filters: { status?: string; customerId?: string; q?: string } = {}) { tenant(tenantId); return state.orders.filter(item => item.tenantId === tenantId && (!filters.status || item.status === filters.status) && (!filters.customerId || item.customerId === filters.customerId) && (!filters.q || `${item.reference} ${item.destination}`.toLowerCase().includes(filters.q.toLowerCase()))).map(clone); }
export function getOrder(tenantId: string, orderId: string) { return clone(orderFor(tenantId, orderId)); }
export function createOrder(tenantId: string, input: Partial<Order>, actor = 'system') {
  tenant(tenantId); if (!input.customerId || !input.reference || !input.origin || !input.destination || !input.items?.length) throw new Error('客户、参考号、起讫地和订单明细均不能为空');
  if (state.orders.some(item => item.tenantId === tenantId && item.reference === input.reference)) throw new Error('客户参考号已存在');
  const items = input.items.map(item => { if (!item.sku || !item.quantity || item.quantity <= 0 || !item.unitPrice || item.unitPrice < 0 || !item.weightKg || item.weightKg <= 0) throw new Error('订单明细数量、价格和重量必须为正数'); return { sku: item.sku, description: item.description ?? item.sku, quantity: item.quantity, unitPrice: item.unitPrice, weightKg: item.weightKg, hsCode: item.hsCode ?? '0000.00' }; });
  const subtotal = money(items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)); const order: Order = { id: id('ORD'), tenantId, customerId: input.customerId, reference: input.reference, origin: input.origin, destination: input.destination, priority: input.priority ?? 'standard', status: 'draft', items, totalWeightKg: money(items.reduce((sum, item) => sum + item.quantity * item.weightKg, 0)), subtotal, totalAmount: subtotal, currency: input.currency ?? tenant(tenantId).currency, version: 1, createdAt: now(), updatedAt: now() };
  state.orders.unshift(order); mutate(tenantId, actor, 'order.created', 'order', order.id, undefined, order, 'order.created'); return clone(order);
}
export function confirmOrder(tenantId: string, orderId: string, actor = 'system') { const order = orderFor(tenantId, orderId); const before = clone(order); const customer = customerFor(tenantId, order.customerId); if (customer.blocked) throw new Error('客户已被风控冻结'); if (customer.creditUsed + order.totalAmount > customer.creditLimit) { const approval = createApproval(tenantId, { orderId, type: 'credit_override', reason: '订单金额超过客户授信额度' }, actor); throw new Error(`客户授信不足，需要审批 ${approval.id}`); } transition(order, 'confirmed'); customer.creditUsed = money(customer.creditUsed + order.totalAmount); mutate(tenantId, actor, 'order.confirmed', 'order', order.id, before, order, 'order.confirmed'); return clone(order); }
export function allocateOrder(tenantId: string, orderId: string, actor = 'system') { const order = orderFor(tenantId, orderId); const before = clone(order); const allocations: Reservation[] = []; for (const item of order.items) { let remaining = item.quantity; for (const lot of state.inventory.filter(value => value.tenantId === tenantId && value.sku === item.sku && value.available - value.reserved > 0)) { const qty = Math.min(remaining, lot.available - lot.reserved); lot.reserved += qty; remaining -= qty; allocations.push({ id: id('RSV'), tenantId, orderId, lotId: lot.id, sku: item.sku, quantity: qty, status: 'active', createdAt: now() }); if (!remaining) break; } if (remaining) { for (const allocation of allocations) { const lot = state.inventory.find(value => value.id === allocation.lotId)!; lot.reserved -= allocation.quantity; } throw new Error(`库存不足：${item.sku} 还缺少 ${remaining}`); } } state.reservations.push(...allocations); transition(order, 'allocated'); mutate(tenantId, actor, 'order.allocated', 'order', order.id, before, { order, allocations }, 'inventory.reserved'); return clone(order); }
export function dispatchOrder(tenantId: string, orderId: string, actor = 'system') {
  const order = orderFor(tenantId, orderId);
  const customs = state.customs.find(item => item.tenantId === tenantId && item.orderId === orderId);
  if (!customs || customs.status !== 'cleared') throw new Error('海关申报尚未放行');
  const reservations = state.reservations.filter(item => item.orderId === orderId && item.status === 'active');
  if (!reservations.length) throw new Error('订单没有有效库存分配');
  let shipment = shipmentForOrder(tenantId, orderId);
  if (!shipment) {
    let plan = state.routePlans.filter(item => item.tenantId === tenantId && item.orderId === orderId && item.status === 'published').sort((a, b) => b.version - a.version)[0];
    if (!plan) {
      const latest = latestRoutePlan(tenantId, orderId);
      if (!latest || latest.status === 'superseded') {
        createRoutePlan(tenantId, { orderId }, actor);
        plan = latestRoutePlan(tenantId, orderId);
        lockRoutePlan(tenantId, plan.id, { expectedVersion: plan.version }, actor);
      } else if (latest.status === 'locked') plan = latest;
      else if (latest.status === 'draft') throw new Error('最新路线方案尚未锁定发布，不能出运');
      if (plan) publishRoutePlan(tenantId, plan.id, { expectedVersion: plan.version }, actor);
      shipment = shipmentForOrder(tenantId, orderId);
    }
  }
  if (!shipment) throw new Error('没有已发布路线，不能出运');
  const before = clone(order);
  transition(order, 'dispatched');
  reservations.forEach(reservation => {
    const lot = state.inventory.find(item => item.id === reservation.lotId)!;
    lot.available -= reservation.quantity; lot.reserved -= reservation.quantity; reservation.status = 'consumed';
  });
  shipment.status = shipment.legs.some(leg => leg.actualDeparture || leg.actualArrival) ? 'in_transit' : 'planned';
  mutate(tenantId, actor, 'order.dispatched', 'order', order.id, before, { order, shipment, routeVersion: shipment.routeVersion }, 'shipment.ready');
  return clone(order);
}
export function deliverOrder(tenantId: string, orderId: string, actor = 'system') {
  const order = orderFor(tenantId, orderId);
  const shipment = state.shipments.find(item => item.orderId === orderId);
  if (!shipment) throw new Error('运输单不存在');
  const before = clone(order);
  transition(order, 'delivered');
  const finalLeg = shipment.legs[shipment.legs.length - 1];
  const arrivalMilestone = shipment.milestones.find(item => item.legId === finalLeg.id && item.kind === 'arrival');
  if (!finalLeg.actualArrival) {
    const at = now();
    finalLeg.actualArrival = at; finalLeg.localActualArrival = withOffset(at, finalLeg.destinationTimeZone); finalLeg.status = 'arrived';
    if (arrivalMilestone) { arrivalMilestone.actualAt = at; arrivalMilestone.localActualAt = finalLeg.localActualArrival; arrivalMilestone.immutable = true; }
  }
  const projection = projectEta(shipment.legs);
  shipment.eta = projection.eta; shipment.localEta = projection.localEta; shipment.etaContext = projection;
  shipment.status = 'delivered'; shipment.currentLocation = order.destination;
  if (!shipment.events.some(event => event.code === 'DELIVERED')) shipment.events.push({ id: id('TRK'), code: 'DELIVERED', location: order.destination, occurredAt: now(), note: '签收完成', legId: finalLeg.id, routePlanId: shipment.routePlanId, routeVersion: shipment.routeVersion });
  mutate(tenantId, actor, 'order.delivered', 'order', order.id, before, { order, shipment }, 'shipment.delivered');
  return clone(order);
}
export function closeOrder(tenantId: string, orderId: string, actor = 'system') { const order = orderFor(tenantId, orderId); const invoice = state.invoices.find(item => item.orderId === orderId); if (!invoice || invoice.status !== 'paid') throw new Error('发票未完成收款核销'); const before = clone(order); transition(order, 'closed'); const customer = customerFor(tenantId, order.customerId); customer.creditUsed = money(Math.max(0, customer.creditUsed - order.totalAmount)); mutate(tenantId, actor, 'order.closed', 'order', order.id, before, order, 'order.closed'); return clone(order); }
export function cancelOrder(tenantId: string, orderId: string, actor = 'system') { const order = orderFor(tenantId, orderId); const before = clone(order); if (['dispatched', 'delivered', 'closed'].includes(order.status)) throw new Error('已出运订单不能取消'); transition(order, 'cancelled'); state.reservations.filter(item => item.orderId === orderId && item.status === 'active').forEach(item => { state.inventory.find(lot => lot.id === item.lotId)!.reserved -= item.quantity; item.status = 'released'; }); const customer = customerFor(tenantId, order.customerId); if (before.status !== 'draft') customer.creditUsed = money(Math.max(0, customer.creditUsed - order.totalAmount)); mutate(tenantId, actor, 'order.cancelled', 'order', order.id, before, order, 'order.cancelled'); return clone(order); }

function assertLatestVersion(plan: RoutePlan, expectedVersion?: number) {
  const latest = latestRoutePlan(plan.tenantId, plan.orderId);
  if (!latest || latest.id !== plan.id) throw new Error('路线方案不是当前版本，请刷新后重试');
  if (expectedVersion !== undefined && plan.version !== expectedVersion) throw new Error(`路线版本已变化：当前为 v${latest.version}，提交的是 v${expectedVersion}`);
}
function validateChain(legs: RoutePlanLeg[]) {
  for (let index = 1; index < legs.length; index += 1) {
    if (legs[index - 1].destination !== legs[index].origin) throw new Error(`第 ${index} 段与第 ${index + 1} 段的中转点不一致`);
  }
}
export function listRoutePlans(tenantId: string, orderId?: string) { tenant(tenantId); return state.routePlans.filter(item => item.tenantId === tenantId && (!orderId || item.orderId === orderId)).sort((a, b) => b.version - a.version).map(clone); }
export function getRoutePlan(tenantId: string, planId: string) { return clone(routePlanFor(tenantId, planId)); }
export function getShipment(tenantId: string, shipmentId: string) { const shipment = state.shipments.find(item => item.id === shipmentId); if (!shipment) throw new Error('运输单不存在'); return clone(assertTenant(shipment, tenantId)); }
export function calculateShipmentEta(tenantId: string, shipmentId: string) { const shipment = state.shipments.find(item => item.id === shipmentId); if (!shipment) throw new Error('运输单不存在'); assertTenant(shipment, tenantId); return projectEta(shipment.legs); }
export function createRoutePlan(tenantId: string, input: { orderId: string; startAt?: string }, actor = 'system') {
  tenant(tenantId); const order = orderFor(tenantId, input.orderId);
  const current = latestRoutePlan(tenantId, order.id);
  if (current && current.status !== 'superseded') throw new Error('订单已有未归档路线方案，请锁定、发布或基于已发布版本重新规划');
  const built = buildLegs(order.origin, order.destination, order.priority, input.startAt ?? now());
  const version = current ? current.version + 1 : 1;
  const plan: RoutePlan = { id: id('RTP'), tenantId, orderId: order.id, version, status: 'draft', origin: order.origin, destination: order.destination, priority: order.priority, ...built, createdAt: now(), updatedAt: now() };
  state.routePlans.unshift(plan); mutate(tenantId, actor, 'route_plan.created', 'route_plan', plan.id, undefined, plan, 'route_plan.created'); return clone(plan);
}
export function lockRoutePlan(tenantId: string, planId: string, input: { expectedVersion?: number } = {}, actor = 'system') {
  const plan = routePlanFor(tenantId, planId); const before = clone(plan);
  if (plan.status === 'locked') return clone(plan);
  if (plan.status !== 'draft') throw new Error('只有草稿方案才能锁定');
  assertLatestVersion(plan, input.expectedVersion); validateChain(plan.legs);
  plan.status = 'locked'; plan.lockedAt = now(); plan.updatedAt = now();
  mutate(tenantId, actor, 'route_plan.locked', 'route_plan', plan.id, before, plan, 'route_plan.locked'); return clone(plan);
}
export function replaceRoutePlanLeg(tenantId: string, planId: string, input: { legId: string; mode?: TransportMode; carrier?: string; origin?: string; destination?: string; startAt?: string; expectedVersion?: number }, actor = 'system') {
  const plan = routePlanFor(tenantId, planId); const before = clone(plan);
  if (plan.status !== 'draft') throw new Error('只有草稿方案允许替换单段，已发布方案请先重新规划');
  assertLatestVersion(plan, input.expectedVersion);
  const index = plan.legs.findIndex(leg => leg.id === input.legId);
  if (index < 0) throw new Error('待替换运输段不存在');
  const target = plan.legs[index];
  if (target.actualDeparture || target.actualArrival || target.delayMinutes !== undefined) throw new Error('该运输段已有实际里程碑，不能替换');
  if (input.origin !== undefined && index > 0 && input.origin !== plan.legs[index - 1].destination) throw new Error('替换段起点必须衔接上一段终点');
  if (input.destination !== undefined && index < plan.legs.length - 1 && input.destination !== plan.legs[index + 1].origin) throw new Error('替换段终点必须衔接下一段起点');
  if (input.mode) target.mode = input.mode;
  if (input.carrier !== undefined) target.carrier = input.carrier || carrierFor(target.mode);
  if (input.origin !== undefined) target.origin = input.origin;
  if (input.destination !== undefined) target.destination = input.destination;
  target.originTimeZone = timeZoneForPlace(target.origin); target.destinationTimeZone = timeZoneForPlace(target.destination); target.carrier ||= carrierFor(target.mode);
  if (index > 0 && input.origin === undefined) plan.legs[index - 1].destination = target.origin;
  if (index < plan.legs.length - 1 && input.destination === undefined) plan.legs[index + 1].origin = target.destination;
  const prefix = plan.legs.slice(0, index);
  prefix.forEach(prefixLeg => {
    const departure = plan.milestones.find(milestone => milestone.legId === prefixLeg.id && milestone.kind === 'departure');
    const arrival = plan.milestones.find(milestone => milestone.legId === prefixLeg.id && milestone.kind === 'arrival');
    if (departure) { departure.location = prefixLeg.origin; departure.timeZone = prefixLeg.originTimeZone; departure.localPlannedAt = prefixLeg.localPlannedDeparture; }
    if (arrival) { arrival.location = prefixLeg.destination; arrival.timeZone = prefixLeg.destinationTimeZone; arrival.localPlannedAt = prefixLeg.localPlannedArrival; }
  });
  const startAt = index === 0 ? (input.startAt ?? target.plannedDeparture) : isoAfterHours(plan.legs[index - 1].plannedArrival, plan.legs[index - 1].layoverHoursAfter);
  const suffix = plan.legs.slice(index);
  suffix.forEach(leg => { leg.id = id('LEG'); leg.carrier ||= carrierFor(leg.mode); });
  const rebuilt = rescheduleLegs(plan.priority, suffix, startAt);
  plan.legs = [...plan.legs.slice(0, index), ...rebuilt.legs];
  plan.legs.forEach((leg, legIndex) => { leg.sequence = legIndex + 1; });
  plan.milestones = [...plan.milestones.filter(milestone => plan.legs.slice(0, index).some(leg => leg.id === milestone.legId)), ...rebuilt.milestones];
  validateChain(plan.legs); attachPlanEta(plan); plan.updatedAt = now();
  mutate(tenantId, actor, 'route_plan.leg_replaced', 'route_plan', plan.id, before, plan, 'route_plan.leg_replaced'); return clone(plan);
}
export function replanRoutePlan(tenantId: string, planId: string, input: { expectedVersion?: number; reason?: string; startAt?: string } = {}, actor = 'system') {
  const source = routePlanFor(tenantId, planId); const before = clone(source);
  if (source.status !== 'published') throw new Error('只有已发布方案才能重新规划');
  assertLatestVersion(source, input.expectedVersion);
  const shipment = shipmentForOrder(tenantId, source.orderId);
  if (!shipment) throw new Error('已发布方案缺少运输单视图，不能重新规划');
  if (source.legs.some(leg => leg.status !== 'planned') && !shipment.legs.some(leg => leg.actualDeparture || leg.actualArrival || leg.delayMinutes !== undefined)) throw new Error('重新规划缺少实际里程碑依据');
  let preserveCount = 0;
  for (const leg of shipment.legs) {
    if (!(leg.actualDeparture || leg.actualArrival || leg.delayMinutes !== undefined)) break;
    preserveCount += 1;
  }
  if (shipment.legs.slice(preserveCount).some(leg => leg.actualDeparture || leg.actualArrival || leg.delayMinutes !== undefined)) throw new Error('后续运输段存在乱序实际里程碑，无法安全重算');
  if (shipment.legs[shipment.legs.length - 1].actualArrival) throw new Error('最终到达里程碑已发生，不能重新规划');
  const order = orderFor(tenantId, source.orderId);
  let legs: RoutePlanLeg[];
  let milestones: RouteMilestone[];
  let eta: string; let localEta: string; let totalTransitHours: number;
  if (preserveCount === 0) {
    const built = buildLegs(order.origin, order.destination, order.priority, input.startAt ?? now());
    legs = built.legs; milestones = built.milestones; eta = built.eta; localEta = built.localEta; totalTransitHours = built.totalTransitHours;
  } else {
    legs = shipment.legs.slice(0, preserveCount).map(clone);
    milestones = shipment.milestones.filter(milestone => legs.some(leg => leg.id === milestone.legId)).map(clone);
    const active = legs[legs.length - 1];
    let anchor: string;
    if (active.actualArrival) {
      anchor = isoAfterHours(active.actualArrival, active.layoverHoursAfter);
    } else {
      const projectedDeparture = active.actualDeparture ?? active.plannedDeparture;
      active.plannedArrival = isoAfterHours(projectedDeparture, active.durationHours + (active.delayMinutes ?? 0) / 60);
      active.localPlannedArrival = withOffset(active.plannedArrival, active.destinationTimeZone);
      const arrivalMilestone = milestones.find(milestone => milestone.legId === active.id && milestone.kind === 'arrival');
      if (arrivalMilestone && !arrivalMilestone.actualAt) { arrivalMilestone.plannedAt = active.plannedArrival; arrivalMilestone.localPlannedAt = active.localPlannedArrival; }
      anchor = isoAfterHours(active.plannedArrival, active.layoverHoursAfter);
    }
    if (active.destination !== order.destination) {
      const points = continuationPoints(order.origin, active.destination, order.destination, order.priority);
      const built = buildLegs(order.origin, order.destination, order.priority, anchor, points);
      built.legs.forEach((leg, index) => { leg.sequence = legs.length + index + 1; });
      legs.push(...built.legs); milestones.push(...built.milestones);
    }
    legs.forEach((leg, index) => { leg.sequence = index + 1; });
    validateChain(legs);
    eta = legs[legs.length - 1].plannedArrival; localEta = legs[legs.length - 1].localPlannedArrival;
    totalTransitHours = Math.round((new Date(eta).getTime() - new Date(legs[0].plannedDeparture).getTime()) / HOUR_MS);
  }
  const plan: RoutePlan = { id: id('RTP'), tenantId, orderId: order.id, version: source.version + 1, status: 'draft', basedOnVersion: source.version, reason: input.reason, origin: order.origin, destination: order.destination, priority: order.priority, legs, milestones, eta, localEta, totalTransitHours, createdAt: now(), updatedAt: now() };
  state.routePlans.unshift(plan); mutate(tenantId, actor, 'route_plan.replanned', 'route_plan', plan.id, before, { source: before, plan }, 'route_plan.replanned'); return clone(plan);
}
export function publishRoutePlan(tenantId: string, planId: string, input: { expectedVersion?: number } = {}, actor = 'system') {
  const plan = routePlanFor(tenantId, planId);
  if (plan.status === 'superseded' || latestRoutePlan(tenantId, plan.orderId)?.id !== plan.id) throw new Error('该路线版本已被新版本替代，不能确认或重复发布');
  if (plan.status === 'published') return { plan: clone(plan), shipment: clone(shipmentForOrder(tenantId, plan.orderId)!) };
  if (plan.status !== 'locked') throw new Error('只有锁定方案才能发布到履约流程');
  assertLatestVersion(plan, input.expectedVersion);
  const order = orderFor(tenantId, plan.orderId);
  if (!['allocated', 'dispatched', 'delivered'].includes(order.status)) throw new Error('订单完成库存分配后才能发布路线');
  const customs = state.customs.find(item => item.tenantId === tenantId && item.orderId === order.id);
  if (!customs || customs.status !== 'cleared') throw new Error('海关申报尚未放行，禁止发布履约路线');
  validateChain(plan.legs);
  const before = { plan: clone(plan), shipment: shipmentForOrder(tenantId, order.id) ? clone(shipmentForOrder(tenantId, order.id)!) : undefined };
  state.routePlans.filter(item => item.tenantId === tenantId && item.orderId === order.id && item.id !== plan.id && ['draft', 'locked', 'published'].includes(item.status)).forEach(item => { item.status = 'superseded'; item.supersededByVersion = plan.version; item.updatedAt = now(); });
  plan.status = 'published'; plan.publishedAt = now(); plan.updatedAt = now();
  const projection = projectEta(plan.legs);
  let shipment = shipmentForOrder(tenantId, order.id);
  if (!shipment) {
    shipment = { id: id('SHP'), tenantId, orderId: order.id, trackingNo: `CBF${Date.now().toString().slice(-8)}`, legs: [], milestones: [], currentLocation: order.origin, eta: projection.eta, status: 'planned', events: [] };
    state.shipments.push(shipment); order.shipmentId = shipment.id;
  }
  shipment.routePlanId = plan.id; shipment.routeVersion = plan.version;
  shipment.legs = plan.legs.map(clone); shipment.milestones = plan.milestones.map(clone);
  shipment.eta = projection.eta; shipment.localEta = projection.localEta; shipment.etaContext = projection;
  shipment.status = shipment.legs.some(leg => leg.actualArrival && leg.sequence === shipment.legs.length) ? 'delivered' : shipment.legs.some(leg => leg.delayMinutes !== undefined) ? 'exception' : shipment.legs.some(leg => leg.actualDeparture || leg.actualArrival) ? 'in_transit' : 'planned';
  if (!shipment.events.length) shipment.currentLocation = order.origin;
  record(tenantId, actor, 'route_plan.published', 'route_plan', plan.id, before, { plan, shipment });
  emit(tenantId, 'route_plan.published', plan.id, { plan: clone(plan), shipment: clone(shipment) });
  return { plan: clone(plan), shipment: clone(shipment) };
}

export function createCustomsDeclaration(tenantId: string, input: { orderId: string; country?: string; requiredDocuments?: string[] }, actor = 'system') { const order = orderFor(tenantId, input.orderId); if (state.customs.some(item => item.tenantId === tenantId && item.orderId === order.id)) throw new Error('订单已有海关申报'); const declaration: CustomsDeclaration = { id: id('CUS'), tenantId, orderId: order.id, country: input.country ?? order.destination, status: 'draft', documentRefs: [], requiredDocuments: input.requiredDocuments ?? ['commercial-invoice', 'packing-list', 'origin-certificate'], riskScore: order.priority === 'critical' ? 82 : order.totalWeightKg > 1000 ? 60 : 24, updatedAt: now() }; state.customs.push(declaration); order.customsDeclarationId = declaration.id; mutate(tenantId, actor, 'customs.created', 'customs', declaration.id, undefined, declaration, 'customs.created'); return clone(declaration); }
export function updateCustoms(tenantId: string, declarationId: string, input: { status?: CustomsStatus; documentRefs?: string[]; rejectionReason?: string }, actor = 'system') { const declaration = assertTenant(state.customs.find(item => item.id === declarationId) ?? (() => { throw new Error('海关申报不存在'); })(), tenantId); const before = clone(declaration); if (input.documentRefs) declaration.documentRefs = [...new Set(input.documentRefs)]; if (input.status) { if (input.status === 'cleared' && declaration.requiredDocuments.some(doc => !declaration.documentRefs.includes(doc))) throw new Error('放行前必须补齐所有必需单证'); if (input.status === 'inspection' && declaration.status !== 'submitted') throw new Error('只有已提交申报才能进入查验'); declaration.status = input.status; } declaration.rejectionReason = input.rejectionReason; declaration.updatedAt = now(); mutate(tenantId, actor, 'customs.updated', 'customs', declaration.id, before, declaration, 'customs.updated'); return clone(declaration); }
export function addShipmentEvent(tenantId: string, shipmentId: string, input: { code: string; location: string; occurredAt?: string; note?: string; legId?: string; expectedVersion?: number; delayMinutes?: number }, actor = 'system') {
  const shipment = assertTenant(state.shipments.find(item => item.id === shipmentId) ?? (() => { throw new Error('运输单不存在'); })(), tenantId);
  if (!input.code || !input.location) throw new Error('轨迹编码和位置不能为空');
  if (input.expectedVersion !== undefined && shipment.routeVersion !== input.expectedVersion) throw new Error(`运输单当前路线为 v${shipment.routeVersion}，事件针对 v${input.expectedVersion}`);
  const at = input.occurredAt ?? now();
  const code = input.code.toUpperCase();
  let targetLeg: ShipmentLeg | undefined;
  if (input.legId) targetLeg = shipment.legs.find(leg => leg.id === input.legId);
  else if (code === 'DEPARTED') targetLeg = shipment.legs.find(leg => !leg.actualDeparture);
  else if (code === 'ARRIVED') targetLeg = [...shipment.legs].reverse().find(leg => !leg.actualArrival) ?? shipment.legs[shipment.legs.length - 1];
  else if (code === 'DELAYED') targetLeg = shipment.legs.find(leg => leg.status !== 'arrived' && !leg.actualArrival);
  if (['DEPARTED', 'ARRIVED', 'DELAYED'].includes(code) && !targetLeg) throw new Error('找不到可更新的运输段');
  if (targetLeg && input.location !== targetLeg.origin && input.location !== targetLeg.destination && code !== 'DELAYED') throw new Error('里程碑位置必须与该运输段起点或终点一致');

  if (code === 'DEPARTED') {
    if (targetLeg!.actualDeparture) throw new Error('该段出发里程碑已发生，不能被新方案或重复事件覆盖');
    const index = shipment.legs.indexOf(targetLeg!);
    if (index > 0 && !shipment.legs[index - 1].actualArrival) throw new Error('前一运输段尚未到达，不能记录本段出发');
    targetLeg!.actualDeparture = at; targetLeg!.localActualDeparture = withOffset(at, targetLeg!.originTimeZone); targetLeg!.status = 'in_transit';
    const milestone = shipment.milestones.find(item => item.legId === targetLeg!.id && item.kind === 'departure');
    if (milestone?.actualAt) throw new Error('出发里程碑已实际发生，不能覆盖');
    if (milestone) { milestone.actualAt = at; milestone.localActualAt = targetLeg!.localActualDeparture; milestone.immutable = true; }
    shipment.status = 'in_transit';
  } else if (code === 'ARRIVED') {
    if (targetLeg!.actualArrival) throw new Error('该段到达里程碑已发生，不能被新方案或重复事件覆盖');
    const index = shipment.legs.indexOf(targetLeg!);
    if (!targetLeg!.actualDeparture && !shipment.legs.slice(0, index).every(leg => leg.actualArrival)) throw new Error('本段尚未出发，不能记录到达');
    targetLeg!.actualArrival = at; targetLeg!.localActualArrival = withOffset(at, targetLeg!.destinationTimeZone); targetLeg!.status = 'arrived';
    const milestone = shipment.milestones.find(item => item.legId === targetLeg!.id && item.kind === 'arrival');
    if (milestone?.actualAt) throw new Error('到达里程碑已实际发生，不能覆盖');
    if (milestone) { milestone.actualAt = at; milestone.localActualAt = targetLeg!.localActualArrival; milestone.immutable = true; }
    shipment.status = index === shipment.legs.length - 1 ? 'in_transit' : 'in_transit';
  } else if (code === 'DELAYED') {
    const minutes = Math.max(1, input.delayMinutes ?? 60);
    targetLeg!.delayMinutes = Math.max(targetLeg!.delayMinutes ?? 0, minutes);
    targetLeg!.status = 'delayed';
    shipment.milestones.push({ id: id('MST'), code: 'DELAYED', legId: targetLeg!.id, sequence: shipment.milestones.length + 1, location: input.location, timeZone: timeZoneForPlace(input.location), plannedAt: at, localPlannedAt: withOffset(at, timeZoneForPlace(input.location)), actualAt: at, localActualAt: withOffset(at, timeZoneForPlace(input.location)), kind: 'exception', immutable: true });
    shipment.status = 'exception';
  }
  shipment.currentLocation = input.location;
  const projection = projectEta(shipment.legs);
  shipment.eta = projection.eta; shipment.localEta = projection.localEta; shipment.etaContext = projection;
  const event: ShipmentEvent = { id: id('TRK'), code, location: input.location, occurredAt: at, note: input.note, legId: targetLeg?.id, routePlanId: shipment.routePlanId, routeVersion: shipment.routeVersion, delayMinutes: code === 'DELAYED' ? (targetLeg?.delayMinutes ?? 60) : undefined };
  shipment.events.push(event);
  record(tenantId, actor, 'shipment.event.added', 'shipment', shipment.id, undefined, event);
  emit(tenantId, 'shipment.event.added', shipment.id, event);
  if (code === 'DELAYED') createApproval(tenantId, { orderId: shipment.orderId, type: 'delay_compensation', reason: `运输轨迹 ${shipment.trackingNo} v${shipment.routeVersion} 发生延误`, shipmentId: shipment.id, routePlanId: shipment.routePlanId, routeVersion: shipment.routeVersion, eta: shipment.eta, delayMinutes: targetLeg!.delayMinutes }, actor);
  return clone(shipment);
}

export function generateInvoice(tenantId: string, orderId: string, actor = 'system') { const order = orderFor(tenantId, orderId); const existing = state.invoices.find(item => item.orderId === orderId); if (existing) return clone(existing); if (!['allocated', 'dispatched', 'delivered', 'closed'].includes(order.status)) throw new Error('订单完成库存分配后才能开票'); const freight = money(Math.max(120, order.totalWeightKg * (order.priority === 'critical' ? 4.2 : 2.1))); const fuel = money(freight * 0.13); const customsFee = money(95 + order.items.length * 25); const lines: InvoiceLine[] = [{ code: 'GOODS', description: '货物服务费', quantity: 1, unitPrice: order.subtotal, amount: order.subtotal }, { code: 'FREIGHT', description: '跨境运输费', quantity: 1, unitPrice: freight, amount: freight }, { code: 'FUEL', description: '燃油附加费', quantity: 1, unitPrice: fuel, amount: fuel }, { code: 'CUSTOMS', description: '关务服务费', quantity: 1, unitPrice: customsFee, amount: customsFee }]; const subtotal = money(lines.reduce((sum, line) => sum + line.amount, 0)); const tax = money(subtotal * 0.06); const invoice: Invoice = { id: id('INV'), tenantId, orderId, number: `INV-${new Date().getFullYear()}-${String(state.invoices.length + 1).padStart(5, '0')}`, status: 'issued', currency: order.currency, lines, subtotal, tax, total: money(subtotal + tax), paid: 0, dueDate: new Date(Date.now() + 30 * 86400000).toISOString(), createdAt: now() }; state.invoices.push(invoice); order.invoiceId = invoice.id; mutate(tenantId, actor, 'invoice.issued', 'invoice', invoice.id, undefined, invoice, 'invoice.issued'); return clone(invoice); }
export function recordPayment(tenantId: string, input: { invoiceId: string; amount: number; method: Payment['method']; reference: string }, actor = 'system') { const invoice = assertTenant(state.invoices.find(item => item.id === input.invoiceId) ?? (() => { throw new Error('发票不存在'); })(), tenantId); if (!input.amount || input.amount <= 0 || input.amount > invoice.total - invoice.paid + 0.01) throw new Error('收款金额超过发票未核销余额'); if (state.payments.some(item => item.tenantId === tenantId && item.reference === input.reference)) throw new Error('收款流水号已处理，禁止重复入账'); const before = clone(invoice); const payment: Payment = { id: id('PAY'), tenantId, invoiceId: invoice.id, amount: money(input.amount), method: input.method, reference: input.reference, receivedAt: now() }; state.payments.push(payment); invoice.paid = money(invoice.paid + payment.amount); invoice.status = invoice.paid >= invoice.total - 0.01 ? 'paid' : 'partially_paid'; mutate(tenantId, actor, 'payment.recorded', 'invoice', invoice.id, before, invoice, 'payment.recorded'); return clone(payment); }

export function createApproval(tenantId: string, input: { orderId: string; type: Approval['type']; reason: string; shipmentId?: string; routePlanId?: string; routeVersion?: number; eta?: string; delayMinutes?: number }, actor = 'system') { orderFor(tenantId, input.orderId); const approval: Approval = { id: id('APR'), tenantId, orderId: input.orderId, type: input.type, reason: input.reason, status: 'pending', shipmentId: input.shipmentId, routePlanId: input.routePlanId, routeVersion: input.routeVersion, eta: input.eta, delayMinutes: input.delayMinutes, createdAt: now() }; state.approvals.push(approval); record(tenantId, actor, 'approval.created', 'approval', approval.id, undefined, approval); emit(tenantId, 'approval.created', approval.id, approval); return clone(approval); }
export function decideApproval(tenantId: string, approvalId: string, input: { status: Exclude<ApprovalStatus, 'pending'>; comment?: string }, actor: string) { const approval = assertTenant(state.approvals.find(item => item.id === approvalId) ?? (() => { throw new Error('审批不存在'); })(), tenantId); if (approval.status !== 'pending') throw new Error('审批已经决策'); const before = clone(approval); approval.status = input.status; approval.decidedBy = actor; approval.comment = input.comment; approval.decidedAt = now(); if (input.status === 'approved' && approval.type === 'credit_override') { const order = orderFor(tenantId, approval.orderId); const customer = customerFor(tenantId, order.customerId); customer.creditLimit = Math.max(customer.creditLimit, customer.creditUsed + order.totalAmount); } mutate(tenantId, actor, 'approval.decided', 'approval', approval.id, before, approval, 'approval.decided'); return clone(approval); }

export function operationSummary(tenantId: string) { tenant(tenantId); const orders = listOrders(tenantId); const invoices = state.invoices.filter(item => item.tenantId === tenantId); const shipments = state.shipments.filter(item => item.tenantId === tenantId); const routePlans = state.routePlans.filter(item => item.tenantId === tenantId); return { tenantId, generatedAt: now(), orderCount: orders.length, routePlanCount: routePlans.length, currentRouteVersions: shipments.map(item => ({ shipmentId: item.id, orderId: item.orderId, routePlanId: item.routePlanId, routeVersion: item.routeVersion, eta: item.eta, status: item.status })), byStatus: orders.reduce<Record<string, number>>((acc, item) => { acc[item.status] = (acc[item.status] ?? 0) + 1; return acc; }, {}), grossMerchandiseValue: money(orders.reduce((sum, item) => sum + item.totalAmount, 0)), receivable: money(invoices.reduce((sum, item) => sum + item.total - item.paid, 0)), paid: money(invoices.reduce((sum, item) => sum + item.paid, 0)), delayedShipments: shipments.filter(item => item.status === 'exception').length, pendingApprovals: state.approvals.filter(item => item.tenantId === tenantId && item.status === 'pending').length, inventory: state.inventory.filter(item => item.tenantId === tenantId).map(item => ({ warehouse: item.warehouse, sku: item.sku, available: item.available, reserved: item.reserved, free: item.available - item.reserved })) }; }
export function timeline(tenantId: string, orderId: string) { const order = orderFor(tenantId, orderId); const relatedIds = new Set([order.id]); const shipment = state.shipments.find(item => item.orderId === orderId); const customs = state.customs.find(item => item.tenantId === tenantId && item.orderId === orderId); const invoice = state.invoices.find(item => item.tenantId === tenantId && item.orderId === orderId); state.routePlans.filter(item => item.tenantId === tenantId && item.orderId === orderId).forEach(item => relatedIds.add(item.id)); if (shipment) relatedIds.add(shipment.id); if (customs) relatedIds.add(customs.id); if (invoice) relatedIds.add(invoice.id); state.approvals.filter(item => item.orderId === orderId).forEach(item => relatedIds.add(item.id)); return state.audit.filter(item => item.tenantId === tenantId && relatedIds.has(item.entityId)).sort((a, b) => b.at.localeCompare(a.at)).map(clone); }
export function listAudit(tenantId: string, limit = 100) { tenant(tenantId); return state.audit.filter(item => item.tenantId === tenantId).slice(0, Math.min(limit, 500)).map(clone); }
export function listOutbox(tenantId: string, status?: OutboxEvent['status']) { tenant(tenantId); return state.outbox.filter(item => item.tenantId === tenantId && (!status || item.status === status)).map(clone); }
export function publishOutbox(tenantId: string, eventId: string, actor = 'system') { const event = assertTenant(state.outbox.find(item => item.id === eventId) ?? (() => { throw new Error('事件不存在'); })(), tenantId); if (event.status === 'published') return clone(event); event.status = 'published'; event.attempts += 1; record(tenantId, actor, 'outbox.published', 'outbox', event.id, { status: 'pending' }, event); return clone(event); }

// seed a coherent flow for demos: one order is allocated, one customs declaration is cleared, and one invoice is partially paid.
const seeded = createOrder('tenant-acme', { customerId: 'CUS-001', reference: 'PO-2026-0918', origin: '上海保税区', destination: '鹿特丹', priority: 'urgent', items: [{ sku: 'SENSOR-X9', description: '工业温度传感器', quantity: 10, unitPrice: 180, weightKg: 2.4, hsCode: '9025.19' }, { sku: 'CONTROL-M2', description: '边缘控制模块', quantity: 4, unitPrice: 420, weightKg: 3.2, hsCode: '8537.10' }] });
confirmOrder('tenant-acme', seeded.id); allocateOrder('tenant-acme', seeded.id); const seededDeclaration = createCustomsDeclaration('tenant-acme', { orderId: seeded.id }); updateCustoms('tenant-acme', seededDeclaration.id, { documentRefs: ['commercial-invoice', 'packing-list', 'origin-certificate'], status: 'submitted' }); updateCustoms('tenant-acme', seededDeclaration.id, { status: 'cleared' }); dispatchOrder('tenant-acme', seeded.id); const seededInvoice = generateInvoice('tenant-acme', seeded.id); recordPayment('tenant-acme', { invoiceId: seededInvoice.id, amount: 500, method: 'bank_transfer', reference: 'BANK-DEMO-001' });
