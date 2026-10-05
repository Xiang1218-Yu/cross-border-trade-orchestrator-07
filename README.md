# CrossBorder Flow｜跨境供应链履约与结算编排服务

一个纯后端、Node.js + TypeScript 的复杂业务项目。它把跨境订单、库存锁定、分段运输、海关申报、计费开票、收款核销、异常审批、审计和事件投递串成一个可追踪的履约闭环。

## 业务边界

- **订单编排**：订单状态机、信用额度校验、幂等创建、乐观版本控制。
- **库存与分配**：按仓库和 SKU 锁定库存；防止超卖；分配结果写入订单时间线。
- **跨境运输**：基于订单起讫地与优先级生成卡车、铁路、海运、空运的多式联运计划；支持版本化草稿、锁定、发布、单段替换与已出发后的前缀保留式重规划；按实际/计划里程碑、延误、模式时长和跨时区计算 ETA。
- **履约一致性**：`shipment` 只展示当前已发布路线版本；运营查询、审批、审计与 Outbox 事件携带同一 `routePlanId/routeVersion`，重复发布幂等，旧版本确认会失败，未放行海关不能发布。
- **海关合规**：申报单、单证完整性校验、查验/放行/退回，未放行订单禁止出运。
- **计费结算**：按重量、燃油附加费、关务服务费、优先级计算应收；生成发票并支持部分收款和核销。
- **异常与审批**：信用超额、海关退回、运输延误等异常进入审批流；审批决定会影响订单动作。
- **可观测性**：审计事件、Outbox 事件、运营指标、订单全链路时间线。

## 启动

```bash
cd "/Users/tog/Documents/ChatGPT/play/professional-platforms/cross-border-trade-orchestrator"
npm install
npm run dev
```

默认监听 `http://localhost:4120`。

## 演示租户与请求头

所有业务 API 默认要求 `x-tenant-id: tenant-acme`。演示数据已经包含订单、库存、运输段、海关申报、发票和一笔部分收款。

```bash
curl -H 'x-tenant-id: tenant-acme' http://localhost:4120/api/operations/summary
```

## 路线计划 API

```bash
# 创建草稿（订单已确认或已分配后即可编排；发布仍要求库存分配和海关放行）
curl -X POST -H 'x-tenant-id: tenant-acme' -H 'content-type: application/json' \
  -d '{"startAt":"2026-10-05T00:00:00.000Z"}' \
  http://localhost:4120/api/orders/ORD-XXXX/route-plans

# 锁定、发布；body 可传 expectedVersion 做乐观版本校验
curl -X POST http://localhost:4120/api/route-plans/RTP-XXXX/lock
curl -X POST http://localhost:4120/api/route-plans/RTP-XXXX/publish

# 草稿替换单段；已发布路线用 replan 生成新版本
curl -X POST -H 'content-type: application/json' \
  -d '{"legId":"LEG-XXXX","mode":"rail","expectedVersion":1}' \
  http://localhost:4120/api/route-plans/RTP-XXXX/replace-leg
curl -X POST http://localhost:4120/api/route-plans/RTP-XXXX/replan

# 查询当前 shipment 视图与综合 ETA
curl http://localhost:4120/api/shipments/SHP-XXXX
curl http://localhost:4120/api/shipments/SHP-XXXX/eta
```

已发生的出发/到达/延误里程碑会标记为不可变；重规划只替换尚未发生的后缀运输段，发布时 shipment、审批和 Outbox 均切换到同一新版本。
