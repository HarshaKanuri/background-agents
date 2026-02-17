# Open-Inspect Architecture

This document provides visual architecture diagrams for the Open-Inspect system.

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              USER INTERFACES                                    │
│                                                                                 │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                      │
│   │   Web App    │    │  Slack Bot   │    │   GitHub     │                      │
│   │  (Next.js)   │    │ (CF Worker)  │    │  (Webhooks)  │                      │
│   │  Vercel      │    │  Cloudflare  │    │              │                      │
│   └──────┬───────┘    └──────┬───────┘    └──────┬───────┘                      │
│          │ HTTP/WS           │ Service            │ HTTP                         │
│          │                   │ Binding            │                              │
└──────────┼───────────────────┼────────────────────┼─────────────────────────────┘
           │                   │                    │
           ▼                   ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        CONTROL PLANE (Cloudflare Workers)                       │
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                          Router (src/router.ts)                          │   │
│  │  REST API: /sessions, /repos, /secrets    WebSocket: /sessions/:id/ws   │   │
│  └──────────────────────────┬───────────────────────────────────────────────┘   │
│                             │                                                   │
│  ┌──────────────────────────▼───────────────────────────────────────────────┐   │
│  │                  Session Durable Object (per session)                    │   │
│  │                                                                          │   │
│  │  ┌─────────────┐  ┌─────────────────┐  ┌────────────────────────────┐   │   │
│  │  │  WebSocket   │  │    Sandbox      │  │    Session Repository     │   │   │
│  │  │  Manager     │  │    Lifecycle    │  │    (SQLite Storage)       │   │   │
│  │  │             │  │    Manager      │  │                            │   │   │
│  │  │ • Hub       │  │                 │  │  • sessions   • events    │   │   │
│  │  │ • Auth      │  │ • Spawn/Restore│  │  • messages   • artifacts │   │   │
│  │  │ • Hibernate │  │ • Heartbeat    │  │  • sandboxes  • presence  │   │   │
│  │  │ • Broadcast │  │ • Timeout      │  │                            │   │   │
│  │  │ • Presence  │  │ • Circuit Break│  │                            │   │   │
│  │  └─────────────┘  └────────┬────────┘  └────────────────────────────┘   │   │
│  │                            │                                             │   │
│  └────────────────────────────┼─────────────────────────────────────────────┘   │
│                               │                                                 │
│  ┌────────────────┐  ┌────────┴───────┐  ┌──────────────────┐                  │
│  │  D1 Database   │  │  KV Namespace  │  │   Auth Layer     │                  │
│  │                │  │                │  │                  │                  │
│  │ • sessions     │  │ • REPOS_CACHE  │  │ • GitHub OAuth   │                  │
│  │ • repo_secrets │  │   (5-min TTL)  │  │ • GitHub App     │                  │
│  │ • global_secrets│ │                │  │ • HMAC (internal)│                  │
│  │ • repo_metadata│  │                │  │ • Sandbox tokens │                  │
│  └────────────────┘  └────────────────┘  └──────────────────┘                  │
│                                                                                 │
└────────────────────────────────┬────────────────────────────────────────────────┘
                                 │
                                 │ HMAC-authenticated HTTP
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         MODAL INFRASTRUCTURE (Python)                           │
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                     Modal App ("open-inspect")                           │   │
│  │                                                                          │   │
│  │  ┌───────────────┐  ┌───────────────┐  ┌─────────────────────────────┐  │   │
│  │  │  Web API       │  │  Functions    │  │  Scheduler                  │  │   │
│  │  │                │  │               │  │                             │  │   │
│  │  │ create_sandbox │  │ health_check  │  │ build_repo_image (30-min)  │  │   │
│  │  │               │  │ get_snapshot  │  │                             │  │   │
│  │  │               │  │ list_snapshots│  │                             │  │   │
│  │  │               │  │ register_repo │  │                             │  │   │
│  │  └───────┬───────┘  └───────────────┘  └─────────────────────────────┘  │   │
│  │          │                                                               │   │
│  │          ▼                                                               │   │
│  │  ┌───────────────────────────────────────────────────────────────────┐   │   │
│  │  │                    Sandbox Manager                                │   │   │
│  │  │                                                                   │   │   │
│  │  │  • Spawn new sandboxes from base image or snapshot               │   │   │
│  │  │  • Manage warm pools per repository                              │   │   │
│  │  │  • Track sandbox handles and lifecycle                           │   │   │
│  │  │  • Default timeout: 7200 seconds                                 │   │   │
│  │  └───────────────────────────┬───────────────────────────────────────┘   │   │
│  │                              │                                           │   │
│  └──────────────────────────────┼───────────────────────────────────────────┘   │
│                                 │                                               │
│  ┌──────────────┐               │              ┌────────────────────────────┐   │
│  │   Secrets    │               │              │   Shared Volume (/data)    │   │
│  │              │               │              │                            │   │
│  │ • llm-api-  │               │              │  • Snapshot metadata       │   │
│  │   keys      │               │              │  • Repository registry     │   │
│  │ • github-app│               │              │                            │   │
│  │ • internal- │               │              │                            │   │
│  │   api       │               │              │                            │   │
│  └──────────────┘               │              └────────────────────────────┘   │
│                                 │                                               │
└─────────────────────────────────┼───────────────────────────────────────────────┘
                                  │
                                  │ Spawns container
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          SANDBOX (Linux Container)                              │
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                    Supervisor (PID 1, entrypoint.py)                     │   │
│  │                                                                          │   │
│  │  Startup Sequence:                                                       │   │
│  │  1. Git sync (clone/pull)                                                │   │
│  │  2. Run .openinspect/setup.sh (if fresh clone)                           │   │
│  │  3. Start OpenCode server (port 4096)                                    │   │
│  │  4. Start Bridge process                                                 │   │
│  │  5. Monitor & restart on failure                                         │   │
│  │                                                                          │   │
│  │  ┌────────────────────┐          ┌────────────────────────────────────┐  │   │
│  │  │    OpenCode        │◄────────►│         Bridge (bridge.py)         │  │   │
│  │  │    (Agent Runtime) │ HTTP     │                                    │  │   │
│  │  │                    │ :4096    │  • WebSocket to Control Plane      │  │   │
│  │  │  • Code editing    │          │  • Event forwarding                │  │   │
│  │  │  • File operations │          │  • Command handling                │  │   │
│  │  │  • Git operations  │          │  • Heartbeat loop                  │  │   │
│  │  │  • Tool execution  │          │  • Git identity management         │  │   │
│  │  │  • LLM interaction │          │                                    │  │   │
│  │  └────────────────────┘          └──────────────┬─────────────────────┘  │   │
│  │                                                  │                       │   │
│  └──────────────────────────────────────────────────┼───────────────────────┘   │
│                                                     │ WebSocket                 │
└─────────────────────────────────────────────────────┼───────────────────────────┘
                                                      │
                                              ┌───────▼───────┐
                                              │ Control Plane │
                                              │ Durable Object│
                                              └───────────────┘
```

---

## Session Lifecycle

```
                    ┌──────────┐
                    │   User   │
                    └────┬─────┘
                         │
                    POST /sessions
                         │
                         ▼
              ┌──────────────────────┐
              │    Control Plane     │
              │   (Create Session)   │
              │                      │
              │ • Allocate Session DO│
              │ • Init SQLite schema │
              │ • Index in D1        │
              └──────────┬───────────┘
                         │
                  Spawn Decision
                   ┌─────┴─────┐
                   │           │
              No Snapshot   Has Snapshot
                   │           │
                   ▼           ▼
             ┌──────────┐ ┌──────────┐
             │  Spawn   │ │ Restore  │
             │  Fresh   │ │   From   │
             │ Sandbox  │ │ Snapshot │
             │ (~30-60s)│ │  (~5-10s)│
             └────┬─────┘ └────┬─────┘
                  │            │
                  └─────┬──────┘
                        │
                        ▼
              ┌──────────────────────┐
              │   Sandbox Running    │
              │                      │
              │ Supervisor → OpenCode│
              │            → Bridge  │
              └──────────┬───────────┘
                         │
                  Bridge connects via
                  WebSocket to Session DO
                         │
                         ▼
              ┌──────────────────────┐
              │   Ready for Prompts  │◄──────────────────────────────┐
              └──────────┬───────────┘                               │
                         │                                           │
                  User sends prompt                                  │
                         │                                           │
                         ▼                                           │
              ┌──────────────────────┐                               │
              │  Prompt Processing   │                               │
              │                      │                               │
              │ 1. Store message     │                               │
              │ 2. Configure git ID  │                               │
              │ 3. Forward to OpenCode│                              │
              │ 4. Stream events     │                               │
              │ 5. Broadcast to all  │                               │
              │    connected clients │                               │
              └──────────┬───────────┘                               │
                         │                                           │
                         ▼                                           │
              ┌──────────────────────┐       ┌────────────────┐     │
              │ Execution Complete   │──────►│ Take Snapshot  │     │
              └──────────┬───────────┘       └────────────────┘     │
                         │                                           │
                  ┌──────┴──────┐                                    │
                  │             │                                    │
           More prompts    No activity                               │
                  │             │                                    │
                  │             ▼                                    │
                  │    ┌─────────────────┐                           │
                  │    │ Inactivity Timer│                           │
                  │    │  (10 minutes)   │                           │
                  │    └────────┬────────┘                           │
                  │             │                                    │
                  │        ┌────┴────┐                               │
                  │        │         │                               │
                  │    Timeout   New prompt                          │
                  │        │         │                               │
                  │        ▼         └──────────────────────────────►┘
                  │  ┌───────────┐
                  │  │  Sandbox  │
                  │  │  Stopped  │
                  │  └───────────┘
                  │
                  └─────────────────────────────────────────────────►┘
```

---

## Data Flow: Prompt to Result

```
┌────────┐   WebSocket    ┌──────────────┐    WebSocket     ┌───────────┐
│ Client │───────────────►│ Session DO   │────────────────►│  Bridge   │
│(Web/   │                │              │                  │ (Sandbox) │
│ Slack) │◄───────────────│ • Store msg  │◄────────────────│           │
│        │   Events       │ • Queue      │    Events        │           │
└────────┘                │ • Broadcast  │                  └─────┬─────┘
                          └──────────────┘                        │
                                                            HTTP :4096
                                                                  │
                                                            ┌─────▼─────┐
                                                            │ OpenCode  │
                                                            │           │
                                                            │ • LLM API │
                                                            │ • Tools   │
                                                            │ • Git ops │
                                                            └───────────┘
```

### Event Types Flowing Through the System

```
OpenCode → Bridge → Control Plane → Clients
─────────────────────────────────────────────
  token           Stream of LLM output tokens
  tool_call       Agent invoking a tool (file edit, bash, etc.)
  tool_result     Result of tool execution
  git_sync        Repository sync status updates
  error           Error events
  execution_complete  Prompt processing finished
  artifact        PR created, screenshot taken, etc.
  heartbeat       Connection health (not persisted)
```

---

## Infrastructure & Deployment

```
┌─────────────────────────────────────────────────────────────┐
│                        Terraform                            │
│                                                             │
│  terraform/environments/production/main.tf                  │
│                                                             │
│  ┌───────────────────┐  ┌────────────┐  ┌───────────────┐  │
│  │    Cloudflare      │  │   Vercel   │  │    Modal      │  │
│  │                    │  │            │  │               │  │
│  │ • control-plane    │  │ • Next.js  │  │ • modal deploy│  │
│  │   worker           │  │   web app  │  │   via CLI     │  │
│  │ • slack-bot worker │  │            │  │               │  │
│  │ • D1 database      │  │            │  │ • Secrets     │  │
│  │ • KV namespaces    │  │            │  │ • Volumes     │  │
│  │ • DO bindings      │  │            │  │               │  │
│  │ • D1 migrations    │  │            │  │               │  │
│  └───────────────────┘  └────────────┘  └───────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Authentication & Security

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Authentication Layers                         │
│                                                                      │
│  ┌─────────────────┐     ┌──────────────────┐     ┌──────────────┐  │
│  │  User → Web App │     │ Web App → Control │     │ Control Plane│  │
│  │                  │     │     Plane         │     │   → Modal    │  │
│  │  GitHub OAuth    │     │  GitHub OAuth     │     │              │  │
│  │  (login + PRs)   │     │  token forwarding │     │  HMAC-signed │  │
│  │                  │     │                   │     │  tokens      │  │
│  └─────────────────┘     └──────────────────┘     │  (5-min TTL) │  │
│                                                    └──────────────┘  │
│  ┌─────────────────┐     ┌──────────────────┐                       │
│  │ Sandbox → Control│     │ Slack → Control  │                       │
│  │     Plane        │     │     Plane        │                       │
│  │                  │     │                  │                       │
│  │ Time-limited     │     │ Service binding  │                       │
│  │ sandbox auth     │     │ (internal auth)  │                       │
│  │ tokens           │     │                  │                       │
│  └─────────────────┘     └──────────────────┘                       │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │                     Secrets Storage                           │    │
│  │                                                               │    │
│  │  Modal Secrets         D1 (encrypted)       Terraform vars   │    │
│  │  ├─ ANTHROPIC_API_KEY  ├─ repo_secrets      ├─ GitHub creds  │    │
│  │  ├─ GITHUB_APP_*       │  (AES-256-GCM)     ├─ API keys      │    │
│  │  └─ MODAL_API_SECRET   └─ global_secrets    └─ Encrypt keys  │    │
│  └──────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

```
┌─────────────┬───────────────────────────────────────────────────────┐
│   Layer     │  Technologies                                        │
├─────────────┼───────────────────────────────────────────────────────┤
│  Frontend   │  Next.js 19, React 19, Zustand, Tailwind CSS         │
│  Hosting    │  Vercel (automatic HTTPS, CDN)                        │
├─────────────┼───────────────────────────────────────────────────────┤
│  Control    │  Cloudflare Workers, Durable Objects, D1 (SQLite),   │
│  Plane      │  KV Namespaces, WebSockets w/ Hibernation            │
├─────────────┼───────────────────────────────────────────────────────┤
│  Compute    │  Modal (Python), Linux containers, filesystem        │
│             │  snapshots, warm pools                                │
├─────────────┼───────────────────────────────────────────────────────┤
│  Agent      │  OpenCode (coding agent runtime, port 4096)           │
├─────────────┼───────────────────────────────────────────────────────┤
│  Chat       │  Slack Bot (Cloudflare Worker, Hono framework)        │
├─────────────┼───────────────────────────────────────────────────────┤
│  Auth       │  GitHub OAuth, GitHub App, HMAC signing               │
├─────────────┼───────────────────────────────────────────────────────┤
│  IaC        │  Terraform (Cloudflare, Vercel, Modal providers)      │
├─────────────┼───────────────────────────────────────────────────────┤
│  Dev Tools  │  Node.js 22, Python 3.12, pnpm, Playwright           │
└─────────────┴───────────────────────────────────────────────────────┘
```

---

## Package Structure

```
background-agents/
├── packages/
│   ├── control-plane/          # Cloudflare Workers — main coordinator
│   │   └── src/
│   │       ├── router.ts           # HTTP/WS request routing
│   │       ├── session/
│   │       │   ├── durable-object.ts   # Per-session Durable Object
│   │       │   ├── repository.ts       # SQLite session storage
│   │       │   ├── websocket-manager.ts # WS hub with hibernation
│   │       │   └── pull-request-service.ts
│   │       ├── sandbox/
│   │       │   └── lifecycle/manager.ts # Spawn/restore/timeout logic
│   │       ├── db/
│   │       │   ├── session-index.ts    # D1 session metadata
│   │       │   ├── repo-metadata.ts    # D1 repo descriptions
│   │       │   └── repo-secrets.ts     # D1 encrypted secrets
│   │       └── auth/                   # OAuth, App, HMAC auth
│   │
│   ├── modal-infra/            # Modal Python — sandbox compute
│   │   └── src/
│   │       ├── app.py              # Modal app definition
│   │       ├── functions.py        # Sandbox CRUD functions
│   │       ├── web_api.py          # HTTP endpoints
│   │       ├── sandbox/
│   │       │   ├── manager.py          # Sandbox orchestration
│   │       │   ├── entrypoint.py       # Supervisor (PID 1)
│   │       │   ├── bridge.py           # WS bridge to control plane
│   │       │   └── types.py            # Status enums, event types
│   │       ├── scheduler/
│   │       │   └── image_builder.py    # Periodic image rebuilds
│   │       └── registry/              # Snapshot & repo registry
│   │
│   ├── web/                    # Next.js — frontend UI
│   │   └── src/
│   │       ├── app/                # App router pages
│   │       ├── components/         # React components
│   │       ├── hooks/              # Custom React hooks
│   │       └── lib/                # API clients & utilities
│   │
│   ├── slack-bot/              # Cloudflare Worker — Slack integration
│   │   └── src/
│   │       └── index.ts            # Hono routes for Slack events
│   │
│   └── shared/                 # Shared TypeScript types & models
│       └── src/
│           ├── models.ts           # Model definitions (Anthropic, OpenAI)
│           └── types.ts            # Session, Message, Event types
│
├── terraform/                  # Infrastructure as Code
│   ├── environments/production/    # Production config
│   ├── modules/                    # Reusable Terraform modules
│   └── d1/migrations/             # D1 database migrations
│
├── scripts/                    # Deployment & migration scripts
└── docs/                       # Documentation
```
