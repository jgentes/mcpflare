export interface WorkerCode {
  compatibilityDate: string;
  compatibilityFlags?: string[];
  experimental?: boolean;
  mainModule: string;
  modules: Record<string, string | ModuleContent>;
  env?: Record<string, any>;
  globalOutbound?: any;
}

export type ModuleContent =
  | { js: string }
  | { cjs: string }
  | { py: string }
  | { text: string }
  | { data: ArrayBuffer }
  | { json: object };

export interface WorkerStub {
  getEntrypoint(name?: string, options?: { props?: any }): any;
}

export interface WorkerLoader {
  get(
    id: string,
    getCodeCallback: () => Promise<WorkerCode>
  ): WorkerStub;
}

