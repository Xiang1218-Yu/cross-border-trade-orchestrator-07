import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { URL } from 'node:url';
import {
  addShipmentEvent, allocateOrder, cancelOrder, closeOrder, confirmOrder, createApproval, createCustomsDeclaration, createOrder, createRoutePlan, decideApproval, deliverOrder, dispatchOrder, generateInvoice, getOrder, getOrderRoute, getRoutePlan, listAudit, listOrders, listOutbox, listRoutePlans, lockRoutePlan, operationSummary, publishOutbox, publishRoutePlan, recordPayment, replanRoutePlan, replaceRouteLeg, state, timeline, updateCustoms
} from './domain.js';

const port = Number(process.env.PORT ?? 4120);
const json = (res: ServerResponse, status: number, body: unknown) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(body)); };
const readBody = async (req: IncomingMessage) => { let raw = ''; for await (const chunk of req) raw += chunk; if (!raw.trim()) return {}; try { return JSON.parse(raw); } catch { throw new Error('请求体必须是合法 JSON'); } };
const tenantId = (req: IncomingMessage) => String(req.headers['x-tenant-id'] ?? 'tenant-acme');
const actor = (req: IncomingMessage) => String(req.headers['x-actor'] ?? 'api-user');
const success = (res: ServerResponse, body: unknown, status = 200) => json(res, status, { data: body });
const failure = (res: ServerResponse, error: unknown, status = 400) => json(res, status, { error: error instanceof Error ? error.message : '请求失败' });

const server = createServer(async (req, res) => {
  const method = req.method ?? 'GET'; const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`); const path = url.pathname; const tenant = tenantId(req); const user = actor(req);
  if (method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  if (path === '/api/health') return success(res, { ok: true, service: 'cross-border-trade-orchestrator', now: new Date().toISOString() });
  if (!path.startsWith('/api/')) return failure(res, new Error('Not Found'), 404);
  try {
    if (method === 'GET' && path === '/api/operations/summary') return success(res, operationSummary(tenant));
    if (method === 'GET' && path === '/api/orders') return success(res, listOrders(tenant, { status: url.searchParams.get('status') ?? undefined, customerId: url.searchParams.get('customerId') ?? undefined, q: url.searchParams.get('q') ?? undefined }));
    const orderTimeline = path.match(/^\/api\/orders\/([^/]+)\/timeline$/)?.[1];
    if (method === 'GET' && orderTimeline) return success(res, timeline(tenant, orderTimeline));
    const orderRoute = path.match(/^\/api\/orders\/([^/]+)\/route$/)?.[1];
    if (method === 'GET' && orderRoute) return success(res, getOrderRoute(tenant, orderRoute));
    const orderRoutePlans = path.match(/^\/api\/orders\/([^/]+)\/route-plans$/)?.[1];
    if (method === 'GET' && orderRoutePlans) return success(res, listRoutePlans(tenant, orderRoutePlans));
    if (method === 'POST' && orderRoutePlans) return success(res, createRoutePlan(tenant, orderRoutePlans, await readBody(req), user), 201);
    const orderAction = path.match(/^\/api\/orders\/([^/]+)\/(confirm|allocate|dispatch|deliver|close|cancel)$/);
    if (method === 'POST' && orderAction) { const [, id, action] = orderAction; const actions: Record<string, (t: string, o: string, a: string) => unknown> = { confirm: confirmOrder, allocate: allocateOrder, dispatch: dispatchOrder, deliver: deliverOrder, close: closeOrder, cancel: cancelOrder }; return success(res, actions[action](tenant, id, user)); }
    const orderId = path.match(/^\/api\/orders\/([^/]+)$/)?.[1];
    if (method === 'GET' && orderId) return success(res, getOrder(tenant, orderId));
    if (method === 'POST' && path === '/api/orders') return success(res, createOrder(tenant, await readBody(req), user), 201);

    const planId = path.match(/^\/api\/route-plans\/([^/]+)$/)?.[1];
    if (method === 'GET' && planId) return success(res, getRoutePlan(tenant, planId));
    const planAction = path.match(/^\/api\/route-plans\/([^/]+)\/(lock|publish|replan)$/);
    if (method === 'POST' && planAction) { const [, id, action] = planAction; if (action === 'lock') return success(res, lockRoutePlan(tenant, id, user)); if (action === 'publish') return success(res, publishRoutePlan(tenant, id, user)); return success(res, replanRoutePlan(tenant, id, await readBody(req), user), 201); }
    const legReplace = path.match(/^\/api\/route-plans\/([^/]+)\/legs\/([^/]+)\/replace$/);
    if (method === 'POST' && legReplace) return success(res, replaceRouteLeg(tenant, legReplace[1], legReplace[2], await readBody(req), user));

    if (method === 'POST' && path === '/api/customs/declarations') return success(res, createCustomsDeclaration(tenant, await readBody(req), user), 201);
    const customsId = path.match(/^\/api\/customs\/declarations\/([^/]+)$/)?.[1];
    if (method === 'PATCH' && customsId) return success(res, updateCustoms(tenant, customsId, await readBody(req), user));
    const shipmentId = path.match(/^\/api\/shipments\/([^/]+)\/events$/)?.[1];
    if (method === 'POST' && shipmentId) return success(res, addShipmentEvent(tenant, shipmentId, await readBody(req), user), 201);

    if (method === 'POST' && path === '/api/invoices') { const body = await readBody(req); return success(res, generateInvoice(tenant, String(body.orderId), user), 201); }
    if (method === 'POST' && path === '/api/payments') return success(res, recordPayment(tenant, await readBody(req), user), 201);
    if (method === 'POST' && path === '/api/approvals') return success(res, createApproval(tenant, await readBody(req), user), 201);
    const approvalId = path.match(/^\/api\/approvals\/([^/]+)\/decision$/)?.[1];
    if (method === 'POST' && approvalId) return success(res, decideApproval(tenant, approvalId, await readBody(req), user));
    if (method === 'GET' && path === '/api/audit/events') return success(res, listAudit(tenant, Number(url.searchParams.get('limit') ?? 100)));
    if (method === 'GET' && path === '/api/outbox') return success(res, listOutbox(tenant, (url.searchParams.get('status') as 'pending' | 'published' | null) ?? undefined));
    const eventId = path.match(/^\/api\/outbox\/([^/]+)\/publish$/)?.[1];
    if (method === 'POST' && eventId) return success(res, publishOutbox(tenant, eventId, user));
    if (method === 'GET' && path === '/api/meta') return success(res, { tenant: state.tenants.find(item => item.id === tenant), capabilities: ['orders', 'inventory-reservation', 'shipment-tracking', 'route-planning', 'customs-compliance', 'billing', 'approvals', 'audit', 'outbox'] });
    return failure(res, new Error('路由不存在'), 404);
  } catch (error) { return failure(res, error); }
});

server.listen(port, () => console.log(`cross-border trade orchestrator listening on http://localhost:${port}`));
