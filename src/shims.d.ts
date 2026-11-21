declare module 'autobee' {
  export default class Autobee {
    constructor(store: any, key?: Buffer | null, options?: any)
    key: Buffer; discoveryKey: Buffer; local: { key: Buffer }; writable: boolean; view: any
    ready(): Promise<void>; update(): Promise<void>; append(value: Buffer | Buffer[], options?: any): Promise<void>
    replicate(initiatorOrStream: boolean | any): any
    close(): Promise<void>
  }
}
declare module 'corestore' {
  export default class Corestore {
    constructor(storage: string)
    createKeyPair(name: string): Promise<{ publicKey: Buffer; secretKey: Buffer }>
    replicate(stream: any): any
    close(): Promise<void>
  }
}
declare module 'hyperswarm' {
  export default class Hyperswarm {
    constructor(options?: any)
    on(event: string, callback: (...args: any[]) => void): this
    join(topic: Buffer, options?: any): { flushed(): Promise<void> }
    destroy(): Promise<void>
  }
}
