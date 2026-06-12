export class NullEmbeddings {
  readonly name = "null" as const;
  readonly dim = 0;

  async embed(_text: string): Promise<Float32Array> {
    return new Float32Array(0);
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    return texts.map(() => new Float32Array(0));
  }
}
