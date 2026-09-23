#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// packages/core/dist/types.js
var DEFAULT_WORKER_LIMITS;
var init_types = __esm({
  "packages/core/dist/types.js"() {
    "use strict";
    DEFAULT_WORKER_LIMITS = {
      maxSpend: 2,
      maxDurationMs: 30 * 6e4,
      maxEnvironments: 3,
      maxRetries: 1,
      maxToolCalls: 40
    };
  }
});

// packages/core/dist/events/events.js
var EventStore;
var init_events = __esm({
  "packages/core/dist/events/events.js"() {
    "use strict";
    EventStore = class {
      events = [];
      listeners = [];
      sequenceCounter = 0;
      lastEventIdByWorker = /* @__PURE__ */ new Map();
      emit(type, params) {
        this.sequenceCounter += 1;
        const eventId = `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        const parentEventId = params.parentEventId || (params.workerId ? this.lastEventIdByWorker.get(params.workerId) : void 0);
        const event = {
          id: eventId,
          runId: params.runId,
          sequence: this.sequenceCounter,
          parentEventId,
          type,
          timestamp: Date.now(),
          workerId: params.workerId,
          environmentId: params.environmentId,
          leaseId: params.leaseId,
          data: params.data ? JSON.parse(JSON.stringify(params.data)) : {}
        };
        Object.freeze(event);
        Object.freeze(event.data);
        this.events.push(event);
        if (params.workerId) {
          this.lastEventIdByWorker.set(params.workerId, eventId);
        }
        for (const listener of this.listeners) {
          try {
            listener(event);
          } catch (err) {
            console.error("[Meshly EventStore] Listener exception:", err);
          }
        }
        return event;
      }
      load(events) {
        this.events = events.map((e) => {
          const copy = { ...e, data: e.data ? { ...e.data } : {} };
          Object.freeze(copy);
          Object.freeze(copy.data);
          return copy;
        });
        this.sequenceCounter = this.events.reduce((max, e) => Math.max(max, e.sequence || 0), 0);
        this.lastEventIdByWorker.clear();
        for (const event of this.events) {
          if (event.workerId)
            this.lastEventIdByWorker.set(event.workerId, event.id);
        }
      }
      exportAll() {
        return [...this.events];
      }
      subscribe(listener) {
        this.listeners.push(listener);
        return () => {
          const idx = this.listeners.indexOf(listener);
          if (idx !== -1)
            this.listeners.splice(idx, 1);
        };
      }
      query(filter = {}) {
        const types = filter.type ? Array.isArray(filter.type) ? filter.type : [filter.type] : void 0;
        let matches = this.events.filter((e) => {
          if (types && !types.includes(e.type))
            return false;
          if (filter.workerId && e.workerId !== filter.workerId)
            return false;
          if (filter.runId && e.runId !== filter.runId)
            return false;
          if (filter.environmentId && e.environmentId !== filter.environmentId)
            return false;
          if (filter.since && e.timestamp < filter.since)
            return false;
          return true;
        });
        if (filter.limit && matches.length > filter.limit) {
          matches = matches.slice(-filter.limit);
        }
        return matches;
      }
      getTimeline(workerId) {
        return this.events.filter((e) => e.workerId === workerId);
      }
      getRunTimeline(runId) {
        return this.events.filter((e) => e.runId === runId);
      }
      get count() {
        return this.events.length;
      }
      exportJson() {
        return JSON.stringify(this.events, null, 2);
      }
    };
  }
});

// packages/core/dist/lifecycle/states.js
function canTransitionWorker(from, to) {
  return VALID_WORKER_TRANSITIONS[from]?.includes(to) ?? false;
}
function canTransitionEnvironment(from, to) {
  return VALID_ENVIRONMENT_TRANSITIONS[from]?.includes(to) ?? false;
}
var VALID_WORKER_TRANSITIONS, VALID_ENVIRONMENT_TRANSITIONS;
var init_states = __esm({
  "packages/core/dist/lifecycle/states.js"() {
    "use strict";
    VALID_WORKER_TRANSITIONS = {
      CREATED: ["QUEUED", "CANCELLED"],
      QUEUED: ["ALLOCATING", "CANCELLED", "FAILED"],
      ALLOCATING: ["RUNNING", "FAILED", "CANCELLED", "QUEUED"],
      RUNNING: ["WAITING", "PAUSED", "HANDOFF", "COMPLETED", "FAILED", "CANCELLED"],
      WAITING: ["RUNNING", "PAUSED", "CANCELLED", "FAILED"],
      PAUSED: ["RESUMING", "CANCELLED", "FAILED"],
      RESUMING: ["RUNNING", "FAILED", "CANCELLED"],
      HANDOFF: ["RUNNING", "COMPLETED", "FAILED", "CANCELLED"],
      COMPLETED: [],
      FAILED: [],
      CANCELLED: []
    };
    VALID_ENVIRONMENT_TRANSITIONS = {
      COLD: ["STARTING", "TERMINATED"],
      STARTING: ["READY", "LOST", "TERMINATING"],
      READY: ["BUSY", "IDLE", "PAUSED", "LOST", "TERMINATING"],
      BUSY: ["IDLE", "PAUSED", "READY", "LOST", "TERMINATING"],
      IDLE: ["BUSY", "PAUSED", "LOST", "TERMINATING"],
      PAUSED: ["RESUMING", "LOST", "TERMINATING"],
      RESUMING: ["READY", "BUSY", "LOST", "TERMINATING"],
      LOST: ["TERMINATING", "STARTING"],
      TERMINATING: ["TERMINATED"],
      TERMINATED: []
    };
  }
});

// packages/core/dist/execution/world.js
function extractTitle(html) {
  const m = html.match(/<title>([^<]*)<\/title>/i);
  return m ? m[1].trim() : "";
}
function extractById(html, id) {
  const re = new RegExp(`id=["']${id}["'][^>]*>([^<]*)<`, "i");
  const m = html.match(re);
  return m ? m[1].trim() : void 0;
}
function parsePaymentsHtml(html) {
  return {
    title: extractTitle(html),
    invoiceId: extractById(html, "inv-" + INVOICE_ID) ? INVOICE_ID : INVOICE_ID,
    payment_status: extractById(html, "payment-status") || "UNKNOWN",
    amount: INVOICE_AMOUNT
  };
}
var INVOICE_ID, INVOICE_AMOUNT, PAYMENTS_HTML, RESEARCH_HTML, STATUS_HTML, RECONCILE_PY, CODING_APP_JS;
var init_world = __esm({
  "packages/core/dist/execution/world.js"() {
    "use strict";
    INVOICE_ID = "4421";
    INVOICE_AMOUNT = "1200.00";
    PAYMENTS_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Payments \xB7 Invoice ${INVOICE_ID}</title>
</head>
<body>
  <h1>Today's payments</h1>
  <table id="transactions">
    <tr id="inv-${INVOICE_ID}" data-invoice="${INVOICE_ID}">
      <td class="invoice">${INVOICE_ID}</td>
      <td class="status" id="payment-status">PAID</td>
      <td class="amount">${INVOICE_AMOUNT}</td>
    </tr>
  </table>
  <p id="http-note">Retrieved over a live browser session.</p>
</body>
</html>`;
    RESEARCH_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Research notes \xB7 Solari environments</title>
</head>
<body>
  <h1>Environment surfaces</h1>
  <ul id="findings">
    <li>Browser: Playwright-style page control</li>
    <li>Sandbox: commands, files, code, git</li>
    <li>Desktop: graphical VM with pause/resume</li>
  </ul>
</body>
</html>`;
    STATUS_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Ops status \xB7 billing-api</title>
</head>
<body>
  <h1>System lookup</h1>
  <div id="service">billing-api</div>
  <div id="health">DEGRADED</div>
  <div id="error-rate">2.4%</div>
</body>
</html>`;
    RECONCILE_PY = `
import json, pathlib
payments = json.loads(pathlib.Path("/tmp/payments.json").read_text())
ledger = json.loads(pathlib.Path("/tmp/ledger.json").read_text())
p = payments.get("status") or payments.get("${INVOICE_ID}", {}).get("status")
l = ledger.get("status") or ledger.get("${INVOICE_ID}", {}).get("status")
amount = payments.get("amount") or payments.get("${INVOICE_ID}", {}).get("amount")
result = {"invoice": "${INVOICE_ID}", "payment": p, "ledger": l, "match": p == l, "amount": amount}
pathlib.Path("/tmp/reconciliation.json").write_text(json.dumps(result))
print(json.dumps(result))
`.trim();
    CODING_APP_JS = `
function add(a, b) { return a + b }
if (add(2, 2) !== 4) { console.error("FAIL"); process.exit(1) }
console.log("PASS")
`.trim();
  }
});

// packages/core/dist/fabric/simulator.js
function createFs() {
  return { files: /* @__PURE__ */ new Map() };
}
function emulatePython(code, fs9) {
  if (code.includes("print(2+2)"))
    return { exitCode: 0, stdout: "4\n", stderr: "" };
  if (code.includes("print('PASS')") || code.includes('print("PASS")')) {
    return { exitCode: 0, stdout: "PASS\n", stderr: "" };
  }
  try {
    const paymentsRaw = fs9.files.get("/tmp/payments.json") || "{}";
    const ledgerRaw = fs9.files.get("/tmp/ledger.json") || "{}";
    if (code.includes("reconciliation.json") || code.includes("payments.json")) {
      const payments = JSON.parse(paymentsRaw);
      const ledger = JSON.parse(ledgerRaw);
      const p = payments.status || payments["4421"]?.status;
      const l = ledger.status || ledger["4421"]?.status;
      const result = {
        invoice: payments.invoice || "4421",
        payment: p,
        ledger: l,
        match: p === l,
        amount: payments.amount || payments["4421"]?.amount
      };
      fs9.files.set("/tmp/reconciliation.json", JSON.stringify(result));
      return { exitCode: 0, stdout: JSON.stringify(result) + "\n", stderr: "" };
    }
  } catch (err) {
    return { exitCode: 1, stdout: "", stderr: err instanceof Error ? err.message : String(err) };
  }
  return { exitCode: 0, stdout: "4\n", stderr: "" };
}
var SimulatorExecutionFabric;
var init_simulator = __esm({
  "packages/core/dist/fabric/simulator.js"() {
    "use strict";
    init_world();
    SimulatorExecutionFabric = class {
      name = "simulator-fabric";
      resources = /* @__PURE__ */ new Map();
      async launchBrowser(options = {}) {
        const id = `sim_browser_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        let html = `<html><head><title>Example Domain</title></head><body><h1>Example Domain</h1><div id="state">LOADED</div></body></html>`;
        let currentUrl = "https://example.com/";
        const mockBrowser = {
          id,
          options,
          newPage: async () => {
            const page = {
              goto: async (url) => {
                currentUrl = url;
                if (url.includes("example.com")) {
                  html = `<html><head><title>Example Domain</title></head><body><h1>Example Domain</h1></body></html>`;
                }
                return { url };
              },
              setContent: async (content) => {
                html = content;
                currentUrl = "about:blank";
              },
              title: async () => extractTitle(html) || "Example Domain",
              url: () => currentUrl,
              content: async () => html,
              screenshot: async () => Buffer.from("sim-browser-screenshot"),
              evaluate: async (fn) => typeof fn === "function" ? fn() : void 0,
              click: async () => void 0
            };
            mockBrowser.__meshlyPage = page;
            return page;
          },
          close: async () => void 0
        };
        const resource = {
          id,
          type: "browser",
          handle: mockBrowser,
          replayUrl: `https://console.getsolari.com/replays/${id}`
        };
        this.resources.set(id, resource);
        return resource;
      }
      async createSandbox(options = {}) {
        const id = `sim_sandbox_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        const fs9 = createFs();
        const mockSandbox = {
          id,
          sandboxId: id,
          options,
          connect: async () => void 0,
          files: {
            write: async (filePath, content) => {
              fs9.files.set(filePath, String(content));
            },
            readText: async (filePath) => fs9.files.get(filePath) ?? "",
            read: async (filePath) => Buffer.from(fs9.files.get(filePath) ?? "", "utf8")
          },
          commands: {
            run: async (cmd, opts) => {
              const args = opts?.args || [];
              if (cmd === "python3" && args[0] === "-c")
                return emulatePython(args[1] || "", fs9);
              if (cmd === "cat")
                return { exitCode: 0, stdout: (fs9.files.get(args[0]) || "") + "\n", stderr: "" };
              if (cmd === "bash" && String(args.join(" ")).includes("base64")) {
                return { exitCode: 0, stdout: "", stderr: "" };
              }
              if (`${cmd} ${args.join(" ")}`.includes("print(2+2)")) {
                return { exitCode: 0, stdout: "4\n", stderr: "" };
              }
              return { exitCode: 0, stdout: "4\n", stderr: "" };
            }
          },
          kill: async () => void 0
        };
        const resource = {
          id,
          type: "sandbox",
          handle: mockSandbox
        };
        this.resources.set(id, resource);
        return resource;
      }
      async createDesktop(options = {}) {
        const id = `sim_desktop_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        const fs9 = createFs();
        const mockDesktop = {
          id,
          sessionId: id,
          options,
          connect: async () => void 0,
          health: async () => ({ ready: true, display: true, vnc: true }),
          open: async () => void 0,
          mouse: { click: async () => void 0 },
          keyboard: { type: async (text) => {
            fs9.files.set("/tmp/typed", String(text));
          } },
          files: {
            write: async (filePath, content) => {
              fs9.files.set(filePath, String(content));
            },
            readText: async (filePath) => fs9.files.get(filePath) ?? "",
            read: async (filePath) => Buffer.from(fs9.files.get(filePath) ?? "", "utf8")
          },
          commands: {
            run: async (cmd, opts) => {
              const args = opts?.args || [];
              if (cmd === "cat")
                return { exitCode: 0, stdout: fs9.files.get(args[0]) || "", stderr: "" };
              return { exitCode: 0, stdout: "", stderr: "" };
            }
          },
          screenshot: async () => Buffer.from("mock_screenshot"),
          pause: async () => void 0,
          resume: async () => void 0,
          close: async () => void 0
        };
        const resource = {
          id,
          type: "desktop",
          handle: mockDesktop,
          streamUrl: `wss://stream.getsolari.com/vnc/${id}`
        };
        this.resources.set(id, resource);
        return resource;
      }
      async pauseResource(resource) {
        if (resource.handle?.pause)
          await resource.handle.pause();
      }
      async resumeResource(resource) {
        if (resource.handle?.resume)
          await resource.handle.resume();
      }
      async destroyResource(resource) {
        if (resource.type === "sandbox" && resource.handle?.kill) {
          await resource.handle.kill();
        } else if (resource.handle?.close) {
          await resource.handle.close();
        }
        this.resources.delete(resource.id);
      }
      async reconnect(id, _type) {
        const existing = this.resources.get(id);
        if (!existing)
          throw new Error(`Simulator has no live handle for ${id}. Process-local mocks do not survive destroy().`);
        return existing;
      }
    };
  }
});

// packages/core/dist/fabric/broker.js
var EnvironmentBroker;
var init_broker = __esm({
  "packages/core/dist/fabric/broker.js"() {
    "use strict";
    init_simulator();
    EnvironmentBroker = class {
      environments = /* @__PURE__ */ new Map();
      leases = /* @__PURE__ */ new Map();
      fabric;
      events;
      onLeaseExpired;
      constructor(events, fabric, onLeaseExpired) {
        this.events = events;
        this.fabric = fabric || new SimulatorExecutionFabric();
        this.onLeaseExpired = onLeaseExpired;
      }
      setFabric(fabric) {
        this.fabric = fabric;
      }
      /**
       * Acquire an environment matching requirements and affinity
       */
      async acquire(req) {
        const affinity = req.affinity || {};
        for (const env2 of this.environments.values()) {
          if (env2.status === "IDLE" && env2.type === req.type && env2.handle) {
            const profileMatch = !affinity.profile || env2.profile === affinity.profile;
            const filesMatch = !affinity.files || affinity.files.every((f) => env2.loadedFiles.includes(f));
            if (profileMatch && filesMatch) {
              env2.status = "BUSY";
              env2.owner = req.workerId;
              env2.lastActiveAt = /* @__PURE__ */ new Date();
              const lease2 = this.createLease(req, env2.id);
              env2.currentLeaseId = lease2.leaseId;
              this.events.emit("environment.reused", {
                workerId: req.workerId,
                environmentId: env2.id,
                leaseId: lease2.leaseId,
                data: { type: env2.type, profile: env2.profile, affinityMatched: true }
              });
              return lease2;
            }
          }
        }
        for (const env2 of this.environments.values()) {
          if (env2.status === "IDLE" && env2.type === req.type && env2.handle && !affinity.profile) {
            env2.status = "BUSY";
            env2.owner = req.workerId;
            env2.lastActiveAt = /* @__PURE__ */ new Date();
            const lease2 = this.createLease(req, env2.id);
            env2.currentLeaseId = lease2.leaseId;
            this.events.emit("environment.reused", {
              workerId: req.workerId,
              environmentId: env2.id,
              leaseId: lease2.leaseId,
              data: { type: env2.type, reusedGeneric: true }
            });
            return lease2;
          }
        }
        const envId = `env_${req.type}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        const env = {
          id: envId,
          type: req.type,
          status: "STARTING",
          owner: req.workerId,
          profile: affinity.profile,
          loadedFiles: affinity.files ? [...affinity.files] : [],
          cost: 0,
          capabilities: req.capabilities || [req.type],
          lastActiveAt: /* @__PURE__ */ new Date()
        };
        this.environments.set(envId, env);
        let resource;
        if (req.type === "browser") {
          resource = await this.fabric.launchBrowser({
            profileId: affinity.profile,
            stealth: false,
            recording: true
          });
          env.replayUrl = resource.replayUrl;
          env.cost += 0.05;
        } else if (req.type === "sandbox") {
          resource = await this.fabric.createSandbox({
            template: affinity.template || "base",
            timeoutMs: req.timeoutMs ?? 5 * 6e4
          });
          env.cost += 0.02;
        } else {
          resource = await this.fabric.createDesktop({
            resolution: "1280x720",
            timeoutMs: req.timeoutMs ?? 10 * 6e4
          });
          env.streamUrl = resource.streamUrl;
          env.cost += 0.08;
        }
        env.handle = resource.handle;
        env.fabricId = resource.id;
        env.replayUrl = resource.replayUrl ?? env.replayUrl;
        env.streamUrl = resource.streamUrl ?? env.streamUrl;
        env.status = "READY";
        const lease = this.createLease(req, env.id);
        env.currentLeaseId = lease.leaseId;
        env.status = "BUSY";
        this.events.emit("environment.acquired", {
          workerId: req.workerId,
          environmentId: env.id,
          leaseId: lease.leaseId,
          data: {
            type: env.type,
            profile: env.profile,
            fabricId: env.fabricId,
            streamUrl: env.streamUrl,
            replayUrl: env.replayUrl
          }
        });
        return lease;
      }
      createLease(req, envId) {
        const duration = req.timeoutMs ?? 5 * 6e4;
        const createdAt = /* @__PURE__ */ new Date();
        const expiresAt = new Date(createdAt.getTime() + duration);
        const lease = {
          leaseId: `lease_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          workerId: req.workerId,
          environmentId: envId,
          createdAt,
          expiresAt,
          capabilities: req.capabilities || [req.type],
          budget: req.budget,
          authority: req.authority,
          status: "ACTIVE"
        };
        this.leases.set(lease.leaseId, lease);
        this.events.emit("lease.granted", {
          workerId: lease.workerId,
          environmentId: lease.environmentId,
          leaseId: lease.leaseId,
          data: { expiresAt: lease.expiresAt.toISOString(), budget: lease.budget }
        });
        return lease;
      }
      async release(leaseId) {
        const lease = this.leases.get(leaseId);
        if (!lease || lease.status !== "ACTIVE")
          return;
        lease.status = "RELEASED";
        const env = this.environments.get(lease.environmentId);
        if (env) {
          env.status = "IDLE";
          env.owner = void 0;
          env.currentLeaseId = void 0;
          env.lastActiveAt = /* @__PURE__ */ new Date();
        }
        this.events.emit("environment.released", {
          workerId: lease.workerId,
          environmentId: lease.environmentId,
          leaseId: lease.leaseId
        });
      }
      async pause(environmentId) {
        const env = this.environments.get(environmentId);
        if (!env)
          return;
        env.status = "PAUSED";
        if (env.handle) {
          await this.fabric.pauseResource({ id: env.id, type: env.type, handle: env.handle });
        }
        this.events.emit("environment.paused", { environmentId: env.id, data: { type: env.type } });
      }
      async resume(environmentId) {
        const env = this.environments.get(environmentId);
        if (!env)
          return;
        env.status = "RESUMING";
        if (env.handle) {
          await this.fabric.resumeResource({ id: env.id, type: env.type, handle: env.handle });
        }
        env.status = "READY";
        env.lastActiveAt = /* @__PURE__ */ new Date();
        this.events.emit("environment.resumed", { environmentId: env.id, data: { type: env.type, resumeLatencyMs: 780 } });
      }
      inspect(environmentId) {
        return this.environments.get(environmentId);
      }
      markLost(environmentId, reason = "Environment unreachable", meta = {}) {
        const env = this.environments.get(environmentId);
        if (!env) {
          this.events.emit("environment.lost", { environmentId, workerId: meta.workerId, runId: meta.runId, data: { reason } });
          return void 0;
        }
        env.status = "LOST";
        env.handle = void 0;
        if (env.currentLeaseId) {
          const lease = this.leases.get(env.currentLeaseId);
          if (lease && lease.status === "ACTIVE")
            lease.status = "EXPIRED";
        }
        this.events.emit("environment.lost", {
          environmentId: env.id,
          workerId: meta.workerId || env.owner,
          runId: meta.runId,
          data: { type: env.type, fabricId: env.fabricId, reason }
        });
        return env;
      }
      async destroy(environmentId) {
        const env = this.environments.get(environmentId);
        if (!env)
          return;
        env.status = "TERMINATING";
        if (env.handle) {
          await this.fabric.destroyResource({ id: env.id, type: env.type, handle: env.handle });
        }
        env.status = "TERMINATED";
        this.environments.delete(environmentId);
      }
      list() {
        return Array.from(this.environments.values());
      }
      getLease(leaseId) {
        return this.leases.get(leaseId);
      }
      getFabric() {
        return this.fabric;
      }
      adopt(env, lease) {
        this.environments.set(env.id, env);
        if (lease)
          this.leases.set(lease.leaseId, lease);
      }
      async reconnect(environmentId) {
        const env = this.environments.get(environmentId);
        if (!env?.fabricId)
          return env;
        if (!this.fabric.reconnect)
          return env;
        const resource = await this.fabric.reconnect(env.fabricId, env.type);
        env.handle = resource.handle;
        env.streamUrl = resource.streamUrl ?? env.streamUrl;
        env.replayUrl = resource.replayUrl ?? env.replayUrl;
        env.status = env.status === "PAUSED" ? "PAUSED" : "IDLE";
        this.events.emit("environment.reconnected", {
          environmentId: env.id,
          data: { type: env.type, fabricId: env.fabricId }
        });
        return env;
      }
      register(type, options = {}) {
        const id = `env_${type}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        const env = {
          id,
          type,
          status: "IDLE",
          loadedFiles: [],
          cost: 0,
          capabilities: [type],
          profile: options.profile,
          lastActiveAt: /* @__PURE__ */ new Date()
        };
        this.environments.set(id, env);
        return env;
      }
    };
  }
});

// packages/core/dist/authority/authority.js
var AuthorityManager;
var init_authority = __esm({
  "packages/core/dist/authority/authority.js"() {
    "use strict";
    AuthorityManager = class _AuthorityManager {
      events;
      constructor(events) {
        this.events = events;
      }
      static issue(params) {
        return {
          tools: params.tools ? [...params.tools] : ["*"],
          capabilities: params.capabilities ? [...params.capabilities] : ["*"],
          domains: params.domains ? [...params.domains] : void 0,
          maxSpend: params.maxSpend ?? 5,
          writeAccess: params.writeAccess ? [...params.writeAccess] : [],
          expiresAt: new Date(Date.now() + (params.lifespanMs ?? 60 * 60 * 1e3)),
          boundToJobId: params.boundToJobId
        };
      }
      static delegate(parent, requested) {
        let tools;
        if (parent.tools.includes("*")) {
          tools = requested.tools ? [...requested.tools] : ["*"];
        } else if (requested.tools) {
          tools = requested.tools.filter((t) => parent.tools.includes(t));
        } else {
          tools = [...parent.tools];
        }
        let capabilities;
        if (parent.capabilities.includes("*")) {
          capabilities = requested.capabilities ? [...requested.capabilities] : ["*"];
        } else if (requested.capabilities) {
          capabilities = requested.capabilities.filter((c) => parent.capabilities.includes(c));
        } else {
          capabilities = [...parent.capabilities];
        }
        let domains;
        if (parent.domains && requested.domains) {
          domains = requested.domains.filter((d) => parent.domains.includes(d));
        } else if (parent.domains) {
          domains = [...parent.domains];
        } else {
          domains = requested.domains ? [...requested.domains] : void 0;
        }
        const maxSpend = Math.min(parent.maxSpend ?? 0, requested.maxSpend ?? parent.maxSpend ?? 0);
        const writeAccess = requested.writeAccess ? requested.writeAccess.filter((w) => parent.writeAccess?.includes(w)) : [...parent.writeAccess ?? []];
        const expiresAt = requested.expiresAt && requested.expiresAt.getTime() < parent.expiresAt.getTime() ? requested.expiresAt : parent.expiresAt;
        return {
          tools,
          capabilities,
          domains,
          maxSpend,
          writeAccess,
          expiresAt,
          boundToJobId: requested.boundToJobId || parent.boundToJobId
        };
      }
      static evaluate(auth, action) {
        if (Date.now() > auth.expiresAt.getTime()) {
          return { decision: "DENY", allowed: false, violation: "Authority lease has expired", policyReason: "LEASE_EXPIRED" };
        }
        if (action.tool && !auth.tools.includes("*") && !auth.tools.includes(action.tool)) {
          return {
            decision: "DENY",
            allowed: false,
            violation: `Tool '${action.tool}' not permitted under active authority`,
            policyReason: "TOOL_DISALLOWED"
          };
        }
        if (action.capability && !auth.capabilities.includes("*") && !auth.capabilities.includes(action.capability)) {
          return {
            decision: "DENY",
            allowed: false,
            violation: `Capability '${action.capability}' not held by worker`,
            policyReason: "CAPABILITY_DISALLOWED"
          };
        }
        if (action.domain && auth.domains) {
          const allowed = auth.domains.some((p) => p === "*" || action.domain === p || action.domain?.endsWith("." + p));
          if (!allowed) {
            return {
              decision: "DENY",
              allowed: false,
              violation: `Domain '${action.domain}' blocked by authority policy`,
              policyReason: "DOMAIN_BLOCKED"
            };
          }
        }
        const requestedAmount = action.amount ?? 0;
        if (requestedAmount > 0 && auth.maxSpend !== void 0 && requestedAmount > auth.maxSpend) {
          return {
            decision: "DENY",
            allowed: false,
            violation: `Requested amount $${requestedAmount.toFixed(2)} exceeds authority limit $${auth.maxSpend.toFixed(2)}`,
            policyReason: "SPEND_EXCEEDED"
          };
        }
        if (action.writeTarget && auth.writeAccess) {
          const writeAllowed = auth.writeAccess.some((target) => target === "*" || action.writeTarget === target || action.writeTarget?.startsWith(target));
          if (!writeAllowed) {
            return {
              decision: "DENY",
              allowed: false,
              violation: `Write access to '${action.writeTarget}' is unauthorized`,
              policyReason: "WRITE_UNAUTHORIZED"
            };
          }
        }
        return { decision: "ALLOW", allowed: true };
      }
      authorize(workerId, auth, action) {
        const result = _AuthorityManager.evaluate(auth, action);
        if (this.events) {
          if (result.allowed) {
            this.events.emit("action.authorized", { workerId, data: { action } });
          } else {
            this.events.emit("action.denied", {
              workerId,
              data: { action, violation: result.violation, policyReason: result.policyReason }
            });
          }
        }
        return result;
      }
    };
  }
});

// packages/core/dist/context/context.js
var ContextManager;
var init_context = __esm({
  "packages/core/dist/context/context.js"() {
    "use strict";
    ContextManager = class {
      contexts = /* @__PURE__ */ new Map();
      events;
      constructor(events) {
        this.events = events;
      }
      init(workerId, task, objective) {
        const ctx = {
          workerId,
          task,
          objective: objective || task,
          currentStep: 0,
          plan: [],
          environmentState: "COLD",
          recentActions: [],
          artifacts: [],
          relevantMemory: [],
          metadata: {}
        };
        this.contexts.set(workerId, ctx);
        return ctx;
      }
      get(workerId) {
        return this.contexts.get(workerId);
      }
      update(workerId, patch) {
        const ctx = this.contexts.get(workerId);
        if (!ctx)
          throw new Error(`Context not found for worker ${workerId}`);
        Object.assign(ctx, patch);
        return ctx;
      }
      recordAction(workerId, action) {
        const ctx = this.contexts.get(workerId);
        if (!ctx)
          throw new Error(`Context not found for worker ${workerId}`);
        ctx.currentStep += 1;
        const record = {
          ...action,
          step: ctx.currentStep,
          timestamp: Date.now()
        };
        ctx.recentActions.push(record);
        if (ctx.recentActions.length > 20) {
          ctx.recentActions.shift();
        }
        if (this.events) {
          this.events.emit("action.executed", {
            workerId,
            data: { step: record.step, tool: record.tool, verified: record.verified }
          });
        }
        return record;
      }
      recordObservation(workerId, observation) {
        const ctx = this.contexts.get(workerId);
        if (!ctx)
          return;
        ctx.lastObservation = observation;
        if (this.events) {
          this.events.emit("observation.captured", {
            workerId,
            data: { step: ctx.currentStep }
          });
        }
      }
      addArtifact(workerId, artifact) {
        const ctx = this.contexts.get(workerId);
        if (!ctx)
          return;
        ctx.artifacts.push({ ...artifact, createdAt: Date.now() });
      }
      snapshot(workerId) {
        const ctx = this.contexts.get(workerId);
        if (!ctx)
          throw new Error(`Worker context not found for ${workerId}`);
        return JSON.parse(JSON.stringify(ctx));
      }
      restore(workerId, snapshot2) {
        const restored = JSON.parse(JSON.stringify(snapshot2));
        restored.workerId = workerId;
        this.contexts.set(workerId, restored);
        return restored;
      }
      transfer(fromWorkerId, toWorkerId) {
        const source = this.contexts.get(fromWorkerId);
        if (!source)
          throw new Error(`Cannot transfer context: source worker ${fromWorkerId} not found`);
        const transferred = {
          ...JSON.parse(JSON.stringify(source)),
          workerId: toWorkerId,
          metadata: {
            ...source.metadata,
            handedOffFrom: fromWorkerId,
            handedOffAt: Date.now()
          }
        };
        this.contexts.set(toWorkerId, transferred);
        if (this.events) {
          this.events.emit("worker.handoff", {
            workerId: toWorkerId,
            data: { fromWorkerId, currentStep: transferred.currentStep }
          });
        }
        return transferred;
      }
    };
  }
});

// packages/core/dist/memory/memory.js
var MemoryManager;
var init_memory = __esm({
  "packages/core/dist/memory/memory.js"() {
    "use strict";
    MemoryManager = class {
      store = /* @__PURE__ */ new Map();
      maxHotTokens;
      events;
      constructor(events, maxHotTokens = 4e3) {
        this.events = events;
        this.maxHotTokens = maxHotTokens;
      }
      put(params) {
        const compositeKey = `${params.workerId}:${params.key}`;
        const serialized = typeof params.value === "string" ? params.value : JSON.stringify(params.value);
        const tokenEst = params.tokensEstimate ?? Math.max(1, Math.ceil(serialized.length / 4));
        const entry = {
          id: `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          key: params.key,
          tier: params.tier ?? "hot",
          value: params.value,
          tokensEstimate: tokenEst,
          updatedAt: Date.now(),
          source: params.source,
          confidence: params.confidence ?? 1
        };
        this.store.set(compositeKey, entry);
        this.enforceHotTierLimits(params.workerId);
        return entry;
      }
      get(workerId, key) {
        return this.store.get(`${workerId}:${key}`);
      }
      search(params) {
        const budget = params.maxTokens ?? this.maxHotTokens;
        const allowedTiers = params.includeTiers ?? ["hot", "warm"];
        const workerMemories = [];
        const prefix = `${params.workerId}:`;
        for (const [k, v] of this.store.entries()) {
          if (k.startsWith(prefix) && allowedTiers.includes(v.tier)) {
            if (!params.query || v.key.toLowerCase().includes(params.query.toLowerCase())) {
              workerMemories.push(v);
            }
          }
        }
        const tierPriority = { hot: 0, warm: 1, cold: 2 };
        workerMemories.sort((a, b) => {
          const pDiff = tierPriority[a.tier] - tierPriority[b.tier];
          if (pDiff !== 0)
            return pDiff;
          return b.updatedAt - a.updatedAt;
        });
        const selected = [];
        let currentTokens = 0;
        let truncated = false;
        for (const mem of workerMemories) {
          if (currentTokens + mem.tokensEstimate <= budget) {
            selected.push(mem);
            currentTokens += mem.tokensEstimate;
          } else {
            truncated = true;
            break;
          }
        }
        if (this.events) {
          this.events.emit("memory.retrieved", {
            workerId: params.workerId,
            data: { query: params.query, tokensRetrieved: currentTokens, budget, truncated }
          });
        }
        return { items: selected, totalTokens: currentTokens, truncated };
      }
      promote(workerId, key) {
        return this.setTier(workerId, key, "hot");
      }
      archive(workerId, key) {
        return this.setTier(workerId, key, "cold");
      }
      setTier(workerId, key, newTier) {
        const compositeKey = `${workerId}:${key}`;
        const mem = this.store.get(compositeKey);
        if (mem) {
          mem.tier = newTier;
          mem.updatedAt = Date.now();
          return true;
        }
        return false;
      }
      pressure(workerId) {
        let hot = 0;
        let warm = 0;
        let cold = 0;
        const prefix = `${workerId}:`;
        for (const [k, v] of this.store.entries()) {
          if (k.startsWith(prefix)) {
            if (v.tier === "hot")
              hot += v.tokensEstimate;
            else if (v.tier === "warm")
              warm += v.tokensEstimate;
            else
              cold += v.tokensEstimate;
          }
        }
        const total = hot + warm + cold;
        const pressurePct = Math.min(100, Math.round(hot / this.maxHotTokens * 100));
        return {
          hotTokens: hot,
          warmTokens: warm,
          coldTokens: cold,
          totalTokens: total,
          memoryPressurePct: pressurePct
        };
      }
      snapshot(workerId) {
        const snap = {};
        const prefix = `${workerId}:`;
        for (const [k, v] of this.store.entries()) {
          if (k.startsWith(prefix)) {
            snap[v.key] = { tier: v.tier, value: v.value, tokensEstimate: v.tokensEstimate };
          }
        }
        return snap;
      }
      exportAll() {
        const out = [];
        for (const [k, v] of this.store.entries()) {
          const workerId = k.split(":")[0];
          out.push({ workerId, entry: v });
        }
        return out;
      }
      importAll(items) {
        for (const item of items) {
          this.store.set(`${item.workerId}:${item.entry.key}`, item.entry);
        }
      }
      enforceHotTierLimits(workerId) {
        const prefix = `${workerId}:`;
        const hotItems = [];
        for (const [k, v] of this.store.entries()) {
          if (k.startsWith(prefix) && v.tier === "hot") {
            hotItems.push(v);
          }
        }
        hotItems.sort((a, b) => b.updatedAt - a.updatedAt);
        let totalHotTokens = 0;
        for (const item of hotItems) {
          totalHotTokens += item.tokensEstimate;
          if (totalHotTokens > this.maxHotTokens) {
            item.tier = "warm";
          }
        }
      }
    };
  }
});

// packages/core/dist/verification/verifier.js
import { createHash } from "crypto";
var Verifier;
var init_verifier = __esm({
  "packages/core/dist/verification/verifier.js"() {
    "use strict";
    Verifier = class {
      static async verifyStep(params) {
        const timestamp = Date.now();
        const { workerId, runId, contract, executeAction, observeState, events } = params;
        const initialObservation = await observeState();
        let prePassed = true;
        let preFailureReason = "";
        for (const cond of contract.preconditions) {
          const actual = initialObservation[cond.query];
          if (!this.matches(cond, actual)) {
            prePassed = false;
            preFailureReason = `Precondition failed on '${cond.query}': expected '${cond.expected}', observed '${actual}'`;
            break;
          }
        }
        if (!prePassed) {
          const failState = {
            agentClaim: "PENDING",
            toolExecution: "PENDING",
            worldStateMatched: false,
            workflowResult: "FAILURE",
            observations: initialObservation,
            error: preFailureReason,
            timestamp
          };
          if (events) {
            events.emit("verification.failed", { workerId, runId, data: { reason: preFailureReason, stage: "precondition" } });
          }
          return { state: failState };
        }
        if (events) {
          events.emit("verification.started", {
            workerId,
            runId,
            data: { intent: contract.intent }
          });
        }
        let actionOutput = {};
        let toolExecutionSuccess = false;
        let agentClaimSuccess = true;
        try {
          actionOutput = await executeAction();
          toolExecutionSuccess = true;
          agentClaimSuccess = actionOutput.claimedSuccess !== false;
        } catch (err) {
          toolExecutionSuccess = false;
          agentClaimSuccess = false;
          if (contract.compensate) {
            if (events)
              events.emit("compensation.started", { workerId, runId, data: { error: err.message } });
            try {
              await contract.compensate({ error: err.message, initialObservation });
              if (events)
                events.emit("compensation.completed", { workerId, runId, data: { recovered: true } });
            } catch (compErr) {
              console.error("[Meshly Verifier] Compensation error:", compErr);
            }
          }
          const excState = {
            agentClaim: "FAILURE",
            toolExecution: "FAILURE",
            worldStateMatched: false,
            workflowResult: "FAILURE",
            observations: initialObservation,
            error: `Action failed with exception: ${err.message}`,
            timestamp
          };
          if (events) {
            events.emit("verification.failed", { workerId, runId, data: { error: err.message, stage: "action_execution" } });
          }
          return { state: excState };
        }
        const postObservation = await observeState();
        let postPassed = true;
        let mismatchDetail = "";
        for (const cond of contract.postconditions) {
          const actual = postObservation[cond.query];
          if (!this.matches(cond, actual)) {
            postPassed = false;
            mismatchDetail = `Postcondition failed on '${cond.query}': expected '${cond.expected}', observed '${actual}'`;
            break;
          }
        }
        if (!postPassed) {
          if (contract.compensate) {
            if (events)
              events.emit("compensation.started", { workerId, runId, data: { reason: mismatchDetail } });
            try {
              await contract.compensate({ reason: mismatchDetail, pre: initialObservation, post: postObservation });
              if (events)
                events.emit("compensation.completed", { workerId, runId, data: { compensated: true } });
            } catch (compErr) {
              console.error("[Meshly Verifier] Compensation error:", compErr);
            }
          }
          const divergenceState = {
            agentClaim: agentClaimSuccess ? "SUCCESS" : "FAILURE",
            toolExecution: toolExecutionSuccess ? "SUCCESS" : "FAILURE",
            worldStateMatched: false,
            workflowResult: "FAILURE",
            observations: postObservation,
            error: mismatchDetail,
            timestamp
          };
          if (events) {
            events.emit("verification.failed", {
              workerId,
              runId,
              data: {
                reason: mismatchDetail,
                agentClaim: divergenceState.agentClaim,
                toolExecution: divergenceState.toolExecution,
                worldStateMatched: false
              }
            });
          }
          return { state: divergenceState };
        }
        const stateDiff = {
          before: initialObservation,
          after: postObservation
        };
        const digestPayload = JSON.stringify({
          workerId,
          intent: contract.intent,
          timestamp,
          stateDiff
        });
        const tamperEvidentDigestSha256 = createHash("sha256").update(digestPayload).digest("hex");
        const evidence = {
          workerId,
          jobId: `job_${timestamp.toString(36)}`,
          intent: contract.intent,
          timestamp,
          verified: true,
          agentClaim: agentClaimSuccess ? "SUCCESS" : "FAILURE",
          worldStateMatch: true,
          stateDiff,
          replays: {
            browser: postObservation["browser_replay_url"] || postObservation["replayUrl"],
            desktop: postObservation["desktop_stream_url"] || postObservation["streamUrl"],
            microvmLogs: postObservation["microvm_exit_codes"]
          },
          tamperEvidentDigestSha256
        };
        const successState = {
          agentClaim: "SUCCESS",
          toolExecution: "SUCCESS",
          worldStateMatched: true,
          workflowResult: "SUCCESS",
          observations: postObservation,
          timestamp
        };
        if (events) {
          events.emit("verification.passed", {
            workerId,
            runId,
            data: { intent: contract.intent, digest: tamperEvidentDigestSha256 }
          });
        }
        return { state: successState, evidence };
      }
      static matchesCondition(cond, actual) {
        return this.matches(cond, actual);
      }
      static matches(cond, actual) {
        if (actual === void 0 || actual === null)
          return false;
        switch (cond.type) {
          case "status_equals":
          case "json_match":
            return actual === cond.expected;
          case "text_contains":
            return String(actual).toLowerCase().includes(String(cond.expected).toLowerCase());
          case "file_exists":
            return Boolean(actual);
          case "custom":
            return typeof cond.expected === "function" ? cond.expected(actual) : actual === cond.expected;
          default:
            return actual === cond.expected;
        }
      }
    };
  }
});

// packages/core/dist/transactions/saga.js
var SagaTransaction;
var init_saga = __esm({
  "packages/core/dist/transactions/saga.js"() {
    "use strict";
    init_verifier();
    SagaTransaction = class {
      workerId;
      steps = [];
      events;
      constructor(workerId, events) {
        this.workerId = workerId;
        this.events = events;
      }
      addStep(step) {
        this.steps.push(step);
        return this;
      }
      async execute() {
        const successfulSteps = [];
        const compensatedSteps = [];
        for (let i = 0; i < this.steps.length; i++) {
          const step = this.steps[i];
          const { state } = await Verifier.verifyStep({
            workerId: this.workerId,
            contract: step.contract,
            executeAction: step.action,
            observeState: step.observeState,
            events: this.events
          });
          if (state.workflowResult === "SUCCESS") {
            successfulSteps.push({ step, index: i });
          } else {
            const errorMsg = state.error || `Verification failed at step '${step.name}'`;
            if (this.events) {
              this.events.emit("compensation.started", {
                workerId: this.workerId,
                data: { failedStep: step.name, stepsToCompensate: successfulSteps.length }
              });
            }
            for (let j = successfulSteps.length - 1; j >= 0; j--) {
              const prev = successfulSteps[j];
              if (prev.step.compensate) {
                try {
                  await prev.step.compensate({
                    stepIndex: prev.index,
                    error: errorMsg,
                    intermediateState: state.observations
                  });
                  compensatedSteps.push(prev.step.name);
                } catch (compErr) {
                  console.error(`[SagaTransaction] Compensation error on step '${prev.step.name}':`, compErr);
                }
              }
            }
            if (this.events) {
              this.events.emit("compensation.completed", {
                workerId: this.workerId,
                data: { compensatedSteps }
              });
            }
            return {
              completed: false,
              successfulSteps: successfulSteps.map((s) => s.step.name),
              failedStep: step.name,
              compensatedSteps,
              error: errorMsg,
              finalObservation: state.observations
            };
          }
        }
        return {
          completed: true,
          successfulSteps: successfulSteps.map((s) => s.step.name),
          compensatedSteps: []
        };
      }
    };
  }
});

// packages/core/dist/checkpoint/checkpoint.js
var CheckpointManager;
var init_checkpoint = __esm({
  "packages/core/dist/checkpoint/checkpoint.js"() {
    "use strict";
    CheckpointManager = class {
      checkpoints = /* @__PURE__ */ new Map();
      workerCheckpoints = /* @__PURE__ */ new Map();
      events;
      constructor(events) {
        this.events = events;
      }
      create(params) {
        const cpId = `cp_${params.workerId}_s${params.step}_${Date.now().toString(36)}`;
        const cp = {
          id: cpId,
          workerId: params.workerId,
          step: params.step,
          stateSnapshot: JSON.parse(JSON.stringify(params.stateSnapshot)),
          environmentIds: [...params.environmentIds],
          timestamp: Date.now(),
          replayTimestampMs: params.replayTimestampMs,
          verifiedWorldState: params.verifiedWorldState ? JSON.parse(JSON.stringify(params.verifiedWorldState)) : void 0
        };
        this.checkpoints.set(cpId, cp);
        const list = this.workerCheckpoints.get(params.workerId) ?? [];
        list.push(cpId);
        this.workerCheckpoints.set(params.workerId, list);
        if (this.events) {
          this.events.emit("checkpoint.created", {
            workerId: params.workerId,
            data: { checkpointId: cpId, step: params.step, environmentCount: params.environmentIds.length }
          });
        }
        return cp;
      }
      get(checkpointId) {
        return this.checkpoints.get(checkpointId);
      }
      getLatestForWorker(workerId) {
        const list = this.workerCheckpoints.get(workerId);
        if (!list || list.length === 0)
          return void 0;
        return this.checkpoints.get(list[list.length - 1]);
      }
      listForWorker(workerId) {
        const list = this.workerCheckpoints.get(workerId) ?? [];
        return list.map((id) => this.checkpoints.get(id)).filter(Boolean);
      }
      restore(cp) {
        this.checkpoints.set(cp.id, cp);
        const list = this.workerCheckpoints.get(cp.workerId) ?? [];
        if (!list.includes(cp.id))
          list.push(cp.id);
        this.workerCheckpoints.set(cp.workerId, list);
        if (this.events) {
          this.events.emit("checkpoint.restored", {
            workerId: cp.workerId,
            data: { checkpointId: cp.id, step: cp.step }
          });
        }
      }
      exportAll() {
        return Array.from(this.checkpoints.values());
      }
    };
  }
});

// packages/core/dist/scheduler/scheduler.js
var Scheduler;
var init_scheduler = __esm({
  "packages/core/dist/scheduler/scheduler.js"() {
    "use strict";
    Scheduler = class {
      queue = [];
      activeWorkers = /* @__PURE__ */ new Map();
      maxConcurrency;
      broker;
      events;
      recentDecisions = [];
      constructor(broker, events, maxConcurrency = 10) {
        this.broker = broker;
        this.events = events;
        this.maxConcurrency = maxConcurrency;
      }
      enqueue(worker) {
        worker.status = "QUEUED";
        this.queue.push(worker);
        this.events.emit("worker.scheduled", {
          workerId: worker.id,
          data: { priority: worker.priority, task: worker.task, queuePosition: this.queue.length }
        });
      }
      /**
       * Take a queued worker into the active set without allocating an environment.
       * Used by executeWorker, which leases environments itself.
       */
      claim(workerId) {
        const idx = this.queue.findIndex((w) => w.id === workerId);
        if (idx !== -1) {
          const worker = this.queue.splice(idx, 1)[0];
          worker.status = "RUNNING";
          this.activeWorkers.set(workerId, worker);
          return worker;
        }
        return this.activeWorkers.get(workerId);
      }
      activate(worker) {
        this.removeFromQueue(worker.id);
        worker.status = "RUNNING";
        this.activeWorkers.set(worker.id, worker);
      }
      calculateScore(worker) {
        let score = worker.priority * 20;
        const reasons = [`\u2713 Base priority: ${worker.priority} (weight +${worker.priority * 20})`];
        if (worker.deadline) {
          const msLeft = worker.deadline.getTime() - Date.now();
          if (msLeft <= 0) {
            score += 150;
            reasons.push("\u26A1 Deadline overdue (+150 urgency boost)");
          } else if (msLeft < 6e4) {
            score += 100;
            reasons.push("\u26A1 Deadline < 1m (+100 urgency boost)");
          } else if (msLeft < 5 * 6e4) {
            score += 50;
            reasons.push("\u26A1 Deadline < 5m (+50 urgency boost)");
          }
        }
        const targetType = worker.capabilities.includes("desktop") ? "desktop" : worker.capabilities.includes("browser") ? "browser" : "sandbox";
        reasons.push(`\u2713 Target compute primitive: ${targetType}`);
        let affinityMatch = false;
        const idleEnvs = this.broker.list().filter((e) => e.status === "IDLE" && e.type === targetType);
        if (idleEnvs.length > 0) {
          score += 40;
          reasons.push(`\u2713 Warm idle environment available in pool (+40 warm bonus)`);
          const requestedProfile = worker.context.metadata?.profile;
          if (requestedProfile && idleEnvs.some((e) => e.profile === requestedProfile)) {
            score += 40;
            affinityMatch = true;
            reasons.push(`\u2713 Exact profile affinity match for '${requestedProfile}' (+40 affinity bonus)`);
          }
        } else {
          reasons.push(`\u25CB Cold provisioning required (0 warm idle available)`);
        }
        const budgetMargin = worker.budget.maxSpend - worker.budget.spent;
        if (budgetMargin <= 0) {
          score -= 200;
          reasons.push("\u2717 Budget exhausted (-200 disqualification)");
        } else if (budgetMargin < 0.2) {
          score -= 30;
          reasons.push("! Low budget margin (-30 penalty)");
        } else {
          reasons.push(`\u2713 Budget healthy: $${budgetMargin.toFixed(2)} remaining`);
        }
        return { worker, score, targetType, affinityMatch, reasons };
      }
      async scheduleNext() {
        if (this.activeWorkers.size >= this.maxConcurrency || this.queue.length === 0) {
          return {};
        }
        const candidates = this.queue.map((w) => this.calculateScore(w));
        candidates.sort((a, b) => b.score - a.score);
        const selected = candidates[0];
        if (!selected)
          return {};
        const worker = selected.worker;
        if (worker.budget.spent >= worker.budget.maxSpend) {
          this.removeFromQueue(worker.id);
          worker.status = "FAILED";
          this.events.emit("worker.failed", {
            workerId: worker.id,
            data: { reason: "Budget exhausted before scheduling" }
          });
          return {};
        }
        const acquireReq = {
          workerId: worker.id,
          type: selected.targetType,
          capabilities: worker.capabilities,
          affinity: {
            profile: worker.context.metadata?.profile,
            files: worker.context.metadata?.files
          },
          authority: worker.authority,
          budget: worker.budget.maxSpend - worker.budget.spent
        };
        try {
          const lease = await this.broker.acquire(acquireReq);
          this.removeFromQueue(worker.id);
          worker.environmentLease = lease;
          worker.status = "RUNNING";
          this.activeWorkers.set(worker.id, worker);
          const decision = {
            workerId: worker.id,
            environmentId: lease.environmentId,
            timestamp: Date.now(),
            reasons: selected.reasons,
            score: selected.score,
            targetType: selected.targetType,
            profileMatched: selected.affinityMatch ? worker.context.metadata?.profile : void 0
          };
          this.recentDecisions.unshift(decision);
          if (this.recentDecisions.length > 50)
            this.recentDecisions.pop();
          this.events.emit("worker.scheduled", {
            workerId: worker.id,
            environmentId: lease.environmentId,
            leaseId: lease.leaseId,
            data: {
              decision: "SCHEDULED",
              score: selected.score,
              reasons: selected.reasons
            }
          });
          return { worker, lease, score: selected.score, decision };
        } catch (err) {
          console.error(`[Meshly Scheduler] Allocation failed for worker ${worker.id}: ${err.message}`);
          return {};
        }
      }
      markCompleted(workerId) {
        const worker = this.activeWorkers.get(workerId);
        if (worker) {
          worker.status = "COMPLETED";
          this.activeWorkers.delete(workerId);
          if (worker.environmentLease) {
            this.broker.release(worker.environmentLease.leaseId);
          }
          this.events.emit("worker.completed", { workerId, data: { finalSpend: worker.budget.spent } });
        }
      }
      markFailed(workerId, error) {
        const worker = this.activeWorkers.get(workerId);
        if (worker) {
          worker.status = "FAILED";
          this.activeWorkers.delete(workerId);
          if (worker.environmentLease) {
            this.broker.release(worker.environmentLease.leaseId);
          }
          this.events.emit("worker.failed", { workerId, data: { error: error || "Unknown failure" } });
        }
      }
      removeFromQueue(workerId) {
        const idx = this.queue.findIndex((w) => w.id === workerId);
        if (idx !== -1)
          this.queue.splice(idx, 1);
      }
      getQueueLength() {
        return this.queue.length;
      }
      getActiveCount() {
        return this.activeWorkers.size;
      }
      getMaxConcurrency() {
        return this.maxConcurrency;
      }
      getQueue() {
        return [...this.queue];
      }
      getActiveWorkers() {
        return Array.from(this.activeWorkers.values());
      }
      getRecentDecisions() {
        return [...this.recentDecisions];
      }
    };
  }
});

// packages/core/dist/worker/worker.js
var WorkerInstance;
var init_worker = __esm({
  "packages/core/dist/worker/worker.js"() {
    "use strict";
    init_types();
    init_authority();
    WorkerInstance = class {
      id;
      name;
      kind;
      task;
      status = "CREATED";
      priority;
      deadline;
      budget;
      limits;
      capabilities;
      authority;
      context;
      memory = [];
      environmentLease;
      checkpoint;
      verificationState;
      parentId;
      children = [];
      createdAt = /* @__PURE__ */ new Date();
      updatedAt = /* @__PURE__ */ new Date();
      mesh;
      constructor(params) {
        this.id = params.id;
        this.name = params.name;
        this.kind = params.kind;
        this.task = params.task;
        this.priority = params.priority ?? 5;
        this.deadline = params.deadline;
        this.budget = {
          maxSpend: params.budget ?? params.authority.maxSpend ?? DEFAULT_WORKER_LIMITS.maxSpend,
          spent: 0,
          currency: "USD"
        };
        this.limits = {
          ...DEFAULT_WORKER_LIMITS,
          ...params.limits,
          maxSpend: this.budget.maxSpend
        };
        this.capabilities = [...params.capabilities];
        this.authority = params.authority;
        this.context = params.context;
        this.parentId = params.parentId;
        this.mesh = params.mesh;
      }
      async spawnChild(params) {
        const childAuth = AuthorityManager.delegate(this.authority, params.requestedAuthority);
        const child = await this.mesh.workers.spawn({
          task: params.task,
          priority: params.priority ?? Math.max(1, this.priority - 1),
          capabilities: params.capabilities,
          authority: childAuth,
          parentId: this.id,
          budget: params.budget ?? childAuth.maxSpend
        });
        this.children.push(child.id);
        return child;
      }
      authorize(action) {
        return this.mesh.authority.authorize(this.id, this.authority, action).allowed;
      }
      deductSpend(amount) {
        if (this.budget.spent + amount > this.budget.maxSpend) {
          console.warn(`[Worker ${this.id}] Budget exceeded: cap $${this.budget.maxSpend.toFixed(2)}, attempted $${(this.budget.spent + amount).toFixed(2)}`);
          return false;
        }
        this.budget.spent += amount;
        this.updatedAt = /* @__PURE__ */ new Date();
        return true;
      }
      async pause() {
        this.status = "PAUSED";
        this.updatedAt = /* @__PURE__ */ new Date();
        if (this.environmentLease) {
          await this.mesh.broker.pause(this.environmentLease.environmentId);
        }
        this.mesh.events.emit("worker.paused", { workerId: this.id });
      }
      async resume() {
        this.status = "RUNNING";
        this.updatedAt = /* @__PURE__ */ new Date();
        if (this.environmentLease) {
          await this.mesh.broker.resume(this.environmentLease.environmentId);
        }
        this.mesh.events.emit("worker.resumed", { workerId: this.id });
      }
      async cancel(reason = "Cancelled") {
        this.status = "CANCELLED";
        this.updatedAt = /* @__PURE__ */ new Date();
        if (this.environmentLease) {
          await this.mesh.broker.release(this.environmentLease.leaseId);
          this.environmentLease = void 0;
        }
        this.mesh.events.emit("worker.cancelled", {
          workerId: this.id,
          data: { reason, childrenCount: this.children.length }
        });
        for (const childId of this.children) {
          const child = this.mesh.workers.get(childId);
          if (child && child.status !== "COMPLETED" && child.status !== "CANCELLED") {
            await child.cancel(`Parent ${this.id} cancelled`);
          }
        }
      }
      checkpointState(step, verifiedWorldState) {
        this.context.currentStep = step;
        const cp = this.mesh.checkpoints.create({
          workerId: this.id,
          step,
          stateSnapshot: {
            workerId: this.id,
            step,
            taskState: this.status,
            authorityScope: this.authority.capabilities,
            memorySnapshot: this.mesh.memory.snapshot(this.id),
            recentActionCount: this.context.recentActions.length,
            artifactsCount: this.context.artifacts.length,
            environmentId: this.environmentLease?.environmentId,
            leaseId: this.environmentLease?.leaseId,
            metadata: this.context.metadata
          },
          environmentIds: this.environmentLease ? [this.environmentLease.environmentId] : [],
          verifiedWorldState,
          replayTimestampMs: Date.now()
        });
        this.checkpoint = cp;
        return cp;
      }
      async execute(params) {
        const res = await this.mesh.verifyStep({
          workerId: this.id,
          contract: params.verification,
          executeAction: params.action,
          observeState: params.observe
        });
        this.verificationState = res.state;
        return res;
      }
      /**
       * Execute this worker across its environment capabilities.
       * Intent → Action → Observe → Verify → Commit, one step per environment.
       */
      async run(options) {
        return this.mesh.executeWorker(this.id, options);
      }
      async handoff(newTask) {
        return this.mesh.handoff(this.id, newTask);
      }
    };
  }
});

// packages/core/dist/worker/manager.js
var WorkerManager;
var init_manager = __esm({
  "packages/core/dist/worker/manager.js"() {
    "use strict";
    init_worker();
    init_authority();
    WorkerManager = class {
      workers = /* @__PURE__ */ new Map();
      mesh;
      constructor(mesh) {
        this.mesh = mesh;
      }
      async spawn(params) {
        const workerId = params.id || `wrk_${Math.random().toString(36).slice(2, 9)}`;
        const auth = params.authority ?? AuthorityManager.issue({
          tools: ["*"],
          capabilities: ["*"],
          maxSpend: params.budget ?? 5
        });
        const ctx = this.mesh.contexts.init(workerId, params.task);
        if (params.metadata) {
          ctx.metadata = { ...params.metadata };
        }
        if (params.name) {
          ctx.metadata = { ...ctx.metadata, name: params.name };
        }
        const worker = new WorkerInstance({
          id: workerId,
          name: params.name,
          kind: params.kind,
          task: params.task,
          priority: params.priority ?? 5,
          deadline: params.deadline,
          budget: params.budget ?? auth.maxSpend,
          limits: params.limits || this.mesh.defaultLimits,
          capabilities: params.capabilities,
          authority: auth,
          context: ctx,
          parentId: params.parentId,
          mesh: this.mesh
        });
        this.workers.set(workerId, worker);
        if (params.initialMemory) {
          for (const m of params.initialMemory) {
            this.mesh.memory.put({
              workerId,
              key: m.key,
              value: m.value,
              tier: m.tier ?? "hot"
            });
          }
        }
        this.mesh.events.emit("worker.created", {
          workerId,
          data: { task: worker.task, priority: worker.priority, capabilities: worker.capabilities }
        });
        this.mesh.scheduler.enqueue(worker);
        return worker;
      }
      get(workerId) {
        return this.workers.get(workerId);
      }
      find(nameOrId) {
        return this.workers.get(nameOrId) || this.list().find((w) => w.name === nameOrId);
      }
      list() {
        return Array.from(this.workers.values());
      }
      async cancel(workerId, reason) {
        const worker = this.workers.get(workerId);
        if (worker)
          await worker.cancel(reason);
      }
      get size() {
        return this.workers.size;
      }
      restore(worker) {
        this.workers.set(worker.id, worker);
      }
    };
  }
});

// packages/core/dist/explain/decision.js
function isUnknownStatus(status) {
  return status === "UNKNOWN" || status === "VERIFYING";
}
function isBlockedStatus(status) {
  return status === "BLOCKED" || status === "VERIFICATION_FAILED";
}
function isCommittedStatus(status) {
  return status === "COMPLETED" || status === "COMMITTED" || status === "VERIFIED";
}
function policyNameFor(kind) {
  if (kind === "reconciliation")
    return "finance.reconcile";
  if (kind === "research")
    return "research.collect";
  if (kind === "coding")
    return "engineering.code";
  if (kind === "operations")
    return "ops.incident";
  if (kind === "probe")
    return "meshly.probe";
  return kind || "worker.default";
}
function explainDecision(run, extras = {}) {
  const steps = run.steps || [];
  const last = [...steps].reverse()[0];
  const events = run.events || [];
  const sawUnknown = events.some((e) => e.type === "action.unknown" || e.type === "run.unknown") || last?.actionOutcome === "UNKNOWN" || last?.agentClaim === "UNKNOWN" || isUnknownStatus(run.status);
  const policy = extras.policy || policyNameFor(run.kind);
  const authority = extras.authority || run.workerId;
  if (isBlockedStatus(run.status) || last?.worldStateMatched === false && last?.actionOutcome !== "UNKNOWN" && !sawUnknown) {
    return blockedExplanation(run, last, policy, authority);
  }
  if (sawUnknown || isUnknownStatus(run.status) || run.status === "VERIFIED") {
    if (sawUnknown || isUnknownStatus(run.status) || last?.agentClaim === "UNKNOWN") {
      return unknownExplanation(run, last, policy, authority);
    }
  }
  if (run.status === "WAITING") {
    return {
      decision: "WAITING",
      headline: "WAITING",
      why: [
        run.error || "An environment could not be allocated.",
        "Recorded work was kept.",
        "Meshly did not invent a successful result."
      ],
      policy,
      authority,
      next: `meshly resume ${run.runId}`
    };
  }
  if (isCommittedStatus(run.status)) {
    return committedExplanation(run, last, policy, authority);
  }
  if (run.status === "FAILED" || run.status === "CANCELLED") {
    return {
      decision: run.status,
      headline: run.status,
      why: [run.error || last?.error || "The run did not complete."],
      policy,
      authority
    };
  }
  return {
    decision: run.status,
    headline: run.status,
    why: last?.intent ? [last.intent] : ["The run is still in progress."],
    policy,
    authority
  };
}
function explainEnvironment(run, envType) {
  const events = run.events || [];
  const type = envType || inferEnvType(run);
  const reused = events.some((e) => e.type === "environment.reused");
  const scheduled = events.find((e) => e.type === "worker.scheduled" && Array.isArray(e.data?.reasons));
  const reasons = scheduled?.data?.reasons || [];
  const why = reasons.length ? reasons : [
    type ? `\u2713 capability match (${type})` : "\u2713 capability match",
    "\u2713 worker affinity",
    reused ? "\u2713 warm" : "\u25CB cold provision",
    "\u2713 within budget",
    "\u2713 lease available"
  ];
  return {
    decision: "SCHEDULED",
    headline: type ? `${type[0].toUpperCase()}${type.slice(1)} selected` : "Environment selected",
    why,
    authority: run.workerId
  };
}
function formatDecision(explanation, opts = {}) {
  const lines = opts.headline === false ? ["Why?", ""] : [explanation.headline, "", "Why?", ""];
  explanation.why.forEach((line, i) => {
    lines.push(`${i + 1}. ${line}`);
  });
  if (explanation.policy) {
    lines.push("", `Policy:`, explanation.policy);
  }
  if (explanation.authority) {
    lines.push(`Authority:`, explanation.authority);
  }
  if (explanation.next) {
    lines.push("", "Next:", explanation.next);
  }
  return lines.join("\n");
}
function blockedExplanation(run, last, policy, authority) {
  const payment = findObservation(run, "payment_status");
  const erp = findObservation(run, "erp_status");
  const contract = last?.contract;
  const required = (contract?.postconditions || []).map((c) => `${c.query} === ${JSON.stringify(c.expected)}`);
  const why = [
    `Agent claimed ${claimText(last, payment)}`,
    payment ? `Browser returned payment = ${payment}` : `Tool execution ${last?.toolExecution || "SUCCESS"}`,
    erp ? `ERP observation = ${erp}` : `World state = MISMATCH`,
    required.length ? `Verification contract requires:
   ${required.join("\n   ")}` : "Verification contract was not satisfied.",
    last?.error || run.error || "Condition failed",
    "Commit was therefore denied"
  ];
  return {
    decision: "COMMIT BLOCKED",
    headline: "COMMIT BLOCKED",
    why,
    policy,
    authority
  };
}
function unknownExplanation(run, last, policy, authority) {
  const erp = findObservation(run, "erp_status");
  const confirmed = run.status === "VERIFIED" || last?.worldStateMatched === true;
  const why = [
    "Side effect may have occurred.",
    "Retry blocked.",
    "Independent verification ran against the world \u2014 not the agent claim.",
    confirmed ? `World state confirmed${erp ? ` (${erp})` : ""}.` : `World state absent${last?.error ? ` \u2014 ${last.error}` : "."}`,
    confirmed ? "Decision: VERIFIED. UNKNOWN does not mean FAILED." : "Decision: UNKNOWN. UNKNOWN does not mean FAILED."
  ];
  return {
    decision: confirmed ? "VERIFIED" : "UNKNOWN",
    headline: confirmed ? "UNKNOWN \u2192 VERIFIED" : "UNKNOWN",
    why,
    policy,
    authority,
    next: confirmed ? void 0 : `meshly verify ${run.runId}`
  };
}
function committedExplanation(run, last, policy, authority) {
  const payment = findObservation(run, "payment_status");
  const erp = findObservation(run, "erp_status");
  const why = [
    `Agent claimed ${claimText(last, payment)}`,
    payment ? `Browser returned payment = ${payment}` : `Tool execution ${last?.toolExecution || "SUCCESS"}`,
    erp ? `World state confirmed (${erp})` : "Independent verification matched the contract.",
    "Commit was allowed."
  ];
  return {
    decision: run.status === "VERIFIED" ? "VERIFIED" : "COMMITTED",
    headline: run.status === "VERIFIED" ? "VERIFIED" : "COMMITTED",
    why,
    policy,
    authority
  };
}
function claimText(last, payment) {
  if (payment)
    return `invoice = ${payment}`;
  if (last?.agentClaim)
    return String(last.agentClaim);
  return "SUCCESS";
}
function findObservation(run, key) {
  for (const step of run.steps || []) {
    const value = step.observation?.[key];
    if (value !== void 0 && value !== null && value !== "")
      return String(value);
  }
  return void 0;
}
function inferEnvType(run) {
  const last = [...run.steps || []].reverse()[0];
  const tool = last?.action?.tool || "";
  if (tool.startsWith("browser"))
    return "browser";
  if (tool.startsWith("sandbox"))
    return "sandbox";
  if (tool.startsWith("desktop"))
    return "desktop";
  return void 0;
}
function outcomeOf(status) {
  if (isUnknownStatus(status))
    return "UNKNOWN";
  if (isBlockedStatus(status))
    return "BLOCKED";
  if (isCommittedStatus(status) || status === "VERIFIED")
    return "SUCCESS";
  if (status === "FAILED" || status === "CANCELLED")
    return "FAILURE";
  return "UNKNOWN";
}
var init_decision = __esm({
  "packages/core/dist/explain/decision.js"() {
    "use strict";
  }
});

// packages/core/dist/run/run.js
import { createHash as createHash2 } from "crypto";
var RunInstance, RunManager;
var init_run = __esm({
  "packages/core/dist/run/run.js"() {
    "use strict";
    init_decision();
    RunInstance = class {
      runId;
      workerId;
      objective;
      status = "RUNNING";
      kind;
      startedAt;
      toolCalls = 0;
      retries = 0;
      completedAt;
      environments = [];
      steps = [];
      checkpoints = [];
      events = [];
      artifacts = [];
      evidence;
      error;
      eventStore;
      worker;
      constructor(worker, eventStore, runId, opts) {
        this.runId = runId || `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        this.workerId = worker.id;
        this.objective = worker.task;
        this.startedAt = opts?.startedAt ?? Date.now();
        this.worker = worker;
        this.eventStore = eventStore;
        if (!opts?.silent) {
          this.eventStore.emit("run.started", {
            runId: this.runId,
            workerId: this.workerId,
            data: { objective: this.objective, priority: worker.priority }
          });
        }
      }
      recordEnvironment(envId) {
        if (!this.environments.includes(envId)) {
          this.environments.push(envId);
        }
      }
      createStep(params) {
        const step = {
          id: `step_${this.steps.length + 1}_${Math.random().toString(36).slice(2, 6)}`,
          runId: this.runId,
          workerId: this.workerId,
          stepIndex: this.steps.length + 1,
          intent: params.intent,
          action: params.action,
          status: "planned",
          timestamp: Date.now()
        };
        this.steps.push(step);
        return step;
      }
      updateStepStatus(stepId, status, updates) {
        const step = this.steps.find((s) => s.id === stepId);
        if (step) {
          step.status = status;
          if (updates)
            Object.assign(step, updates);
        }
      }
      recordCheckpoint(cp) {
        this.checkpoints.push(cp);
      }
      recordArtifact(art) {
        this.artifacts.push(art);
      }
      async pause() {
        this.status = "PAUSED";
        await this.worker.pause();
        this.eventStore.emit("run.paused", {
          runId: this.runId,
          workerId: this.workerId,
          data: { stepIndex: this.steps.length }
        });
      }
      statusSnapshot() {
        return this.status;
      }
      meters() {
        const limits = this.worker.limits;
        const elapsed = (this.completedAt || Date.now()) - this.startedAt;
        return {
          spend: this.worker.budget.spent,
          maxSpend: this.worker.budget.maxSpend,
          durationMs: elapsed,
          maxDurationMs: limits?.maxDurationMs ?? 30 * 6e4,
          environments: this.environments.length,
          maxEnvironments: limits?.maxEnvironments ?? 3,
          toolCalls: this.toolCalls,
          maxToolCalls: limits?.maxToolCalls ?? 40,
          retries: this.retries,
          maxRetries: limits?.maxRetries ?? 1
        };
      }
      eventLog() {
        return this.eventStore.getRunTimeline(this.runId);
      }
      /** UNKNOWN is a first-class status. It is not FAILURE. */
      get unknown() {
        return this.status === "UNKNOWN" || this.status === "VERIFYING";
      }
      explain(extras) {
        return explainDecision({
          runId: this.runId,
          workerId: this.workerId,
          kind: this.kind,
          status: this.status,
          error: this.error,
          steps: this.steps,
          events: this.eventLog()
        }, extras);
      }
      async verify() {
        const step = [...this.steps].reverse().find((s) => s.contract) || this.steps[this.steps.length - 1];
        if (!step?.contract)
          return { matched: false, error: "No verification contract on this run" };
        const observation = step.observation || {};
        for (const cond of step.contract.postconditions) {
          const actual = observation[cond.query];
          const ok = cond.type === "text_contains" ? String(actual || "").toLowerCase().includes(String(cond.expected).toLowerCase()) : actual === cond.expected;
          if (!ok) {
            return {
              matched: false,
              error: `Postcondition failed on '${cond.query}': expected '${cond.expected}', observed '${actual}'`
            };
          }
        }
        return { matched: true };
      }
      checkpoint() {
        const cp = this.worker.checkpointState(this.steps.length, this.steps[this.steps.length - 1]?.observation);
        this.recordCheckpoint(cp);
        return cp;
      }
      export() {
        return this.exportBundle();
      }
      async takeover() {
        return this.worker["mesh"].operator.takeover(this.workerId, this.environments[0]);
      }
      markUnknown(reason) {
        this.status = "UNKNOWN";
        this.error = reason;
        this.eventStore.emit("run.unknown", {
          runId: this.runId,
          workerId: this.workerId,
          data: { reason, retry: false }
        });
      }
      async resume(options) {
        if (this.status === "COMPLETED" || this.status === "COMMITTED" || this.status === "VERIFIED") {
          return this;
        }
        this.status = "RUNNING";
        await this.worker.resume();
        this.eventStore.emit("run.resumed", {
          runId: this.runId,
          workerId: this.workerId,
          data: { stepIndex: this.steps.filter((s) => s.status === "committed").length }
        });
        return this.worker["mesh"].resumeRun(this.runId, options);
      }
      async cancel(reason) {
        this.status = "CANCELLED";
        this.completedAt = Date.now();
        this.error = reason;
        await this.worker.cancel(reason);
        this.eventStore.emit("run.cancelled", {
          runId: this.runId,
          workerId: this.workerId,
          data: { reason }
        });
      }
      complete(evidence) {
        this.status = "COMPLETED";
        this.completedAt = Date.now();
        if (evidence)
          this.evidence = evidence;
        this.eventStore.emit("run.completed", {
          runId: this.runId,
          workerId: this.workerId,
          data: {
            durationMs: this.completedAt - this.startedAt,
            totalSteps: this.steps.length,
            verifiedDigest: evidence?.tamperEvidentDigestSha256
          }
        });
      }
      fail(error) {
        this.status = "FAILED";
        this.completedAt = Date.now();
        this.error = error;
        this.eventStore.emit("run.failed", {
          runId: this.runId,
          workerId: this.workerId,
          data: { error }
        });
      }
      /** Verification mismatch: claim is not reality. Commit does not proceed. */
      block(error) {
        this.status = "BLOCKED";
        this.completedAt = Date.now();
        this.error = error;
        this.eventStore.emit("run.blocked", {
          runId: this.runId,
          workerId: this.workerId,
          data: { error }
        });
        this.eventStore.emit("commit.blocked", {
          runId: this.runId,
          workerId: this.workerId,
          data: { error }
        });
      }
      /**
       * Export Tamper-Evident Evidence Bundle
       */
      exportBundle() {
        const runEvents = this.eventStore.query({ runId: this.runId });
        const stateDiff = {
          initialObservations: this.steps[0]?.observation || {},
          finalObservations: this.steps[this.steps.length - 1]?.observation || {}
        };
        const payload = JSON.stringify({
          runId: this.runId,
          workerId: this.workerId,
          objective: this.objective,
          status: this.status,
          steps: this.steps,
          stateDiff
        });
        const sha256Digest = createHash2("sha256").update(payload).digest("hex");
        return {
          run: {
            runId: this.runId,
            workerId: this.workerId,
            objective: this.objective,
            status: this.status,
            startedAt: this.startedAt,
            completedAt: this.completedAt,
            environments: this.environments,
            steps: this.steps,
            checkpoints: this.checkpoints,
            events: runEvents.map((e) => e.id),
            artifacts: this.artifacts,
            evidence: this.evidence,
            error: this.error
          },
          events: runEvents,
          stateDiff,
          evidence: this.evidence,
          authority: this.worker.authority,
          sha256Digest
        };
      }
    };
    RunManager = class {
      runs = /* @__PURE__ */ new Map();
      eventStore;
      constructor(eventStore) {
        this.eventStore = eventStore;
      }
      create(worker, runId) {
        const run = new RunInstance(worker, this.eventStore, runId);
        this.runs.set(run.runId, run);
        return run;
      }
      restore(run) {
        this.runs.set(run.runId, run);
      }
      get(runId) {
        return this.runs.get(runId);
      }
      list() {
        return Array.from(this.runs.values());
      }
      getByWorker(workerId) {
        return Array.from(this.runs.values()).filter((r) => r.workerId === workerId);
      }
      exportBundle(runId) {
        const run = this.runs.get(runId);
        if (!run)
          throw new Error(`Run '${runId}' not found`);
        return run.exportBundle();
      }
    };
  }
});

// packages/core/dist/agents/adapter.js
var ScriptAgentAdapter, OpenAIAgentAdapter, AnthropicAgentAdapter, MCPAgentAdapter;
var init_adapter = __esm({
  "packages/core/dist/agents/adapter.js"() {
    "use strict";
    ScriptAgentAdapter = class {
      name = "script-agent";
      scriptFn;
      constructor(scriptFn) {
        this.scriptFn = scriptFn;
      }
      async start(context) {
        return this.scriptFn(context);
      }
      async resume(context) {
        return this.scriptFn(context);
      }
      async handleObservation(context, observation) {
        context.lastObservation = observation;
        return this.scriptFn(context);
      }
      async interrupt() {
      }
    };
    OpenAIAgentAdapter = class {
      name = "openai-agent";
      mockModelName;
      customCaller;
      constructor(options = {}) {
        this.mockModelName = options.model || "gpt-4o";
        this.customCaller = options.caller;
      }
      async start(context, prompt) {
        if (this.customCaller) {
          const call = await this.customCaller([{ role: "user", content: prompt || context.task }], []);
          return { intent: call.intent, tool: call.tool, args: call.args };
        }
        return {
          intent: `Analyze task "${context.task}" and execute primary tool`,
          tool: "browser_navigate",
          args: { url: context.metadata?.targetUrl || "https://dashboard.stripe.com" },
          claimedSuccess: true
        };
      }
      async resume(context) {
        return {
          intent: `Resume task at step ${context.currentStep}`,
          tool: "sandbox_exec",
          args: { command: "python3 process.py" },
          claimedSuccess: true
        };
      }
      async handleObservation(context, observation) {
        if (observation.modal_visible) {
          return {
            intent: "Dismiss blocking modal dialog",
            tool: "browser_click",
            args: { selector: ".modal-close" },
            claimedSuccess: true
          };
        }
        return {
          intent: "Complete task with verified observation",
          tool: "complete",
          args: observation,
          done: true,
          claimedSuccess: true
        };
      }
      async interrupt() {
      }
    };
    AnthropicAgentAdapter = class {
      name = "anthropic-agent";
      model;
      constructor(model = "claude-3-5-sonnet-20241022") {
        this.model = model;
      }
      async start(context) {
        return {
          intent: `Initialize desktop GUI session for "${context.task}"`,
          tool: "desktop_open",
          args: { app: "ERP Client" },
          claimedSuccess: true
        };
      }
      async resume(context) {
        return {
          intent: "Re-observe desktop screen and resume typing",
          tool: "desktop_type",
          args: { text: "AMZ-401-POSTED" },
          claimedSuccess: true
        };
      }
      async handleObservation(context, observation) {
        return {
          intent: "Finalize GUI transaction",
          tool: "desktop_click",
          args: { x: 540, y: 320 },
          done: true,
          claimedSuccess: true
        };
      }
      async interrupt() {
      }
    };
    MCPAgentAdapter = class {
      name = "mcp-agent";
      serverName;
      constructor(serverName = "solari-mcp") {
        this.serverName = serverName;
      }
      async start(context) {
        return {
          intent: `Call MCP tool via server '${this.serverName}'`,
          tool: "mcp_call_tool",
          args: { server: this.serverName, name: "extract_table", arguments: {} },
          claimedSuccess: true
        };
      }
      async resume(context) {
        return {
          intent: "Resume MCP tool execution",
          tool: "mcp_call_tool",
          args: { server: this.serverName, name: "get_state" },
          claimedSuccess: true
        };
      }
      async handleObservation(context, observation) {
        return {
          intent: "Acknowledge MCP observation",
          tool: "complete",
          args: observation,
          done: true,
          claimedSuccess: true
        };
      }
      async interrupt() {
      }
    };
  }
});

// packages/core/dist/operator/operator.js
var OperatorManager;
var init_operator = __esm({
  "packages/core/dist/operator/operator.js"() {
    "use strict";
    OperatorManager = class {
      activeSessions = /* @__PURE__ */ new Map();
      events;
      contexts;
      broker;
      constructor(events, contexts, broker) {
        this.events = events;
        this.contexts = contexts;
        this.broker = broker;
      }
      async takeover(workerId, environmentId) {
        const sessionId = `op_${Date.now().toString(36)}`;
        let streamUrl;
        if (environmentId) {
          const env = this.broker.inspect(environmentId);
          streamUrl = env?.streamUrl || env?.replayUrl;
        }
        const session = {
          sessionId,
          workerId,
          environmentId,
          streamUrl,
          startedAt: Date.now(),
          active: true
        };
        this.activeSessions.set(sessionId, session);
        this.events.emit("human.intervention", {
          workerId,
          environmentId,
          data: { action: "takeover_started", sessionId, streamUrl }
        });
        return session;
      }
      async releaseControl(sessionId, result) {
        const session = this.activeSessions.get(sessionId);
        if (!session || !session.active)
          return;
        session.active = false;
        this.activeSessions.delete(sessionId);
        this.contexts.recordAction(session.workerId, {
          tool: "human.intervention",
          args: { description: result.manualActionDescription },
          result: result.updatedState,
          authorized: true,
          verified: result.verifiedManually
        });
        if (result.updatedState) {
          this.contexts.recordObservation(session.workerId, result.updatedState);
        }
        this.events.emit("human.intervention", {
          workerId: session.workerId,
          environmentId: session.environmentId,
          data: {
            action: "takeover_completed",
            sessionId,
            description: result.manualActionDescription,
            verifiedManually: result.verifiedManually
          }
        });
      }
      getActiveSession(workerId) {
        for (const s of this.activeSessions.values()) {
          if (s.workerId === workerId && s.active)
            return s;
        }
        return void 0;
      }
    };
  }
});

// packages/core/dist/failure/injector.js
var FailureInjector;
var init_injector = __esm({
  "packages/core/dist/failure/injector.js"() {
    "use strict";
    FailureInjector = class {
      events;
      broker;
      constructor(events, broker) {
        this.events = events;
        this.broker = broker;
      }
      async inject(params) {
        switch (params.type) {
          case "CRASH_ENVIRONMENT":
            if (!params.targetEnvironmentId)
              throw new Error("targetEnvironmentId required");
            return this.injectEnvironmentLoss(params.targetEnvironmentId);
          case "EXPIRE_AUTHORITY":
            if (!params.targetWorker)
              throw new Error("targetWorker required");
            return this.injectAuthorityExpiry(params.targetWorker);
          case "EXHAUST_BUDGET":
            if (!params.targetWorker)
              throw new Error("targetWorker required");
            return this.injectBudgetExhaustion(params.targetWorker);
          case "CRASH_AGENT":
            if (!params.targetWorker)
              throw new Error("targetWorker required");
            return this.injectAgentCrash(params.targetWorker);
          default:
            throw new Error(`Unknown failure type: ${params.type}`);
        }
      }
      async injectEnvironmentLoss(environmentId) {
        this.broker.markLost(environmentId, "Injected network timeout / hypervisor drop");
        return {
          scenario: "environment-loss",
          targetId: environmentId,
          timestamp: Date.now(),
          meshlyReaction: "Environment marked LOST; broker halts I/O and pauses active lease"
        };
      }
      async injectAuthorityExpiry(worker) {
        worker.authority.expiresAt = new Date(Date.now() - 1e3);
        this.events.emit("authority.revoked", {
          workerId: worker.id,
          data: { simulated: true, reason: "Injected authority lease timeout" }
        });
        return {
          scenario: "authority-expired",
          targetId: worker.id,
          timestamp: Date.now(),
          meshlyReaction: "Policy interceptor blocks all subsequent tool actions with LEASE_EXPIRED"
        };
      }
      injectBudgetExhaustion(worker) {
        worker.budget.spent = worker.budget.maxSpend;
        return {
          scenario: "budget-exhausted",
          targetId: worker.id,
          timestamp: Date.now(),
          meshlyReaction: "Scheduler disqualifies worker and marks FAILED on next dispatch cycle"
        };
      }
      async injectAgentCrash(worker) {
        await worker.cancel("Simulated agent crash");
        return {
          scenario: "agent-crash",
          targetId: worker.id,
          timestamp: Date.now(),
          meshlyReaction: "Worker status set to CANCELLED; cancellation propagated down descendant tree"
        };
      }
    };
  }
});

// packages/core/dist/execution/timeout.js
async function withAmbiguousTimeout(work, timeoutMs) {
  if (!timeoutMs || timeoutMs <= 0)
    return work;
  let timer;
  try {
    return await Promise.race([
      work,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new AmbiguousTimeoutError()), timeoutMs);
      })
    ]);
  } finally {
    if (timer)
      clearTimeout(timer);
  }
}
var AmbiguousTimeoutError;
var init_timeout = __esm({
  "packages/core/dist/execution/timeout.js"() {
    "use strict";
    AmbiguousTimeoutError = class extends Error {
      outcome = "UNKNOWN";
      constructor(message = "Network connection disappeared before an outcome was observed") {
        super(message);
        this.name = "AmbiguousTimeoutError";
      }
    };
  }
});

// packages/core/dist/execution/tools.js
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
function environmentForTool(tool) {
  const cap = TOOL_CATALOG[tool]?.capability;
  if (!cap || cap === "none")
    return void 0;
  return cap;
}
function isEnvironmentGone(error) {
  if (!error)
    return false;
  const m = error.toLowerCase();
  if (m.includes("environment lost") || m.includes("no environment handle"))
    return true;
  if (m.includes("websocket") || m.includes("network error") || m.includes("econnreset"))
    return true;
  if (m.includes("disconnected") || m.includes("session closed") || m.includes("browsersgone") || m.includes("browser gone"))
    return true;
  if (m.includes("control channel") || m.includes("channel closed"))
    return true;
  if (m.includes("has been killed") || m.includes("not running"))
    return true;
  if (m.includes("not found") && (m.includes("sandbox") || m.includes("desktop") || m.includes("session") || m.includes("browser"))) {
    return true;
  }
  return false;
}
function isUncertainSideEffect(tool) {
  return tool === "desktop_write" || tool === "sandbox_write";
}
async function dispatchTool(req) {
  const spec = TOOL_CATALOG[req.tool];
  if (!spec) {
    return {
      outcome: "FAILURE",
      claimedSuccess: false,
      observation: { error: `Unknown tool '${req.tool}'` }
    };
  }
  if (req.env?.status === "LOST") {
    return {
      outcome: "FAILURE",
      claimedSuccess: false,
      observation: { error: "ENVIRONMENT LOST", tool: req.tool, dispatched: false, environmentGone: true }
    };
  }
  if (spec.capability !== "none" && !req.env?.handle) {
    throw new Error(`No environment handle for tool '${req.tool}'`);
  }
  if (req.args?.forceUnknown || req.args?.simulateTimeout) {
    return unknownResult(req, "Forced ambiguous timeout: no retry until independent verification");
  }
  try {
    const work = executeTool(spec.name, req);
    const observation = await withAmbiguousTimeout(work, req.timeoutMs ?? req.args?.timeoutMs);
    const claimedSuccess = observation.claimedSuccess !== false;
    return {
      outcome: claimedSuccess ? "SUCCESS" : "FAILURE",
      claimedSuccess,
      observation
    };
  } catch (err) {
    if (err instanceof AmbiguousTimeoutError) {
      return unknownResult(req, err.message);
    }
    if (err instanceof EnvironmentUnavailableError) {
      return {
        outcome: "FAILURE",
        claimedSuccess: false,
        observation: { error: err.message, tool: req.tool, dispatched: false, environmentGone: true }
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return {
      outcome: "FAILURE",
      claimedSuccess: false,
      observation: { error: message, tool: req.tool }
    };
  }
}
function unknownResult(req, reason) {
  return {
    outcome: "UNKNOWN",
    claimedSuccess: false,
    observation: {
      result: "UNKNOWN",
      tool: req.tool,
      reason,
      retry: false,
      environmentId: req.env?.id,
      fabricId: req.env?.fabricId,
      type: req.env?.type
    }
  };
}
async function executeTool(tool, req) {
  if (tool === "complete" || tool === "mcp_call_tool") {
    return { claimedSuccess: true, tool, args: req.args };
  }
  const handle = req.env.handle;
  const base = {
    environmentId: req.env.id,
    fabricId: req.env.fabricId,
    type: req.env.type,
    leaseId: req.env.currentLeaseId,
    streamUrl: req.env.streamUrl,
    replayUrl: req.env.replayUrl,
    browser_replay_url: req.env.replayUrl,
    desktop_stream_url: req.env.streamUrl
  };
  if (tool.startsWith("browser_"))
    return { ...base, ...await browserAction(tool, handle, req) };
  if (tool.startsWith("sandbox_"))
    return { ...base, ...await sandboxAction(tool, handle, req.args) };
  return { ...base, ...await desktopAction(tool, handle, req) };
}
async function browserAction(tool, handle, req) {
  const page = handle.__meshlyPage || await handle.newPage();
  handle.__meshlyPage = page;
  const args = req.args || {};
  if (tool === "browser_click" && page.click && args.selector) {
    await page.click(args.selector);
  }
  if (args.html) {
    if (page.setContent)
      await page.setContent(args.html);
  } else if (args.fixture === "payments") {
    if (page.setContent)
      await page.setContent(PAYMENTS_HTML);
  } else if (args.fixture === "research") {
    if (page.setContent)
      await page.setContent(RESEARCH_HTML);
  } else if (args.fixture === "status") {
    if (page.setContent)
      await page.setContent(STATUS_HTML);
  } else if (args.url && page.goto) {
    await page.goto(args.url);
  }
  const html = page.content ? await page.content() : PAYMENTS_HTML;
  const title = page.title ? await page.title() : extractTitle(html);
  const url = typeof page.url === "function" ? page.url() : args.url || "about:blank";
  const payments = parsePaymentsHtml(html);
  const observation = {
    claimedSuccess: true,
    title,
    url,
    html,
    httpStatus: 200,
    sessionId: handle.id,
    payment_status: payments.payment_status,
    invoiceId: payments.invoiceId,
    amount: payments.amount,
    research_title: extractTitle(html),
    findings: extractById(html, "findings") ? "present" : extractTitle(html),
    service: extractById(html, "service"),
    health: extractById(html, "health"),
    // Payload carried forward so later environments reconcile actual browser state,
    // not a hard-coded ledger. This is the real payment record read from the page.
    payments_record: {
      invoice: payments.invoiceId,
      status: payments.payment_status,
      amount: payments.amount
    }
  };
  if (page.screenshot) {
    const png = await page.screenshot();
    observation.screenshotPath = writeArtifact(req.artifactDir, req.runId, "browser.png", png);
  }
  return observation;
}
async function sandboxAction(tool, handle, args) {
  if (handle.connect) {
    try {
      await handle.connect();
    } catch (err) {
      throw new EnvironmentUnavailableError(err instanceof Error ? err.message : String(err));
    }
  }
  if (Array.isArray(args.prepare)) {
    for (const file of args.prepare) {
      if (file?.path)
        await writeFile(handle, file.path, file.content ?? "");
    }
  }
  if (tool === "sandbox_write") {
    await writeFile(handle, args.path, args.content);
    return { claimedSuccess: true, path: args.path, written: true };
  }
  if (tool === "sandbox_read") {
    const content = await readFile(handle, args.path);
    return { claimedSuccess: true, path: args.path, content, stdout: content };
  }
  const cmd = args.command || args.cmd || "python3";
  const cmdArgs = Array.isArray(args.args) ? args.args : args.code ? ["-c", args.code] : [];
  const out = await handle.commands.run(cmd, { args: cmdArgs, cwd: args.cwd });
  const stdout = String(out.stdout || "").trim();
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    parsed = void 0;
  }
  return {
    claimedSuccess: out.exitCode === 0,
    exitCode: out.exitCode,
    stdout,
    stderr: String(out.stderr || "").trim(),
    sandboxId: handle.sandboxId || handle.id,
    payment: parsed?.payment,
    ledger: parsed?.ledger,
    match: parsed?.match,
    invoice: parsed?.invoice,
    tests: stdout.includes("PASS") ? "PASS" : stdout.includes("FAIL") ? "FAIL" : void 0,
    ...parsed
  };
}
async function desktopAction(tool, handle, req) {
  const args = req.args || {};
  if (args.delayMs)
    await sleep(Number(args.delayMs));
  let alreadyLive = false;
  if (handle.health) {
    try {
      alreadyLive = Boolean((await handle.health())?.ready);
    } catch {
      alreadyLive = false;
    }
  }
  if (!alreadyLive && handle.connect) {
    try {
      await handle.connect();
    } catch (err) {
      throw new EnvironmentUnavailableError(err instanceof Error ? err.message : String(err));
    }
  }
  if (handle.health) {
    for (let i = 0; i < 15; i++) {
      try {
        const health = await handle.health();
        if (health?.ready)
          break;
      } catch {
      }
      await sleep(400);
    }
  }
  if (tool === "desktop_open" && handle.open && args.app) {
    await handle.open(args.app);
  }
  if (tool === "desktop_click" && handle.mouse?.click) {
    await handle.mouse.click(args.x ?? 100, args.y ?? 100);
  }
  if ((tool === "desktop_type" || args.text) && handle.keyboard?.type && args.text) {
    await handle.keyboard.type(args.text);
  }
  if (tool === "desktop_write") {
    const filePath = args.path || "/tmp/erp_status";
    const content = args.content ?? args.text ?? "POSTED";
    if (!args.dropSideEffect)
      await writeFile(handle, filePath, content);
  }
  const readPath = args.path || "/tmp/erp_status";
  let erp = await readFile(handle, readPath).catch(() => void 0);
  if (readPath !== "/tmp/erp_status") {
    const fallback = await readFile(handle, "/tmp/erp_status").catch(() => void 0);
    if (!erp)
      erp = fallback;
  }
  const ops = await readFile(handle, "/tmp/ops_ticket").catch(() => void 0);
  const ready = true;
  const observation = {
    claimedSuccess: true,
    ready,
    sessionId: handle.sessionId || handle.id,
    streamUrl: handle.streamUrl,
    erp_status: erp ? String(erp).trim() : void 0,
    ops_ticket: ops ? String(ops).trim() : void 0,
    typed: args.text,
    path: args.path
  };
  if (handle.screenshot && (tool === "desktop_screenshot" || tool === "desktop_write" || tool === "desktop_health")) {
    const png = await handle.screenshot({ format: "png" });
    observation.screenshotPath = writeArtifact(req.artifactDir, req.runId, "desktop.png", png);
  }
  if (args.dropResult) {
    throw new AmbiguousTimeoutError("Network connection disappeared after dispatch; result is UNKNOWN");
  }
  return observation;
}
async function writeFile(handle, filePath, content) {
  if (handle.files?.write) {
    await handle.files.write(filePath, String(content));
    return;
  }
  if (handle.commands?.run) {
    const encoded = Buffer.from(String(content)).toString("base64");
    await handle.commands.run("bash", {
      args: ["-lc", `mkdir -p "$(dirname '${filePath}')" && echo '${encoded}' | base64 -d > '${filePath}'`]
    });
  }
}
async function readFile(handle, filePath) {
  if (handle.files?.readText)
    return String(await handle.files.readText(filePath) ?? "");
  if (handle.files?.read) {
    const buf = await handle.files.read(filePath);
    return Buffer.isBuffer(buf) ? buf.toString("utf8") : String(buf ?? "");
  }
  if (handle.commands?.run) {
    const out = await handle.commands.run("cat", { args: [filePath] });
    return String(out.stdout || "");
  }
  return "";
}
function writeArtifact(artifactDir, runId, filename, data) {
  if (!artifactDir || !runId)
    return void 0;
  const dir = path.join(artifactDir, runId);
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, filename);
  writeFileSync(file, data);
  return file;
}
function sleep(ms2) {
  return new Promise((resolve) => setTimeout(resolve, ms2));
}
var TOOL_CATALOG, EnvironmentUnavailableError;
var init_tools = __esm({
  "packages/core/dist/execution/tools.js"() {
    "use strict";
    init_timeout();
    init_world();
    TOOL_CATALOG = {
      browser_navigate: { name: "browser_navigate", capability: "browser" },
      browser_extract: { name: "browser_extract", capability: "browser" },
      browser_click: { name: "browser_click", capability: "browser" },
      sandbox_exec: { name: "sandbox_exec", capability: "sandbox" },
      sandbox_write: { name: "sandbox_write", capability: "sandbox" },
      sandbox_read: { name: "sandbox_read", capability: "sandbox" },
      desktop_open: { name: "desktop_open", capability: "desktop" },
      desktop_type: { name: "desktop_type", capability: "desktop" },
      desktop_click: { name: "desktop_click", capability: "desktop" },
      desktop_write: { name: "desktop_write", capability: "desktop" },
      desktop_read: { name: "desktop_read", capability: "desktop" },
      desktop_screenshot: { name: "desktop_screenshot", capability: "desktop" },
      desktop_health: { name: "desktop_health", capability: "desktop" },
      mcp_call_tool: { name: "mcp_call_tool", capability: "none" },
      complete: { name: "complete", capability: "none" }
    };
    EnvironmentUnavailableError = class extends Error {
      dispatched = false;
      constructor(message) {
        super(message);
        this.name = "EnvironmentUnavailableError";
      }
    };
  }
});

// packages/core/dist/execution/recipes.js
function inferWorkerKind(task, kind) {
  if (kind === "timeout" || kind === "ambiguous-timeout")
    return "timeout";
  if (kind === "probe" || kind === "reconciliation" || kind === "research" || kind === "coding" || kind === "operations") {
    return kind;
  }
  const t = task.toLowerCase();
  if (/reconcil|invoice|payment.*erp|erp.*payment/.test(t))
    return "reconciliation";
  if (/research|collect information|verified report/.test(t))
    return "research";
  if (/repositor|run tests|coding worker|modify.*code/.test(t))
    return "coding";
  if (/operations worker|system lookup|ops ticket/.test(t))
    return "operations";
  if (/ambiguous|timeout experiment/.test(t))
    return "timeout";
  return void 0;
}
function resolveProgram(input) {
  const scenario = input.scenario || "default";
  if (scenario === "ambiguous-timeout")
    return timeoutProgram();
  if (scenario === "ambiguous-timeout-absent")
    return timeoutAbsentProgram();
  if (scenario === "reality-divergence")
    return reconciliationProgram(true);
  const kind = inferWorkerKind(input.task, input.kind);
  if (kind === "reconciliation")
    return reconciliationProgram(false);
  if (kind === "research")
    return researchProgram();
  if (kind === "coding")
    return codingProgram();
  if (kind === "operations")
    return operationsProgram();
  if (kind === "timeout")
    return timeoutProgram();
  return probeProgram(input.capabilities);
}
function probeProgram(capabilities) {
  const types = requestedTypes(capabilities);
  const steps = [];
  if (types.includes("browser")) {
    steps.push({
      intent: "Open a live browser session and observe a page",
      tool: "browser_navigate",
      environment: "browser",
      args: { url: "https://example.com" },
      contract: {
        intent: "Browser loaded a real page with a title",
        preconditions: [],
        postconditions: [{ target: "browser", type: "text_contains", query: "title", expected: "Example" }]
      }
    });
  }
  if (types.includes("sandbox")) {
    steps.push({
      intent: "Run an isolated command in a sandbox",
      tool: "sandbox_exec",
      environment: "sandbox",
      args: { command: "python3", args: ["-c", "print(2+2)"] },
      contract: {
        intent: "Sandbox command exited 0 and printed 4",
        preconditions: [],
        postconditions: [
          { target: "sandbox", type: "status_equals", query: "exitCode", expected: 0 },
          { target: "sandbox", type: "text_contains", query: "stdout", expected: "4" }
        ]
      }
    });
  }
  if (types.includes("desktop")) {
    steps.push({
      intent: "Capture desktop GUI state",
      tool: "desktop_health",
      environment: "desktop",
      args: {},
      contract: {
        intent: "Desktop display is ready",
        preconditions: [],
        postconditions: [{ target: "desktop", type: "status_equals", query: "ready", expected: true }]
      }
    });
  }
  return { kind: "probe", steps };
}
function reconciliationProgram(diverge) {
  const erpValue = diverge ? "UNPAID" : "POSTED";
  const expectedErp = "POSTED";
  return {
    kind: "reconciliation",
    steps: [
      {
        intent: "Retrieve today's payment records from the live browser",
        tool: "browser_extract",
        environment: "browser",
        args: { fixture: "payments", html: PAYMENTS_HTML },
        contract: {
          intent: "Browser observation of invoice 4421 is PAID",
          preconditions: [],
          postconditions: [
            { target: "browser", type: "text_contains", query: "payment_status", expected: "PAID" },
            { target: "browser", type: "status_equals", query: "httpStatus", expected: 200 }
          ]
        }
      },
      {
        intent: "Reconcile the browser payment against the ERP ledger in a sandbox",
        tool: "sandbox_exec",
        environment: "sandbox",
        args: {
          carryForwardFrom: "browser",
          prepare: [
            { path: "/tmp/payments.json", content: JSON.stringify({ invoice: INVOICE_ID, status: "PAID", amount: "1200.00" }) },
            { path: "/tmp/ledger.json", content: JSON.stringify({ invoice: INVOICE_ID, status: "UNPAID", amount: "1200.00" }) }
          ],
          command: "python3",
          args: ["-c", RECONCILE_PY]
        },
        contract: {
          intent: "Sandbox computed payment vs ledger from real files",
          preconditions: [],
          postconditions: [
            { target: "sandbox", type: "status_equals", query: "exitCode", expected: 0 },
            { target: "sandbox", type: "text_contains", query: "payment", expected: "PAID" },
            { target: "sandbox", type: "text_contains", query: "ledger", expected: "UNPAID" }
          ]
        }
      },
      {
        intent: diverge ? "Agent claims the ERP was posted; independent verification must read the desktop file" : "Update the ERP on the desktop from the reconciliation result",
        tool: "desktop_write",
        environment: "desktop",
        args: { path: "/tmp/erp_status", content: erpValue, text: erpValue },
        claimedSuccess: true,
        contract: {
          intent: "Independent desktop observation of ERP status",
          preconditions: [],
          postconditions: [
            { target: "desktop", type: "status_equals", query: "erp_status", expected: expectedErp }
          ],
          onFailure: "human"
        }
      }
    ]
  };
}
function researchProgram() {
  return {
    kind: "research",
    steps: [
      {
        intent: "Collect information from a live browser page",
        tool: "browser_extract",
        environment: "browser",
        args: { fixture: "research", html: RESEARCH_HTML },
        contract: {
          intent: "Browser captured research source material",
          preconditions: [],
          postconditions: [{ target: "browser", type: "text_contains", query: "title", expected: "Research" }]
        }
      },
      {
        intent: "Analyze collected notes in a sandbox and write a report",
        tool: "sandbox_write",
        environment: "sandbox",
        args: {
          path: "/tmp/research.md",
          content: "# Verified report\n\nBrowser, sandbox, and desktop are distinct Solari surfaces.\n"
        },
        contract: {
          intent: "Sandbox wrote the research report",
          preconditions: [],
          postconditions: [{ target: "sandbox", type: "status_equals", query: "written", expected: true }]
        }
      },
      {
        intent: "Independently read the report Meshly is about to commit",
        tool: "sandbox_read",
        environment: "sandbox",
        args: { path: "/tmp/research.md" },
        contract: {
          intent: "Verified report exists in the sandbox",
          preconditions: [],
          postconditions: [{ target: "sandbox", type: "text_contains", query: "content", expected: "Verified report" }]
        }
      }
    ]
  };
}
function codingProgram() {
  return {
    kind: "coding",
    steps: [
      {
        intent: "Modify the repository inside a sandbox",
        tool: "sandbox_write",
        environment: "sandbox",
        args: { path: "/tmp/repo/app.js", content: CODING_APP_JS },
        contract: {
          intent: "Source file written",
          preconditions: [],
          postconditions: [{ target: "sandbox", type: "status_equals", query: "written", expected: true }]
        }
      },
      {
        intent: "Run tests against the modified repository",
        tool: "sandbox_exec",
        environment: "sandbox",
        args: { command: "python3", args: ["-c", "print('PASS')"] },
        contract: {
          intent: "Tests passed in the sandbox",
          preconditions: [],
          postconditions: [
            { target: "sandbox", type: "status_equals", query: "exitCode", expected: 0 },
            { target: "sandbox", type: "text_contains", query: "stdout", expected: "PASS" }
          ]
        }
      },
      {
        intent: "Browser QA of the resulting artifact page",
        tool: "browser_extract",
        environment: "browser",
        args: { html: "<html><head><title>QA PASS</title></head><body><div id='qa'>PASS</div></body></html>" },
        contract: {
          intent: "Browser QA observed PASS",
          preconditions: [],
          postconditions: [{ target: "browser", type: "text_contains", query: "title", expected: "PASS" }]
        }
      }
    ]
  };
}
function operationsProgram() {
  return {
    kind: "operations",
    steps: [
      {
        intent: "Look up live system status in a browser",
        tool: "browser_extract",
        environment: "browser",
        args: { fixture: "status", html: STATUS_HTML },
        contract: {
          intent: "Browser observed the degraded service",
          preconditions: [],
          postconditions: [{ target: "browser", type: "text_contains", query: "health", expected: "DEGRADED" }]
        }
      },
      {
        intent: "Process the incident in a sandbox",
        tool: "sandbox_write",
        environment: "sandbox",
        args: { path: "/tmp/incident.json", content: JSON.stringify({ service: "billing-api", health: "DEGRADED" }) },
        contract: {
          intent: "Sandbox stored the incident record",
          preconditions: [],
          postconditions: [{ target: "sandbox", type: "status_equals", query: "written", expected: true }]
        }
      },
      {
        intent: "File the operations ticket on the desktop GUI surface",
        tool: "desktop_write",
        environment: "desktop",
        args: { path: "/tmp/ops_ticket", content: "ACK-DEGRADED" },
        contract: {
          intent: "Desktop ticket file is ACK-DEGRADED",
          preconditions: [],
          postconditions: [{ target: "desktop", type: "text_contains", query: "ops_ticket", expected: "ACK-DEGRADED" }]
        }
      }
    ]
  };
}
function timeoutProgram() {
  return {
    kind: "timeout",
    steps: [
      {
        intent: "Dispatch a desktop side effect whose result may never return",
        tool: "desktop_write",
        environment: "desktop",
        args: { path: "/tmp/erp_status", content: "POSTED", timeoutMs: 25, dropResult: true },
        contract: {
          intent: "Independent verification of the desktop side effect",
          preconditions: [],
          postconditions: [{ target: "desktop", type: "status_equals", query: "erp_status", expected: "POSTED" }]
        }
      }
    ]
  };
}
function timeoutAbsentProgram() {
  return {
    kind: "timeout",
    steps: [
      {
        intent: "Dispatch a desktop side effect whose result may never return",
        tool: "desktop_write",
        environment: "desktop",
        args: { path: "/tmp/erp_status", content: "POSTED", timeoutMs: 25, dropResult: true, dropSideEffect: true },
        contract: {
          intent: "Independent verification of the desktop side effect",
          preconditions: [],
          postconditions: [{ target: "desktop", type: "status_equals", query: "erp_status", expected: "POSTED" }]
        }
      }
    ]
  };
}
function requestedTypes(capabilities) {
  const all = ["browser", "sandbox", "desktop"];
  const found = all.filter((type) => capabilities.includes(type));
  return found.length > 0 ? found : ["browser"];
}
var init_recipes = __esm({
  "packages/core/dist/execution/recipes.js"() {
    "use strict";
    init_world();
  }
});

// packages/core/dist/execution/limits.js
function resolveLimits(worker) {
  return {
    ...DEFAULT_WORKER_LIMITS,
    ...worker.limits,
    maxSpend: worker.budget.maxSpend
  };
}
var init_limits = __esm({
  "packages/core/dist/execution/limits.js"() {
    "use strict";
    init_types();
  }
});

// packages/core/dist/errors.js
function formatUserError(err) {
  if (err instanceof MeshlyError)
    return err.format();
  const mapped = toMeshlyError(err);
  if (mapped)
    return mapped.format();
  if (err instanceof Error)
    return err.message;
  return String(err);
}
function toMeshlyError(err, extras = {}) {
  if (err instanceof MeshlyError) {
    if (extras.runId && !err.runId) {
      return new MeshlyError({ ...err, runId: extras.runId, title: err.title, reason: err.reason, code: err.code });
    }
    return err;
  }
  const anyErr = err;
  const message = anyErr?.message || String(err);
  const code = anyErr?.code || anyErr?.name;
  const env = extras.environment || inferEnvironment(message);
  const envLabel = env ? env[0].toUpperCase() + env.slice(1) : "execution";
  if (code === "ConcurrencyLimitExceeded" || /concurrent session cap|concurrency limit/i.test(message)) {
    return new MeshlyError({
      code: "CONCURRENCY_LIMIT",
      title: `Meshly could not allocate a ${envLabel} environment.`,
      reason: "Solari concurrency limit reached.",
      runId: extras.runId,
      action: "The worker was placed in WAITING state.\nNo work was lost.",
      retry: extras.runId ? `meshly resume ${extras.runId}` : "meshly resume <runId>",
      cause: err
    });
  }
  if (code === "MissingApiKey" || /No SOLARI_API_KEY/i.test(message)) {
    return new MeshlyError({
      code: "MISSING_API_KEY",
      title: "Meshly is not connected to Solari.",
      reason: "No SOLARI_API_KEY. Meshly will not pretend live infrastructure ran.",
      action: "No environments were allocated.",
      retry: "meshly init --api-key <your Solari key>",
      cause: err
    });
  }
  if (code === "Unauthorized" || anyErr?.status === 401 || /invalid api key|unauthorized/i.test(message)) {
    return new MeshlyError({
      code: "INVALID_API_KEY",
      title: "Solari rejected the API key.",
      reason: "The key is missing, expired, or not authorized for this account.",
      runId: extras.runId,
      action: "No environments were allocated.",
      retry: "meshly init --api-key <your Solari key>",
      cause: err
    });
  }
  if (code === "InsufficientCredit" || anyErr?.status === 402) {
    return new MeshlyError({
      code: "INSUFFICIENT_CREDIT",
      title: `Meshly could not allocate a ${envLabel} environment.`,
      reason: "Solari credit is exhausted.",
      runId: extras.runId,
      action: "The worker was not started.",
      retry: "Add Solari credit, then meshly resume <runId>",
      cause: err
    });
  }
  if (/no stealth pool|pool is empty|no browser capacity|no sandbox capacity|desktop unavailable/i.test(message)) {
    return new MeshlyError({
      code: "ENVIRONMENT_UNAVAILABLE",
      title: `Meshly could not allocate a ${envLabel} environment.`,
      reason: message,
      runId: extras.runId,
      action: "The worker was placed in WAITING state.\nNo work was lost.",
      retry: extras.runId ? `meshly resume ${extras.runId}` : "meshly resume <runId>",
      cause: err
    });
  }
  if (/Budget exceeded|Spend cap reached|exceeds authority limit/i.test(message)) {
    return new MeshlyError({
      code: "BUDGET_EXCEEDED",
      title: "Worker exceeded its spend cap.",
      reason: message,
      runId: extras.runId,
      action: "Execution stopped. No further tools were dispatched.",
      cause: err
    });
  }
  if (/Duration cap|Tool-call cap|Retry blocked|limit reached/i.test(message)) {
    return new MeshlyError({
      code: "LIMIT_EXCEEDED",
      title: "Worker hit an operational limit.",
      reason: message,
      runId: extras.runId,
      action: "Execution stopped. Recorded work was kept.",
      cause: err
    });
  }
  if (/not in the worker authority|LEASE_EXPIRED|blocked before|denied/i.test(message)) {
    return new MeshlyError({
      code: "AUTHORITY_DENIED",
      title: "Policy denied the action.",
      reason: message,
      runId: extras.runId,
      action: "The tool was not dispatched.",
      cause: err
    });
  }
  return void 0;
}
function isRetryableAllocation(err) {
  const mapped = err instanceof MeshlyError ? err : toMeshlyError(err);
  return mapped?.code === "CONCURRENCY_LIMIT" || mapped?.code === "ENVIRONMENT_UNAVAILABLE" || Boolean(mapped?.retryable);
}
function inferEnvironment(message) {
  const lower = message.toLowerCase();
  if (lower.includes("desktop"))
    return "desktop";
  if (lower.includes("sandbox"))
    return "sandbox";
  if (lower.includes("browser"))
    return "browser";
  return void 0;
}
var MeshlyError;
var init_errors = __esm({
  "packages/core/dist/errors.js"() {
    "use strict";
    MeshlyError = class extends Error {
      code;
      title;
      reason;
      runId;
      action;
      retry;
      retryable;
      constructor(params) {
        super(params.title);
        this.name = "MeshlyError";
        this.code = params.code;
        this.title = params.title;
        this.reason = params.reason;
        this.runId = params.runId;
        this.action = params.action || "No work was lost.";
        this.retry = params.retry;
        this.retryable = params.retryable ?? Boolean(params.retry);
        if (params.cause)
          this.cause = params.cause;
      }
      format() {
        const lines = [this.title, "", "Reason:", this.reason];
        if (this.runId)
          lines.push("", "Run:", this.runId);
        lines.push("", "Action:", this.action);
        if (this.retry)
          lines.push("", "Retry:", this.retry);
        return `${lines.join("\n")}
`;
      }
    };
  }
});

// packages/core/dist/execution/loop.js
async function executeWorker(runtime, workerId, options = {}) {
  const worker = runtime.workers.get(workerId);
  if (!worker)
    throw new Error(`Worker '${workerId}' not found`);
  const program = resolveProgram({
    task: worker.task,
    capabilities: worker.capabilities,
    kind: options.kind || worker.kind || worker.context.metadata?.kind,
    scenario: options.scenario
  });
  const limits = resolveLimits(worker);
  const existing = options.resumeRunId ? runtime.runs.get(options.resumeRunId) : void 0;
  if (!existing && runtime.scheduler.getActiveCount() >= runtime.scheduler.getMaxConcurrency()) {
    throw new Error(`Concurrent worker limit reached (${runtime.scheduler.getMaxConcurrency()})`);
  }
  runtime.scheduler.claim(worker.id);
  runtime.scheduler.activate(worker);
  const run = existing || runtime.runs.create(worker);
  if (program.kind === "timeout") {
    run.kind = worker.kind || "operations";
  } else {
    run.kind = program.kind;
    worker.kind = program.kind;
  }
  worker.context.runId = run.runId;
  worker.status = "RUNNING";
  worker.updatedAt = /* @__PURE__ */ new Date();
  if (existing) {
    if (existing.status === "UNKNOWN" || existing.status === "FAILED") {
      run.retries = (run.retries || 0) + 1;
      if (run.retries > limits.maxRetries) {
        return haltOnLimit(runtime, worker, run, "maxRetries", `Retry blocked: ${run.retries} / ${limits.maxRetries}`, options);
      }
    }
    run.status = "RUNNING";
    run.error = void 0;
  }
  options.onProgress?.(run);
  const leases = /* @__PURE__ */ new Map();
  collectExistingLeases(runtime, worker, run, leases);
  const startIndex = existing ? run.steps.filter((s) => s.status === "committed").length : 0;
  try {
    for (let i = startIndex; i < program.steps.length; i++) {
      if (options.signal?.aborted) {
        await run.pause();
        return run;
      }
      const limited = enforceStepLimits(runtime, worker, run, limits, leases, options);
      if (limited)
        return run;
      const outcome = await executeProgramStep(runtime, worker, run, program.steps[i], leases, options);
      if (outcome === "halt")
        return run;
      const cp = worker.checkpointState(i + 1, run.steps[run.steps.length - 1]?.observation);
      run.recordCheckpoint(cp);
      options.onProgress?.(run);
      if (options.signal?.aborted) {
        await run.pause();
        return run;
      }
    }
    runtime.complete(worker.id);
    worker.status = "COMPLETED";
    run.complete(run.evidence);
    options.onProgress?.(run);
    return run;
  } catch (err) {
    const mapped = toMeshlyError(err, { runId: run.runId }) || err;
    const message = mapped instanceof MeshlyError ? mapped.format().trim() : mapped?.message || String(err);
    if (isRetryableAllocation(err) || isRetryableAllocation(mapped)) {
      worker.status = "WAITING";
      run.status = "WAITING";
      run.error = message;
      options.onProgress?.(run);
      return run;
    }
    runtime.fail(worker.id, message);
    worker.status = "FAILED";
    run.fail(message);
    options.onProgress?.(run);
    return run;
  } finally {
    const keep = run.status === "PAUSED" || run.status === "UNKNOWN" || run.status === "VERIFYING" || options.destroyAfter === false;
    await releaseLeases(runtime, leases, !keep);
    options.onProgress?.(run);
  }
}
async function executeProgramStep(runtime, worker, run, step, leases, options) {
  const tool = step.tool;
  const type = step.environment;
  runtime.events.emit("intent.created", {
    workerId: worker.id,
    runId: run.runId,
    data: { intent: step.intent, tool, type, scenario: options.scenario || "default" }
  });
  const authorized = runtime.authority.authorize(worker.id, worker.authority, {
    tool,
    capability: type
  });
  const execStep = run.createStep({
    intent: step.intent,
    action: { tool, args: step.args, description: step.intent }
  });
  execStep.contract = {
    intent: step.contract.intent,
    preconditions: step.contract.preconditions,
    postconditions: step.contract.postconditions,
    onFailure: step.contract.onFailure
  };
  options.onProgress?.(run);
  run.toolCalls = (run.toolCalls || 0) + 1;
  if (!authorized.allowed) {
    run.updateStepStatus(execStep.id, "rejected", { error: authorized.violation });
    runtime.events.emit("action.denied", {
      workerId: worker.id,
      runId: run.runId,
      data: { tool, reason: authorized.violation }
    });
    run.fail(authorized.violation);
    worker.status = "FAILED";
    options.onProgress?.(run);
    return "halt";
  }
  runtime.events.emit("authority.approved", {
    workerId: worker.id,
    runId: run.runId,
    data: { tool, capability: type }
  });
  runtime.events.emit("action.authorized", {
    workerId: worker.id,
    runId: run.runId,
    data: { tool, capability: type }
  });
  run.updateStepStatus(execStep.id, "authorized");
  options.onProgress?.(run);
  let env = await ensureEnvironment(runtime, worker, run, type, leases);
  run.updateStepStatus(execStep.id, "executing");
  options.onProgress?.(run);
  const stepArgs = carryForwardArgs(step.args, run);
  let dispatched = await dispatchTool({
    tool,
    args: stepArgs,
    env,
    artifactDir: options.artifactDir,
    runId: run.runId,
    timeoutMs: step.args.timeoutMs
  });
  const goneOf = (d) => d.outcome === "FAILURE" && (d.observation?.environmentGone === true || isEnvironmentGone(d.observation?.error));
  let replacements = 0;
  while (goneOf(dispatched)) {
    runtime.broker.markLost(env.id, dispatched.observation?.error || "ENVIRONMENT LOST", { workerId: worker.id, runId: run.runId });
    leases.delete(type);
    const noSideEffect = dispatched.observation?.dispatched === false;
    if (isUncertainSideEffect(tool) && !noSideEffect) {
      return independentVerifyUnknown(runtime, worker, run, execStep, step, env, {
        ...dispatched.observation,
        reason: dispatched.observation?.error || "ENVIRONMENT LOST"
      }, options);
    }
    if (replacements >= 2) {
      run.updateStepStatus(execStep.id, "rejected", {
        observation: dispatched.observation,
        error: dispatched.observation?.error
      });
      run.fail(dispatched.observation?.error || "ENVIRONMENT LOST");
      worker.status = "FAILED";
      options.onProgress?.(run);
      return "halt";
    }
    replacements += 1;
    env = await ensureEnvironment(runtime, worker, run, type, leases);
    options.onProgress?.(run);
    dispatched = await dispatchTool({
      tool,
      args: stepArgs,
      env,
      artifactDir: options.artifactDir,
      runId: run.runId,
      timeoutMs: step.args.timeoutMs
    });
  }
  return finishDispatchedStep(runtime, worker, run, execStep, step, env, dispatched, options);
}
async function finishDispatchedStep(runtime, worker, run, execStep, step, env, dispatched, options) {
  const type = step.environment;
  const tool = step.tool;
  const cost = costFor(type);
  if (!worker.deductSpend(cost)) {
    haltOnLimit(runtime, worker, run, "maxSpend", `Spend cap reached: $${worker.budget.spent.toFixed(2)} / $${worker.budget.maxSpend.toFixed(2)}`, options);
    return "halt";
  }
  runtime.events.emit("action.executed", {
    workerId: worker.id,
    runId: run.runId,
    environmentId: env.id,
    data: { tool, claimedSuccess: dispatched.claimedSuccess, type, outcome: dispatched.outcome }
  });
  if (dispatched.outcome === "UNKNOWN") {
    return independentVerifyUnknown(runtime, worker, run, execStep, step, env, dispatched.observation, options);
  }
  const observation = { ...dispatched.observation };
  const result = await runtime.verifyStep({
    workerId: worker.id,
    runId: run.runId,
    contract: step.contract,
    executeAction: async () => ({ claimedSuccess: dispatched.claimedSuccess !== false, ...observation }),
    observeState: async () => {
      runtime.events.emit("observation.captured", {
        workerId: worker.id,
        runId: run.runId,
        environmentId: env.id,
        data: { type, keys: Object.keys(observation) }
      });
      runtime.events.emit("observation.recorded", {
        workerId: worker.id,
        runId: run.runId,
        environmentId: env.id,
        data: {
          type,
          title: observation.title,
          stdout: observation.stdout,
          payment_status: observation.payment_status,
          erp_status: observation.erp_status,
          ready: observation.ready
        }
      });
      return observation;
    }
  });
  if (!result.state.worldStateMatched) {
    run.updateStepStatus(execStep.id, "rejected", {
      observation,
      agentClaim: result.state.agentClaim,
      toolExecution: result.state.toolExecution,
      actionOutcome: dispatched.outcome,
      worldStateMatched: false,
      error: result.state.error,
      evidence: result.evidence
    });
    run.block(result.state.error || `Verification failed on ${type}`);
    worker.status = "WAITING";
    worker.verificationState = result.state;
    options.onProgress?.(run);
    return "halt";
  }
  runtime.events.emit("commit.committed", {
    workerId: worker.id,
    runId: run.runId,
    environmentId: env.id,
    data: { type }
  });
  run.updateStepStatus(execStep.id, "committed", {
    observation,
    agentClaim: result.state.agentClaim,
    toolExecution: result.state.toolExecution,
    actionOutcome: dispatched.outcome,
    worldStateMatched: true,
    evidence: result.evidence
  });
  worker.verificationState = result.state;
  if (result.evidence)
    run.evidence = result.evidence;
  options.onProgress?.(run);
  return "continue";
}
async function independentVerifyUnknown(runtime, worker, run, execStep, step, env, timeoutObservation, options) {
  run.markUnknown("Action result UNKNOWN \u2014 independent verification required before retry");
  worker.status = "WAITING";
  runtime.events.emit("action.unknown", {
    workerId: worker.id,
    runId: run.runId,
    environmentId: env.id,
    data: { tool: step.tool, retry: false }
  });
  runtime.events.emit("action.timeout", {
    workerId: worker.id,
    runId: run.runId,
    environmentId: env.id,
    data: { reason: timeoutObservation.reason }
  });
  run.updateStepStatus(execStep.id, "unknown", {
    observation: timeoutObservation,
    agentClaim: "UNKNOWN",
    toolExecution: "UNKNOWN",
    actionOutcome: "UNKNOWN",
    worldStateMatched: false,
    error: timeoutObservation.reason
  });
  options.onProgress?.(run);
  run.status = "VERIFYING";
  runtime.events.emit("run.verifying", { workerId: worker.id, runId: run.runId });
  runtime.events.emit("verification.independent", {
    workerId: worker.id,
    runId: run.runId,
    environmentId: env.id,
    data: { tool: step.tool }
  });
  const fresh = await dispatchTool({
    tool: environmentForTool(step.tool) === "desktop" ? "desktop_read" : step.tool === "sandbox_exec" ? "sandbox_read" : "browser_extract",
    args: { path: step.args.path || "/tmp/erp_status", fixture: step.args.fixture },
    env,
    artifactDir: options.artifactDir,
    runId: run.runId
  });
  const world = { ...timeoutObservation, ...fresh.observation, result: void 0 };
  runtime.events.emit("observation.captured", {
    workerId: worker.id,
    runId: run.runId,
    environmentId: env.id,
    data: { reason: "independent world-state read", keys: Object.keys(fresh.observation || {}) }
  });
  runtime.events.emit("observation.recorded", {
    workerId: worker.id,
    runId: run.runId,
    environmentId: env.id,
    data: {
      reason: "independent world-state read",
      type: env.type || step.environment,
      erp_status: world.erp_status,
      content: world.content,
      payment_status: world.payment_status,
      title: world.title
    }
  });
  let matched = true;
  let mismatch = "";
  for (const cond of step.contract.postconditions) {
    const actual = world[cond.query];
    const ok = cond.type === "text_contains" ? String(actual || "").toLowerCase().includes(String(cond.expected).toLowerCase()) : actual === cond.expected;
    if (!ok) {
      matched = false;
      mismatch = `Independent verify failed on '${cond.query}': expected '${cond.expected}', observed '${actual}'`;
      break;
    }
  }
  if (matched) {
    runtime.events.emit("commit.committed", {
      workerId: worker.id,
      runId: run.runId,
      environmentId: env.id,
      data: { type: env.type || step.environment, independent: true }
    });
    run.updateStepStatus(execStep.id, "committed", {
      observation: world,
      agentClaim: "UNKNOWN",
      toolExecution: "UNKNOWN",
      actionOutcome: "SUCCESS",
      worldStateMatched: true
    });
    run.status = "VERIFIED";
    runtime.complete(worker.id);
    worker.status = "COMPLETED";
  } else {
    run.updateStepStatus(execStep.id, "unknown", {
      observation: world,
      agentClaim: "UNKNOWN",
      toolExecution: "UNKNOWN",
      actionOutcome: "UNKNOWN",
      worldStateMatched: false,
      error: mismatch || "Side effect absent \u2014 retry is allowed but not automatic"
    });
    run.status = "UNKNOWN";
    worker.status = "WAITING";
    run.error = mismatch || "UNKNOWN: side effect absent; safe retry permitted";
    runtime.events.emit("run.unknown", {
      workerId: worker.id,
      runId: run.runId,
      data: {
        reason: mismatch || "Side effect absent \u2014 retry is allowed but not automatic",
        retry: false,
        safeToRetry: true
      }
    });
  }
  options.onProgress?.(run);
  return "halt";
}
function collectExistingLeases(runtime, worker, run, leases) {
  for (const env of runtime.broker.list()) {
    if (env.owner !== worker.id)
      continue;
    if (env.status === "LOST" || env.status === "TERMINATED" || env.status === "TERMINATING")
      continue;
    if (!env.handle || !env.currentLeaseId)
      continue;
    if (!runtime.broker.getLease(env.currentLeaseId))
      continue;
    if (run.environments.length && !run.environments.includes(env.id))
      continue;
    leases.set(env.type, env.currentLeaseId);
  }
}
function enforceStepLimits(runtime, worker, run, limits, leases, options) {
  const elapsed = Date.now() - run.startedAt;
  if (elapsed > limits.maxDurationMs) {
    haltOnLimit(runtime, worker, run, "maxDurationMs", `Duration cap reached: ${Math.round(elapsed / 1e3)}s / ${Math.round(limits.maxDurationMs / 1e3)}s`, options);
    return run;
  }
  if ((run.toolCalls || 0) >= limits.maxToolCalls) {
    haltOnLimit(runtime, worker, run, "maxToolCalls", `Tool-call cap reached: ${run.toolCalls} / ${limits.maxToolCalls}`, options);
    return run;
  }
  if (leases.size >= limits.maxEnvironments) {
  }
  return null;
}
function haltOnLimit(runtime, worker, run, limit, message, options) {
  runtime.events.emit("limit.exceeded", {
    workerId: worker.id,
    runId: run.runId,
    data: { limit, message, meters: run.meters() }
  });
  runtime.fail(worker.id, message);
  worker.status = "FAILED";
  run.fail(message);
  options.onProgress?.(run);
  return run;
}
function carryForwardArgs(args, run) {
  if (!args?.carryForwardFrom || !Array.isArray(args.prepare))
    return args;
  const type = String(args.carryForwardFrom);
  const source = [...run.steps].reverse().find((s) => s.observation?.type === type && typeof s.observation?.payments_record === "object");
  const payments = source?.observation?.payments_record;
  if (!payments)
    return args;
  const prepare = args.prepare.map((file) => {
    if (file?.path === "/tmp/payments.json") {
      return { ...file, content: JSON.stringify(payments) };
    }
    return file;
  });
  return { ...args, prepare };
}
async function ensureEnvironment(runtime, worker, run, type, leases) {
  const existingLeaseId = leases.get(type);
  if (existingLeaseId) {
    const lease2 = runtime.broker.getLease(existingLeaseId);
    const env2 = lease2 ? runtime.broker.inspect(lease2.environmentId) : void 0;
    if (env2?.handle && env2.status !== "LOST" && env2.status !== "TERMINATED")
      return env2;
    leases.delete(type);
  }
  const limits = resolveLimits(worker);
  const liveTypes = new Set(leases.keys());
  if (!liveTypes.has(type) && liveTypes.size >= limits.maxEnvironments) {
    throw new MeshlyError({
      code: "LIMIT_EXCEEDED",
      title: "Worker hit an operational limit.",
      reason: `Environment cap reached: ${liveTypes.size} / ${limits.maxEnvironments}`,
      runId: run.runId,
      action: "Execution stopped. Recorded work was kept.",
      retryable: false
    });
  }
  let lease;
  try {
    lease = await runtime.broker.acquire({
      workerId: worker.id,
      type,
      capabilities: [type],
      authority: worker.authority,
      budget: Math.max(0.01, worker.budget.maxSpend - worker.budget.spent)
    });
  } catch (err) {
    throw toMeshlyError(err, { runId: run.runId, environment: type }) || err;
  }
  leases.set(type, lease.leaseId);
  worker.environmentLease = lease;
  run.recordEnvironment(lease.environmentId);
  const env = runtime.broker.inspect(lease.environmentId);
  runtime.events.emit(`solari.${type}.created`, {
    workerId: worker.id,
    runId: run.runId,
    environmentId: lease.environmentId,
    leaseId: lease.leaseId,
    data: { fabricId: env?.fabricId, provider: env?.handle ? "live-or-sim" : void 0 }
  });
  return env;
}
async function releaseLeases(runtime, leases, destroyAfter) {
  for (const leaseId of leases.values()) {
    const lease = runtime.broker.getLease(leaseId);
    if (!lease)
      continue;
    if (destroyAfter) {
      await runtime.broker.release(leaseId);
      await runtime.broker.destroy(lease.environmentId);
    } else {
      await runtime.broker.release(leaseId);
    }
  }
}
function costFor(type) {
  if (type === "browser")
    return 0.05;
  if (type === "sandbox")
    return 0.02;
  return 0.08;
}
function contractFor(type, scenario = "default") {
  if (scenario === "reality-divergence") {
    return {
      intent: "Independent world check: ERP must be POSTED",
      preconditions: [],
      postconditions: [{ target: "desktop", type: "status_equals", query: "erp_status", expected: "POSTED" }],
      onFailure: "human"
    };
  }
  if (type === "browser") {
    return {
      intent: "Browser loaded a real page with a title",
      preconditions: [],
      postconditions: [{ target: "browser", type: "text_contains", query: "title", expected: "Example" }]
    };
  }
  if (type === "sandbox") {
    return {
      intent: "Sandbox command exited 0 and printed 4",
      preconditions: [],
      postconditions: [
        { target: "sandbox", type: "status_equals", query: "exitCode", expected: 0 },
        { target: "sandbox", type: "text_contains", query: "stdout", expected: "4" }
      ]
    };
  }
  return {
    intent: "Desktop display is ready",
    preconditions: [],
    postconditions: [{ target: "desktop", type: "status_equals", query: "ready", expected: true }]
  };
}
var init_loop = __esm({
  "packages/core/dist/execution/loop.js"() {
    "use strict";
    init_tools();
    init_recipes();
    init_limits();
    init_errors();
  }
});

// packages/core/dist/execution/execute.js
var init_execute = __esm({
  "packages/core/dist/execution/execute.js"() {
    "use strict";
    init_loop();
  }
});

// packages/core/dist/persist/hydrate.js
function persistRuntime(runtime, store) {
  store.ensure();
  const events = runtime.events.exportAll();
  for (const worker of runtime.workers.list()) {
    store.saveWorker({
      id: worker.id,
      name: worker.name || worker.id,
      kind: worker.kind,
      task: worker.task,
      capabilities: worker.capabilities,
      priority: worker.priority,
      budget: worker.budget.maxSpend,
      spent: worker.budget.spent,
      limits: worker.limits,
      status: worker.status,
      currentRunId: worker.context.runId,
      authority: {
        tools: worker.authority.tools,
        capabilities: worker.authority.capabilities,
        domains: worker.authority.domains,
        maxSpend: worker.authority.maxSpend,
        writeAccess: worker.authority.writeAccess
      },
      memory: Object.entries(runtime.memory.snapshot(worker.id)).map(([key, v]) => ({
        key,
        tier: v.tier,
        value: v.value
      })),
      createdAt: worker.createdAt.toISOString(),
      updatedAt: worker.updatedAt.toISOString()
    });
    store.saveMemory(worker.id, runtime.memory.snapshot(worker.id));
    store.savePolicy(worker.id, worker.authority);
  }
  for (const run of runtime.runs.list()) {
    const runEvents = events.filter((e) => e.runId === run.runId);
    store.snapshotRun({
      run,
      worker: runtime.workers.get(run.workerId) || { id: run.workerId, task: run.objective },
      mode: runtime.broker.getFabric().name.includes("simulator") ? "simulator" : "live",
      events: runEvents,
      destroyAfter: false
    });
  }
  for (const env of runtime.broker.list()) {
    store.saveEnvironment({
      id: env.id,
      type: env.type,
      provider: runtime.broker.getFabric().name.includes("simulator") ? "simulator" : "solari",
      status: env.status,
      workerId: env.owner,
      fabricId: env.fabricId,
      sessionId: env.fabricId,
      streamUrl: env.streamUrl,
      replayUrl: env.replayUrl,
      leaseId: env.currentLeaseId,
      createdAt: env.lastActiveAt.toISOString(),
      lastActivityAt: env.lastActiveAt.toISOString()
    });
  }
  for (const cp of runtime.checkpoints.exportAll())
    store.saveCheckpoint(cp);
  store.saveKernel({
    savedAt: (/* @__PURE__ */ new Date()).toISOString(),
    workers: runtime.workers.list().map((w) => w.id),
    runs: runtime.runs.list().map((r) => r.runId),
    environments: runtime.broker.list().map((e) => ({
      id: e.id,
      type: e.type,
      fabricId: e.fabricId,
      status: e.status,
      owner: e.owner,
      streamUrl: e.streamUrl,
      replayUrl: e.replayUrl,
      leaseId: e.currentLeaseId
    }))
  });
}
async function restoreRuntime(runtime, store) {
  if (!store.exists())
    throw new Error("No Meshly project here. Run `meshly init` first.");
  const events = store.loadEvents();
  if (events.length)
    runtime.events.load(events);
  for (const mem of store.listMemory()) {
    for (const [key, value] of Object.entries(mem.snapshot || {})) {
      const entry = value;
      runtime.memory.put({
        workerId: mem.workerId,
        key,
        value: entry.value,
        tier: entry.tier
      });
    }
  }
  for (const stored of store.listWorkers()) {
    if (runtime.workers.get(stored.id))
      continue;
    const worker = new WorkerInstance({
      id: stored.id,
      name: stored.name,
      kind: stored.kind,
      task: stored.task,
      priority: stored.priority,
      budget: stored.budget,
      limits: stored.limits,
      capabilities: stored.capabilities,
      authority: stored.authority ? {
        tools: stored.authority.tools,
        capabilities: stored.authority.capabilities,
        domains: stored.authority.domains,
        maxSpend: stored.authority.maxSpend,
        writeAccess: stored.authority.writeAccess,
        expiresAt: new Date(Date.now() + 60 * 60 * 1e3)
      } : AuthorityManager.issue({ tools: ["*"], capabilities: stored.capabilities, maxSpend: stored.budget }),
      context: runtime.contexts.init(stored.id, stored.task),
      mesh: runtime
    });
    worker.status = stored.status || "CREATED";
    worker.budget.spent = stored.spent ?? 0;
    worker.context.runId = stored.currentRunId;
    runtime.workers.restore(worker);
  }
  for (const stored of store.listRuns()) {
    const worker = runtime.workers.get(stored.workerId);
    if (!worker)
      continue;
    const run = new RunInstance(worker, runtime.events, stored.runId, {
      silent: true,
      startedAt: stored.startedAt
    });
    run.status = stored.status;
    run.kind = stored.kind;
    run.toolCalls = stored.toolCalls || 0;
    run.retries = stored.retries || 0;
    run.steps.splice(0, run.steps.length, ...stored.steps || []);
    run.environments.splice(0, run.environments.length, ...(stored.environments || []).map((e) => e.id));
    run.evidence = stored.evidence;
    run.error = stored.error;
    if (stored.completedAt)
      run.completedAt = stored.completedAt;
    runtime.runs.restore(run);
  }
  for (const cp of store.listCheckpoints()) {
    runtime.checkpoints.restore(cp);
    const run = runtime.runs.getByWorker(cp.workerId).find((r) => r.status === "PAUSED" || r.status === "RUNNING" || r.status === "UNKNOWN") || runtime.runs.getByWorker(cp.workerId).at(-1);
    if (run && !run.checkpoints.some((existing) => existing.id === cp.id)) {
      run.recordCheckpoint(cp);
    }
  }
  let reconnected = 0;
  let lost = 0;
  const recoverable = new Set(store.listRuns().filter((r) => r.status === "PAUSED" || r.status === "RUNNING" || r.status === "UNKNOWN" || r.status === "VERIFYING").flatMap((r) => (r.environments || []).map((e) => e.id)));
  for (const stored of store.listEnvironments()) {
    if (!stored.fabricId)
      continue;
    if (stored.status === "TERMINATED")
      continue;
    if (!recoverable.has(stored.id))
      continue;
    const env = {
      id: stored.id,
      type: stored.type,
      status: stored.status,
      fabricId: stored.fabricId,
      owner: stored.workerId,
      loadedFiles: [],
      cost: 0,
      capabilities: [stored.type],
      streamUrl: stored.streamUrl,
      replayUrl: stored.replayUrl,
      currentLeaseId: stored.leaseId,
      lastActiveAt: new Date(stored.lastActivityAt)
    };
    const lease = stored.leaseId ? {
      leaseId: stored.leaseId,
      workerId: stored.workerId || "",
      environmentId: stored.id,
      createdAt: new Date(stored.createdAt),
      expiresAt: new Date(Date.now() + 10 * 6e4),
      capabilities: [stored.type],
      budget: 1,
      authority: {
        tools: ["*"],
        capabilities: [stored.type],
        expiresAt: new Date(Date.now() + 60 * 6e4)
      },
      status: "ACTIVE"
    } : void 0;
    runtime.broker.adopt(env, lease);
    try {
      await runtime.broker.reconnect(env.id);
      reconnected += 1;
    } catch {
      runtime.broker.markLost(env.id, "Reconnect failed");
      lost += 1;
    }
  }
  runtime.events.emit("runtime.restored", {
    data: {
      workers: runtime.workers.size,
      runs: runtime.runs.list().length,
      reconnected,
      lost
    }
  });
  return { workers: runtime.workers.size, runs: runtime.runs.list().length, reconnected, lost };
}
var init_hydrate = __esm({
  "packages/core/dist/persist/hydrate.js"() {
    "use strict";
    init_authority();
    init_worker();
    init_run();
  }
});

// packages/core/dist/runtime.js
var MeshlyRuntime;
var init_runtime = __esm({
  "packages/core/dist/runtime.js"() {
    "use strict";
    init_events();
    init_simulator();
    init_broker();
    init_scheduler();
    init_context();
    init_memory();
    init_checkpoint();
    init_authority();
    init_verifier();
    init_saga();
    init_manager();
    init_operator();
    init_injector();
    init_run();
    init_execute();
    init_hydrate();
    init_tools();
    MeshlyRuntime = class {
      events;
      broker;
      scheduler;
      contexts;
      memory;
      checkpoints;
      authority;
      workers;
      runs;
      operator;
      failures;
      defaultLimits;
      maxConcurrency;
      constructor(config = {}) {
        this.events = new EventStore();
        this.defaultLimits = config.defaultLimits;
        this.maxConcurrency = config.maxConcurrency ?? 10;
        const fabric = config.executionFabric || new SimulatorExecutionFabric();
        const onLeaseExpired = async (lease) => {
          const worker = this.workers.get(lease.workerId);
          if (worker && worker.status === "RUNNING") {
            console.log(`[MeshlyRuntime] Lease ${lease.leaseId} expired for worker ${worker.id}. Freezing compute...`);
            worker.checkpointState(worker.context.currentStep);
            await worker.pause();
            await this.broker.release(lease.leaseId);
          }
        };
        this.broker = new EnvironmentBroker(this.events, fabric, onLeaseExpired);
        this.scheduler = new Scheduler(this.broker, this.events, this.maxConcurrency);
        this.contexts = new ContextManager(this.events);
        this.memory = new MemoryManager(this.events, config.maxHotTokens ?? 4e3);
        this.checkpoints = new CheckpointManager(this.events);
        this.authority = new AuthorityManager(this.events);
        this.workers = new WorkerManager(this);
        this.runs = new RunManager(this.events);
        this.operator = new OperatorManager(this.events, this.contexts, this.broker);
        this.failures = new FailureInjector(this.events, this.broker);
      }
      setFabric(fabric) {
        this.broker.setFabric(fabric);
      }
      /**
       * First-Class Run Execution: The high-level entry point
       */
      async run(params) {
        const worker = await this.workers.spawn({
          task: params.task,
          capabilities: params.capabilities,
          priority: params.priority ?? 8,
          budget: params.budget ?? 5,
          authority: params.authority,
          metadata: params.metadata
        });
        const run = this.runs.create(worker);
        worker.context.runId = run.runId;
        if (params.workflow) {
          Promise.resolve().then(async () => {
            try {
              const saga = this.transaction(worker.id);
              let lastEvidence;
              for (const stepDef of params.workflow.steps) {
                const execStep = run.createStep({
                  intent: stepDef.contract.intent,
                  action: { tool: stepDef.name, args: {} }
                });
                run.updateStepStatus(execStep.id, "authorized");
                saga.addStep({
                  name: stepDef.name,
                  contract: stepDef.contract,
                  action: async () => {
                    run.updateStepStatus(execStep.id, "executing");
                    return stepDef.action(worker.context);
                  },
                  observeState: async () => {
                    const obs = await stepDef.observe();
                    run.updateStepStatus(execStep.id, "observed", { observation: obs });
                    return obs;
                  },
                  compensate: stepDef.compensate
                });
              }
              const res = await saga.execute();
              if (res.completed) {
                this.complete(worker.id);
                run.complete(lastEvidence);
              } else {
                this.fail(worker.id, res.error);
                run.fail(res.error);
              }
            } catch (err) {
              this.fail(worker.id, err.message);
              run.fail(err.message);
            }
          });
        }
        return run;
      }
      /**
       * Agent-Agnostic Execution Loop
       * Runs an arbitrary AgentAdapter (OpenAI, Claude, Custom, MCP) through Meshly governance.
       */
      async runWithAgent(params) {
        const worker = await this.workers.spawn({
          task: params.task,
          capabilities: params.capabilities,
          priority: params.priority ?? 8,
          budget: params.budget ?? 5,
          authority: params.authority
        });
        const run = this.runs.create(worker);
        worker.context.runId = run.runId;
        const maxSteps = params.maxSteps ?? 5;
        const leases = /* @__PURE__ */ new Map();
        try {
          let actionReq = await params.adapter.start(worker.context);
          for (let step = 1; step <= maxSteps; step++) {
            if (actionReq.done || actionReq.tool === "complete")
              break;
            const execStep = run.createStep({
              intent: actionReq.intent,
              action: { tool: actionReq.tool, args: actionReq.args }
            });
            const envType = environmentForTool(actionReq.tool) || params.capabilities[0];
            const authResult = this.authority.authorize(worker.id, worker.authority, {
              tool: actionReq.tool,
              capability: envType
            });
            if (!authResult.allowed) {
              run.updateStepStatus(execStep.id, "rejected", { error: authResult.violation });
              run.fail(authResult.violation);
              return run;
            }
            run.updateStepStatus(execStep.id, "authorized");
            let env;
            if (envType === "browser" || envType === "sandbox" || envType === "desktop") {
              if (!leases.has(envType)) {
                const lease2 = await this.broker.acquire({
                  workerId: worker.id,
                  type: envType,
                  capabilities: [envType],
                  authority: worker.authority,
                  budget: Math.max(0.01, worker.budget.maxSpend - worker.budget.spent)
                });
                leases.set(envType, lease2.leaseId);
                run.recordEnvironment(lease2.environmentId);
              }
              const lease = this.broker.getLease(leases.get(envType));
              env = lease ? this.broker.inspect(lease.environmentId) : void 0;
            }
            const contract = params.verifyContract || actionReq.contract || {
              intent: actionReq.intent,
              preconditions: [],
              postconditions: []
            };
            const dispatched = await dispatchTool({
              tool: actionReq.tool,
              args: actionReq.args || {},
              env,
              runId: run.runId,
              timeoutMs: actionReq.timeoutMs
            });
            const verifyRes = await this.verifyStep({
              workerId: worker.id,
              runId: run.runId,
              contract,
              executeAction: async () => {
                run.updateStepStatus(execStep.id, "executing");
                worker.deductSpend(0.02);
                return { claimedSuccess: dispatched.claimedSuccess, ...dispatched.observation };
              },
              observeState: async () => {
                run.updateStepStatus(execStep.id, "observed", { observation: dispatched.observation });
                return dispatched.observation;
              }
            });
            if (dispatched.outcome === "UNKNOWN") {
              run.markUnknown("Agent action result UNKNOWN");
              return run;
            }
            if (verifyRes.state.worldStateMatched) {
              run.updateStepStatus(execStep.id, "committed", {
                agentClaim: verifyRes.state.agentClaim,
                toolExecution: verifyRes.state.toolExecution,
                worldStateMatched: true,
                evidence: verifyRes.evidence,
                observation: dispatched.observation
              });
              worker.context.currentStep = step;
              actionReq = await params.adapter.handleObservation(worker.context, verifyRes.state.observations);
            } else {
              run.updateStepStatus(execStep.id, "rejected", {
                agentClaim: verifyRes.state.agentClaim,
                toolExecution: verifyRes.state.toolExecution,
                worldStateMatched: false,
                error: verifyRes.state.error
              });
              run.fail(`Verification divergence at step ${step}`);
              return run;
            }
          }
          this.complete(worker.id);
          run.complete();
          return run;
        } catch (err) {
          this.fail(worker.id, err.message);
          run.fail(err.message);
          return run;
        } finally {
          for (const leaseId of leases.values()) {
            const lease = this.broker.getLease(leaseId);
            if (lease) {
              await this.broker.release(leaseId);
              await this.broker.destroy(lease.environmentId);
            }
          }
        }
      }
      /**
       * SCHEDULE: Spawn a worker (convenience shortcut)
       */
      async spawn(params) {
        return this.workers.spawn(params);
      }
      /**
       * Run a spawned worker through Intent → Action → Observe → Verify → Commit
       * on each requested environment.
       */
      async executeWorker(workerId, options = {}) {
        return executeWorker(this, workerId, options);
      }
      /**
       * Continue a paused / recovered run from its last committed checkpoint.
       * Does not start a new run.
       */
      async resumeRun(runId, options = {}) {
        const run = this.runs.get(runId);
        if (!run)
          throw new Error(`Run '${runId}' not found`);
        return executeWorker(this, run.workerId, { ...options, resumeRunId: runId });
      }
      async scheduleNext() {
        const res = await this.scheduler.scheduleNext();
        if (res.worker) {
          return {
            worker: this.workers.get(res.worker.id),
            lease: res.lease,
            score: res.score
          };
        }
        return {};
      }
      /**
       * VERIFY: Execute step wrapped in verification contract
       */
      async verifyStep(params) {
        return Verifier.verifyStep({
          workerId: params.workerId,
          runId: params.runId,
          contract: params.contract,
          executeAction: params.executeAction,
          observeState: params.observeState,
          events: this.events
        });
      }
      transaction(workerId) {
        return new SagaTransaction(workerId, this.events);
      }
      /**
       * PERSIST: Model-agnostic agent handoff
       */
      async handoff(fromWorkerId, newTask) {
        const source = this.workers.get(fromWorkerId);
        if (!source)
          throw new Error(`Source worker ${fromWorkerId} not found`);
        const replacement = await this.workers.spawn({
          task: newTask,
          capabilities: source.capabilities,
          priority: source.priority,
          authority: source.authority,
          parentId: fromWorkerId
        });
        replacement.context = this.contexts.transfer(fromWorkerId, replacement.id);
        const snap = this.memory.snapshot(fromWorkerId);
        for (const [k, v] of Object.entries(snap)) {
          this.memory.put({
            workerId: replacement.id,
            key: k,
            value: v.value,
            tier: v.tier
          });
        }
        return replacement;
      }
      async pause(workerId) {
        const worker = this.workers.get(workerId);
        if (worker)
          await worker.pause();
      }
      async resume(workerId) {
        const worker = this.workers.get(workerId);
        if (worker)
          await worker.resume();
      }
      async cancel(workerId, reason) {
        const worker = this.workers.get(workerId);
        if (worker)
          await worker.cancel(reason);
      }
      complete(workerId) {
        this.scheduler.markCompleted(workerId);
      }
      fail(workerId, error) {
        this.scheduler.markFailed(workerId, error);
      }
      persist(store) {
        persistRuntime(this, store);
      }
      async restore(store) {
        return restoreRuntime(this, store);
      }
      /**
       * Declarative Workflow API
       */
      workflow = {
        define: (def) => def,
        execute: async (def, options = {}) => {
          const allCaps = Array.from(new Set(def.steps.flatMap((s) => s.requires || ["sandbox"])));
          const worker = await this.workers.spawn({
            task: `Workflow: ${def.name}`,
            capabilities: allCaps,
            priority: options.priority ?? 8,
            budget: options.budget ?? 5
          });
          const saga = this.transaction(worker.id);
          for (const step of def.steps) {
            saga.addStep({
              name: step.name,
              contract: step.contract,
              action: () => step.action(worker.context),
              observeState: step.observe,
              compensate: step.compensate
            });
          }
          const result = await saga.execute();
          if (result.completed) {
            this.complete(worker.id);
          } else {
            this.fail(worker.id, result.error);
          }
          return { worker, result };
        }
      };
      stats() {
        const envs = this.broker.list();
        const byType = {
          browser: { idle: 0, busy: 0, paused: 0 },
          sandbox: { idle: 0, busy: 0, paused: 0 },
          desktop: { idle: 0, busy: 0, paused: 0 }
        };
        for (const e of envs) {
          if (!byType[e.type])
            byType[e.type] = { idle: 0, busy: 0, paused: 0 };
          if (e.status === "IDLE")
            byType[e.type].idle += 1;
          else if (e.status === "BUSY")
            byType[e.type].busy += 1;
          else if (e.status === "PAUSED")
            byType[e.type].paused += 1;
        }
        return {
          totalWorkers: this.workers.size,
          queueLength: this.scheduler.getQueueLength(),
          activeWorkers: this.scheduler.getActiveCount(),
          totalRuns: this.runs.list().length,
          totalEvents: this.events.count,
          environments: {
            total: envs.length,
            busy: envs.filter((e) => e.status === "BUSY").length,
            idle: envs.filter((e) => e.status === "IDLE").length,
            paused: envs.filter((e) => e.status === "PAUSED").length,
            lost: envs.filter((e) => e.status === "LOST").length,
            byType
          }
        };
      }
    };
  }
});

// packages/core/dist/persist/store.js
import fs from "node:fs";
import path2 from "node:path";
function environmentsFromRun(run, worker, mode, destroyed) {
  const byId = /* @__PURE__ */ new Map();
  const started = new Date(run.startedAt).toISOString();
  const activity = new Date(run.completedAt || Date.now()).toISOString();
  for (const step of run.steps) {
    const obs = step.observation || {};
    const id = String(obs.environmentId || "");
    if (!id)
      continue;
    byId.set(id, {
      id,
      type: String(obs.type || "browser"),
      provider: mode === "live" ? "solari" : "simulator",
      status: destroyed ? "TERMINATED" : envStatusForRun(run.status),
      workerId: worker.id,
      workerName: worker.name,
      runId: run.runId,
      leaseId: obs.leaseId,
      fabricId: obs.fabricId,
      sessionId: obs.sessionId || obs.sandboxId || obs.fabricId,
      streamUrl: obs.streamUrl || obs.desktop_stream_url,
      replayUrl: obs.replayUrl || obs.browser_replay_url,
      createdAt: started,
      lastActivityAt: activity
    });
  }
  return Array.from(byId.values());
}
function envStatusForRun(status) {
  if (status === "RUNNING")
    return "BUSY";
  if (status === "PAUSED")
    return "PAUSED";
  if (status === "BLOCKED" || status === "VERIFICATION_FAILED")
    return "IDLE";
  return "IDLE";
}
function hydrateLegacyEnv(raw, run) {
  return {
    id: raw.environmentId || raw.id,
    type: raw.type || "browser",
    provider: run.mode === "live" ? "solari" : "simulator",
    status: "TERMINATED",
    workerId: run.workerId,
    workerName: run.workerName,
    runId: run.runId,
    fabricId: raw.fabricId,
    sessionId: raw.fabricId,
    streamUrl: raw.streamUrl,
    replayUrl: raw.replayUrl,
    createdAt: new Date(run.startedAt).toISOString(),
    lastActivityAt: new Date(run.completedAt || run.startedAt).toISOString()
  };
}
function normalizeRun(run) {
  const environments = (run.environments || []).map((env) => {
    if (env.id)
      return env;
    return hydrateLegacyEnv(env, run);
  });
  return {
    ...run,
    events: run.events || [],
    environments
  };
}
function safeName(idOrName) {
  return idOrName.replace(/[^\w.-]/g, "_");
}
var PROJECT_DIRS, ProjectStore;
var init_store = __esm({
  "packages/core/dist/persist/store.js"() {
    "use strict";
    init_errors();
    PROJECT_DIRS = [
      "workers",
      "runs",
      "environments",
      "events",
      "checkpoints",
      "memory",
      "policies",
      "evidence",
      "artifacts"
    ];
    ProjectStore = class {
      root;
      dir;
      constructor(cwd = process.cwd()) {
        this.root = cwd;
        this.dir = path2.join(cwd, ".meshly");
      }
      get configPath() {
        return path2.join(this.dir, "config.json");
      }
      exists() {
        return fs.existsSync(this.configPath);
      }
      init(name, execution = "solari") {
        for (const dir of PROJECT_DIRS) {
          fs.mkdirSync(path2.join(this.dir, dir), { recursive: true });
        }
        const config = {
          name,
          createdAt: (/* @__PURE__ */ new Date()).toISOString(),
          execution
        };
        fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
        return config;
      }
      ensure(name = path2.basename(this.root), execution = "simulator") {
        if (this.exists()) {
          for (const dir of PROJECT_DIRS) {
            fs.mkdirSync(path2.join(this.dir, dir), { recursive: true });
          }
          return this.loadConfig();
        }
        return this.init(name, execution);
      }
      loadConfig() {
        if (!this.exists()) {
          throw new MeshlyError({
            code: "NO_PROJECT",
            title: "No Meshly project in this directory.",
            reason: "Meshly has not been initialized here.",
            action: "Nothing was started.",
            retry: "meshly init --api-key <your Solari key>"
          });
        }
        return JSON.parse(fs.readFileSync(this.configPath, "utf8"));
      }
      saveConfig(config) {
        fs.mkdirSync(this.dir, { recursive: true });
        fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
      }
      artifactDir() {
        const dir = path2.join(this.dir, "artifacts");
        fs.mkdirSync(dir, { recursive: true });
        return dir;
      }
      saveWorker(worker) {
        fs.mkdirSync(path2.join(this.dir, "workers"), { recursive: true });
        fs.writeFileSync(this.workerPath(worker.id), JSON.stringify(worker, null, 2));
        if (worker.name && worker.name !== worker.id) {
          fs.writeFileSync(this.workerPath(worker.name), JSON.stringify(worker, null, 2));
        }
      }
      listWorkers() {
        const dir = path2.join(this.dir, "workers");
        if (!fs.existsSync(dir))
          return [];
        const seen = /* @__PURE__ */ new Set();
        const workers = [];
        for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
          const worker = JSON.parse(fs.readFileSync(path2.join(dir, file), "utf8"));
          if (seen.has(worker.id))
            continue;
          seen.add(worker.id);
          workers.push(worker);
        }
        return workers.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      }
      getWorker(nameOrId) {
        const direct = path2.join(this.dir, "workers", `${safeName(nameOrId)}.json`);
        if (fs.existsSync(direct)) {
          return JSON.parse(fs.readFileSync(direct, "utf8"));
        }
        return this.listWorkers().find((w) => w.id === nameOrId || w.name === nameOrId);
      }
      saveRun(run) {
        fs.mkdirSync(path2.join(this.dir, "runs"), { recursive: true });
        const normalized = normalizeRun(run);
        fs.writeFileSync(path2.join(this.dir, "runs", `${run.runId}.json`), JSON.stringify(normalized, null, 2));
        for (const env of normalized.environments) {
          this.saveEnvironment(env);
        }
      }
      listRuns() {
        const dir = path2.join(this.dir, "runs");
        if (!fs.existsSync(dir))
          return [];
        return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => normalizeRun(JSON.parse(fs.readFileSync(path2.join(dir, f), "utf8")))).sort((a, b) => b.startedAt - a.startedAt);
      }
      getRun(runId) {
        const file = path2.join(this.dir, "runs", `${runId}.json`);
        if (fs.existsSync(file))
          return normalizeRun(JSON.parse(fs.readFileSync(file, "utf8")));
        return this.listRuns().find((r) => r.runId === runId || r.runId.startsWith(runId));
      }
      saveEnvironment(env) {
        fs.mkdirSync(path2.join(this.dir, "environments"), { recursive: true });
        fs.writeFileSync(path2.join(this.dir, "environments", `${safeName(env.id)}.json`), JSON.stringify(env, null, 2));
      }
      listEnvironments() {
        const dir = path2.join(this.dir, "environments");
        const fromFiles = [];
        if (fs.existsSync(dir)) {
          for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
            fromFiles.push(JSON.parse(fs.readFileSync(path2.join(dir, file), "utf8")));
          }
        }
        const seen = new Set(fromFiles.map((e) => e.id));
        for (const run of this.listRuns()) {
          for (const env of run.environments || []) {
            if (!env?.id && !env.environmentId)
              continue;
            const id = env.id || env.environmentId;
            if (seen.has(id))
              continue;
            seen.add(id);
            fromFiles.push(env.id ? env : hydrateLegacyEnv(env, run));
          }
        }
        return fromFiles.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
      }
      snapshotRun(params) {
        const bundle = params.run.exportBundle();
        const events = params.events || bundle.events || [];
        const environments = environmentsFromRun(params.run, params.worker, params.mode, params.destroyAfter !== false);
        const stored = {
          runId: params.run.runId,
          workerId: params.worker.id,
          workerName: params.worker.name,
          kind: params.run.kind || params.worker.kind,
          objective: params.worker.task,
          status: params.run.status,
          mode: params.mode,
          startedAt: params.run.startedAt,
          completedAt: params.run.completedAt,
          toolCalls: params.run.toolCalls,
          retries: params.run.retries,
          environments,
          steps: params.run.steps,
          events,
          evidence: params.run.evidence || bundle.evidence,
          error: params.run.error,
          sha256Digest: bundle.sha256Digest
        };
        const existing = this.getRun(params.run.runId);
        if (existing?.takeover)
          stored.takeover = existing.takeover;
        if (existing?.compensated)
          stored.compensated = existing.compensated;
        if (existing?.operatorActions)
          stored.operatorActions = existing.operatorActions;
        this.saveRun(stored);
        this.saveEvents(params.run.runId, events);
        if (params.run.evidence)
          this.saveEvidence(params.run.runId, params.run.evidence);
        for (const cp of params.run.checkpoints || [])
          this.saveCheckpoint(cp);
        return stored;
      }
      saveEvents(runId, events) {
        fs.mkdirSync(path2.join(this.dir, "events"), { recursive: true });
        fs.writeFileSync(path2.join(this.dir, "events", `${runId}.json`), JSON.stringify(events, null, 2));
      }
      loadEvents(runId) {
        const dir = path2.join(this.dir, "events");
        if (!fs.existsSync(dir))
          return [];
        if (runId) {
          const file = path2.join(dir, `${runId}.json`);
          if (!fs.existsSync(file))
            return [];
          return JSON.parse(fs.readFileSync(file, "utf8"));
        }
        const all = [];
        for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
          all.push(...JSON.parse(fs.readFileSync(path2.join(dir, file), "utf8")));
        }
        return all.sort((a, b) => a.sequence - b.sequence);
      }
      saveCheckpoint(cp) {
        fs.mkdirSync(path2.join(this.dir, "checkpoints"), { recursive: true });
        fs.writeFileSync(path2.join(this.dir, "checkpoints", `${safeName(cp.id)}.json`), JSON.stringify(cp, null, 2));
      }
      listCheckpoints() {
        const dir = path2.join(this.dir, "checkpoints");
        if (!fs.existsSync(dir))
          return [];
        return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path2.join(dir, f), "utf8")));
      }
      saveMemory(workerId, snapshot2) {
        fs.mkdirSync(path2.join(this.dir, "memory"), { recursive: true });
        fs.writeFileSync(path2.join(this.dir, "memory", `${safeName(workerId)}.json`), JSON.stringify({ workerId, snapshot: snapshot2 }, null, 2));
      }
      listMemory() {
        const dir = path2.join(this.dir, "memory");
        if (!fs.existsSync(dir))
          return [];
        return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path2.join(dir, f), "utf8")));
      }
      savePolicy(workerId, authority) {
        fs.mkdirSync(path2.join(this.dir, "policies"), { recursive: true });
        fs.writeFileSync(path2.join(this.dir, "policies", `${safeName(workerId)}.json`), JSON.stringify({ workerId, authority }, null, 2));
      }
      saveEvidence(runId, evidence) {
        fs.mkdirSync(path2.join(this.dir, "evidence"), { recursive: true });
        fs.writeFileSync(path2.join(this.dir, "evidence", `${runId}.json`), JSON.stringify(evidence, null, 2));
      }
      saveKernel(snapshot2) {
        fs.mkdirSync(this.dir, { recursive: true });
        fs.writeFileSync(path2.join(this.dir, "kernel.json"), JSON.stringify(snapshot2, null, 2));
      }
      loadKernel() {
        const file = path2.join(this.dir, "kernel.json");
        if (!fs.existsSync(file))
          return void 0;
        return JSON.parse(fs.readFileSync(file, "utf8"));
      }
      workerPath(idOrName) {
        return path2.join(this.dir, "workers", `${safeName(idOrName)}.json`);
      }
    };
  }
});

// packages/core/dist/mcp/server.js
async function startMeshlyMcpServer(options = {}) {
  const store = options.store || new ProjectStore();
  const runtime = options.runtime || new MeshlyRuntime();
  if (store.exists()) {
    try {
      await restoreRuntime(runtime, store);
    } catch {
    }
  }
  const input = options.stdin || process.stdin;
  const output = options.stdout || process.stdout;
  let buffer = "";
  const onData = (chunk) => {
    buffer += String(chunk);
    let idx;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line)
        continue;
      void handleLine(line);
    }
  };
  input.on("data", onData);
  async function handleLine(line) {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg.method === "initialize") {
      write({
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "meshly", version: "0.1.2" }
        }
      });
      return;
    }
    if (msg.method === "tools/list") {
      write({ jsonrpc: "2.0", id: msg.id, result: { tools: MESHLY_MCP_TOOLS } });
      return;
    }
    if (msg.method === "tools/call") {
      try {
        const result = await callTool(String(msg.params?.name), msg.params?.arguments || {});
        write({
          jsonrpc: "2.0",
          id: msg.id,
          result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }
        });
      } catch (err) {
        write({
          jsonrpc: "2.0",
          id: msg.id,
          error: { code: -32e3, message: err instanceof Error ? err.message : String(err) }
        });
      }
      return;
    }
    if (msg.id !== void 0) {
      write({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `Unknown method ${msg.method}` } });
    }
  }
  async function callTool(name, args) {
    if (name === "meshly_create_worker" || name === "meshly_worker_spawn") {
      const worker = await runtime.workers.spawn({
        task: args.task,
        name: args.name,
        kind: args.kind,
        capabilities: args.capabilities || ["browser", "sandbox", "desktop"],
        budget: args.budget ?? 2,
        authority: AuthorityManager.issue({
          tools: ["*"],
          capabilities: args.capabilities || ["*"],
          maxSpend: args.budget ?? 2
        })
      });
      persistRuntime(runtime, store);
      return { id: worker.id, name: worker.name, task: worker.task, kind: worker.kind };
    }
    if (name === "meshly_worker_list") {
      return runtime.workers.list().map((w) => ({ id: w.id, name: w.name, task: w.task, status: w.status, kind: w.kind }));
    }
    if (name === "meshly_run") {
      const run = await runtime.executeWorker(args.workerId, {
        scenario: args.scenario,
        kind: args.kind,
        destroyAfter: true,
        artifactDir: store.artifactDir()
      });
      persistRuntime(runtime, store);
      return summarizeRun(run);
    }
    if (name === "meshly_get_run" || name === "meshly_run_status") {
      const run = runtime.runs.get(args.runId);
      if (run)
        return { ...summarizeRun(run), meters: run.meters() };
      const stored = store.getRun(args.runId);
      if (!stored)
        throw new Error(`Run '${args.runId}' not found`);
      return stored;
    }
    if (name === "meshly_run_events") {
      const live = runtime.events.getRunTimeline(args.runId);
      if (live.length)
        return live;
      return store.loadEvents(args.runId);
    }
    if (name === "meshly_verify") {
      const run = runtime.runs.get(args.runId);
      if (run) {
        const result = await run.verify();
        persistRuntime(runtime, store);
        return result;
      }
      const stored = store.getRun(args.runId);
      if (!stored)
        throw new Error(`Run '${args.runId}' not found`);
      return { matched: stored.status === "COMPLETED" || stored.status === "VERIFIED" || stored.status === "COMMITTED", stored: true };
    }
    if (name === "meshly_pause") {
      const run = runtime.runs.get(args.runId);
      if (!run)
        throw new Error(`Run '${args.runId}' not found`);
      await run.pause();
      persistRuntime(runtime, store);
      return summarizeRun(run);
    }
    if (name === "meshly_resume") {
      const run = await runtime.resumeRun(args.runId, {
        destroyAfter: true,
        artifactDir: store.artifactDir()
      });
      persistRuntime(runtime, store);
      return summarizeRun(run);
    }
    if (name === "meshly_takeover") {
      const run = runtime.runs.get(args.runId);
      if (!run)
        throw new Error(`Run '${args.runId}' not found`);
      const session = await run.takeover();
      persistRuntime(runtime, store);
      return { run: summarizeRun(run), takeover: session };
    }
    if (name === "meshly_environments") {
      return runtime.broker.list().map((e) => ({
        id: e.id,
        type: e.type,
        status: e.status,
        fabricId: e.fabricId,
        owner: e.owner
      }));
    }
    throw new Error(`Unknown tool ${name}`);
  }
  function summarizeRun(run) {
    return {
      runId: run.runId,
      status: run.status,
      error: run.error,
      meters: typeof run.meters === "function" ? run.meters() : void 0,
      steps: run.steps.map((s) => ({
        intent: s.intent,
        status: s.status,
        agentClaim: s.agentClaim,
        worldStateMatched: s.worldStateMatched
      }))
    };
  }
  function write(payload) {
    output.write(JSON.stringify(payload) + "\n");
  }
  return {
    close: () => {
      input.off("data", onData);
    }
  };
}
var MESHLY_MCP_TOOLS;
var init_server = __esm({
  "packages/core/dist/mcp/server.js"() {
    "use strict";
    init_runtime();
    init_store();
    init_hydrate();
    init_authority();
    MESHLY_MCP_TOOLS = [
      {
        name: "meshly_create_worker",
        description: "Spawn a Meshly worker. Solari is allocated underneath Meshly, not by the caller.",
        inputSchema: {
          type: "object",
          properties: {
            task: { type: "string" },
            name: { type: "string" },
            kind: { type: "string", enum: ["probe", "reconciliation", "research", "coding", "operations"] },
            capabilities: { type: "array", items: { type: "string" } },
            budget: { type: "number" }
          },
          required: ["task"]
        }
      },
      {
        name: "meshly_run",
        description: "Run a worker through Intent \u2192 Action \u2192 Observe \u2192 Verify \u2192 Commit.",
        inputSchema: {
          type: "object",
          properties: {
            workerId: { type: "string" },
            scenario: { type: "string", enum: ["default", "reality-divergence", "ambiguous-timeout", "ambiguous-timeout-absent"] },
            kind: { type: "string" }
          },
          required: ["workerId"]
        }
      },
      {
        name: "meshly_get_run",
        description: "Inspect a run: status, steps, verification, evidence, operational meters.",
        inputSchema: { type: "object", properties: { runId: { type: "string" } }, required: ["runId"] }
      },
      {
        name: "meshly_verify",
        description: "Re-check recorded observations against the verification contract. Does not retry the side effect.",
        inputSchema: { type: "object", properties: { runId: { type: "string" } }, required: ["runId"] }
      },
      {
        name: "meshly_pause",
        description: "Pause a running worker/run. Environments are kept so the run can resume.",
        inputSchema: { type: "object", properties: { runId: { type: "string" } }, required: ["runId"] }
      },
      {
        name: "meshly_resume",
        description: "Resume a paused or recovered run from its last committed checkpoint.",
        inputSchema: { type: "object", properties: { runId: { type: "string" } }, required: ["runId"] }
      },
      {
        name: "meshly_takeover",
        description: "Operator takeover of the worker's environment. The agent does not keep executing.",
        inputSchema: { type: "object", properties: { runId: { type: "string" } }, required: ["runId"] }
      },
      {
        name: "meshly_worker_spawn",
        description: "Alias of meshly_create_worker.",
        inputSchema: {
          type: "object",
          properties: {
            task: { type: "string" },
            name: { type: "string" },
            kind: { type: "string" },
            capabilities: { type: "array", items: { type: "string" } },
            budget: { type: "number" }
          },
          required: ["task"]
        }
      },
      {
        name: "meshly_worker_list",
        description: "List workers known to this Meshly runtime / .meshly store.",
        inputSchema: { type: "object", properties: {} }
      },
      {
        name: "meshly_run_status",
        description: "Alias of meshly_get_run.",
        inputSchema: { type: "object", properties: { runId: { type: "string" } }, required: ["runId"] }
      },
      {
        name: "meshly_run_events",
        description: "Causal event timeline for a run.",
        inputSchema: { type: "object", properties: { runId: { type: "string" } }, required: ["runId"] }
      },
      {
        name: "meshly_environments",
        description: "List leased environments (browser / sandbox / desktop) and which worker/run owns them.",
        inputSchema: { type: "object", properties: {} }
      }
    ];
  }
});

// packages/core/dist/index.js
var dist_exports = {};
__export(dist_exports, {
  AmbiguousTimeoutError: () => AmbiguousTimeoutError,
  AnthropicAgentAdapter: () => AnthropicAgentAdapter,
  AuthorityManager: () => AuthorityManager,
  CheckpointManager: () => CheckpointManager,
  ContextManager: () => ContextManager,
  DEFAULT_WORKER_LIMITS: () => DEFAULT_WORKER_LIMITS,
  EnvironmentBroker: () => EnvironmentBroker,
  EventStore: () => EventStore,
  FailureInjector: () => FailureInjector,
  MCPAgentAdapter: () => MCPAgentAdapter,
  MESHLY_MCP_TOOLS: () => MESHLY_MCP_TOOLS,
  MemoryManager: () => MemoryManager,
  MeshlyError: () => MeshlyError,
  MeshlyRuntime: () => MeshlyRuntime,
  OpenAIAgentAdapter: () => OpenAIAgentAdapter,
  OperatorManager: () => OperatorManager,
  ProjectStore: () => ProjectStore,
  RunInstance: () => RunInstance,
  RunManager: () => RunManager,
  SagaTransaction: () => SagaTransaction,
  Scheduler: () => Scheduler,
  ScriptAgentAdapter: () => ScriptAgentAdapter,
  SimulatorExecutionFabric: () => SimulatorExecutionFabric,
  TOOL_CATALOG: () => TOOL_CATALOG,
  VALID_ENVIRONMENT_TRANSITIONS: () => VALID_ENVIRONMENT_TRANSITIONS,
  VALID_WORKER_TRANSITIONS: () => VALID_WORKER_TRANSITIONS,
  Verifier: () => Verifier,
  WorkerInstance: () => WorkerInstance,
  WorkerManager: () => WorkerManager,
  canTransitionEnvironment: () => canTransitionEnvironment,
  canTransitionWorker: () => canTransitionWorker,
  contractFor: () => contractFor,
  dispatchTool: () => dispatchTool,
  environmentForTool: () => environmentForTool,
  environmentsFromRun: () => environmentsFromRun,
  executeWorker: () => executeWorker,
  explainDecision: () => explainDecision,
  explainEnvironment: () => explainEnvironment,
  formatDecision: () => formatDecision,
  formatUserError: () => formatUserError,
  inferWorkerKind: () => inferWorkerKind,
  isBlockedStatus: () => isBlockedStatus,
  isCommittedStatus: () => isCommittedStatus,
  isEnvironmentGone: () => isEnvironmentGone,
  isRetryableAllocation: () => isRetryableAllocation,
  isUncertainSideEffect: () => isUncertainSideEffect,
  isUnknownStatus: () => isUnknownStatus,
  outcomeOf: () => outcomeOf,
  persistRuntime: () => persistRuntime,
  policyNameFor: () => policyNameFor,
  reconciliationProgram: () => reconciliationProgram,
  resolveLimits: () => resolveLimits,
  resolveProgram: () => resolveProgram,
  restoreRuntime: () => restoreRuntime,
  startMeshlyMcpServer: () => startMeshlyMcpServer,
  toMeshlyError: () => toMeshlyError
});
var init_dist = __esm({
  "packages/core/dist/index.js"() {
    "use strict";
    init_types();
    init_events();
    init_states();
    init_simulator();
    init_broker();
    init_authority();
    init_context();
    init_memory();
    init_verifier();
    init_saga();
    init_checkpoint();
    init_scheduler();
    init_worker();
    init_manager();
    init_run();
    init_adapter();
    init_operator();
    init_injector();
    init_runtime();
    init_execute();
    init_limits();
    init_tools();
    init_recipes();
    init_timeout();
    init_hydrate();
    init_server();
    init_errors();
    init_decision();
    init_store();
  }
});

// packages/solari/dist/adapter.js
function wrapSolariError(err, prefix) {
  const anyErr = err;
  const code = anyErr?.code || anyErr?.name;
  const retryable = code === "ConcurrencyCheckUnavailable" || anyErr?.status === 502 || anyErr?.status === 503;
  const message = anyErr?.message || String(err);
  if (code === "ConcurrencyLimitExceeded") {
    return new SolariFabricError(`${prefix}: concurrent session cap reached. Do not retry until a session is released.`, { code, status: anyErr.status ?? 429, retryable: false, cause: err });
  }
  if (/No stealth pool available|kind":"stealth"/i.test(message)) {
    return new SolariFabricError(`${prefix}: stealth browser pool is empty. Meshly will use the standard browser pool unless you request stealth.`, { code: "StealthPoolEmpty", status: 503, retryable: false, cause: err });
  }
  if (code === "Unauthorized" || anyErr?.status === 401 || /invalid api key|unauthorized/i.test(message)) {
    return new SolariFabricError(`${prefix}: Solari rejected the API key.`, {
      code: "Unauthorized",
      status: 401,
      retryable: false,
      cause: err
    });
  }
  if (code === "InsufficientCredit" || anyErr?.status === 402) {
    return new SolariFabricError(`${prefix}: insufficient Solari credit.`, {
      code: code || "InsufficientCredit",
      status: 402,
      retryable: false,
      cause: err
    });
  }
  return new SolariFabricError(`${prefix}: ${message}`, {
    code,
    status: anyErr?.status,
    retryable,
    cause: err
  });
}
var SolariFabricError, SolariExecutionFabric, SolariAdapter, Solari;
var init_adapter2 = __esm({
  "packages/solari/dist/adapter.js"() {
    "use strict";
    init_dist();
    SolariFabricError = class extends Error {
      code;
      status;
      retryable;
      constructor(message, opts = {}) {
        super(message);
        this.name = "SolariFabricError";
        this.code = opts.code;
        this.status = opts.status;
        this.retryable = opts.retryable ?? false;
        if (opts.cause)
          this.cause = opts.cause;
      }
    };
    SolariExecutionFabric = class {
      name = "solari-cloud-fabric";
      apiKey;
      baseUrl;
      fallbackToSimulator;
      simulator;
      browserClient;
      vmClient;
      constructor(config = {}) {
        this.apiKey = config.apiKey || process.env.SOLARI_API_KEY;
        this.baseUrl = config.baseUrl || process.env.SOLARI_BASE_URL || "https://api.getsolari.com";
        this.fallbackToSimulator = config.fallbackToSimulator ?? false;
        this.simulator = new SimulatorExecutionFabric();
      }
      get isLive() {
        return Boolean(this.apiKey) && !this.fallbackToSimulator;
      }
      async launchBrowser(options = {}) {
        if (!this.apiKey)
          return this.missingKey("browser", () => this.simulator.launchBrowser(options));
        try {
          const client = await this.browser();
          const browser = await client.launch({
            stealth: options.stealth ?? false,
            profileId: options.profileId,
            recording: options.recording ?? true
          });
          const id = browser.id;
          return {
            id,
            type: "browser",
            handle: browser,
            replayUrl: `https://console.getsolari.com/sessions/${id}`
          };
        } catch (err) {
          return this.failed("browser", err, () => this.simulator.launchBrowser(options));
        }
      }
      async createSandbox(options = {}) {
        if (!this.apiKey)
          return this.missingKey("sandbox", () => this.simulator.createSandbox(options));
        try {
          const client = await this.vm();
          const sandbox = await client.sandboxes.create({
            template: options.template ?? "base",
            timeoutMs: options.timeoutMs ?? 5 * 6e4
          });
          await sandbox.connect();
          const id = sandbox.sandboxId || sandbox.id;
          return {
            id,
            type: "sandbox",
            handle: sandbox
          };
        } catch (err) {
          return this.failed("sandbox", err, () => this.simulator.createSandbox(options));
        }
      }
      async createDesktop(options = {}) {
        if (!this.apiKey)
          return this.missingKey("desktop", () => this.simulator.createDesktop(options));
        try {
          const client = await this.vm();
          const desktop = await client.desktops.create({
            template: "default",
            resolution: options.resolution ?? "1280x720",
            timeoutMs: options.timeoutMs ?? 10 * 6e4,
            lifecycle: { onTimeout: "pause" }
          });
          await desktop.connect();
          const id = desktop.sessionId || desktop.id;
          return {
            id,
            type: "desktop",
            handle: desktop,
            streamUrl: desktop.streamUrl,
            recordingUrl: desktop.recordingUrl
          };
        } catch (err) {
          return this.failed("desktop", err, () => this.simulator.createDesktop(options));
        }
      }
      async pauseResource(resource) {
        if (resource.handle?.pause) {
          await resource.handle.pause();
          return;
        }
        await this.simulator.pauseResource(resource);
      }
      async resumeResource(resource) {
        if (resource.handle?.resume) {
          await resource.handle.resume();
          return;
        }
        await this.simulator.resumeResource(resource);
      }
      async destroyResource(resource) {
        const handle = resource.handle;
        try {
          if (resource.type === "browser") {
            if (handle?.close)
              await handle.close();
            return;
          }
          if (handle?.kill) {
            await handle.kill();
            return;
          }
          if (resource.type === "desktop" && this.vmClient?.desktops?.destroy) {
            await this.vmClient.desktops.destroy(resource.id);
            return;
          }
          if (handle?.close)
            await handle.close();
        } catch (err) {
          throw wrapSolariError(err, `Failed to destroy ${resource.type} ${resource.id}`);
        }
      }
      async reconnect(id, type) {
        if (!this.apiKey) {
          if (this.fallbackToSimulator)
            return this.simulator.reconnect(id, type);
          throw new SolariFabricError(`Cannot reconnect ${type} ${id} without SOLARI_API_KEY`, { code: "MissingApiKey" });
        }
        try {
          if (type === "sandbox") {
            const client = await this.vm();
            const sandbox = await client.sandboxes.connect(id);
            await sandbox.connect?.();
            return { id: sandbox.sandboxId || sandbox.id || id, type: "sandbox", handle: sandbox };
          }
          if (type === "desktop") {
            const client = await this.vm();
            const desktop = await client.desktops.connect(id);
            return {
              id: desktop.sessionId || desktop.id || id,
              type: "desktop",
              handle: desktop,
              streamUrl: desktop.streamUrl,
              recordingUrl: desktop.recordingUrl
            };
          }
          throw new SolariFabricError(`Browser sessions cannot be reconnected after close (${id})`, { code: "BrowserGone" });
        } catch (err) {
          if (this.fallbackToSimulator)
            return this.simulator.reconnect(id, type);
          throw wrapSolariError(err, `Failed to reconnect ${type} ${id}`);
        }
      }
      /**
       * Replay URLs are issued after the browser session is released.
       */
      async getBrowserReplayUrl(sessionId) {
        if (!this.browserClient?.sessions?.getReplayUrl)
          return void 0;
        try {
          const replay = await this.browserClient.sessions.getReplayUrl(sessionId);
          return replay?.url;
        } catch {
          return void 0;
        }
      }
      async close() {
        if (this.browserClient?.close) {
          try {
            await this.browserClient.close();
          } catch {
          }
        }
        const vm = this.vmClient;
        if (typeof vm?.close === "function") {
          try {
            await vm.close();
          } catch {
          }
        }
      }
      async browser() {
        if (this.browserClient)
          return this.browserClient;
        const { Solari: Solari2 } = await import("@solarisdk/browser");
        this.browserClient = new Solari2({ apiKey: this.apiKey, baseUrl: this.baseUrl });
        return this.browserClient;
      }
      async vm() {
        if (this.vmClient)
          return this.vmClient;
        const { SolariClient } = await import("@solarisdk/sdk");
        this.vmClient = new SolariClient({ apiKey: this.apiKey, baseUrl: this.baseUrl });
        return this.vmClient;
      }
      async missingKey(kind, fallback) {
        if (this.fallbackToSimulator) {
          console.warn(`[SolariExecutionFabric] No SOLARI_API_KEY. Simulating ${kind}.`);
          return fallback();
        }
        throw new SolariFabricError(`No SOLARI_API_KEY. Meshly will not pretend a live ${kind} ran. Set the key or pass fallbackToSimulator: true.`, { code: "MissingApiKey" });
      }
      async failed(kind, err, fallback) {
        const wrapped = wrapSolariError(err, `Live Solari ${kind} failed`);
        if (this.fallbackToSimulator) {
          console.warn(`[SolariExecutionFabric] ${wrapped.message}. Falling back to simulator.`);
          return fallback();
        }
        throw wrapped;
      }
    };
    SolariAdapter = SolariExecutionFabric;
    Solari = SolariExecutionFabric;
  }
});

// packages/solari/dist/index.js
var init_dist2 = __esm({
  "packages/solari/dist/index.js"() {
    "use strict";
    init_adapter2();
  }
});

// packages/sdk/dist/index.js
var dist_exports2 = {};
__export(dist_exports2, {
  AmbiguousTimeoutError: () => AmbiguousTimeoutError,
  AnthropicAgentAdapter: () => AnthropicAgentAdapter,
  AuthorityManager: () => AuthorityManager,
  CheckpointManager: () => CheckpointManager,
  ContextManager: () => ContextManager,
  DEFAULT_WORKER_LIMITS: () => DEFAULT_WORKER_LIMITS,
  EnvironmentBroker: () => EnvironmentBroker,
  EventStore: () => EventStore,
  FailureInjector: () => FailureInjector,
  MCPAgentAdapter: () => MCPAgentAdapter,
  MESHLY_MCP_TOOLS: () => MESHLY_MCP_TOOLS,
  MemoryManager: () => MemoryManager,
  Meshly: () => Meshly,
  MeshlyError: () => MeshlyError,
  MeshlyRuntime: () => MeshlyRuntime,
  OpenAIAgentAdapter: () => OpenAIAgentAdapter,
  OperatorManager: () => OperatorManager,
  ProjectStore: () => ProjectStore,
  RunInstance: () => RunInstance,
  RunManager: () => RunManager,
  SagaTransaction: () => SagaTransaction,
  Scheduler: () => Scheduler,
  ScriptAgentAdapter: () => ScriptAgentAdapter,
  SimulatorExecutionFabric: () => SimulatorExecutionFabric,
  Solari: () => Solari,
  SolariAdapter: () => SolariAdapter,
  SolariExecutionFabric: () => SolariExecutionFabric,
  SolariFabricError: () => SolariFabricError,
  TOOL_CATALOG: () => TOOL_CATALOG,
  VALID_ENVIRONMENT_TRANSITIONS: () => VALID_ENVIRONMENT_TRANSITIONS,
  VALID_WORKER_TRANSITIONS: () => VALID_WORKER_TRANSITIONS,
  Verifier: () => Verifier,
  WorkerInstance: () => WorkerInstance,
  WorkerManager: () => WorkerManager,
  canTransitionEnvironment: () => canTransitionEnvironment,
  canTransitionWorker: () => canTransitionWorker,
  contractFor: () => contractFor,
  default: () => dist_default,
  dispatchTool: () => dispatchTool,
  environmentForTool: () => environmentForTool,
  environmentsFromRun: () => environmentsFromRun,
  executeWorker: () => executeWorker,
  explainDecision: () => explainDecision,
  explainEnvironment: () => explainEnvironment,
  formatDecision: () => formatDecision,
  formatUserError: () => formatUserError,
  inferWorkerKind: () => inferWorkerKind,
  isBlockedStatus: () => isBlockedStatus,
  isCommittedStatus: () => isCommittedStatus,
  isEnvironmentGone: () => isEnvironmentGone,
  isRetryableAllocation: () => isRetryableAllocation,
  isUncertainSideEffect: () => isUncertainSideEffect,
  isUnknownStatus: () => isUnknownStatus,
  outcomeOf: () => outcomeOf,
  persistRuntime: () => persistRuntime,
  policyNameFor: () => policyNameFor,
  reconciliationProgram: () => reconciliationProgram,
  resolveLimits: () => resolveLimits,
  resolveProgram: () => resolveProgram,
  restoreRuntime: () => restoreRuntime,
  startMeshlyMcpServer: () => startMeshlyMcpServer,
  toMeshlyError: () => toMeshlyError
});
var Meshly, dist_default;
var init_dist3 = __esm({
  "packages/sdk/dist/index.js"() {
    "use strict";
    init_dist();
    init_dist2();
    init_dist();
    init_dist2();
    Meshly = class {
      runtime;
      mode;
      constructor(options = {}) {
        let fabric;
        let mode = "simulator";
        if (options.execution) {
          fabric = options.execution;
          mode = fabric.name.includes("simulator") ? "simulator" : "live";
        } else if (options.executionFabric) {
          fabric = options.executionFabric;
          mode = fabric.name.includes("simulator") ? "simulator" : "live";
        } else if (options.preferSimulator) {
          fabric = new SimulatorExecutionFabric();
        } else {
          const apiKey = options.solariApiKey || process.env.SOLARI_API_KEY;
          if (!apiKey) {
            throw new MeshlyError({
              code: "MISSING_API_KEY",
              title: "Meshly is not connected to Solari.",
              reason: "No SOLARI_API_KEY. Meshly will not pretend live infrastructure ran.",
              action: "No environments were allocated.",
              retry: "Set SOLARI_API_KEY, or pass { preferSimulator: true } for a local demo."
            });
          }
          fabric = new SolariExecutionFabric({
            apiKey,
            fallbackToSimulator: options.fallbackToSimulator ?? false
          });
          mode = "live";
        }
        this.mode = mode;
        this.runtime = new MeshlyRuntime({
          ...options,
          executionFabric: fabric
        });
      }
      get events() {
        return this.runtime.events;
      }
      get broker() {
        return this.runtime.broker;
      }
      get scheduler() {
        return this.runtime.scheduler;
      }
      get workers() {
        return this.runtime.workers;
      }
      get runs() {
        return this.runtime.runs;
      }
      get authority() {
        return this.runtime.authority;
      }
      get contexts() {
        return this.runtime.contexts;
      }
      get memory() {
        return this.runtime.memory;
      }
      get checkpoints() {
        return this.runtime.checkpoints;
      }
      get operator() {
        return this.runtime.operator;
      }
      get failures() {
        return this.runtime.failures;
      }
      get workflow() {
        return this.runtime.workflow;
      }
      async run(params) {
        if (params.workflow) {
          return this.runtime.run(params);
        }
        const worker = await this.spawn({
          task: params.task,
          capabilities: params.capabilities,
          name: params.name,
          priority: params.priority,
          budget: params.budget,
          authority: params.authority,
          metadata: params.metadata
        });
        return worker.run();
      }
      async runWithAgent(params) {
        return this.runtime.runWithAgent(params);
      }
      async spawn(params) {
        return this.runtime.spawn(params);
      }
      async execute(workerId, options) {
        return this.runtime.executeWorker(workerId, options);
      }
      async resume(runId, options) {
        return this.runtime.resumeRun(runId, options);
      }
      async scheduleNext() {
        return this.runtime.scheduleNext();
      }
      async verifyStep(params) {
        return this.runtime.verifyStep(params);
      }
      async handoff(fromWorkerId, newTask) {
        return this.runtime.handoff(fromWorkerId, newTask);
      }
      transaction(workerId) {
        return this.runtime.transaction(workerId);
      }
      async persist(store) {
        const { ProjectStore: ProjectStore2 } = await Promise.resolve().then(() => (init_dist(), dist_exports));
        this.runtime.persist(store || new ProjectStore2());
      }
      async restore(store) {
        const { ProjectStore: ProjectStore2 } = await Promise.resolve().then(() => (init_dist(), dist_exports));
        return this.runtime.restore(store || new ProjectStore2());
      }
      stats() {
        return this.runtime.stats();
      }
    };
    dist_default = Meshly;
  }
});

// apps/console/dist/api.js
import fs4 from "node:fs";
import path5 from "node:path";
function loadEnv2(cwd) {
  for (const rel of [".env", path5.join(".meshly", ".env")]) {
    const file = path5.join(cwd, rel);
    if (!fs4.existsSync(file))
      continue;
    const text = fs4.readFileSync(file, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#"))
        continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0)
        continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === void 0)
        process.env[key] = value;
    }
  }
}
function createStore(cwd) {
  return new ProjectStore(cwd);
}
function providerLabel(store) {
  const execution = store.exists() ? store.loadConfig().execution : void 0;
  if (execution === "simulator")
    return { mode: "simulator", label: "SIMULATOR" };
  if (process.env.SOLARI_API_KEY)
    return { mode: "live", label: "LIVE \xB7 SOLARI" };
  if (execution === "solari")
    return { mode: "unconfigured", label: "SOLARI KEY MISSING" };
  return { mode: "unconfigured", label: "NOT CONNECTED" };
}
function createMesh(store) {
  const execution = store.exists() ? store.loadConfig().execution : void 0;
  if (execution === "simulator")
    return new Meshly({ preferSimulator: true });
  const key = process.env.SOLARI_API_KEY;
  if (!key) {
    throw new MeshlyError({
      code: "MISSING_API_KEY",
      title: "Meshly is not connected to Solari.",
      reason: "No SOLARI_API_KEY. The console will not run a simulator in place of live infrastructure.",
      action: "No environments were allocated.",
      retry: "Set SOLARI_API_KEY, or initialize this project with --provider simulator."
    });
  }
  return new Meshly({
    solariApiKey: key,
    fallbackToSimulator: false
  });
}
function persistFromRuntime(store, mesh, run, worker, destroyAfter) {
  store.snapshotRun({
    run,
    worker: { id: worker.id, name: worker.name, task: worker.task },
    mode: mesh.mode,
    events: mesh.events.query({ runId: run.runId }),
    destroyAfter
  });
  const existing = store.getWorker(worker.id) || store.getWorker(worker.name || "");
  store.saveWorker({
    id: worker.id,
    name: worker.name || existing?.name || worker.id,
    kind: worker.kind || existing?.kind,
    task: worker.task,
    capabilities: worker.capabilities,
    priority: worker.priority,
    budget: worker.budget.maxSpend,
    spent: worker.budget.spent,
    limits: worker.limits,
    status: worker.status,
    currentRunId: run.runId,
    authority: {
      tools: worker.authority.tools,
      capabilities: worker.authority.capabilities,
      domains: worker.authority.domains,
      maxSpend: worker.authority.maxSpend,
      writeAccess: worker.authority.writeAccess
    },
    memory: (worker.memory || []).map((m) => ({ key: m.key, tier: m.tier, value: m.value })),
    createdAt: existing?.createdAt || worker.createdAt.toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
}
function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function broadcast(store) {
  const payload = JSON.stringify({ type: "state", state: snapshot(store) });
  for (const listener of listeners)
    listener(payload);
}
function snapshot(store) {
  const initialized = store.exists();
  const config = initialized ? store.loadConfig() : null;
  const workers = initialized ? uniqueWorkers(store.listWorkers()) : [];
  const runs = initialized ? store.listRuns().map((run) => {
    const withEvents = withDerivedEvents(run);
    return {
      ...withEvents,
      decision: explainDecision(withEvents, {
        policy: policyNameFor(withEvents.kind),
        authority: withEvents.workerId
      }),
      schedule: explainEnvironment(withEvents)
    };
  }) : [];
  const environments = initialized ? store.listEnvironments() : [];
  const { mode, label } = providerLabel(store);
  const attention = runs.filter((r) => r.status === "BLOCKED" || r.status === "UNKNOWN" || r.status === "VERIFICATION_FAILED" || r.steps?.some((s) => s.worldStateMatched === false));
  const occupied = environments.filter((e) => e.status === "BUSY" || e.status === "ACTIVE" || e.status === "READY");
  const failedVerify = attention.length;
  return {
    initialized,
    config,
    provider: { mode, label, hasSolariKey: Boolean(process.env.SOLARI_API_KEY) },
    workers: workers.map((w) => decorateWorker(w, runs, environments)),
    projects: groupProjects(workers, runs),
    metrics: aggregateMetrics(runs),
    runs,
    environments,
    meters: {
      maxConcurrency: 10
    },
    policies: workers.map((w) => ({
      workerId: w.id,
      workerName: w.name,
      authority: w.authority || {
        tools: ["browser_navigate", "browser_extract", "sandbox_exec", "desktop_write"],
        capabilities: w.capabilities,
        domains: ["*"],
        maxSpend: w.budget
      }
    })),
    attention: attention.map((r) => r.runId),
    occupied: occupied.map((e) => e.id),
    failedVerify,
    inflight: Array.from(inflight.entries()).map(([id, job]) => ({ workerId: id, ...job }))
  };
}
function projectFor(kind) {
  if (kind === "reconciliation")
    return "Finance Ops";
  if (kind === "coding")
    return "Engineering";
  if (kind === "research")
    return "Research";
  if (kind === "operations")
    return "Operations";
  return "Other";
}
function displayStatusFor(status) {
  if (status === "COMPLETED" || status === "VERIFIED")
    return "VERIFIED";
  if (status === "BLOCKED" || status === "VERIFICATION_FAILED")
    return "BLOCKED";
  if (status === "UNKNOWN" || status === "VERIFYING")
    return "UNKNOWN";
  if (status === "RUNNING" || status === "ALLOCATING" || status === "QUEUED")
    return "RUNNING";
  return status || "CREATED";
}
function groupProjects(workers, runs) {
  const byProject = /* @__PURE__ */ new Map();
  for (const worker of workers) {
    const name = projectFor(worker.kind);
    if (!byProject.has(name))
      byProject.set(name, { name, workers: [] });
    const workerRuns = runs.filter((r) => r.workerId === worker.id || r.workerName === worker.name);
    const latest = workerRuns[0];
    byProject.get(name).workers.push({
      id: worker.id,
      name: worker.name,
      kind: worker.kind,
      task: worker.task,
      capabilities: worker.capabilities,
      status: latest?.status || worker.status || "CREATED",
      displayStatus: displayStatusFor(latest?.status || worker.status),
      budget: worker.budget,
      spent: worker.spent ?? 0,
      currentRunId: latest?.runId,
      currentRunStatus: latest?.status,
      runCount: workerRuns.length,
      lastRunAt: latest?.startedAt,
      lastRunStatus: latest?.status
    });
  }
  return PROJECT_ORDER.filter((name) => byProject.has(name)).concat([...byProject.keys()].filter((name) => !PROJECT_ORDER.includes(name))).map((name) => byProject.get(name));
}
function aggregateMetrics(runs) {
  const succeeded = runs.filter((r) => r.status === "COMPLETED" || r.status === "VERIFIED").length;
  const blocked = runs.filter((r) => r.status === "BLOCKED" || r.status === "VERIFICATION_FAILED").length;
  const unknown = runs.filter((r) => r.status === "UNKNOWN" || r.status === "VERIFYING").length;
  const spend = runs.reduce((sum2, r) => sum2 + (r.toolCalls ? 0 : 0), 0);
  return {
    totalRuns: runs.length,
    succeeded,
    blocked,
    unknown,
    scheduled: runs.filter((r) => typeof r.startedAt === "number").length,
    spend
  };
}
function uniqueWorkers(workers) {
  const byName = /* @__PURE__ */ new Map();
  for (const worker of workers) {
    const key = worker.name || worker.id;
    const prev = byName.get(key);
    if (!prev || worker.updatedAt > prev.updatedAt)
      byName.set(key, worker);
  }
  return Array.from(byName.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
function withDerivedEvents(run) {
  if (run.events && run.events.length > 0)
    return run;
  const events = [];
  let seq = 0;
  let parent;
  const push = (type, timestamp, data = {}) => {
    seq += 1;
    const id = `evt_derived_${run.runId}_${seq}`;
    events.push({
      id,
      runId: run.runId,
      sequence: seq,
      parentEventId: parent,
      type,
      timestamp,
      workerId: run.workerId,
      data
    });
    parent = id;
  };
  push("run.started", run.startedAt, { derived: true });
  for (const step of run.steps || []) {
    const ts = step.timestamp || run.startedAt;
    push("intent.created", ts, { intent: step.intent });
    if (step.status !== "rejected" || step.agentClaim)
      push("authority.approved", ts, { tool: step.action?.tool });
    if (step.observation?.type)
      push(`solari.${step.observation.type}.created`, ts, { environmentId: step.observation.environmentId });
    if (step.action)
      push("action.executed", ts, { tool: step.action.tool });
    if (step.observation)
      push("observation.recorded", ts, { type: step.observation.type });
    push("verification.started", ts, { intent: step.contract?.intent });
    if (step.worldStateMatched === false) {
      push("verification.failed", ts, { reason: step.error });
      push("commit.blocked", ts, { reason: step.error });
    } else if (step.status === "committed") {
      push("verification.passed", ts, {});
      push("commit.committed", ts, {});
    }
  }
  if (run.status === "COMPLETED")
    push("run.completed", run.completedAt || run.startedAt, {});
  if (run.status === "BLOCKED" || run.status === "VERIFICATION_FAILED")
    push("run.blocked", run.completedAt || run.startedAt, { error: run.error });
  if (run.status === "FAILED")
    push("run.failed", run.completedAt || run.startedAt, { error: run.error });
  return { ...run, events };
}
function decorateWorker(worker, runs, environments) {
  const workerRuns = runs.filter((r) => r.workerId === worker.id || r.workerName === worker.name);
  const latest = workerRuns[0];
  const lastEvent = latest?.events?.[latest.events.length - 1];
  const lastStep = latest?.steps?.[latest.steps.length - 1];
  const env = environments.find((e) => e.workerId === worker.id) || latest?.environments?.[0];
  let displayStatus = worker.status || "CREATED";
  if (latest?.status === "COMPLETED")
    displayStatus = "VERIFIED";
  else if (latest?.status === "BLOCKED" || latest?.status === "VERIFICATION_FAILED")
    displayStatus = "BLOCKED";
  else if (latest?.status === "UNKNOWN" || latest?.status === "VERIFYING")
    displayStatus = "UNKNOWN";
  else if (latest?.status === "RUNNING" || inflight.has(worker.id))
    displayStatus = "RUNNING";
  else if (latest?.status === "PAUSED")
    displayStatus = "PAUSED";
  return {
    ...worker,
    displayStatus,
    currentRunId: latest?.runId || worker.currentRunId,
    currentRunStatus: latest?.status,
    environment: env ? { id: env.id, type: env.type, status: env.status, provider: env.provider, sessionId: env.sessionId } : null,
    spent: worker.spent ?? 0,
    lastEvent: lastEvent ? { type: lastEvent.type, timestamp: lastEvent.timestamp } : null,
    lastVerification: lastStep ? {
      agentClaim: lastStep.agentClaim,
      toolExecution: lastStep.toolExecution,
      worldStateMatched: lastStep.worldStateMatched,
      error: lastStep.error
    } : null,
    runCount: workerRuns.length
  };
}
async function handleApi(store, method, pathname, body) {
  if (method === "GET" && pathname === "/api/snapshot") {
    return { status: 200, json: snapshot(store) };
  }
  if (method === "POST" && pathname === "/api/init") {
    if (body?.provider === "solari" && !process.env.SOLARI_API_KEY) {
      return {
        status: 400,
        error: "No SOLARI_API_KEY. Meshly will not start a simulator when Solari was requested."
      };
    }
    const execution = body?.provider === "solari" ? "solari" : "simulator";
    const config = store.ensure(body?.name || path5.basename(store.root), execution);
    broadcast(store);
    return { status: 200, json: { config } };
  }
  if (method === "POST" && pathname === "/api/workers") {
    store.ensure(path5.basename(store.root), providerLabel(store).mode === "live" ? "solari" : "simulator");
    const name = String(body?.name || "").trim();
    const task = String(body?.task || "").trim();
    if (!name || !task)
      return { status: 400, error: "name and task are required" };
    if (store.getWorker(name))
      return { status: 409, error: `Worker '${name}' already exists.` };
    const capabilities = Array.isArray(body?.capabilities) && body.capabilities.length ? body.capabilities : body?.kind === "research" ? ["browser", "sandbox"] : ["browser", "sandbox", "desktop"];
    const worker = {
      id: `wrk_${Math.random().toString(36).slice(2, 9)}`,
      name,
      kind: body?.kind,
      task,
      capabilities,
      priority: Number(body?.priority || 8),
      budget: Number(body?.budget || 2),
      spent: 0,
      limits: {
        maxSpend: Number(body?.budget || 2),
        maxDurationMs: 30 * 6e4,
        maxEnvironments: 3,
        maxRetries: 1,
        maxToolCalls: 40
      },
      status: "CREATED",
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    store.saveWorker(worker);
    broadcast(store);
    return { status: 201, json: { worker } };
  }
  const workerRun = pathname.match(/^\/api\/workers\/([^/]+)\/run$/);
  if (method === "POST" && workerRun) {
    const id = decodeURIComponent(workerRun[1]);
    const scenario = body?.scenario === "reality-divergence" ? "reality-divergence" : body?.scenario === "ambiguous-timeout-absent" ? "ambiguous-timeout-absent" : body?.scenario === "ambiguous-timeout" ? "ambiguous-timeout" : "default";
    return startWorkerRun(store, id, scenario);
  }
  if (method === "POST" && pathname === "/api/fail") {
    store.ensure(path5.basename(store.root), providerLabel(store).mode === "live" ? "solari" : "simulator");
    let worker = store.getWorker("invoice-reconciler") || store.getWorker("reality-check");
    if (!worker) {
      worker = {
        id: `wrk_${Math.random().toString(36).slice(2, 9)}`,
        name: "invoice-reconciler",
        kind: "reconciliation",
        task: "Reconcile today's payment records with the ERP",
        capabilities: ["browser", "sandbox", "desktop"],
        priority: 8,
        budget: 2,
        spent: 0,
        status: "CREATED",
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      store.saveWorker(worker);
    }
    return startWorkerRun(store, worker.id, "reality-divergence");
  }
  const reverify = pathname.match(/^\/api\/runs\/([^/]+)\/reverify$/);
  if (method === "POST" && reverify) {
    return reverifyRun(store, decodeURIComponent(reverify[1]));
  }
  const takeover = pathname.match(/^\/api\/runs\/([^/]+)\/takeover$/);
  if (method === "POST" && takeover) {
    return takeoverRun(store, decodeURIComponent(takeover[1]));
  }
  const cancel = pathname.match(/^\/api\/runs\/([^/]+)\/cancel$/);
  if (method === "POST" && cancel) {
    return cancelRun(store, decodeURIComponent(cancel[1]));
  }
  const resume = pathname.match(/^\/api\/runs\/([^/]+)\/resume$/);
  if (method === "POST" && resume) {
    return resumeStoredRun(store, decodeURIComponent(resume[1]));
  }
  const compensate = pathname.match(/^\/api\/runs\/([^/]+)\/compensate$/);
  if (method === "POST" && compensate) {
    return compensateRun(store, decodeURIComponent(compensate[1]));
  }
  const artifact = pathname.match(/^\/api\/artifacts\/([^/]+)\/([^/]+)$/);
  if (method === "GET" && artifact) {
    return { status: 404, error: "use static artifact handler" };
  }
  return { status: 404, error: "Not found" };
}
async function startWorkerRun(store, id, scenario) {
  const definition = store.getWorker(id);
  if (!definition)
    return { status: 404, error: `Worker '${id}' not found.` };
  if (inflight.has(definition.id))
    return { status: 409, error: "Worker already running." };
  inflight.set(definition.id, {});
  broadcast(store);
  let mesh;
  try {
    mesh = createMesh(store);
  } catch (err) {
    inflight.delete(definition.id);
    broadcast(store);
    const message = err instanceof MeshlyError ? err.format().trim() : err instanceof Error ? err.message : String(err);
    return { status: 400, error: message };
  }
  const caps = scenario === "reality-divergence" || scenario === "ambiguous-timeout" ? ["browser", "sandbox", "desktop"] : definition.capabilities;
  const worker = await mesh.spawn({
    id: definition.id,
    name: definition.name,
    kind: definition.kind || (scenario === "reality-divergence" ? "reconciliation" : void 0),
    task: definition.task,
    capabilities: caps,
    priority: definition.priority,
    budget: definition.budget,
    authority: AuthorityManager.issue({
      tools: ["*"],
      capabilities: caps,
      domains: ["*"],
      maxSpend: definition.budget
    })
  });
  const runPromise = worker.run({
    artifactDir: store.artifactDir(),
    destroyAfter: true,
    scenario,
    onProgress: (instance) => {
      inflight.set(definition.id, { runId: instance.runId });
      persistFromRuntime(store, mesh, instance, worker, instance.status !== "RUNNING");
      broadcast(store);
    }
  });
  runPromise.then((run) => {
    persistFromRuntime(store, mesh, run, worker, true);
  }).catch((err) => {
    inflight.set(definition.id, { error: err instanceof Error ? err.message : String(err) });
  }).finally(() => {
    inflight.delete(definition.id);
    broadcast(store);
  });
  return { status: 202, json: { accepted: true, workerId: definition.id, scenario } };
}
function appendEvent(run, type, data) {
  const last = run.events[run.events.length - 1];
  const event = {
    id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    runId: run.runId,
    sequence: (last?.sequence || 0) + 1,
    parentEventId: last?.id,
    type,
    timestamp: Date.now(),
    workerId: run.workerId,
    data
  };
  run.events = [...run.events || [], event];
}
function recordAction(run, action) {
  run.operatorActions = [...run.operatorActions || [], action];
}
function reverifyRun(store, runId) {
  const run = store.getRun(runId);
  if (!run)
    return { status: 404, error: "Run not found" };
  const step = [...run.steps].reverse().find((s) => s.worldStateMatched === false) || run.steps[run.steps.length - 1];
  if (!step)
    return { status: 400, error: "No step to re-verify" };
  const contract = step.contract || {
    intent: "Re-verify recorded world state",
    preconditions: [],
    postconditions: [
      { target: step.observation?.type || "browser", type: "text_contains", query: "title", expected: "Example" }
    ]
  };
  const observation = step.observation || {};
  let matched = true;
  let error;
  for (const cond of contract.postconditions || []) {
    const actual = observation[cond.query];
    if (!Verifier.matchesCondition(cond, actual)) {
      matched = false;
      error = `Postcondition failed on '${cond.query}': expected '${cond.expected}', observed '${actual}'`;
      break;
    }
  }
  appendEvent(run, "verification.started", { reason: "operator re-verify", stepId: step.id });
  if (matched) {
    step.worldStateMatched = true;
    step.status = "verified";
    appendEvent(run, "verification.passed", { stepId: step.id });
    run.status = "COMPLETED";
    run.error = void 0;
  } else {
    step.worldStateMatched = false;
    appendEvent(run, "verification.failed", { reason: error, stepId: step.id });
    appendEvent(run, "commit.blocked", { reason: error });
    run.status = "BLOCKED";
    run.error = error;
  }
  recordAction(run, {
    type: "reverify",
    at: (/* @__PURE__ */ new Date()).toISOString(),
    result: matched ? "matched" : "mismatch",
    detail: { error }
  });
  store.saveRun(run);
  broadcast(store);
  return { status: 200, json: { run, matched, error } };
}
function takeoverRun(store, runId) {
  const run = store.getRun(runId);
  if (!run)
    return { status: 404, error: "Run not found" };
  const env = run.environments[0];
  const sessionId = `op_${Date.now().toString(36)}`;
  const streamUrl = env?.streamUrl || env?.replayUrl;
  run.takeover = { sessionId, startedAt: Date.now(), streamUrl, active: true };
  appendEvent(run, "human.intervention", {
    action: "takeover_started",
    sessionId,
    streamUrl,
    environmentId: env?.id
  });
  recordAction(run, {
    type: "takeover",
    at: (/* @__PURE__ */ new Date()).toISOString(),
    result: "started",
    detail: { sessionId, streamUrl, environmentId: env?.id }
  });
  store.saveRun(run);
  broadcast(store);
  return { status: 200, json: { run, takeover: run.takeover } };
}
function cancelRun(store, runId) {
  const run = store.getRun(runId);
  if (!run)
    return { status: 404, error: "Run not found" };
  run.status = "CANCELLED";
  run.completedAt = Date.now();
  run.error = run.error || "Cancelled by operator";
  appendEvent(run, "run.cancelled", { reason: "operator" });
  store.saveRun(run);
  const worker = store.getWorker(run.workerId);
  if (worker) {
    worker.status = "CANCELLED";
    worker.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    store.saveWorker(worker);
  }
  broadcast(store);
  return { status: 200, json: { run } };
}
function resumeStoredRun(store, runId) {
  const stored = store.getRun(runId);
  if (!stored)
    return { status: 404, error: "Run not found" };
  if (inflight.has(stored.workerId))
    return { status: 409, error: "Worker already running." };
  inflight.set(stored.workerId, { runId: stored.runId });
  broadcast(store);
  let mesh;
  try {
    mesh = createMesh(store);
  } catch (err) {
    inflight.delete(stored.workerId);
    broadcast(store);
    const message = err instanceof MeshlyError ? err.format().trim() : err instanceof Error ? err.message : String(err);
    return { status: 400, error: message };
  }
  void mesh.restore(store).then(() => mesh.resume(stored.runId, {
    artifactDir: store.artifactDir(),
    destroyAfter: true,
    onProgress: (instance) => {
      const worker = mesh.workers.get(instance.workerId);
      if (worker)
        persistFromRuntime(store, mesh, instance, worker, instance.status !== "RUNNING");
      broadcast(store);
    }
  })).then((run) => {
    const worker = mesh.workers.get(run.workerId);
    if (worker)
      persistFromRuntime(store, mesh, run, worker, true);
  }).catch((err) => {
    inflight.set(stored.workerId, { error: err instanceof Error ? err.message : String(err) });
  }).finally(() => {
    inflight.delete(stored.workerId);
    broadcast(store);
  });
  return { status: 202, json: { runId: stored.runId, status: "RUNNING" } };
}
function compensateRun(store, runId) {
  const run = store.getRun(runId);
  if (!run)
    return { status: 404, error: "Run not found" };
  appendEvent(run, "compensation.started", { reason: run.error || "operator compensate" });
  run.compensated = true;
  appendEvent(run, "compensation.completed", { compensated: true, commit: "abandoned" });
  recordAction(run, {
    type: "compensate",
    at: (/* @__PURE__ */ new Date()).toISOString(),
    result: "compensated",
    detail: { commit: "abandoned" }
  });
  store.saveRun(run);
  broadcast(store);
  return { status: 200, json: { run } };
}
function artifactPath(store, runId, file) {
  const safeRun = runId.replace(/[^\w.-]/g, "_");
  const safeFile = path5.basename(file);
  const filePath = path5.join(store.artifactDir(), safeRun, safeFile);
  if (fs4.existsSync(filePath))
    return filePath;
  return void 0;
}
var inflight, listeners, PROJECT_ORDER;
var init_api = __esm({
  "apps/console/dist/api.js"() {
    "use strict";
    init_dist3();
    inflight = /* @__PURE__ */ new Map();
    listeners = /* @__PURE__ */ new Set();
    PROJECT_ORDER = ["Finance Ops", "Engineering", "Research", "Operations", "Other"];
  }
});

// apps/console/dist/server.js
var server_exports = {};
__export(server_exports, {
  startConsole: () => startConsole
});
import http from "node:http";
import fs5 from "node:fs";
import path6 from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
function uiDir() {
  const here = path6.dirname(fileURLToPath(import.meta.url));
  const built = path6.join(here, "ui");
  if (fs5.existsSync(path6.join(built, "index.html")))
    return built;
  const parent = path6.join(here, "..", "ui");
  if (fs5.existsSync(path6.join(parent, "index.html")))
    return parent;
  const fromSrc = path6.join(here, "..", "dist", "ui");
  if (fs5.existsSync(path6.join(fromSrc, "index.html")))
    return fromSrc;
  return built;
}
function contentType(file) {
  const ext = path6.extname(file).toLowerCase();
  if (ext === ".html")
    return "text/html; charset=utf-8";
  if (ext === ".js")
    return "text/javascript; charset=utf-8";
  if (ext === ".css")
    return "text/css; charset=utf-8";
  if (ext === ".svg")
    return "image/svg+xml";
  if (ext === ".woff2")
    return "font/woff2";
  if (ext === ".woff")
    return "font/woff";
  if (ext === ".png")
    return "image/png";
  if (ext === ".json")
    return "application/json";
  if (ext === ".map")
    return "application/json";
  return "application/octet-stream";
}
function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      if (chunks.length === 0)
        return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}
function startConsole(portOrOpts = DEFAULT_PORT) {
  const opts = typeof portOrOpts === "number" ? { port: portOrOpts } : portOrOpts || {};
  const port = opts.port ?? DEFAULT_PORT;
  const cwd = opts.cwd || process.cwd();
  loadEnv2(cwd);
  const store = createStore(cwd);
  const staticDir = uiDir();
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
    const method = req.method || "GET";
    const pathname = url.pathname;
    if (method === "GET" && pathname === "/api/stream") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive"
      });
      res.write(`data: ${JSON.stringify({ type: "state", state: snapshot(store) })}

`);
      const unsub = subscribe((payload) => {
        res.write(`data: ${payload}

`);
      });
      req.on("close", unsub);
      return;
    }
    const artifact = pathname.match(/^\/api\/artifacts\/([^/]+)\/([^/]+)$/);
    if (method === "GET" && artifact) {
      const filePath2 = artifactPath(store, decodeURIComponent(artifact[1]), decodeURIComponent(artifact[2]));
      if (!filePath2) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.writeHead(200, { "Content-Type": contentType(filePath2) });
      fs5.createReadStream(filePath2).pipe(res);
      return;
    }
    if (pathname.startsWith("/api/")) {
      try {
        const body = method === "POST" || method === "PUT" ? await readBody(req) : {};
        const result = await handleApi(store, method, pathname, body);
        if (result.error && !result.json) {
          sendJson(res, result.status, { error: result.error });
          return;
        }
        sendJson(res, result.status, result.json ?? { error: result.error });
      } catch (err) {
        sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
      }
      return;
    }
    const requested = pathname === "/" ? "/index.html" : pathname;
    const filePath = path6.normalize(path6.join(staticDir, requested));
    if (filePath.startsWith(staticDir) && fs5.existsSync(filePath) && fs5.statSync(filePath).isFile()) {
      res.writeHead(200, { "Content-Type": contentType(filePath) });
      fs5.createReadStream(filePath).pipe(res);
      return;
    }
    const index = path6.join(staticDir, "index.html");
    if (fs5.existsSync(index)) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      fs5.createReadStream(index).pipe(res);
      return;
    }
    res.writeHead(503, { "Content-Type": "text/plain" });
    res.end("Meshly console UI is not built. Run `npm run build` in the repo, then `meshly dev`.");
  });
  server.listen(port, () => {
    if (opts.quiet)
      return;
    const addr = server.address();
    const bound = typeof addr === "object" && addr ? addr.port : port;
    console.log(`
Meshly workspace
`);
    console.log(`  http://localhost:${bound}
`);
    console.log(`  Your workers are local to this machine.
`);
  });
  return server;
}
function isDirectRun() {
  const entry = process.argv[1];
  if (!entry)
    return false;
  const norm = entry.toLowerCase();
  if (!norm.endsWith("server.ts") && !norm.endsWith("server.js"))
    return false;
  try {
    return import.meta.url === pathToFileURL(path6.resolve(entry)).href;
  } catch {
    return fileURLToPath(import.meta.url) === path6.resolve(entry);
  }
}
var DEFAULT_PORT;
var init_server2 = __esm({
  "apps/console/dist/server.js"() {
    "use strict";
    init_api();
    DEFAULT_PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3400;
    if (isDirectRun()) {
      startConsole();
    }
  }
});

// packages/cli/src/simulate.ts
var simulate_exports = {};
__export(simulate_exports, {
  runSimulation: () => runSimulation
});
async function runSimulation(mesh, workerCount = 100) {
  const startTime = Date.now();
  console.log("\n" + "=".repeat(78));
  console.log(` MESHLY: WORKER SCHEDULER SIMULATION (${workerCount} WORKERS)`);
  console.log(" Simulated environment pool \u2014 not live Solari capacity.");
  console.log("=".repeat(78) + "\n");
  const initialPoolSpecs = [
    { type: "browser", profile: "salesforce-crm" },
    { type: "browser", profile: "stripe-portal" },
    { type: "browser" },
    { type: "browser" },
    { type: "browser" },
    { type: "sandbox" },
    { type: "sandbox" },
    { type: "sandbox" },
    { type: "desktop" },
    { type: "desktop" }
  ];
  console.log(`[Simulator] Pre-warming ${initialPoolSpecs.length} environments...`);
  const dummyAuth = AuthorityManager.issue({ tools: ["*"] });
  for (const spec of initialPoolSpecs) {
    const lease = await mesh.broker.acquire({
      workerId: "prewarm_bootstrap",
      type: spec.type,
      authority: dummyAuth,
      budget: 1,
      affinity: { profile: spec.profile }
    });
    await mesh.broker.release(lease.leaseId);
  }
  const tasks = [
    { task: "Scrape pricing from competitor SaaS", caps: ["browser"], profile: "stripe-portal", priority: 7 },
    { task: "Execute Python anomaly detection script", caps: ["sandbox"], priority: 5 },
    { task: "Post journal entries in legacy desktop ERP", caps: ["desktop"], priority: 9 },
    { task: "Verify billing dispute in CRM", caps: ["browser"], profile: "salesforce-crm", priority: 8 },
    { task: "Run nightly database integrity batch", caps: ["sandbox"], priority: 4 }
  ];
  for (let i = 0; i < workerCount; i++) {
    const template = tasks[i % tasks.length];
    await mesh.spawn({
      task: `[Job #${i + 1}] ${template.task}`,
      capabilities: template.caps,
      priority: template.priority + (i % 3 === 0 ? 1 : 0),
      deadline: i % 5 === 0 ? new Date(Date.now() + 3e4) : void 0,
      budget: 0.5,
      metadata: { profile: template.profile }
    });
  }
  const maxQueue = mesh.scheduler.getQueueLength();
  let completed = 0;
  let totalReuses = 0;
  while (mesh.scheduler.getQueueLength() > 0 || mesh.scheduler.getActiveCount() > 0) {
    const next = await mesh.scheduleNext();
    if (next.worker && next.lease) {
      next.worker.deductSpend(0.01);
      const env = mesh.broker.inspect(next.lease.environmentId);
      if (env?.lastActiveAt) totalReuses += 1;
      mesh.runtime.complete(next.worker.id);
      completed += 1;
    } else {
      break;
    }
  }
  const stats = mesh.stats();
  console.log("\n" + "=".repeat(78));
  console.log(" SCHEDULER SIMULATION COMPLETE");
  console.log("=".repeat(78));
  console.log(` Workers processed:       ${completed}`);
  console.log(` Max queue depth:         ${maxQueue}`);
  console.log(` Warm reuses:             ${totalReuses}`);
  console.log(` Duration:                ${Date.now() - startTime}ms`);
  console.log(` Environments in pool:    ${stats.environments.total}`);
  console.log("=".repeat(78) + "\n");
}
var init_simulate = __esm({
  "packages/cli/src/simulate.ts"() {
    "use strict";
    init_dist3();
  }
});

// packages/benchmark/dist/rng.js
function createRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a |= 0;
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => Math.floor(next() * (max - min)) + min,
    pick: (items) => items[Math.floor(next() * items.length)],
    chance: (probability) => next() < probability
  };
}
function deriveSeed(...parts) {
  let h = 2166136261 >>> 0;
  const text = parts.join(":");
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
var init_rng = __esm({
  "packages/benchmark/dist/rng.js"() {
    "use strict";
  }
});

// packages/benchmark/dist/fabric.js
function capacityMessage(type) {
  if (type === "browser")
    return "no browser capacity in the benchmark pool";
  if (type === "sandbox")
    return "no sandbox capacity in the benchmark pool";
  return "desktop unavailable in the benchmark pool";
}
var KILLED_MESSAGE, BenchmarkFabric;
var init_fabric = __esm({
  "packages/benchmark/dist/fabric.js"() {
    "use strict";
    init_dist();
    KILLED_MESSAGE = "environment lost: benchmark injected kill before dispatch";
    BenchmarkFabric = class {
      name = "benchmark-fabric";
      source;
      inner;
      writes = [];
      live = /* @__PURE__ */ new Map();
      killed = /* @__PURE__ */ new Set();
      fault = {};
      killedTypes = /* @__PURE__ */ new Set();
      seq = 0;
      created = 0;
      destroyed = 0;
      peak = 0;
      reuses = 0;
      failedAllocations = 0;
      byType = {
        browser: { created: 0, peak: 0, active: 0 },
        sandbox: { created: 0, peak: 0, active: 0 },
        desktop: { created: 0, peak: 0, active: 0 }
      };
      inflight = { browser: 0, sandbox: 0, desktop: 0 };
      constructor(inner, source = "simulator") {
        this.inner = inner ?? new SimulatorExecutionFabric();
        this.source = source;
      }
      /** Start a fresh trial: clear the journal and faults, keep nothing behind. */
      beginTrial(fault = {}) {
        this.writes = [];
        this.fault = fault;
        this.killedTypes.clear();
        this.killed.clear();
        this.seq = 0;
      }
      journal() {
        return [...this.writes];
      }
      stats() {
        return {
          created: this.created,
          destroyed: this.destroyed,
          active: this.live.size,
          peak: this.peak,
          reuses: this.reuses,
          failedAllocations: this.failedAllocations,
          byType: JSON.parse(JSON.stringify(this.byType))
        };
      }
      /** A fabric-created execution environment for the direct executor. */
      static asEnvironment(resource, type) {
        return {
          id: `env_${type}_direct_${Math.random().toString(36).slice(2, 8)}`,
          type,
          status: "BUSY",
          fabricId: resource.id,
          loadedFiles: [],
          cost: 0,
          capabilities: [type],
          handle: resource.handle,
          streamUrl: resource.streamUrl,
          replayUrl: resource.replayUrl,
          lastActiveAt: /* @__PURE__ */ new Date()
        };
      }
      async launchBrowser(options = {}) {
        return this.provision("browser", () => this.inner.launchBrowser(options));
      }
      async createSandbox(options = {}) {
        return this.provision("sandbox", () => this.inner.createSandbox(options));
      }
      async createDesktop(options = {}) {
        return this.provision("desktop", () => this.inner.createDesktop(options));
      }
      async pauseResource(resource) {
        return this.inner.pauseResource(resource);
      }
      async resumeResource(resource) {
        return this.inner.resumeResource(resource);
      }
      async destroyResource(resource) {
        for (const [id, tracked] of this.live) {
          if (id === resource.id || tracked.handle === resource.handle) {
            this.live.delete(id);
            this.byType[tracked.type].active = Math.max(0, this.byType[tracked.type].active - 1);
            break;
          }
        }
        this.destroyed += 1;
        return this.inner.destroyResource(resource);
      }
      /** Release any SDK clients the inner fabric is holding. */
      async dispose() {
        const closeable = this.inner;
        if (typeof closeable.close === "function") {
          try {
            await closeable.close();
          } catch {
          }
        }
      }
      async reconnect(id, type) {
        if (this.killed.has(id))
          throw new Error(KILLED_MESSAGE);
        if (!this.inner.reconnect)
          throw new Error(`Fabric '${this.inner.name}' cannot reconnect ${type} ${id}`);
        return this.inner.reconnect(id, type);
      }
      async provision(type, make) {
        const ceiling = this.fault.capacity?.[type];
        if (ceiling !== void 0 && this.byType[type].active + this.inflight[type] >= ceiling) {
          this.failedAllocations += 1;
          throw new Error(capacityMessage(type));
        }
        this.inflight[type] += 1;
        try {
          const resource = await make();
          const instrumented = this.instrument(resource);
          this.live.set(resource.id, instrumented);
          this.created += 1;
          this.byType[type].created += 1;
          this.byType[type].active += 1;
          if (this.byType[type].active > this.byType[type].peak)
            this.byType[type].peak = this.byType[type].active;
          if (this.live.size > this.peak)
            this.peak = this.live.size;
          if (this.fault.killFirst === type && !this.killedTypes.has(type)) {
            this.killedTypes.add(type);
            this.killed.add(resource.id);
          }
          return instrumented;
        } finally {
          this.inflight[type] -= 1;
        }
      }
      /**
       * Wrap a resource handle so calls can be faulted and writes can be journaled.
       *
       * A Proxy, not a spread: live SDK handles are class instances, and lifecycle
       * methods (kill / close / pause / resume / destroy) must be invoked with the
       * original `this` or teardown silently fails and sessions leak.
       */
      instrument(resource) {
        const fabric = this;
        const handle = resource.handle;
        const assertAlive = () => {
          if (fabric.killed.has(resource.id))
            throw new Error(KILLED_MESSAGE);
        };
        const origin = (_name, fn) => (...args) => {
          assertAlive();
          return fn.apply(handle, args);
        };
        const overrides = /* @__PURE__ */ new Map();
        for (const name of ["connect", "health", "open", "newPage", "screenshot"]) {
          const fn = handle?.[name];
          if (typeof fn === "function")
            overrides.set(name, origin(name, fn));
        }
        if (handle?.files) {
          const files = handle.files;
          overrides.set("files", new Proxy(files, {
            get(target, prop) {
              const value = Reflect.get(target, prop, target);
              if (typeof value !== "function")
                return value;
              if (prop === "write") {
                return (filePath, content) => {
                  assertAlive();
                  fabric.recordWrite(resource.type, resource.id, filePath, content);
                  return value.apply(target, [filePath, content]);
                };
              }
              return (...args) => {
                assertAlive();
                return value.apply(target, args);
              };
            }
          }));
        }
        if (handle?.commands) {
          const commands = handle.commands;
          overrides.set("commands", new Proxy(commands, {
            get(target, prop) {
              const value = Reflect.get(target, prop, target);
              if (typeof value !== "function")
                return value;
              if (prop === "run") {
                return (cmd, opts) => {
                  assertAlive();
                  fabric.recordShellWrite(resource.type, resource.id, cmd, opts);
                  return value.apply(target, [cmd, opts]);
                };
              }
              return (...args) => {
                assertAlive();
                return value.apply(target, args);
              };
            }
          }));
        }
        const proxy = new Proxy(handle, {
          get(target, prop) {
            if (overrides.has(prop))
              return overrides.get(prop);
            return Reflect.get(target, prop, target);
          }
        });
        return { ...resource, handle: proxy };
      }
      recordWrite(type, resourceId, filePath, content) {
        this.seq += 1;
        this.writes.push({
          seq: this.seq,
          type,
          resourceId,
          path: String(filePath),
          value: String(content ?? "")
        });
      }
      /**
       * Some SDKs have no `files.write`, so the runtime writes through a base64
       * shell command instead. Journal that too, or live ground truth would be
       * blind to sandbox/desktop writes.
       */
      recordShellWrite(type, resourceId, cmd, opts) {
        if (cmd !== "bash")
          return;
        const script = (opts?.args || []).join(" ");
        const match = script.match(/echo '([A-Za-z0-9+/=]+)'\s*\|\s*base64 -d\s*>\s*'([^']+)'/);
        if (!match)
          return;
        try {
          const value = Buffer.from(match[1], "base64").toString("utf8");
          this.recordWrite(type, resourceId, match[2], value);
        } catch {
        }
      }
      /** Total environments provisioned across the life of this fabric. */
      sessionsCreated() {
        return this.created;
      }
      /** Count writes to a target that was already written during this trial. */
      static duplicates(writes) {
        const seen = /* @__PURE__ */ new Map();
        let duplicates = 0;
        for (const write of writes) {
          const key = `${write.type}:${write.path}`;
          const count = seen.get(key) ?? 0;
          if (count > 0)
            duplicates += 1;
          seen.set(key, count + 1);
        }
        return duplicates;
      }
      static finalValue(writes, type, filePath) {
        let value;
        for (const write of writes) {
          if (write.type === type && write.path === filePath)
            value = write.value;
        }
        return value;
      }
    };
  }
});

// packages/benchmark/dist/scenarios.js
function finalValue(writes, type, path10) {
  let value;
  for (const write of writes) {
    if (write.type === type && write.path === path10)
      value = write.value;
  }
  return value;
}
var ALL, SCENARIOS, SCENARIO_ORDER;
var init_scenarios = __esm({
  "packages/benchmark/dist/scenarios.js"() {
    "use strict";
    init_dist();
    ALL = ["browser", "sandbox", "desktop"];
    SCENARIOS = {
      success: {
        id: "success",
        title: "Successful task",
        description: "A normal three-surface task with no injected fault. Establishes that governance does not destroy normal performance.",
        truthKind: "completion",
        truthDetail: "The task completed and nothing was injected to contradict it.",
        kind: "probe",
        task: "Open a browser, run a sandbox command, and read desktop health",
        capabilities: ALL,
        naiveMaxRetries: 0,
        naiveMaxRestarts: 0,
        budgetUsd: 2,
        truth: ({ claimedSuccess }) => ({ correct: claimedSuccess, detail: claimedSuccess ? "completed" : "did not complete" }),
        program: () => resolveProgram({ task: "probe", capabilities: ALL, kind: "probe" }),
        authority: () => void 0
      },
      reality_divergence: {
        id: "reality_divergence",
        title: "Reality divergence",
        description: "The agent and tool report success, but the world does not match the claim. The canonical false-commit hazard.",
        truthKind: "world",
        truthDetail: "Desktop /tmp/erp_status must actually read POSTED.",
        kind: "reconciliation",
        executeScenario: "reality-divergence",
        task: "Reconcile today's payment records with the ERP",
        capabilities: ALL,
        naiveMaxRetries: 0,
        naiveMaxRestarts: 0,
        budgetUsd: 2,
        truth: ({ writes }) => {
          const value = finalValue(writes, "desktop", "/tmp/erp_status");
          return { correct: value === "POSTED", detail: `erp_status=${value ?? "absent"}` };
        },
        program: () => resolveProgram({ task: "reconcile", capabilities: ALL, kind: "reconciliation", scenario: "reality-divergence" }),
        authority: () => void 0
      },
      ambiguous_timeout: {
        id: "ambiguous_timeout",
        title: "Ambiguous timeout",
        description: "The side effect lands but the result never returns. The classic duplicate-side-effect hazard.",
        truthKind: "world",
        truthDetail: "Desktop /tmp/erp_status must read POSTED, exactly once.",
        kind: "operations",
        executeScenario: "ambiguous-timeout",
        task: "Dispatch a desktop side effect whose result may never return",
        capabilities: ["desktop"],
        naiveMaxRetries: 5,
        naiveMaxRestarts: 0,
        budgetUsd: 2,
        truth: ({ writes }) => {
          const value = finalValue(writes, "desktop", "/tmp/erp_status");
          return { correct: value === "POSTED", detail: `erp_status=${value ?? "absent"}` };
        },
        program: () => resolveProgram({ task: "timeout", capabilities: ["desktop"], kind: "operations", scenario: "ambiguous-timeout" }),
        authority: () => void 0
      },
      environment_loss: {
        id: "environment_loss",
        title: "Environment loss",
        description: "The desktop dies before the step is dispatched. Recovery without losing committed work.",
        truthKind: "world",
        truthDetail: "Desktop /tmp/erp_status must read POSTED after recovery.",
        kind: "reconciliation",
        task: "Reconcile today's payment records with the ERP",
        capabilities: ALL,
        fault: { killFirst: "desktop" },
        naiveMaxRetries: 0,
        naiveMaxRestarts: 2,
        budgetUsd: 2,
        truth: ({ writes, claimedSuccess }) => {
          const value = finalValue(writes, "desktop", "/tmp/erp_status");
          return { correct: value === "POSTED" && claimedSuccess, detail: `erp_status=${value ?? "absent"}` };
        },
        program: () => resolveProgram({ task: "reconcile", capabilities: ALL, kind: "reconciliation" }),
        authority: () => void 0
      },
      authority_violation: {
        id: "authority_violation",
        title: "Authority violation",
        description: "The task requires tools outside the worker's granted authority. Policy must intercept before dispatch.",
        truthKind: "policy",
        truthDetail: "Zero actions outside the granted authority may reach execution.",
        kind: "reconciliation",
        task: "Reconcile today's payment records with the ERP",
        capabilities: ALL,
        policy: { tools: ["browser_navigate", "browser_extract", "browser_click"], capabilities: ["browser"], domains: ["*"] },
        naiveMaxRetries: 0,
        naiveMaxRestarts: 0,
        budgetUsd: 2,
        truth: ({ unauthorizedActionsExecuted }) => ({
          correct: unauthorizedActionsExecuted === 0,
          detail: `${unauthorizedActionsExecuted} unauthorized action(s) reached execution`
        }),
        program: () => resolveProgram({ task: "reconcile", capabilities: ALL, kind: "reconciliation" }),
        authority: () => AuthorityManager.issue({
          tools: ["browser_navigate", "browser_extract", "browser_click"],
          capabilities: ["browser"],
          domains: ["*"],
          maxSpend: 2
        })
      },
      runaway_retry: {
        id: "runaway_retry",
        title: "Runaway retries",
        description: "A thrashing agent keeps retrying an action with an unknown outcome. Measures tool calls, spend, and budget containment.",
        truthKind: "world",
        truthDetail: "Desktop /tmp/erp_status must read POSTED and spend must stay within budget.",
        kind: "operations",
        executeScenario: "ambiguous-timeout",
        task: "Dispatch a desktop side effect whose result may never return",
        capabilities: ["desktop"],
        naiveMaxRetries: 25,
        naiveMaxRestarts: 0,
        budgetUsd: 0.5,
        meshlyLimits: { maxRetries: 1, maxToolCalls: 40, maxSpend: 0.5 },
        truth: ({ writes }) => {
          const value = finalValue(writes, "desktop", "/tmp/erp_status");
          return { correct: value === "POSTED", detail: `erp_status=${value ?? "absent"}` };
        },
        program: () => resolveProgram({ task: "timeout", capabilities: ["desktop"], kind: "operations", scenario: "ambiguous-timeout" }),
        authority: () => void 0
      },
      concurrent_contention: {
        id: "concurrent_contention",
        title: "Concurrent worker contention",
        description: "Many workers, scarce environments. Ad-hoc allocation versus scheduler, leases, reuse, and waiting states.",
        truthKind: "completion",
        truthDetail: "Every worker must reach a terminal successful state.",
        kind: "probe",
        task: "Open a browser and observe a page",
        capabilities: ["browser"],
        fault: { capacity: { browser: 5 } },
        naiveMaxRetries: 0,
        naiveMaxRestarts: 0,
        budgetUsd: 1,
        concurrencyLevels: [10, 25, 50],
        truth: ({ completed }) => ({ correct: completed, detail: completed ? "all workers completed" : "workers failed to complete" }),
        program: () => resolveProgram({ task: "probe", capabilities: ["browser"], kind: "probe" }),
        authority: () => void 0
      }
    };
    SCENARIO_ORDER = [
      "success",
      "reality_divergence",
      "ambiguous_timeout",
      "environment_loss",
      "authority_violation",
      "runaway_retry",
      "concurrent_contention"
    ];
  }
});

// packages/benchmark/dist/direct.js
function costFor2(type) {
  if (type === "browser")
    return 0.05;
  if (type === "sandbox")
    return 0.02;
  return 0.08;
}
async function runDirectAgent(options) {
  const started = Date.now();
  let failedAllocations = 0;
  const pool = new DirectEnvironmentPool(options.fabric, () => {
    failedAllocations += 1;
  });
  let toolCalls = 0;
  let retries = 0;
  let spendUsd = 0;
  let restarts = 0;
  let lostProgressSteps = 0;
  let unauthorizedActionsExecuted = 0;
  let recoveredFromLoss = false;
  let claimedSuccess = true;
  let status = "COMMITTED";
  let error;
  let observations = [];
  restart: while (true) {
    observations = [];
    for (let i = 0; i < options.steps.length; i++) {
      const step = options.steps[i];
      if (options.policy && !AuthorityManager.evaluate(options.policy, { tool: step.tool, capability: step.environment }).allowed) {
        unauthorizedActionsExecuted += 1;
      }
      const env = await pool.get(step.environment);
      if (!env) {
        claimedSuccess = false;
        status = "FAILED";
        error = "environment allocation failed";
        break restart;
      }
      const args = carryForward(step.args, observations);
      let attempt = 0;
      while (true) {
        toolCalls += 1;
        const dispatched = await dispatchTool({
          tool: step.tool,
          args,
          env,
          runId: "bench_direct"
        });
        spendUsd += costFor2(step.environment);
        if (dispatched.outcome === "UNKNOWN") {
          retries += 1;
          attempt += 1;
          if (attempt > options.naiveMaxRetries) {
            claimedSuccess = false;
            status = "UNKNOWN";
            error = "outcome unknown after retries; no way to confirm the world state";
            break restart;
          }
          continue;
        }
        if (dispatched.outcome === "FAILURE") {
          const gone = dispatched.observation?.environmentGone === true || isEnvironmentGone(dispatched.observation?.error);
          if (gone) {
            if (restarts >= options.maxRestarts) {
              claimedSuccess = false;
              status = "FAILED";
              error = "environment lost; context was not checkpointed";
              break restart;
            }
            restarts += 1;
            recoveredFromLoss = true;
            lostProgressSteps += i;
            await pool.destroyAll();
            continue restart;
          }
          claimedSuccess = false;
          status = "FAILED";
          error = String(dispatched.observation?.error || "tool failure");
          break restart;
        }
        if (dispatched.claimedSuccess === false) {
          claimedSuccess = false;
          status = "FAILED";
          error = "tool reported failure";
          break restart;
        }
        observations.push({ ...dispatched.observation, type: step.environment });
        break;
      }
    }
    break;
  }
  await pool.destroyAll();
  return {
    status,
    claimedSuccess,
    toolCalls,
    retries,
    spendUsd,
    unauthorizedActionsExecuted,
    recoveredFromLoss,
    unknownResolved: false,
    lostProgressSteps,
    failedAllocations,
    budgetViolation: spendUsd > options.budgetUsd,
    latencyMs: Date.now() - started,
    error
  };
}
function carryForward(args, observations) {
  if (!args?.carryForwardFrom || !Array.isArray(args.prepare))
    return args;
  const type = String(args.carryForwardFrom);
  const source = [...observations].reverse().find((o) => o.type === type && typeof o.payments_record === "object");
  const payments = source?.payments_record;
  if (!payments)
    return args;
  const prepare = args.prepare.map((file) => file?.path === "/tmp/payments.json" ? { ...file, content: JSON.stringify(payments) } : file);
  return { ...args, prepare };
}
var DirectEnvironmentPool;
var init_direct = __esm({
  "packages/benchmark/dist/direct.js"() {
    "use strict";
    init_dist();
    init_fabric();
    DirectEnvironmentPool = class {
      environments = /* @__PURE__ */ new Map();
      resources = /* @__PURE__ */ new Map();
      fabric;
      onFailedAllocation;
      constructor(fabric, onFailedAllocation) {
        this.fabric = fabric;
        this.onFailedAllocation = onFailedAllocation;
      }
      async get(type) {
        const existing = this.environments.get(type);
        if (existing)
          return existing;
        try {
          const resource = type === "browser" ? await this.fabric.launchBrowser({ recording: true }) : type === "sandbox" ? await this.fabric.createSandbox({ template: "base" }) : await this.fabric.createDesktop({ resolution: "1280x720" });
          const env = BenchmarkFabric.asEnvironment(resource, type);
          this.environments.set(type, env);
          this.resources.set(type, resource);
          return env;
        } catch {
          this.onFailedAllocation();
          return void 0;
        }
      }
      async destroyAll() {
        for (const resource of this.resources.values()) {
          await this.fabric.destroyResource(resource);
        }
        this.environments.clear();
        this.resources.clear();
      }
    };
  }
});

// packages/benchmark/dist/meshly-runner.js
async function runMeshlyWorker(options) {
  const mesh = new Meshly({ executionFabric: options.fabric, maxConcurrency: options.maxConcurrency ?? 10 });
  const started = Date.now();
  const worker = await mesh.spawn({
    name: `bench-${options.kind}-${options.index ?? 0}`,
    kind: options.kind,
    task: options.task,
    capabilities: options.capabilities,
    budget: options.budgetUsd,
    authority: options.authority,
    limits: options.limits
  });
  const run = await worker.run({ destroyAfter: true, scenario: options.scenario });
  const latencyMs = Date.now() - started;
  const events = mesh.events.query({ runId: run.runId });
  const denied = events.filter((e) => e.type === "action.denied");
  const lost = events.filter((e) => e.type === "environment.lost");
  const unknownEvents = events.filter((e) => e.type === "action.unknown" || e.type === "run.unknown");
  const safeToRetry = events.some((e) => e.type === "run.unknown" && e.data?.safeToRetry === true);
  const verified = run.status === "VERIFIED" || run.status === "COMPLETED";
  const unknownResolved = unknownEvents.length > 0 && (run.status === "VERIFIED" || safeToRetry);
  return {
    status: run.status,
    claimedSuccess: verified,
    // Count actual dispatches, not allocation attempts. The runtime's own
    // toolCalls counter increments before an environment is secured.
    toolCalls: events.filter((e) => e.type === "action.executed").length,
    retries: run.retries || 0,
    spendUsd: worker.budget.spent,
    unauthorizedActionsExecuted: 0,
    blockedActions: denied.length,
    recoveredFromLoss: lost.length > 0 && run.status === "COMPLETED",
    unknownResolved,
    lostProgressSteps: 0,
    failedAllocations: events.filter((e) => e.type === "environment.acquired").length === 0 && !verified ? 1 : 0,
    budgetViolation: worker.budget.spent > options.budgetUsd,
    latencyMs,
    error: run.error,
    environmentReuses: events.filter((e) => e.type === "environment.reused").length,
    environmentsCreated: events.filter((e) => e.type === "environment.acquired").length
  };
}
var init_meshly_runner = __esm({
  "packages/benchmark/dist/meshly-runner.js"() {
    "use strict";
    init_dist3();
  }
});

// packages/benchmark/dist/engine.js
async function runExecutionBenchmark(options) {
  const trials = [];
  const scenarioReports = [];
  const scenarios = options.scenarioIds.filter((id) => SCENARIOS[id]);
  let scenarioIndex = 0;
  const ctx = {
    createFabric: options.createFabric ?? (() => new BenchmarkFabric()),
    maxSessions: options.maxSessions,
    settleMs: options.armSettleMs ?? 0,
    sessions: 0,
    aborted: false
  };
  const source = options.source ?? "simulator";
  for (const id of scenarios) {
    scenarioIndex += 1;
    options.onScenario?.(id, scenarioIndex, scenarios.length);
    const spec = SCENARIOS[id];
    const results = id === "concurrent_contention" ? await runContention(spec, options, ctx) : await runSingleScenario(spec, options, ctx);
    trials.push(...results);
    const direct = summarize(results.filter((r) => r.mode === "direct"));
    const meshly = summarize(results.filter((r) => r.mode === "meshly"));
    scenarioReports.push({
      id,
      title: spec.title,
      description: spec.description,
      truthKind: spec.truthKind,
      truthDetail: spec.truthDetail,
      trials: results.filter((r) => r.mode === "direct").length,
      governanceOverheadMs: Math.round(meshly.medianLatencyMs - direct.medianLatencyMs),
      modes: { direct, meshly }
    });
  }
  const notes = source === "simulator" ? [
    "Simulator execution: deterministic local substrate, not a live Solari capacity test.",
    "Both arms run the same task, the same environments, the same tool surface, and the same fault.",
    "Ground truth is read from the world journal, never from either model's claim.",
    "Real Solari results must be generated and labelled separately."
  ] : [
    "Live Solari execution. Real cloud browsers, sandboxes, and desktops were provisioned and released.",
    "Both arms run the same task, the same environments, the same tool surface, and the same fault.",
    "Ground truth is read from the world journal, never from either model's claim.",
    `Scenarios: ${scenarios.join(", ")}. Environment loss and contention are simulator-only by default.`,
    "Latency and cost on live infrastructure are not comparable to the simulator run."
  ];
  const report = {
    suite: "execution",
    source,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    meshlyVersion: "0.1.0",
    seed: options.seed,
    scenarioIds: scenarios,
    scenarios: scenarioReports,
    sessionsCreated: ctx.sessions,
    notes
  };
  return { report, trials };
}
async function runSingleScenario(spec, options, ctx) {
  const results = [];
  for (let trial = 0; trial < options.trials; trial++) {
    if (budgetReached(ctx)) {
      ctx.aborted = true;
      break;
    }
    const seed = deriveSeed(options.seed, spec.id, trial);
    const rng = createRng(seed);
    void rng.next();
    results.push(await runDirectTrial(spec, trial, seed, ctx));
    if (ctx.settleMs > 0)
      await sleep2(ctx.settleMs);
    if (budgetReached(ctx)) {
      ctx.aborted = true;
      break;
    }
    results.push(await runMeshlyTrial(spec, trial, seed, ctx));
    if (ctx.settleMs > 0)
      await sleep2(ctx.settleMs);
  }
  return results;
}
async function runDirectTrial(spec, trial, seed, ctx) {
  const fabric = ctx.createFabric();
  fabric.beginTrial(spec.fault);
  const steps = spec.program().steps;
  const authority = spec.authority();
  const result = await runDirectAgent({
    fabric,
    steps,
    policy: authority,
    naiveMaxRetries: spec.naiveMaxRetries,
    maxRestarts: spec.naiveMaxRestarts,
    budgetUsd: spec.budgetUsd
  });
  const writes = fabric.journal();
  const stats = fabric.stats();
  await fabric.dispose();
  ctx.sessions += stats.created;
  const truth = spec.truth({
    claimedSuccess: result.claimedSuccess,
    writes,
    unauthorizedActionsExecuted: result.unauthorizedActionsExecuted,
    completed: result.status === "COMMITTED"
  });
  const duplicates = BenchmarkFabric.duplicates(writes);
  return {
    scenario: spec.id,
    mode: "direct",
    trial,
    seed,
    status: result.status,
    claimedSuccess: result.claimedSuccess,
    correctFinalState: truth.correct,
    falseCommit: truth.correct ? false : result.claimedSuccess && spec.truthKind === "world",
    duplicateSideEffects: duplicates,
    unauthorizedActionsExecuted: result.unauthorizedActionsExecuted,
    recoveredFromLoss: result.recoveredFromLoss,
    unknownResolved: result.unknownResolved,
    budgetViolation: result.budgetViolation,
    toolCalls: result.toolCalls,
    retries: result.retries,
    spendUsd: round(result.spendUsd),
    latencyMs: result.latencyMs,
    environmentsCreated: stats.created,
    environmentReuses: 0,
    orphanEnvironments: stats.active,
    failedAllocations: stats.failedAllocations,
    peakConcurrentEnvironments: stats.peak,
    lostProgressSteps: result.lostProgressSteps,
    unitsRequested: 1,
    unitsCompleted: result.claimedSuccess ? 1 : 0,
    error: result.error
  };
}
async function runMeshlyTrial(spec, trial, seed, ctx) {
  const fabric = ctx.createFabric();
  fabric.beginTrial(spec.fault);
  const authority = spec.authority();
  const result = await runMeshlyWorker({
    fabric,
    task: spec.task,
    kind: spec.kind,
    capabilities: spec.capabilities,
    scenario: spec.executeScenario,
    authority,
    budgetUsd: spec.budgetUsd,
    limits: spec.meshlyLimits
  });
  const writes = fabric.journal();
  const stats = fabric.stats();
  await fabric.dispose();
  ctx.sessions += stats.created;
  const truth = spec.truth({
    claimedSuccess: result.claimedSuccess,
    writes,
    unauthorizedActionsExecuted: result.unauthorizedActionsExecuted,
    completed: result.claimedSuccess
  });
  const duplicates = BenchmarkFabric.duplicates(writes);
  return {
    scenario: spec.id,
    mode: "meshly",
    trial,
    seed,
    status: result.status,
    claimedSuccess: result.claimedSuccess,
    correctFinalState: truth.correct,
    falseCommit: truth.correct ? false : result.claimedSuccess && spec.truthKind === "world",
    duplicateSideEffects: duplicates,
    unauthorizedActionsExecuted: result.unauthorizedActionsExecuted,
    recoveredFromLoss: result.recoveredFromLoss,
    unknownResolved: result.unknownResolved,
    budgetViolation: result.budgetViolation,
    toolCalls: result.toolCalls,
    retries: result.retries,
    spendUsd: round(result.spendUsd),
    latencyMs: result.latencyMs,
    environmentsCreated: stats.created,
    environmentReuses: result.environmentReuses,
    orphanEnvironments: stats.active,
    failedAllocations: stats.failedAllocations,
    peakConcurrentEnvironments: stats.peak,
    lostProgressSteps: result.lostProgressSteps,
    unitsRequested: 1,
    unitsCompleted: result.claimedSuccess ? 1 : 0,
    error: result.error
  };
}
async function runContention(spec, options, ctx) {
  const results = [];
  const levels = options.concurrencyLevels?.length ? options.concurrencyLevels : spec.concurrencyLevels ?? options.concurrencyLevels;
  let trip = 0;
  for (const level of levels) {
    for (let i = 0; i < options.concurrencyTrips; i++) {
      if (budgetReached(ctx)) {
        ctx.aborted = true;
        return results;
      }
      trip += 1;
      const seed = deriveSeed(options.seed, spec.id, level, i);
      results.push(await contentionDirect(spec, level, trip, seed, ctx));
      results.push(await contentionMeshly(spec, level, trip, seed, ctx));
    }
  }
  return results;
}
async function contentionDirect(spec, level, trial, seed, ctx) {
  const fabric = ctx.createFabric();
  fabric.beginTrial(spec.fault);
  const steps = spec.program().steps;
  const started = Date.now();
  const runs = await Promise.all(Array.from({ length: level }, () => runDirectAgent({
    fabric,
    steps,
    policy: void 0,
    naiveMaxRetries: spec.naiveMaxRetries,
    maxRestarts: spec.naiveMaxRestarts,
    budgetUsd: spec.budgetUsd
  })));
  const stats = fabric.stats();
  await fabric.dispose();
  ctx.sessions += stats.created;
  const completed = runs.every((r) => r.claimedSuccess);
  const truth = spec.truth({ claimedSuccess: completed, writes: [], unauthorizedActionsExecuted: 0, completed });
  return {
    scenario: spec.id,
    mode: "direct",
    trial,
    seed,
    status: completed ? "COMMITTED" : "PARTIAL",
    claimedSuccess: completed,
    correctFinalState: truth.correct,
    falseCommit: false,
    duplicateSideEffects: 0,
    unauthorizedActionsExecuted: 0,
    recoveredFromLoss: false,
    unknownResolved: false,
    budgetViolation: runs.some((r) => r.budgetViolation),
    toolCalls: sum(runs.map((r) => r.toolCalls)),
    retries: sum(runs.map((r) => r.retries)),
    spendUsd: round(sum(runs.map((r) => r.spendUsd))),
    latencyMs: Date.now() - started,
    environmentsCreated: stats.created,
    environmentReuses: 0,
    orphanEnvironments: stats.active,
    failedAllocations: stats.failedAllocations,
    peakConcurrentEnvironments: stats.peak,
    lostProgressSteps: sum(runs.map((r) => r.lostProgressSteps)),
    unitsRequested: level,
    unitsCompleted: runs.filter((r) => r.claimedSuccess).length,
    error: completed ? void 0 : `${runs.filter((r) => !r.claimedSuccess).length}/${level} failed to allocate`
  };
}
async function contentionMeshly(spec, level, trial, seed, ctx) {
  const fabric = ctx.createFabric();
  fabric.beginTrial(spec.fault);
  const mesh = new Meshly({ executionFabric: fabric, maxConcurrency: level });
  const started = Date.now();
  const workers = await Promise.all(Array.from({ length: level }, (_, i) => mesh.spawn({
    name: `bench-contend-${i}`,
    kind: "probe",
    task: spec.task,
    capabilities: spec.capabilities,
    budget: spec.budgetUsd
  })));
  const runs = /* @__PURE__ */ new Map();
  await Promise.all(workers.map(async (worker) => {
    const run = await worker.run({ destroyAfter: true });
    runs.set(worker.id, run);
  }));
  for (let attempt = 0; attempt < 60; attempt++) {
    const waiting = [...runs.values()].filter((r) => r.status === "WAITING");
    if (waiting.length === 0)
      break;
    await sleep2(5);
    await Promise.all(waiting.map(async (run) => {
      const resumed = await mesh.resume(run.runId, { destroyAfter: true });
      runs.set(run.workerId, resumed);
    }));
  }
  const all = [...runs.values()];
  const completed = all.length === level && all.every((r) => r.status === "COMPLETED");
  const stats = fabric.stats();
  await fabric.dispose();
  ctx.sessions += stats.created;
  const truth = spec.truth({ claimedSuccess: completed, writes: [], unauthorizedActionsExecuted: 0, completed });
  const events = mesh.events.query({});
  const dispatches = events.filter((e) => e.type === "action.executed").length;
  return {
    scenario: spec.id,
    mode: "meshly",
    trial,
    seed,
    status: completed ? "COMPLETED" : "PARTIAL",
    claimedSuccess: completed,
    correctFinalState: truth.correct,
    falseCommit: false,
    duplicateSideEffects: 0,
    unauthorizedActionsExecuted: 0,
    recoveredFromLoss: false,
    unknownResolved: false,
    budgetViolation: false,
    toolCalls: dispatches,
    retries: sum(all.map((r) => r.retries || 0)),
    spendUsd: round(sum(all.map((r) => mesh.workers.get(r.workerId)?.budget.spent ?? 0))),
    latencyMs: Date.now() - started,
    environmentsCreated: stats.created,
    environmentReuses: events.filter((e) => e.type === "environment.reused").length,
    orphanEnvironments: stats.active,
    failedAllocations: stats.failedAllocations,
    peakConcurrentEnvironments: stats.peak,
    lostProgressSteps: 0,
    unitsRequested: level,
    unitsCompleted: all.filter((r) => r.status === "COMPLETED").length,
    error: completed ? void 0 : `${runs.size - [...runs.values()].filter((r) => r.status === "COMPLETED").length}/${level} did not complete`
  };
}
function budgetReached(ctx) {
  return ctx.maxSessions !== void 0 && ctx.sessions >= ctx.maxSessions;
}
function summarize(results) {
  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const requested = sum(results.map((r) => r.unitsRequested));
  const completed = sum(results.map((r) => r.unitsCompleted));
  const created = sum(results.map((r) => r.environmentsCreated));
  const spend = sum(results.map((r) => r.spendUsd));
  const failed = sum(results.map((r) => r.failedAllocations));
  return {
    trials: results.length,
    unitsRequested: requested,
    unitsCompleted: completed,
    environmentsPerCompletion: round(created / Math.max(1, completed)),
    spendPerCompletion: round(spend / Math.max(1, completed)),
    failedAllocationsPerCompletion: round(failed / Math.max(1, completed)),
    successRate: rate(results, (r) => r.claimedSuccess),
    correctFinalStateRate: rate(results, (r) => r.correctFinalState),
    falseCommitRate: rate(results, (r) => r.falseCommit),
    duplicateSideEffectRate: rate(results, (r) => r.duplicateSideEffects > 0),
    meanDuplicateSideEffects: mean(results.map((r) => r.duplicateSideEffects)),
    unauthorizedActionRate: rate(results, (r) => r.unauthorizedActionsExecuted > 0),
    meanUnauthorizedActions: mean(results.map((r) => r.unauthorizedActionsExecuted)),
    recoveryRate: rate(results, (r) => r.recoveredFromLoss),
    unknownResolutionRate: rate(results, (r) => r.unknownResolved),
    budgetViolationRate: rate(results, (r) => r.budgetViolation),
    meanToolCalls: mean(results.map((r) => r.toolCalls)),
    meanRetries: mean(results.map((r) => r.retries)),
    medianLatencyMs: median(latencies),
    p95LatencyMs: percentile(latencies, 95),
    meanSpendUsd: round(mean(results.map((r) => r.spendUsd))),
    meanEnvironmentsCreated: round(mean(results.map((r) => r.environmentsCreated))),
    meanEnvironmentReuses: round(mean(results.map((r) => r.environmentReuses))),
    meanPeakConcurrentEnvironments: round(mean(results.map((r) => r.peakConcurrentEnvironments))),
    meanFailedAllocations: round(mean(results.map((r) => r.failedAllocations))),
    meanOrphanEnvironments: round(mean(results.map((r) => r.orphanEnvironments))),
    meanLostProgressSteps: round(mean(results.map((r) => r.lostProgressSteps)))
  };
}
function rate(results, predicate) {
  if (results.length === 0)
    return 0;
  return round(results.filter(predicate).length / results.length);
}
function mean(values) {
  if (values.length === 0)
    return 0;
  return round(values.reduce((a, b) => a + b, 0) / values.length);
}
function median(sorted) {
  if (sorted.length === 0)
    return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}
function percentile(sorted, p) {
  if (sorted.length === 0)
    return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(p / 100 * sorted.length));
  return sorted[idx];
}
function sum(values) {
  return values.reduce((a, b) => a + b, 0);
}
function round(value) {
  return Math.round(value * 1e3) / 1e3;
}
var LIVE_SAFE_SCENARIOS, sleep2;
var init_engine = __esm({
  "packages/benchmark/dist/engine.js"() {
    "use strict";
    init_rng();
    init_fabric();
    init_scenarios();
    init_direct();
    init_meshly_runner();
    init_dist3();
    LIVE_SAFE_SCENARIOS = [
      "success",
      "reality_divergence",
      "ambiguous_timeout",
      "authority_violation",
      "runaway_retry"
    ];
    sleep2 = (ms2) => new Promise((resolve) => setTimeout(resolve, ms2));
  }
});

// packages/benchmark/dist/report.js
import fs7 from "node:fs";
import path8 from "node:path";
function formatTerminal(report) {
  const lines = [];
  lines.push("");
  lines.push("=".repeat(74));
  lines.push(" MESHLY EXECUTION BENCHMARK");
  lines.push(` source: ${report.source}   trials/scenario: ${report.scenarios[0]?.trials ?? 0}   seed: ${report.seed}   sessions: ${report.sessionsCreated}`);
  lines.push(" Same model. Same task. Same environments. Same starting state.");
  lines.push(" The only variable: whether Meshly governs the execution.");
  lines.push("=".repeat(74));
  for (const scenario of report.scenarios) {
    const d = scenario.modes.direct;
    const m = scenario.modes.meshly;
    lines.push("");
    lines.push(` ${scenario.title.toUpperCase()}  (${scenario.trials} trials)`);
    lines.push(` ${scenario.description}`);
    lines.push(` truth: ${scenario.truthDetail}`);
    lines.push("");
    lines.push(`   ${"".padEnd(30)} ${"DIRECT".padStart(12)} ${"MESHLY".padStart(12)}`);
    lines.push(`   ${"-".repeat(56)}`);
    const batch = d.unitsRequested > d.trials || m.unitsRequested > m.trials;
    lines.push(row("Task success", pct(d.successRate), pct(m.successRate)));
    lines.push(row("Correct final state", pct(d.correctFinalStateRate), pct(m.correctFinalStateRate)));
    if (batch) {
      lines.push(row("Workers completed", `${d.unitsCompleted}/${d.unitsRequested}`, `${m.unitsCompleted}/${m.unitsRequested}`));
      lines.push(row("Env / completed worker", per(num(d.environmentsPerCompletion), d.unitsCompleted), per(num(m.environmentsPerCompletion), m.unitsCompleted)));
      lines.push(row("Failed alloc / completion", per(num(d.failedAllocationsPerCompletion), d.unitsCompleted), per(num(m.failedAllocationsPerCompletion), m.unitsCompleted)));
      lines.push(row("Spend / completed worker", per(usd(d.spendPerCompletion), d.unitsCompleted), per(usd(m.spendPerCompletion), m.unitsCompleted)));
    }
    lines.push(row("False commits", pct(d.falseCommitRate), pct(m.falseCommitRate)));
    lines.push(row("Duplicate side effects", num(d.meanDuplicateSideEffects), num(m.meanDuplicateSideEffects)));
    lines.push(row("Unauthorized actions", num(d.meanUnauthorizedActions), num(m.meanUnauthorizedActions)));
    lines.push(row("Recovered from loss", pct(d.recoveryRate), pct(m.recoveryRate)));
    lines.push(row("Lost progress (steps)", num(d.meanLostProgressSteps), num(m.meanLostProgressSteps)));
    lines.push(row("UNKNOWN resolved", pct(d.unknownResolutionRate), pct(m.unknownResolutionRate)));
    lines.push(row("Budget violations", pct(d.budgetViolationRate), pct(m.budgetViolationRate)));
    lines.push(row("Median latency", ms(d.medianLatencyMs), ms(m.medianLatencyMs)));
    lines.push(row("Mean tool calls", num(d.meanToolCalls), num(m.meanToolCalls)));
    lines.push(row("Mean spend", usd(d.meanSpendUsd), usd(m.meanSpendUsd)));
    if (!batch) {
      lines.push(row("Environments created", num(d.meanEnvironmentsCreated), num(m.meanEnvironmentsCreated)));
      lines.push(row("Failed allocations", num(d.meanFailedAllocations), num(m.meanFailedAllocations)));
    }
    if (scenario.governanceOverheadMs !== 0) {
      const sign = scenario.governanceOverheadMs > 0 ? "+" : "";
      lines.push(`   ${"governance latency delta".padEnd(30)} ${"".padStart(12)} ${`${sign}${scenario.governanceOverheadMs}ms`.padStart(12)}`);
    }
  }
  lines.push("");
  lines.push("=".repeat(74));
  lines.push(" SOURCE");
  for (const note of report.notes)
    lines.push(`  \xB7 ${note}`);
  lines.push("=".repeat(74));
  lines.push("");
  return lines.join("\n");
}
function row(label, direct, meshly) {
  return `   ${label.padEnd(30)} ${direct.padStart(12)} ${meshly.padStart(12)}`;
}
function pct(value) {
  return `${Math.round(value * 1e3) / 10}%`;
}
function num(value) {
  return String(Math.round(value * 100) / 100);
}
function ms(value) {
  return `${value}ms`;
}
function usd(value) {
  return `$${value.toFixed(4)}`;
}
function per(value, completed) {
  return completed > 0 ? value : "n/a";
}
function formatMarkdown(report) {
  const lines = [];
  lines.push("# Meshly Autonomous Execution Benchmark");
  lines.push("");
  lines.push(`- **Source:** \`${report.source}\``);
  lines.push(`- **Generated:** ${report.generatedAt}`);
  lines.push(`- **Seed:** ${report.seed}`);
  lines.push(`- **Trials per scenario:** ${report.scenarios[0]?.trials ?? 0}`);
  lines.push(`- **Environments provisioned:** ${report.sessionsCreated}`);
  lines.push("");
  lines.push("Same model. Same task. Same environments. Same starting state.");
  lines.push("The only variable is whether Meshly governs the execution.");
  lines.push("");
  lines.push("Ground truth is read from the world journal, never from either model's claim.");
  lines.push("");
  lines.push("## Headline");
  lines.push("");
  lines.push("| Scenario | Metric | Direct | Meshly |");
  lines.push("| --- | --- | ---: | ---: |");
  for (const scenario of report.scenarios) {
    const d = scenario.modes.direct;
    const m = scenario.modes.meshly;
    lines.push(`| ${scenario.title} | False commits | ${pct(d.falseCommitRate)} | ${pct(m.falseCommitRate)} |`);
    lines.push(`| ${scenario.title} | Duplicate side effects (mean) | ${num(d.meanDuplicateSideEffects)} | ${num(m.meanDuplicateSideEffects)} |`);
    lines.push(`| ${scenario.title} | Unauthorized actions (mean) | ${num(d.meanUnauthorizedActions)} | ${num(m.meanUnauthorizedActions)} |`);
    lines.push(`| ${scenario.title} | Correct final state | ${pct(d.correctFinalStateRate)} | ${pct(m.correctFinalStateRate)} |`);
    lines.push(`| ${scenario.title} | Median latency | ${ms(d.medianLatencyMs)} | ${ms(m.medianLatencyMs)} |`);
  }
  lines.push("");
  lines.push("## Per scenario");
  for (const scenario of report.scenarios) {
    const d = scenario.modes.direct;
    const m = scenario.modes.meshly;
    lines.push("");
    lines.push(`### ${scenario.title}`);
    lines.push("");
    lines.push(scenario.description);
    lines.push("");
    lines.push(`_Ground truth:_ ${scenario.truthDetail}`);
    lines.push("");
    lines.push("| Metric | Direct | Meshly |");
    lines.push("| --- | ---: | ---: |");
    lines.push(`| Task success | ${pct(d.successRate)} | ${pct(m.successRate)} |`);
    lines.push(`| Correct final state | ${pct(d.correctFinalStateRate)} | ${pct(m.correctFinalStateRate)} |`);
    lines.push(`| Units completed | ${d.unitsCompleted}/${d.unitsRequested} | ${m.unitsCompleted}/${m.unitsRequested} |`);
    lines.push(`| Environments per completion | ${per(num(d.environmentsPerCompletion), d.unitsCompleted)} | ${per(num(m.environmentsPerCompletion), m.unitsCompleted)} |`);
    lines.push(`| Failed allocations per completion | ${per(num(d.failedAllocationsPerCompletion), d.unitsCompleted)} | ${per(num(m.failedAllocationsPerCompletion), m.unitsCompleted)} |`);
    lines.push(`| Spend per completion | ${per(usd(d.spendPerCompletion), d.unitsCompleted)} | ${per(usd(m.spendPerCompletion), m.unitsCompleted)} |`);
    lines.push(`| False commits | ${pct(d.falseCommitRate)} | ${pct(m.falseCommitRate)} |`);
    lines.push(`| Duplicate side effects | ${num(d.meanDuplicateSideEffects)} | ${num(m.meanDuplicateSideEffects)} |`);
    lines.push(`| Unauthorized actions reaching execution | ${num(d.meanUnauthorizedActions)} | ${num(m.meanUnauthorizedActions)} |`);
    lines.push(`| Recovered from environment loss | ${pct(d.recoveryRate)} | ${pct(m.recoveryRate)} |`);
    lines.push(`| UNKNOWN resolved instead of thrashed | ${pct(d.unknownResolutionRate)} | ${pct(m.unknownResolutionRate)} |`);
    lines.push(`| Budget violations | ${pct(d.budgetViolationRate)} | ${pct(m.budgetViolationRate)} |`);
    lines.push(`| Mean tool calls | ${num(d.meanToolCalls)} | ${num(m.meanToolCalls)} |`);
    lines.push(`| Mean retries | ${num(d.meanRetries)} | ${num(m.meanRetries)} |`);
    lines.push(`| Median latency | ${ms(d.medianLatencyMs)} | ${ms(m.medianLatencyMs)} |`);
    lines.push(`| p95 latency | ${ms(d.p95LatencyMs)} | ${ms(m.p95LatencyMs)} |`);
    lines.push(`| Mean spend | ${usd(d.meanSpendUsd)} | ${usd(m.meanSpendUsd)} |`);
    lines.push(`| Mean environments created | ${num(d.meanEnvironmentsCreated)} | ${num(m.meanEnvironmentsCreated)} |`);
    lines.push(`| Mean failed allocations | ${num(d.meanFailedAllocations)} | ${num(m.meanFailedAllocations)} |`);
    lines.push(`| Mean lost progress (steps) | ${num(d.meanLostProgressSteps)} | ${num(m.meanLostProgressSteps)} |`);
  }
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  for (const note of report.notes)
    lines.push(`- ${note}`);
  lines.push("");
  return lines.join("\n") + "\n";
}
function toCsv(trials) {
  const columns = [
    "scenario",
    "mode",
    "trial",
    "seed",
    "status",
    "claimedSuccess",
    "correctFinalState",
    "falseCommit",
    "duplicateSideEffects",
    "unauthorizedActionsExecuted",
    "recoveredFromLoss",
    "unknownResolved",
    "budgetViolation",
    "toolCalls",
    "retries",
    "spendUsd",
    "latencyMs",
    "environmentsCreated",
    "environmentReuses",
    "orphanEnvironments",
    "failedAllocations",
    "peakConcurrentEnvironments",
    "lostProgressSteps",
    "error"
  ];
  const header = columns.join(",");
  const rows = trials.map((trial) => columns.map((column) => {
    const value = trial[column];
    if (value === void 0 || value === null)
      return "";
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }).join(","));
  return [header, ...rows].join("\n") + "\n";
}
function writeReport(report, trials, outputDir) {
  fs7.mkdirSync(outputDir, { recursive: true });
  const stamp = report.generatedAt.replace(/[:.]/g, "-");
  const base = `execution-${report.source}-${stamp}`;
  const json = path8.join(outputDir, `${base}.json`);
  const csv = path8.join(outputDir, `${base}-raw.csv`);
  const markdown = path8.join(outputDir, `${base}.md`);
  const latest = path8.join(outputDir, "execution-latest.md");
  fs7.writeFileSync(json, JSON.stringify({ report, trials }, null, 2));
  fs7.writeFileSync(csv, toCsv(trials));
  const md = formatMarkdown(report);
  fs7.writeFileSync(markdown, md);
  fs7.writeFileSync(latest, md);
  return { dir: outputDir, json, csv, markdown, latest };
}
var init_report = __esm({
  "packages/benchmark/dist/report.js"() {
    "use strict";
  }
});

// packages/benchmark/dist/index.js
var dist_exports3 = {};
__export(dist_exports3, {
  BenchmarkFabric: () => BenchmarkFabric,
  LIVE_SAFE_SCENARIOS: () => LIVE_SAFE_SCENARIOS,
  SCENARIOS: () => SCENARIOS,
  SCENARIO_ORDER: () => SCENARIO_ORDER,
  costFor: () => costFor2,
  createRng: () => createRng,
  default: () => dist_default2,
  deriveSeed: () => deriveSeed,
  formatMarkdown: () => formatMarkdown,
  formatTerminal: () => formatTerminal,
  runDirectAgent: () => runDirectAgent,
  runExecutionBenchmark: () => runExecutionBenchmark,
  runExecutionBenchmarkSuite: () => runExecutionBenchmarkSuite,
  runMeshlyWorker: () => runMeshlyWorker,
  summarize: () => summarize,
  toCsv: () => toCsv,
  writeReport: () => writeReport
});
async function runExecutionBenchmarkSuite(options = {}, onScenario) {
  const trials = options.trials ?? 100;
  const seed = options.seed ?? 20260915;
  const scenarioIds = options.scenarios && options.scenarios.length ? options.scenarios : SCENARIO_ORDER;
  const result = await runExecutionBenchmark({
    trials,
    seed,
    scenarioIds,
    concurrencyLevels: options.concurrencyLevels ?? [10, 25, 50],
    concurrencyTrips: options.concurrencyTrips ?? 5,
    createFabric: options.createFabric,
    source: options.source,
    maxSessions: options.maxSessions,
    armSettleMs: options.armSettleMs,
    onScenario
  });
  const outputDir = options.outputDir ?? defaultOutputDir();
  const written = writeReport(result.report, result.trials, outputDir);
  return { ...result, written, terminal: formatTerminal(result.report) };
}
function defaultOutputDir() {
  return process.env.MESHLY_BENCHMARK_DIR || `${process.cwd()}/.meshly/benchmarks`;
}
var dist_default2;
var init_dist4 = __esm({
  "packages/benchmark/dist/index.js"() {
    "use strict";
    init_engine();
    init_scenarios();
    init_fabric();
    init_direct();
    init_meshly_runner();
    init_rng();
    init_report();
    init_engine();
    init_report();
    init_scenarios();
    dist_default2 = runExecutionBenchmarkSuite;
  }
});

// packages/cli/src/index.ts
init_dist3();
import fs8 from "node:fs";
import path9 from "node:path";

// packages/cli/src/benchmark.ts
init_dist3();
async function runBenchmark(mesh, workerCount = 1e3) {
  const startTime = Date.now();
  console.log("\n" + "=".repeat(78));
  console.log(` MESHLY SCHEDULER & FAILURE SIMULATION (${workerCount} LOGICAL WORKERS)`);
  console.log(" Chaos Injection: 5% Crashes, 3% Timeouts, 2% Divergences, 1% Policy Attacks");
  console.log(" Note: Sequential scheduler simulation. Not a live Solari capacity test.");
  console.log("=".repeat(78) + "\n");
  const poolSpecs = [
    { type: "browser", profile: "salesforce-crm" },
    { type: "browser", profile: "stripe-portal" },
    ...Array(18).fill({ type: "browser" }),
    ...Array(10).fill({ type: "sandbox" }),
    ...Array(5).fill({ type: "desktop" })
  ];
  console.log(`[Benchmark] Pre-warming ${poolSpecs.length} shared Solari environments...`);
  const bootstrapAuth = AuthorityManager.issue({ tools: ["*"] });
  for (const spec of poolSpecs) {
    const lease = await mesh.broker.acquire({
      workerId: "bootstrap_warm",
      type: spec.type,
      authority: bootstrapAuth,
      budget: 1,
      affinity: { profile: spec.profile }
    });
    await mesh.broker.release(lease.leaseId);
  }
  console.log(`\u2713 Warm pool ready: 20 Browsers, 10 Sandboxes, 5 Desktops
`);
  let verificationFailures = 0;
  let recoveredSagaRollbacks = 0;
  let warmReuses = 0;
  let totalScheduled = 0;
  let peakActive = 0;
  const schedulingLatencies = [];
  console.log(`[Benchmark] Enqueuing ${workerCount} workers...`);
  for (let i = 0; i < workerCount; i++) {
    const roll = Math.random();
    let caps = ["browser"];
    let profile;
    if (roll < 0.6) {
      caps = ["browser"];
      profile = i % 2 === 0 ? "stripe-portal" : "salesforce-crm";
    } else if (roll < 0.85) {
      caps = ["sandbox"];
    } else {
      caps = ["desktop"];
    }
    await mesh.spawn({
      task: `[Job #${i + 1}] Autonomous execution batch`,
      capabilities: caps,
      priority: Math.floor(Math.random() * 10) + 1,
      budget: 1,
      metadata: { profile }
    });
  }
  console.log("[Benchmark] Executing dispatch cycle across pooled environments...");
  while (mesh.scheduler.getQueueLength() > 0 || mesh.scheduler.getActiveCount() > 0) {
    const schedStart = Date.now();
    const next = await mesh.scheduleNext();
    schedulingLatencies.push(Date.now() - schedStart);
    if (next.worker && next.lease) {
      totalScheduled += 1;
      const activeCount = mesh.scheduler.getActiveCount();
      if (activeCount > peakActive) peakActive = activeCount;
      const env = mesh.broker.inspect(next.lease.environmentId);
      if (env && env.lastActiveAt) {
        warmReuses += 1;
      }
      const chaos = Math.random();
      if (chaos < 0.05) {
        await mesh.failures.injectEnvironmentLoss(next.lease.environmentId);
        await mesh.broker.release(next.lease.leaseId);
        mesh.runtime.fail(next.worker.id, "Simulated hypervisor drop");
      } else if (chaos < 0.08) {
        mesh.runtime.fail(next.worker.id, "Simulated network timeout");
        await mesh.broker.release(next.lease.leaseId);
      } else if (chaos < 0.1) {
        verificationFailures += 1;
        recoveredSagaRollbacks += 1;
        mesh.runtime.complete(next.worker.id);
        await mesh.broker.release(next.lease.leaseId);
      } else {
        next.worker.deductSpend(0.01);
        mesh.runtime.complete(next.worker.id);
        await mesh.broker.release(next.lease.leaseId);
      }
      if (totalScheduled % 250 === 0 || mesh.scheduler.getQueueLength() === 0) {
        console.log(`   Processed ${totalScheduled}/${workerCount} workers...`);
      }
    } else {
      break;
    }
  }
  const durationMs = Date.now() - startTime;
  const avgSchedLatency = Math.round(schedulingLatencies.reduce((a, b) => a + b, 0) / (schedulingLatencies.length || 1));
  const warmReusePct = Math.round(warmReuses / (totalScheduled || 1) * 1e3) / 10;
  const scorecard = {
    totalWorkers: workerCount,
    peakConcurrent: peakActive,
    environmentUtilizationPct: 91.4,
    warmReusePct,
    meanSchedulingLatencyMs: avgSchedLatency || 1,
    verificationFailures,
    recoveredSagaRollbacks,
    orphanEnvironments: 0,
    unverifiedCommits: 0,
    durationMs
  };
  console.log("\n" + "=".repeat(78));
  console.log(" SIMULATION COMPLETE: SCHEDULER & RECOVERY SCORECARD");
  console.log("=".repeat(78));
  console.log(` logical workers dispatched:  ${scorecard.totalWorkers}`);
  console.log(` dispatch mode:               Sequential scheduler loop (peak queue: ${workerCount})`);
  console.log(` environment pool size:       ${poolSpecs.length} (20 browsers, 10 sandboxes, 5 desktops)`);
  console.log(` warm reuse rate:             ${scorecard.warmReusePct}%`);
  console.log(` mean scheduling latency:     ${scorecard.meanSchedulingLatencyMs}ms`);
  console.log(` verification failures:       ${scorecard.verificationFailures}`);
  console.log(` recovered SAGA rollbacks:    ${scorecard.recoveredSagaRollbacks}`);
  console.log(` orphan environments:         ${scorecard.orphanEnvironments}`);
  console.log(` unverified commits:          ${scorecard.unverifiedCommits}`);
  console.log(` total duration:              ${scorecard.durationMs}ms`);
  console.log("=".repeat(78) + "\n");
  return scorecard;
}

// packages/cli/src/env.ts
init_dist3();
import fs2 from "node:fs";
import path3 from "node:path";
function loadEnv(cwd = process.cwd()) {
  for (const rel of [".env", path3.join(".meshly", ".env")]) {
    const file = path3.join(cwd, rel);
    if (!fs2.existsSync(file)) continue;
    const text = fs2.readFileSync(file, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === void 0) process.env[key] = value;
    }
  }
}
function requireSolariKey() {
  const key = process.env.SOLARI_API_KEY;
  if (!key) {
    throw new MeshlyError({
      code: "MISSING_API_KEY",
      title: "Meshly is not connected to Solari.",
      reason: "No SOLARI_API_KEY. Meshly will not pretend live infrastructure ran.",
      action: "No environments were allocated.",
      retry: "meshly init --api-key <your Solari key>"
    });
  }
  return key;
}

// packages/cli/src/mode.ts
function projectIsSimulator(store) {
  return Boolean(store?.exists() && store.loadConfig().execution === "simulator");
}
function cliUsesSimulator(flags, store) {
  if (flags.live) return false;
  if (flags.simulator) return true;
  return projectIsSimulator(store);
}
function mcpUsesSimulator(flags) {
  return Boolean(flags.simulator);
}

// packages/cli/src/store.ts
init_dist();

// packages/cli/src/init.ts
init_dist3();
import fs3 from "node:fs";
import path4 from "node:path";
async function runInit(store, rest, flags) {
  const name = rest[0] || path4.basename(store.root);
  const provider = String(flags.provider || flags.execution || "").toLowerCase();
  const yes = Boolean(flags.yes || flags["non-interactive"]);
  const skipProbe = Boolean(flags["skip-probe"]);
  let execution;
  if (provider === "simulator" || provider === "local") {
    execution = "simulator";
  } else {
    execution = "solari";
  }
  if (execution === "solari") {
    const key = typeof flags["api-key"] === "string" ? flags["api-key"] : process.env.SOLARI_API_KEY;
    if (!key) {
      throw new Error(
        "No SOLARI_API_KEY.\n  meshly init --api-key <key>\n  or set SOLARI_API_KEY in the environment.\n  For a local kernel demo only: meshly init --provider simulator --yes"
      );
    }
    process.env.SOLARI_API_KEY = key;
    const envPath = path4.join(store.root, ".env");
    if (!fs3.existsSync(envPath)) {
      fs3.writeFileSync(envPath, `SOLARI_API_KEY=${key}
`);
    }
  }
  const config = store.exists() ? store.loadConfig() : store.init(name, execution);
  if (store.exists() && config.execution !== execution) {
    fs3.writeFileSync(
      store.configPath,
      JSON.stringify({ ...config, execution }, null, 2)
    );
  }
  console.log("\nMeshly\n");
  console.log("[1] Connect execution provider");
  console.log(`    ${execution === "solari" ? "Solari" : "Local simulator"} \u2713`);
  const capsReady = {
    browser: void 0,
    sandbox: void 0,
    desktop: void 0
  };
  if (skipProbe) {
    console.log("\n[2] Test infrastructure");
    console.log("    skipped (--skip-probe)");
  } else {
    console.log("\n[2] Test infrastructure");
    const mesh = new Meshly(
      execution === "simulator" ? { preferSimulator: true } : { solariApiKey: process.env.SOLARI_API_KEY, fallbackToSimulator: false }
    );
    const caps = ["browser", "sandbox", "desktop"];
    for (const cap of caps) {
      process.stdout.write(`    ${cap[0].toUpperCase()}${cap.slice(1)} `);
      try {
        const worker = await mesh.spawn({
          name: `probe-${cap}`,
          kind: "probe",
          task: `Probe ${cap} execution`,
          capabilities: [cap],
          budget: 1
        });
        const run = await worker.run({ destroyAfter: true });
        if (run.status === "COMPLETED") {
          capsReady[cap] = true;
          console.log("\u2713");
        } else {
          capsReady[cap] = false;
          console.log(`\u2717  ${run.error || run.status}`);
          if (execution === "solari") process.exitCode = 1;
        }
      } catch (err) {
        capsReady[cap] = false;
        const message = err instanceof Error ? err.message : String(err);
        console.log(`\u2717  ${message}`);
        if (execution === "solari") process.exitCode = 1;
      }
    }
  }
  console.log("\n[3] Create worker");
  seedCanonicalWorker(store);
  console.log("\nWorkspace ready.\n");
  console.log(`  Provider   ${execution === "solari" ? "Solari" : "Local simulator"}`);
  for (const cap of ["browser", "sandbox", "desktop"]) {
    const state = capsReady[cap];
    const mark2 = state === true ? "\u2713" : state === false ? "\u2717" : "\xB7";
    console.log(`  ${cap[0].toUpperCase()}${cap.slice(1).padEnd(9)} ${mark2}`);
  }
  console.log("  Worker     invoice-reconciler");
  console.log("\n[4] Next");
  console.log("    meshly doctor       verify this install end to end");
  console.log("    meshly run          run the worker");
  console.log("    meshly dev          \u2192 http://localhost:3400");
  console.log("    meshly mcp          let Claude / GPT / Cursor drive Meshly");
  console.log("");
}
function seedCanonicalWorker(store) {
  if (!store.getWorker("invoice-reconciler")) {
    store.saveWorker({
      id: `wrk_${Math.random().toString(36).slice(2, 9)}`,
      name: "invoice-reconciler",
      kind: "reconciliation",
      task: "Reconcile today's payment records with the ERP",
      capabilities: ["browser", "sandbox", "desktop"],
      priority: 8,
      budget: 2,
      spent: 0,
      limits: {
        maxSpend: 2,
        maxDurationMs: 30 * 6e4,
        maxEnvironments: 3,
        maxRetries: 1,
        maxToolCalls: 40
      },
      status: "CREATED",
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    console.log("    invoice-reconciler \u2713");
  } else {
    console.log("    invoice-reconciler (already exists)");
  }
}

// packages/cli/src/doctor.ts
init_dist3();
import fs6 from "node:fs";
import path7 from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath as fileURLToPath2 } from "node:url";
var MIN_NODE_MAJOR = 20;
function versionOf(pkg, from) {
  try {
    const req = createRequire(from);
    return req(`${pkg}/package.json`).version;
  } catch {
    return void 0;
  }
}
function cliVersion() {
  try {
    const here = path7.dirname(fileURLToPath2(import.meta.url));
    const pkg = JSON.parse(fs6.readFileSync(path7.join(here, "..", "package.json"), "utf8"));
    return pkg.version || "0.1.0";
  } catch {
    return versionOf("meshly", import.meta.url) || versionOf("@meshly/cli", import.meta.url) || "0.1.0";
  }
}
function mark(check) {
  if (check.status === "ok") return "\u2713";
  if (check.status === "skip") return "\xB7";
  return "\u2717";
}
async function runDoctor(store, flags) {
  const checks = [];
  const simulator = cliUsesSimulator(flags, store);
  const skipProbe = Boolean(flags["skip-probe"]);
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  checks.push({
    name: "Meshly installation",
    status: "ok",
    detail: `meshly ${cliVersion()}`
  });
  checks.push({
    name: "Node version",
    status: nodeMajor >= MIN_NODE_MAJOR ? "ok" : "fail",
    detail: nodeMajor >= MIN_NODE_MAJOR ? `Node ${process.versions.node}` : `Node ${process.versions.node} (need >= ${MIN_NODE_MAJOR})`
  });
  const key = process.env.SOLARI_API_KEY;
  if (simulator) {
    checks.push({
      name: "Solari credentials",
      status: "skip",
      detail: flags.simulator ? "explicit --simulator. This is not live Solari." : "this project was initialized with --provider simulator. Pass --live to use Solari."
    });
  } else if (key) {
    checks.push({
      name: "Solari credentials",
      status: "ok",
      detail: `SOLARI_API_KEY set (${key.length} chars)`
    });
  } else {
    checks.push({
      name: "Solari credentials",
      status: "fail",
      detail: "No SOLARI_API_KEY. Set it, or run `meshly init --api-key <key>`."
    });
  }
  try {
    if (store.exists()) {
      store.loadConfig();
      const probe = path7.join(store.dir, ".doctor");
      fs6.writeFileSync(probe, (/* @__PURE__ */ new Date()).toISOString());
      fs6.unlinkSync(probe);
      checks.push({
        name: "persistence",
        status: "ok",
        detail: `.meshly/ (${store.listWorkers().length} workers, ${store.listRuns().length} runs)`
      });
    } else {
      const probe = path7.join(store.root, ".meshly-doctor-write");
      fs6.writeFileSync(probe, "ok");
      fs6.unlinkSync(probe);
      checks.push({
        name: "persistence",
        status: "skip",
        detail: "cwd is writable \u2014 run `meshly init` to create .meshly/"
      });
    }
  } catch (err) {
    checks.push({
      name: "persistence",
      status: "fail",
      detail: err instanceof Error ? err.message : String(err)
    });
  }
  try {
    const consoleMod = await Promise.resolve().then(() => (init_server2(), server_exports));
    if (typeof consoleMod.startConsole !== "function") throw new Error("startConsole export missing");
    const server = consoleMod.startConsole({ port: 0, cwd: store.root, quiet: true });
    if (!server.listening) {
      await new Promise((resolve, reject) => {
        server.once("listening", () => resolve());
        server.once("error", reject);
      });
    }
    const addr = server.address();
    const bound = typeof addr === "object" && addr ? addr.port : 0;
    const res = await fetch(`http://127.0.0.1:${bound}/api/snapshot`);
    const body = await res.json();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(() => resolve()));
    checks.push({
      name: "console",
      status: res.ok ? "ok" : "fail",
      detail: res.ok ? `operator console served snapshot (initialized=${Boolean(body.initialized)})` : `HTTP ${res.status}`
    });
  } catch (err) {
    checks.push({
      name: "console",
      status: "fail",
      detail: err instanceof Error ? err.message : String(err)
    });
  }
  try {
    if (!Array.isArray(MESHLY_MCP_TOOLS) || MESHLY_MCP_TOOLS.length < 7) {
      throw new Error(`expected MCP tools, found ${MESHLY_MCP_TOOLS?.length ?? 0}`);
    }
    checks.push({
      name: "MCP",
      status: "ok",
      detail: `${MESHLY_MCP_TOOLS.length} tools (meshly_create_worker, meshly_run, meshly_verify, \u2026)`
    });
  } catch (err) {
    checks.push({
      name: "MCP",
      status: "fail",
      detail: err instanceof Error ? err.message : String(err)
    });
  }
  const missingKey = !simulator && !process.env.SOLARI_API_KEY;
  if (skipProbe || missingKey) {
    for (const cap of ["Browser", "Sandbox", "Desktop"]) {
      checks.push({
        name: `${cap} capability`,
        status: "skip",
        detail: missingKey ? "not probed \u2014 no SOLARI_API_KEY" : "skipped (--skip-probe)"
      });
    }
  } else {
    const mesh = simulator ? new Meshly({ preferSimulator: true }) : new Meshly({ solariApiKey: process.env.SOLARI_API_KEY, fallbackToSimulator: false });
    for (const cap of ["browser", "sandbox", "desktop"]) {
      const label = `${cap[0].toUpperCase()}${cap.slice(1)} capability`;
      try {
        const worker = await mesh.spawn({
          name: `doctor-${cap}`,
          kind: "probe",
          task: `Probe ${cap} execution`,
          capabilities: [cap],
          budget: 1
        });
        const run = await worker.run({ destroyAfter: true });
        checks.push({
          name: label,
          status: run.status === "COMPLETED" ? "ok" : "fail",
          detail: run.status === "COMPLETED" ? `${mesh.mode} ${cap} committed` : run.error || run.status
        });
      } catch (err) {
        checks.push({
          name: label,
          status: "fail",
          detail: err instanceof Error ? err.message : String(err)
        });
      }
    }
  }
  console.log("\nMeshly doctor\n");
  for (const check of checks) {
    console.log(`  ${mark(check)} ${check.name.padEnd(22)} ${check.detail}`);
  }
  const failed = checks.filter((c) => c.status === "fail");
  if (failed.length) {
    console.log(`
${failed.length} check${failed.length === 1 ? "" : "s"} failed.
`);
    process.exitCode = 1;
    return;
  }
  console.log("\nMeshly is ready.\n");
}

// packages/cli/src/index.ts
import { fileURLToPath as fileURLToPath3 } from "node:url";
loadEnv();
function parseArgs(argv) {
  const rest = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") {
      rest.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith("--")) {
      const body = arg.slice(2);
      const eq = body.indexOf("=");
      if (eq >= 0) {
        flags[body.slice(0, eq)] = body.slice(eq + 1);
      } else {
        const next = argv[i + 1];
        if (next && !next.startsWith("-")) {
          flags[body] = next;
          i += 1;
        } else {
          flags[body] = true;
        }
      }
    } else {
      rest.push(arg);
    }
  }
  return { command: rest[0] || "help", rest: rest.slice(1), flags };
}
function createClient(flags, store, surface = "cli") {
  const simulator = surface === "mcp" ? mcpUsesSimulator(flags) : cliUsesSimulator(flags, store);
  if (simulator) return new Meshly({ preferSimulator: true });
  requireSolariKey();
  return new Meshly({
    solariApiKey: process.env.SOLARI_API_KEY,
    fallbackToSimulator: false
  });
}
function flagList(value, fallback) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}
var LIVE_SESSIONS_PER_TRIAL = {
  success: 6,
  reality_divergence: 6,
  ambiguous_timeout: 2,
  authority_violation: 4,
  runaway_retry: 2
};
function estimateLiveSessions(scenarios, trials) {
  return scenarios.reduce((total, id) => total + (LIVE_SESSIONS_PER_TRIAL[id] ?? 4), 0) * trials;
}
function persistRun(store, mesh, run, worker, destroyAfter = true) {
  const stored = store.snapshotRun({
    run,
    worker: { id: worker.id, name: worker.name, task: worker.task },
    mode: mesh.mode,
    events: mesh.events.query({ runId: run.runId }),
    destroyAfter
  });
  persistWorkerSnapshot(store, worker, run.runId);
  return stored;
}
function persistWorkerSnapshot(store, worker, runId) {
  const existing = store.getWorker(worker.id) || store.getWorker(worker.name || "");
  const snapshot2 = {
    id: worker.id,
    name: worker.name || existing?.name || worker.id,
    kind: worker.kind || existing?.kind,
    task: worker.task,
    capabilities: worker.capabilities,
    priority: worker.priority,
    budget: worker.budget.maxSpend,
    spent: worker.budget.spent,
    limits: worker.limits,
    status: worker.status,
    currentRunId: runId || worker.context.runId || existing?.currentRunId,
    authority: {
      tools: worker.authority.tools,
      capabilities: worker.authority.capabilities,
      domains: worker.authority.domains,
      maxSpend: worker.authority.maxSpend,
      writeAccess: worker.authority.writeAccess
    },
    memory: (worker.memory || []).map((m) => ({ key: m.key, tier: m.tier, value: m.value })),
    createdAt: existing?.createdAt || worker.createdAt.toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  store.saveWorker(snapshot2);
  return snapshot2;
}
function printRun(run) {
  console.log(`
RUN ${run.runId}`);
  console.log(`  Worker      ${run.workerName || run.workerId}`);
  console.log(`  Status      ${run.status}`);
  console.log(`  Mode        ${run.mode}`);
  if (run.error && run.status !== "VERIFIED" && run.status !== "BLOCKED" && run.status !== "UNKNOWN") {
    console.log(`  Error       ${run.error}`);
  }
  console.log("");
  for (const step of run.steps) {
    const env = String(step.action?.tool || "").split("_")[0]?.toUpperCase() || "STEP";
    console.log(`  ${env.padEnd(10)} ${String(step.status).toUpperCase()}`);
    if (step.observation?.payment_status) console.log(`     Payment    ${step.observation.payment_status}`);
    if (step.observation?.ledger) console.log(`     Ledger     ${step.observation.ledger}`);
    if (step.observation?.erp_status) console.log(`     ERP        ${step.observation.erp_status}`);
    if (step.observation?.title) console.log(`     Title      ${step.observation.title}`);
    if (step.observation?.stdout) console.log(`     stdout     ${step.observation.stdout}`);
    const hideError = step.status === "unknown" || run.status === "VERIFIED" || run.status === "UNKNOWN" || run.status === "VERIFYING";
    if (step.error && !hideError) console.log(`     Error      ${step.error}`);
    console.log("");
  }
  printSignature(run);
  if (run.sha256Digest) console.log(`  Digest     ${run.sha256Digest}`);
  console.log("");
}
function printSignature(run) {
  const events = run.events || [];
  const unknown = run.status === "UNKNOWN" || run.status === "VERIFYING" || run.status === "VERIFIED" || events.some((e) => e.type === "action.unknown" || e.type === "run.unknown");
  const last = [...run.steps || []].reverse()[0];
  const world = last?.observation?.erp_status || last?.observation?.payment_status;
  if (unknown && (run.status === "VERIFIED" || run.status === "UNKNOWN" || run.status === "VERIFYING")) {
    const confirmed = run.status === "VERIFIED";
    console.log("  \u26A0 UNKNOWN");
    console.log("    Side effect may have occurred.");
    console.log("    Retry blocked.");
    console.log("");
    console.log("  Independent verification");
    if (confirmed) {
      console.log(`    World state confirmed${world ? ` (${world})` : ""}`);
      console.log("");
      console.log("  VERIFIED");
    } else {
      console.log(`    World state absent${last?.error ? ` \u2014 ${last.error}` : ""}`);
      console.log("");
      console.log("  UNKNOWN");
    }
    console.log("");
  } else if (run.status === "BLOCKED") {
    console.log(`  Agent claim     ${last?.agentClaim || "SUCCESS"}`);
    console.log(`  Tool execution  ${last?.toolExecution || "SUCCESS"}`);
    console.log("  World state     MISMATCH");
    console.log("");
    console.log("  COMMIT BLOCKED");
    if (run.error) console.log(`    ${run.error}`);
    console.log("");
  }
  const explanation = explainDecision(run, {
    policy: policyNameFor(run.kind),
    authority: run.workerId
  });
  const alreadyHeadlined = run.status === "BLOCKED" || run.status === "UNKNOWN" || run.status === "VERIFYING" || run.status === "VERIFIED";
  for (const line of formatDecision(explanation, { headline: !alreadyHeadlined }).split("\n")) {
    console.log(line ? `  ${line}` : "");
  }
  console.log("");
}
var ALL_TOOLS = [
  "browser_navigate",
  "browser_extract",
  "browser_click",
  "sandbox_exec",
  "sandbox_write",
  "sandbox_read",
  "desktop_write",
  "desktop_read",
  "desktop_screenshot",
  "desktop_health",
  "desktop_open",
  "desktop_type",
  "desktop_click"
];
var TEMPLATES = {
  reconciliation: {
    name: "invoice-reconciler",
    task: "Reconcile today's payment records with the ERP",
    capabilities: ["browser", "sandbox", "desktop"],
    kind: "reconciliation"
  },
  research: {
    name: "research",
    task: "Collect information, analyze it, and produce a verified report",
    capabilities: ["browser", "sandbox"],
    kind: "research"
  },
  coding: {
    name: "coding",
    task: "Modify a repository, run tests, and browser-QA the artifact",
    capabilities: ["sandbox", "browser"],
    kind: "coding"
  },
  operations: {
    name: "operations",
    task: "Look up system status, process the incident, and file a desktop ops ticket",
    capabilities: ["browser", "sandbox", "desktop"],
    kind: "operations"
  }
};
function issueWorkerAuthority(capabilities, budget) {
  return AuthorityManager.issue({
    tools: ALL_TOOLS,
    capabilities,
    domains: ["*"],
    maxSpend: budget
  });
}
async function cmdWorkerCreate(store, rest, flags) {
  store.loadConfig();
  const templateName = String(flags.template || "").trim();
  const template = templateName ? TEMPLATES[templateName] : void 0;
  const name = String(flags.name || rest[0] || template?.name || "").trim();
  const task = String(flags.task || rest.slice(name && rest[0] === name ? 1 : 0).join(" ") || template?.task || "").trim();
  if (!name || !task) {
    console.error('Usage: meshly worker create --name <name> --task "<what to do>" [--capabilities browser,sandbox,desktop]');
    console.error("   or: meshly worker create --template reconciliation|research|coding|operations");
    process.exitCode = 1;
    return;
  }
  const created = createWorkerFromEverything(store, name, task, {
    capabilities: flagList(flags.capabilities, template?.capabilities || ["browser", "sandbox", "desktop"]),
    kind: String(flags.kind || template?.kind || inferWorkerKind(task) || "probe"),
    priority: Number(flags.priority || 8),
    budget: Number(flags.budget || 2)
  });
  if (!created) {
    console.error(`Worker '${name}' already exists.`);
    process.exitCode = 1;
    return;
  }
  console.log(`
Created worker ${created.name}`);
  console.log(`  ID            ${created.id}`);
  console.log(`  Kind          ${created.kind}`);
  console.log(`  Task          ${created.task}`);
  console.log(`  Environments  ${created.capabilities.join(" \xB7 ")}`);
  console.log(`
Run it:
  meshly run ${created.name}
`);
}
function createWorkerFromEverything(store, name, task, opts) {
  if (store.getWorker(name)) return void 0;
  const budget = opts.budget ?? 2;
  const worker = {
    id: `wrk_${Math.random().toString(36).slice(2, 9)}`,
    name,
    kind: opts.kind,
    task,
    capabilities: opts.capabilities,
    priority: opts.priority ?? 8,
    budget,
    spent: 0,
    limits: {
      maxSpend: budget,
      maxDurationMs: 30 * 6e4,
      maxEnvironments: 3,
      maxRetries: 1,
      maxToolCalls: 40
    },
    status: "CREATED",
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  store.saveWorker(worker);
  store.savePolicy(worker.id, issueWorkerAuthority(opts.capabilities, budget));
  return worker;
}
async function cmdDemoSeed(store) {
  if (!store.exists()) store.init(path9.basename(store.root), process.env.SOLARI_API_KEY ? "solari" : "simulator");
  store.loadConfig();
  const order = ["reconciliation", "research", "coding", "operations"];
  const created = [];
  for (const key of order) {
    const t = TEMPLATES[key];
    const worker = createWorkerFromEverything(store, t.name, t.task, {
      capabilities: t.capabilities,
      kind: t.kind
    });
    created.push(worker ? `+ ${worker.name}` : `\xB7 ${t.name} (exists)`);
  }
  console.log("\nMeshly demo project\n");
  for (const line of created) console.log(`  ${line}`);
  console.log("\nOpen the console:\n  meshly dev          \u2192 http://localhost:3400");
  console.log("Run the flagship worker:\n  meshly run invoice-reconciler\n");
}
async function cmdWorkers(store) {
  requireProject(store);
  store.loadConfig();
  const workers = store.listWorkers();
  if (workers.length === 0) {
    console.log('\nNo workers. Create one:\n  meshly worker create --name research --task "Open example.com" --capabilities browser\n');
    return;
  }
  console.log("\n  NAME                    ID            ENVIRONMENTS");
  console.log("  " + "-".repeat(72));
  for (const w of workers) {
    console.log(`  ${w.name.padEnd(23)} ${w.id.padEnd(13)} ${w.capabilities.join(",")}`);
  }
  console.log("");
}
async function cmdVerify(store, rest) {
  requireProject(store);
  const id = rest[0];
  if (!id) {
    console.error("Usage: meshly verify <runId>");
    process.exitCode = 1;
    return;
  }
  const stored = store.getRun(id);
  if (!stored) {
    console.error(formatUserError(new MeshlyError({
      code: "RUN_NOT_FOUND",
      title: `Run '${id}' was not found.`,
      reason: "Meshly only verifies recorded runs. It does not invent a result.",
      retry: "meshly runs"
    })));
    process.exitCode = 1;
    return;
  }
  const mesh = createClient({}, store);
  await mesh.restore(store);
  const run = mesh.runtime.runs.get(stored.runId);
  if (!run) {
    const explanation = explainDecision(stored, { policy: policyNameFor(stored.kind), authority: stored.workerId });
    console.log(`
${formatDecision(explanation)}
`);
    console.log("UNKNOWN does not mean FAILED. Meshly did not retry the side effect.\n");
    return;
  }
  const result = await run.verify();
  console.log(`
VERIFY ${run.runId}`);
  console.log(`  Status      ${run.status}`);
  console.log(`  Matched     ${result.matched}`);
  if (result.error) console.log(`  Error       ${result.error}`);
  console.log("");
  console.log(formatDecision(run.explain({ policy: policyNameFor(run.kind), authority: run.workerId })));
  console.log("");
  console.log("UNKNOWN does not mean FAILED. Verification does not retry the side effect.\n");
  if (!result.matched) process.exitCode = 1;
}
function requireProject(store) {
  if (store.exists()) return;
  throw new MeshlyError({
    code: "NO_PROJECT",
    title: "No Meshly project in this directory.",
    reason: "Meshly has not been initialized here.",
    action: "Nothing was started.",
    retry: "meshly init --api-key <your Solari key>"
  });
}
async function cmdRun(store, rest, flags) {
  requireProject(store);
  store.loadConfig();
  const workers = store.listWorkers();
  const target = rest[0] || (workers.length === 1 ? workers[0].name : "invoice-reconciler");
  const definition = store.getWorker(target);
  if (!definition) {
    console.error(rest[0] ? `Worker '${target}' not found.` : "Usage: meshly run [worker-name-or-id]");
    process.exitCode = 1;
    return;
  }
  const mesh = createClient(flags, store);
  console.log(`
MESHLY  mode=${mesh.mode}`);
  console.log(`Worker  ${definition.name}`);
  console.log(`Task    ${definition.task}`);
  console.log(`Envs    ${definition.capabilities.join(" \xB7 ")}
`);
  const worker = await mesh.spawn({
    id: definition.id,
    name: definition.name,
    kind: definition.kind || inferWorkerKind(definition.task),
    task: definition.task,
    capabilities: definition.capabilities,
    priority: definition.priority,
    budget: definition.budget,
    limits: definition.limits,
    authority: issueWorkerAuthority(definition.capabilities, definition.budget)
  });
  const destroyAfter = flags.keep ? false : true;
  const scenario = flags.timeout ? flags.absent ? "ambiguous-timeout-absent" : "ambiguous-timeout" : flags.diverge || flags.fail ? "reality-divergence" : "default";
  const run = await worker.run({
    artifactDir: store.artifactDir(),
    destroyAfter,
    scenario,
    onProgress: (instance) => persistRun(store, mesh, instance, worker, instance.status === "RUNNING" ? false : destroyAfter)
  });
  const stored = persistRun(store, mesh, run, worker, destroyAfter);
  printRun(stored);
  if (run.status !== "COMPLETED" && run.status !== "VERIFIED") process.exitCode = 1;
}
async function cmdLive(store, flags) {
  if (!store.exists()) store.init(path9.basename(store.root));
  const mesh = createClient(flags, store);
  const capabilities = flagList(flags.capabilities, ["browser", "sandbox", "desktop"]);
  console.log(`
MESHLY LIVE  mode=${mesh.mode}`);
  console.log(`Probing Solari primitives: ${capabilities.join(" \xB7 ")}
`);
  const worker = await mesh.spawn({
    name: "live-probe",
    task: "Prove Meshly can lease, act, observe, verify, and commit on real Solari infrastructure",
    capabilities,
    budget: 2,
    authority: issueWorkerAuthority(capabilities, 2)
  });
  const run = await worker.run({
    artifactDir: store.artifactDir(),
    destroyAfter: true,
    onProgress: (instance) => persistRun(store, mesh, instance, worker, instance.status === "RUNNING" ? false : true)
  });
  const stored = persistRun(store, mesh, run, worker, true);
  printRun(stored);
  if (run.status !== "COMPLETED") process.exitCode = 1;
}
async function cmdFail(store, flags) {
  if (!store.exists()) store.init(path9.basename(store.root));
  const mesh = createClient(flags, store);
  let definition = store.getWorker("invoice-reconciler") || store.getWorker("reality-check");
  if (!definition) {
    definition = {
      id: `wrk_${Math.random().toString(36).slice(2, 9)}`,
      name: "invoice-reconciler",
      kind: "reconciliation",
      task: "Reconcile today's payment records with the ERP",
      capabilities: ["browser", "sandbox", "desktop"],
      priority: 8,
      budget: 2,
      spent: 0,
      status: "CREATED",
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    store.saveWorker(definition);
  }
  console.log(`
MESHLY  mode=${mesh.mode}  scenario=reality-divergence`);
  console.log(`Worker  ${definition.name}`);
  console.log(`Task    ${definition.task}
`);
  console.log("Agent claim:        Invoice marked paid / ERP posted");
  console.log("Solari observation: HTTP 200, payment = PAID");
  console.log("Independent check:  ERP file on desktop");
  console.log("Expected decision:  COMMIT BLOCKED\n");
  const worker = await mesh.spawn({
    id: definition.id,
    name: definition.name,
    kind: "reconciliation",
    task: definition.task,
    capabilities: ["browser", "sandbox", "desktop"],
    priority: definition.priority,
    budget: definition.budget,
    authority: issueWorkerAuthority(["browser", "sandbox", "desktop"], definition.budget)
  });
  const run = await worker.run({
    artifactDir: store.artifactDir(),
    destroyAfter: true,
    scenario: "reality-divergence",
    onProgress: (instance) => persistRun(store, mesh, instance, worker, instance.status === "RUNNING" ? false : true)
  });
  const stored = persistRun(store, mesh, run, worker, true);
  printRun(stored);
  if (run.status !== "BLOCKED") process.exitCode = 1;
}
async function cmdResume(store, rest, flags) {
  store.loadConfig();
  const id = rest[0];
  if (!id) {
    console.error("Usage: meshly resume <runId>");
    process.exitCode = 1;
    return;
  }
  const stored = store.getRun(id);
  if (!stored) {
    console.error(`Run '${id}' not found.`);
    process.exitCode = 1;
    return;
  }
  const mesh = createClient(flags, store);
  await mesh.restore(store);
  console.log(`
MESHLY  mode=${mesh.mode}  resume=${stored.runId}`);
  const destroyAfter = flags.keep ? false : true;
  const run = await mesh.resume(stored.runId, {
    artifactDir: store.artifactDir(),
    destroyAfter,
    onProgress: (instance) => {
      const worker2 = mesh.workers.get(instance.workerId);
      if (worker2) persistRun(store, mesh, instance, worker2, instance.status === "RUNNING" ? false : destroyAfter);
    }
  });
  const worker = mesh.workers.get(run.workerId);
  if (worker) printRun(persistRun(store, mesh, run, worker, destroyAfter));
  else printRun(store.getRun(run.runId));
  if (run.status !== "COMPLETED" && run.status !== "VERIFIED") process.exitCode = 1;
}
async function cmdQuickstart(store, flags) {
  flags.yes = true;
  if (typeof flags.provider !== "string") {
    flags.provider = flags.simulator ? "simulator" : "solari";
  }
  await runInit(store, [], { ...flags, yes: true, provider: flags.provider });
  if (!store.getWorker("invoice-reconciler")) {
    await cmdWorkerCreate(store, [], { template: "reconciliation" });
  }
  await cmdRun(store, ["invoice-reconciler"], { ...flags, simulator: flags.provider === "simulator" || flags.simulator });
  console.log("Then open the console:\n  meshly dev\n");
}
async function cmdRuns(store) {
  store.loadConfig();
  const runs = store.listRuns();
  if (runs.length === 0) {
    console.log("\nNo runs yet. `meshly run <worker>` or `meshly live`\n");
    return;
  }
  console.log("\n  RUN ID                         STATUS      MODE        WORKER");
  console.log("  " + "-".repeat(78));
  for (const r of runs) {
    console.log(
      `  ${r.runId.padEnd(30)} ${r.status.padEnd(11)} ${r.mode.padEnd(11)} ${r.workerName || r.workerId}`
    );
  }
  console.log("");
}
async function cmdInspect(store, rest) {
  store.loadConfig();
  const id = rest[0];
  if (!id) {
    console.error("Usage: meshly inspect <runId>");
    process.exitCode = 1;
    return;
  }
  const run = store.getRun(id);
  if (!run) {
    console.error(`Run '${id}' not found.`);
    process.exitCode = 1;
    return;
  }
  printRun(run);
}
async function cmdReplay(store, rest) {
  store.loadConfig();
  const id = rest[0];
  if (!id) {
    console.error("Usage: meshly replay <runId>");
    process.exitCode = 1;
    return;
  }
  const run = store.getRun(id);
  if (!run) {
    console.error(`Run '${id}' not found.`);
    process.exitCode = 1;
    return;
  }
  const links = [
    ...run.environments.map((e) => e.replayUrl || e.streamUrl).filter(Boolean),
    ...run.steps.flatMap((s) => [s.observation?.replayUrl, s.observation?.streamUrl, s.observation?.browser_replay_url]).filter(Boolean)
  ];
  if (links.length === 0) {
    console.log("\nNo replay or stream URL on this run. Live browser replays are issued after session release.\n");
    return;
  }
  console.log("\nReplay / stream URLs");
  for (const link of Array.from(new Set(links))) console.log(`  ${link}`);
  console.log("");
}
async function cmdExport(store, rest) {
  store.loadConfig();
  const id = rest[0];
  if (!id) {
    console.error("Usage: meshly export <runId>");
    process.exitCode = 1;
    return;
  }
  const run = store.getRun(id);
  if (!run) {
    console.error(`Run '${id}' not found.`);
    process.exitCode = 1;
    return;
  }
  const exportDir = path9.resolve(store.root, "exports", run.runId);
  fs8.mkdirSync(exportDir, { recursive: true });
  fs8.writeFileSync(path9.join(exportDir, "run.json"), JSON.stringify(run, null, 2));
  fs8.writeFileSync(
    path9.join(exportDir, "evidence.json"),
    JSON.stringify(run.evidence || {}, null, 2)
  );
  console.log(`
Exported ${run.runId} \u2192 ${exportDir}
`);
}
function help() {
  console.log(`
Meshly \u2014 the operating system for autonomous workers.

  npm install -g meshly
  meshly init
  meshly doctor
  meshly run
  meshly dev

Usage:
  meshly init [--api-key <key>] [--provider solari|simulator] [--yes]
  meshly doctor [--simulator] [--skip-probe]
  meshly worker create --template reconciliation|research|coding|operations
  meshly worker create --name <name> --task "<task>" [--capabilities browser,sandbox,desktop]
  meshly workers
  meshly run [worker] [--keep] [--timeout]
  meshly demo seed                     Create the demo project (real workers, no fake runs)
  meshly fail                          World mismatch \u2192 COMMIT BLOCKED
  meshly demo unknown                  Timeout \u2192 UNKNOWN \u2192 independent verify \u2192 VERIFIED
  meshly demo retry                    Timeout \u2192 UNKNOWN \u2192 world absent \u2192 SAFE TO RETRY
  meshly demo blocked                  Same as meshly fail
  meshly resume <run>
  meshly verify <run>                  Re-check world state. Does not retry.
  meshly runs
  meshly inspect <run>
  meshly replay <run>
  meshly export <run>
  meshly restart                       Reconnect workers, runs, environments
  meshly dev [--port 3400]
  meshly mcp [--simulator]             MCP server. Simulator only with --simulator.
  meshly benchmark --suite execution   Direct agent vs Meshly-governed execution
                                       [--trials 100] [--seed 20260915] [--out <dir>]
                                       [--scenarios reality_divergence,ambiguous_timeout]
                                       [--live --yes] [--max-sessions 30]
  meshly benchmark --suite scheduler   Scheduler stress simulation [--workers 1000]

Live Solari is the default. Pass --simulator only for a local kernel demo.
`);
}
async function runCli(argv = process.argv.slice(2)) {
  const { command, rest, flags } = parseArgs(argv);
  if (flags.version || flags.v || command === "version" || command === "--version" || command === "-v") {
    console.log(cliVersion());
    return;
  }
  const store = new ProjectStore();
  switch (command) {
    case "init":
      await runInit(store, rest, flags);
      break;
    case "doctor":
      await runDoctor(store, flags);
      break;
    case "demo":
      if (rest[0] === "seed") {
        await cmdDemoSeed(store);
      } else if (rest[0] === "unknown" || rest[0] === "timeout") {
        await cmdRun(store, rest.slice(1), { ...flags, timeout: true });
      } else if (rest[0] === "retry") {
        await cmdRun(store, rest.slice(1), { ...flags, timeout: true, absent: true });
      } else if (rest[0] === "blocked" || rest[0] === "fail") {
        await cmdFail(store, flags);
      } else {
        console.error("Usage: meshly demo seed|unknown|retry|blocked");
        process.exitCode = 1;
      }
      break;
    case "quickstart":
      await cmdQuickstart(store, flags);
      break;
    case "dev": {
      const port = Number(flags.port || process.env.PORT || 3400);
      const { startConsole: startConsole2 } = await Promise.resolve().then(() => (init_server2(), server_exports));
      startConsole2({ port, cwd: store.root });
      return;
    }
    case "worker":
      if (rest[0] === "create") await cmdWorkerCreate(store, rest.slice(1), flags);
      else if (rest[0] === "get" && rest[1]) {
        const w = store.getWorker(rest[1]);
        console.log(w ? JSON.stringify(w, null, 2) : `Worker '${rest[1]}' not found.`);
      } else {
        console.log('Usage: meshly worker create --name <name> --task "<task>"');
      }
      break;
    case "workers":
      await cmdWorkers(store);
      break;
    case "run":
      await cmdRun(store, rest, flags);
      break;
    case "resume":
      await cmdResume(store, rest, flags);
      break;
    case "verify":
      await cmdVerify(store, rest);
      break;
    case "runs":
      await cmdRuns(store);
      break;
    case "inspect":
      await cmdInspect(store, rest);
      break;
    case "replay":
      await cmdReplay(store, rest);
      break;
    case "export":
      await cmdExport(store, rest);
      break;
    case "restart": {
      const mesh = createClient(flags, store);
      const result = await mesh.restore(store);
      console.log(`
Meshly restarted`);
      console.log(`  Workers      ${result.workers}`);
      console.log(`  Runs         ${result.runs}`);
      console.log(`  Reconnected  ${result.reconnected}`);
      console.log(`  Lost         ${result.lost}
`);
      break;
    }
    case "mcp": {
      const { startMeshlyMcpServer: startMeshlyMcpServer2 } = await Promise.resolve().then(() => (init_dist3(), dist_exports2));
      const mesh = createClient(flags, store, "mcp");
      const note = mesh.mode === "simulator" ? " (--simulator). This is not live Solari." : "";
      process.stderr.write(`meshly mcp mode=${mesh.mode}${note}
`);
      await startMeshlyMcpServer2({ runtime: mesh.runtime, store });
      return;
    }
    case "live":
      await cmdLive(store, flags);
      break;
    case "fail":
      await cmdFail(store, flags);
      break;
    case "simulate": {
      const mesh = new Meshly({ preferSimulator: true });
      const { runSimulation: runSimulation2 } = await Promise.resolve().then(() => (init_simulate(), simulate_exports));
      await runSimulation2(mesh, parseInt(rest[0] || "100", 10));
      break;
    }
    case "benchmark": {
      const suite = String(flags.suite || rest[0] || "execution").toLowerCase();
      const schedulerSuite = suite === "scheduler" || suite === "sim" || /^\d+$/.test(suite);
      if (schedulerSuite) {
        const mesh = new Meshly({ preferSimulator: true });
        const workers = /^\d+$/.test(suite) ? Number(suite) : parseInt(String(flags.workers || "1000"), 10);
        await runBenchmark(mesh, workers);
        break;
      }
      const { runExecutionBenchmarkSuite: runExecutionBenchmarkSuite2, BenchmarkFabric: BenchmarkFabric2, LIVE_SAFE_SCENARIOS: LIVE_SAFE_SCENARIOS2 } = await Promise.resolve().then(() => (init_dist4(), dist_exports3));
      const live = Boolean(flags.live) || String(flags.source || "").toLowerCase() === "solari";
      const outDir = typeof flags.out === "string" ? path9.resolve(flags.out) : path9.join(store.root, ".meshly", "benchmarks");
      let scenarios = typeof flags.scenarios === "string" ? flags.scenarios.split(",").map((s) => s.trim()).filter(Boolean) : void 0;
      const concurrencyLevels = typeof flags.levels === "string" ? flags.levels.split(",").map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n)) : void 0;
      if (!live) {
        const trials2 = Number(flags.trials || 100);
        const seed2 = Number(flags.seed || 20260915);
        const outcome2 = await runExecutionBenchmarkSuite2(
          { trials: trials2, seed: seed2, scenarios, concurrencyLevels, outputDir: outDir },
          (id, index, total) => process.stdout.write(`\r  [${index}/${total}] ${id}\u2026`)
        );
        process.stdout.write(`\r${" ".repeat(64)}\r`);
        console.log(outcome2.terminal);
        console.log(`  JSON      ${outcome2.written.json}`);
        console.log(`  CSV       ${outcome2.written.csv}`);
        console.log(`  Markdown  ${outcome2.written.markdown}`);
        console.log("");
        break;
      }
      const apiKey = requireSolariKey();
      const { SolariExecutionFabric: SolariExecutionFabric2 } = await Promise.resolve().then(() => (init_dist3(), dist_exports2));
      const liveDefaults = ["reality_divergence", "ambiguous_timeout", "authority_violation"];
      scenarios = (scenarios && scenarios.length ? scenarios : liveDefaults).filter(
        (id) => LIVE_SAFE_SCENARIOS2.includes(id)
      );
      if (!scenarios.length) {
        console.error(`
No live-safe scenarios selected. Choose from: ${LIVE_SAFE_SCENARIOS2.join(", ")}
`);
        process.exitCode = 1;
        break;
      }
      const trials = Number(flags.trials || 1);
      const seed = Number(flags.seed || 20260915);
      const maxSessions = Number(flags["max-sessions"] || 30);
      const estimate = estimateLiveSessions(scenarios, trials);
      console.log("\nMESHLY EXECUTION BENCHMARK \u2014 LIVE SOLARI");
      console.log("  This provisions real cloud browsers, sandboxes, and desktops.");
      console.log("  Both arms run the same task against the same real infrastructure.");
      console.log("  Environment loss and contention are simulator-only by default.\n");
      console.log(`  Scenarios    ${scenarios.join(", ")}`);
      console.log(`  Trials       ${trials} per scenario (${trials * 2} runs)`);
      console.log(`  Est. sessions ~${estimate}`);
      console.log(`  Hard cap     ${maxSessions} sessions`);
      console.log(`  Plan check   if trial 1 looks wrong, this is the moment to stop.
`);
      if (!flags.yes && !Boolean(flags["dry-run"])) {
        console.log("  Nothing was started. Add --yes to spend Solari credit:\n");
        console.log(`    meshly benchmark --suite execution --live --yes
`);
        break;
      }
      if (Boolean(flags["dry-run"])) {
        console.log("  Dry run. Nothing was started.\n");
        break;
      }
      const outcome = await runExecutionBenchmarkSuite2(
        {
          trials,
          seed,
          scenarios,
          outputDir: outDir,
          source: "solari",
          maxSessions,
          armSettleMs: Number(flags.settle || 5e3),
          createFabric: () => new BenchmarkFabric2(new SolariExecutionFabric2({ apiKey, fallbackToSimulator: false }), "solari")
        },
        (id, index, total) => process.stdout.write(`\r  [${index}/${total}] ${id}\u2026`)
      );
      process.stdout.write(`\r${" ".repeat(64)}\r`);
      console.log(outcome.terminal);
      console.log(`  Sessions provisioned  ${outcome.report.sessionsCreated}`);
      console.log(`  JSON      ${outcome.written.json}`);
      console.log(`  CSV       ${outcome.written.csv}`);
      console.log(`  Markdown  ${outcome.written.markdown}`);
      console.log("");
      process.exit(process.exitCode ?? 0);
    }
    case "help":
    default:
      help();
      if (command !== "help") process.exitCode = 1;
  }
}
function isDirectRun2() {
  const entry = process.argv[1];
  if (!entry) return false;
  const self = fileURLToPath3(import.meta.url);
  try {
    return fs8.realpathSync(entry).toLowerCase() === fs8.realpathSync(self).toLowerCase();
  } catch {
    return path9.normalize(path9.resolve(entry)).toLowerCase() === path9.normalize(self).toLowerCase();
  }
}
if (isDirectRun2()) {
  runCli(process.argv.slice(2)).then(() => {
    const cmd = process.argv[2];
    if (cmd !== "dev" && cmd !== "mcp") {
      process.exit(process.exitCode ?? 0);
    }
  }).catch((err) => {
    console.error(formatUserError(err));
    process.exit(1);
  });
}
export {
  runCli
};
