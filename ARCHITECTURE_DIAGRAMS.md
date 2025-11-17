# MCP Guard - Architecture Diagrams

## System Architecture

```mermaid
graph TB
    subgraph "AI Agent Environment"
        Agent[AI Agent<br/>Cursor IDE]
    end
    
    subgraph "MCP Guard Meta-MCP Server"
        MCP[MCP Protocol Handler]
        WM[Worker Manager]
        SC[Schema Converter]
        MC[Metrics Collector]
        
        MCP --> WM
        MCP --> SC
        MCP --> MC
    end
    
    subgraph "Cloudflare Workers Runtime"
        subgraph "Worker Isolate Sandbox"
            Code[AI-Generated<br/>TypeScript Code]
            Bind[MCP Bindings<br/>RPC Interface]
            Sec[Security Layer<br/>globalOutbound: null]
            
            Code --> Bind
            Code -.blocked.-> Sec
        end
    end
    
    subgraph "Target MCP Servers"
        GitHub[GitHub MCP]
        Weather[Weather MCP]
        DB[Database MCP]
        Other[Other MCPs...]
    end
    
    Agent -->|MCP Protocol| MCP
    WM -->|Worker Loader API| Code
    Bind -->|RPC Callbacks| WM
    WM -->|Spawn & Manage| GitHub
    WM -->|Spawn & Manage| Weather
    WM -->|Spawn & Manage| DB
    WM -->|Spawn & Manage| Other
    
    style Agent fill:#e1f5ff
    style Code fill:#fff3cd
    style Sec fill:#f8d7da
    style GitHub fill:#d4edda
    style Weather fill:#d4edda
    style DB fill:#d4edda
```

## Data Flow - Loading an MCP

```mermaid
sequenceDiagram
    participant Agent as AI Agent
    participant Handler as MCP Handler
    participant Manager as Worker Manager
    participant Process as MCP Process
    participant Converter as Schema Converter
    
    Agent->>Handler: load_mcp_server(name, config)
    Handler->>Manager: loadMCP(name, config)
    Manager->>Process: spawn(command, args)
    Process-->>Manager: MCP initialized
    Manager->>Process: fetch schema
    Process-->>Manager: tools schema (JSON)
    Manager->>Converter: convertToTypeScript(tools)
    Converter-->>Manager: TypeScript API definitions
    Manager-->>Handler: MCPInstance with TypeScript API
    Handler-->>Agent: {mcp_id, typescript_api, tools}
```

## Data Flow - Executing Code

```mermaid
sequenceDiagram
    participant Agent as AI Agent
    participant Handler as MCP Handler
    participant Manager as Worker Manager
    participant Isolate as Worker Isolate
    participant MCP as Target MCP
    participant Metrics as Metrics Collector
    
    Agent->>Handler: execute_code(mcp_id, code)
    Handler->>Handler: validateTypeScriptCode(code)
    Handler->>Manager: executeCode(mcp_id, code)
    Manager->>Isolate: Load Worker + Execute Code
    
    loop Multiple MCP Calls
        Isolate->>MCP: RPC call via binding
        MCP-->>Isolate: Result
    end
    
    Isolate-->>Manager: Execution result + logs
    Manager->>Metrics: recordExecution(metrics)
    Manager-->>Handler: {success, output, metrics}
    Handler-->>Agent: Execution result
```

## Security Layers

```mermaid
graph TB
    subgraph "Layer 1: Input Validation"
        V1[Zod Schema Validation]
        V2[Code Pattern Detection]
        V3[Size Limits]
    end
    
    subgraph "Layer 2: Worker Isolation"
        I1[globalOutbound: null<br/>No Network Access]
        I2[Binding-Only MCP Access]
        I3[Disposable Isolates]
    end
    
    subgraph "Layer 3: Secrets Management"
        S1[Env Variables Only]
        S2[Never Exposed to Isolate]
        S3[RPC Handles Auth]
    end
    
    subgraph "Layer 4: Monitoring"
        M1[Audit Logging]
        M2[Performance Metrics]
        M3[Anomaly Detection]
    end
    
    Input[User Input] --> V1
    V1 --> V2
    V2 --> V3
    V3 --> I1
    I1 --> I2
    I2 --> I3
    I3 --> S1
    S1 --> S2
    S2 --> S3
    S3 --> M1
    M1 --> M2
    M2 --> M3
    
    style V1 fill:#fff3cd
    style V2 fill:#fff3cd
    style V3 fill:#fff3cd
    style I1 fill:#f8d7da
    style I2 fill:#f8d7da
    style I3 fill:#f8d7da
    style S1 fill:#d4edda
    style S2 fill:#d4edda
    style S3 fill:#d4edda
```

## Performance Comparison

```mermaid
graph LR
    subgraph "Traditional Tool Calling"
        T1[Tool Call 1] --> LLM1[LLM Process]
        LLM1 --> T2[Tool Call 2]
        T2 --> LLM2[LLM Process]
        LLM2 --> T3[Tool Call 3]
        T3 --> LLM3[LLM Process]
        LLM3 --> Result1[Final Result]
    end
    
    subgraph "Code Mode Execution"
        Gen[Generate Code] --> LLM4[LLM Process]
        LLM4 --> Exec[Execute in Isolate]
        Exec --> C1[Call 1]
        Exec --> C2[Call 2]
        Exec --> C3[Call 3]
        C1 --> Result2[Final Result]
        C2 --> Result2
        C3 --> Result2
    end
    
    style LLM1 fill:#f8d7da
    style LLM2 fill:#f8d7da
    style LLM3 fill:#f8d7da
    style LLM4 fill:#d4edda
    style Exec fill:#d4edda
```

**Traditional**: 3 LLM round-trips, ~7,500 tokens
**Code Mode**: 1 LLM round-trip, ~800 tokens
**Improvement**: 89% token reduction, 5x faster

## Component Interaction Map

```mermaid
graph TB
    subgraph "Server Components"
        Server[Server Entry Point<br/>src/server/index.ts]
        Handler[MCP Handler<br/>src/server/mcp-handler.ts]
        Manager[Worker Manager<br/>src/server/worker-manager.ts]
        Schema[Schema Converter<br/>src/server/schema-converter.ts]
        Metrics[Metrics Collector<br/>src/server/metrics-collector.ts]
    end
    
    subgraph "Utilities"
        Logger[Logger<br/>src/utils/logger.ts]
        Errors[Error Classes<br/>src/utils/errors.ts]
        Validation[Validation<br/>src/utils/validation.ts]
    end
    
    subgraph "Types"
        TypesMCP[MCP Types<br/>src/types/mcp.ts]
        TypesWorker[Worker Types<br/>src/types/worker.ts]
    end
    
    subgraph "Worker"
        Runtime[Worker Runtime<br/>src/worker/runtime.ts]
    end
    
    Server --> Handler
    Handler --> Manager
    Handler --> Validation
    Manager --> Schema
    Manager --> Metrics
    Manager --> Runtime
    
    Handler --> Logger
    Manager --> Logger
    Schema --> Logger
    
    Handler --> Errors
    Manager --> Errors
    Validation --> Errors
    
    Handler --> TypesMCP
    Manager --> TypesMCP
    Manager --> TypesWorker
    Runtime --> TypesWorker
    
    style Server fill:#e1f5ff
    style Runtime fill:#fff3cd
```

## Deployment Architecture

```mermaid
graph TB
    subgraph "Development"
        DevCursor[Cursor IDE]
        DevWrangler[Wrangler Dev Server]
    end
    
    subgraph "Local Testing"
        LocalMCP[MCP Guard<br/>Local Mode]
        LocalWorker[workerd<br/>Local Runtime]
    end
    
    subgraph "CI/CD"
        GitHub[GitHub Actions]
        Tests[Automated Tests]
        Security[Security Scans]
    end
    
    subgraph "Production Planned"
        ProdMCP[MCP Guard<br/>Production]
        CloudflareWorkers[Cloudflare Workers<br/>Global Network]
    end
    
    DevCursor --> LocalMCP
    DevWrangler --> LocalWorker
    LocalMCP --> LocalWorker
    
    LocalMCP --> GitHub
    GitHub --> Tests
    Tests --> Security
    Security --> ProdMCP
    ProdMCP --> CloudflareWorkers
    
    style DevCursor fill:#e1f5ff
    style LocalMCP fill:#fff3cd
    style ProdMCP fill:#d4edda
```

## Token Usage Comparison

```mermaid
graph LR
    subgraph "Scenario: 3 MCP Operations"
        direction TB
        
        subgraph "Traditional"
            T_Gen1[Generate Tool Call 1<br/>500 tokens]
            T_Res1[Process Result 1<br/>1000 tokens]
            T_Gen2[Generate Tool Call 2<br/>500 tokens]
            T_Res2[Process Result 2<br/>1000 tokens]
            T_Gen3[Generate Tool Call 3<br/>500 tokens]
            T_Res3[Process Result 3<br/>1000 tokens]
            T_Total[Total: 4500 tokens]
            
            T_Gen1 --> T_Res1 --> T_Gen2 --> T_Res2 --> T_Gen3 --> T_Res3 --> T_Total
        end
        
        subgraph "Code Mode"
            C_Gen[Generate Code<br/>300 tokens]
            C_Exec[Execute in Isolate<br/>0 tokens]
            C_Res[Process Final Result<br/>200 tokens]
            C_Total[Total: 500 tokens]
            
            C_Gen --> C_Exec --> C_Res --> C_Total
        end
    end
    
    T_Total -.89% reduction.-> C_Total
    
    style T_Total fill:#f8d7da
    style C_Total fill:#d4edda
```

---

## How to Use These Diagrams

### In Markdown Viewers
Most modern markdown viewers (GitHub, VS Code, etc.) will render Mermaid diagrams automatically.

### In Documentation
Copy the Mermaid code blocks into your documentation files.

### As Images
Use tools like [Mermaid Live Editor](https://mermaid.live/) to export as PNG/SVG.

### In Presentations
Export as images and include in slides to explain architecture to stakeholders.

---

These diagrams illustrate:
1. **System Architecture** - Overall component structure
2. **Data Flow** - How requests move through the system
3. **Security Layers** - Defense-in-depth approach
4. **Performance Comparison** - Why code mode is better
5. **Component Interactions** - How code modules relate
6. **Deployment Architecture** - Dev to production flow
7. **Token Usage** - Concrete efficiency improvements
