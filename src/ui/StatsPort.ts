// Where an interface reads the time-saved total: storage.local in the extension, memory in tests.

export interface StatsPort {
  load(): Promise<number>;
  watch(onChange: (seconds: number) => void): () => void;
  reset(): Promise<void>;
}
