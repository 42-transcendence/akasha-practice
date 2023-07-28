export class ByteBufferUnderflowError extends Error {}

export class ByteBuffer {
  private static textEncoder: TextEncoder = new TextEncoder();
  private static textDecoder: TextDecoder = new TextDecoder();

  accessor: DataView;
  offset: number;
  endian: boolean;

  constructor(buffer: ArrayBuffer, endian?: boolean | undefined) {
    this.accessor = new DataView(buffer);
    this.offset = 0;
    this.endian = endian ?? true;
  }

  static create(
    length: number = 128,
    endian?: boolean | undefined
  ): ByteBuffer {
    return new ByteBuffer(new SharedArrayBuffer(length), endian);
  }

  seek(offset: number) {
    this.assertUnderflow(offset);
    this.offset = offset;
  }

  // BEGIN Read
  read(length: number): Uint8Array {
    this.assertUnderflow(this.offset + length);
    const value = new Uint8Array(
      this.accessor.buffer,
      this.accessor.byteOffset + this.offset,
      length
    );
    this.offset += length;
    return value;
  }

  read1(): number {
    this.assertUnderflow(this.offset + 1);
    const value: number = this.accessor.getUint8(this.offset);
    this.offset += 1;
    return value;
  }

  read1Signed(): number {
    this.assertUnderflow(this.offset + 1);
    const value: number = this.accessor.getInt8(this.offset);
    this.offset += 1;
    return value;
  }

  read2(): number {
    this.assertUnderflow(this.offset + 2);
    const value: number = this.accessor.getInt16(this.offset, this.endian);
    this.offset += 2;
    return value;
  }

  read2Unsigned(): number {
    this.assertUnderflow(this.offset + 2);
    const value: number = this.accessor.getUint16(this.offset, this.endian);
    this.offset += 2;
    return value;
  }

  read4(): number {
    this.assertUnderflow(this.offset + 4);
    const value: number = this.accessor.getInt32(this.offset, this.endian);
    this.offset += 4;
    return value;
  }

  read4Unsigned(): number {
    this.assertUnderflow(this.offset + 4);
    const value: number = this.accessor.getUint32(this.offset, this.endian);
    this.offset += 4;
    return value;
  }

  read8(): bigint {
    this.assertUnderflow(this.offset + 8);
    const value: bigint = this.accessor.getBigInt64(this.offset, this.endian);
    this.offset += 8;
    return value;
  }

  read8Unsigned(): bigint {
    this.assertUnderflow(this.offset + 8);
    const value: bigint = this.accessor.getBigUint64(this.offset, this.endian);
    this.offset += 8;
    return value;
  }

  read4Float(): number {
    this.assertUnderflow(this.offset + 4);
    const value: number = this.accessor.getFloat32(this.offset, this.endian);
    this.offset += 4;
    return value;
  }

  read8Float(): number {
    this.assertUnderflow(this.offset + 8);
    const value: number = this.accessor.getFloat64(this.offset, this.endian);
    this.offset += 8;
    return value;
  }

  readString(): string {
    const length: number = this.read2Unsigned();
    const data: Uint8Array = this.read(length);
    const value = ByteBuffer.textDecoder.decode(data);
    return value;
  }
  // END Read

  // BEGIN Write
  write(value: Uint8Array, length: number) {
    ByteBuffer.copy(
      this.accessor.buffer,
      value,
      this.accessor.byteOffset + this.offset
    );
    this.offset += length;
  }

  write1(value: number) {
    this.reserve(this.offset + 1);
    this.accessor.setUint8(this.offset, value);
    this.offset += 1;
  }

  write1Signed(value: number) {
    this.reserve(this.offset + 1);
    this.accessor.setInt8(this.offset, value);
    this.offset += 1;
  }

  write2(value: number) {
    this.reserve(this.offset + 2);
    this.accessor.setInt16(this.offset, value, this.endian);
    this.offset += 2;
  }

  write2Unsigned(value: number) {
    this.reserve(this.offset + 2);
    this.accessor.setUint16(this.offset, value, this.endian);
    this.offset += 2;
  }

  write4(value: number) {
    this.reserve(this.offset + 4);
    this.accessor.setInt32(this.offset, value, this.endian);
    this.offset += 4;
  }

  write4Unsigned(value: number) {
    this.reserve(this.offset + 4);
    this.accessor.setUint32(this.offset, value, this.endian);
    this.offset += 4;
  }

  write8(value: bigint) {
    this.reserve(this.offset + 8);
    this.accessor.setBigInt64(this.offset, value, this.endian);
    this.offset += 8;
  }

  write8Unsigned(value: bigint) {
    this.reserve(this.offset + 8);
    this.accessor.setBigUint64(this.offset, value, this.endian);
    this.offset += 8;
  }

  write4Float(value: number) {
    this.reserve(this.offset + 4);
    this.accessor.setFloat32(this.offset, value, this.endian);
    this.offset += 4;
  }

  write8Float(value: number) {
    this.reserve(this.offset + 8);
    this.accessor.setFloat64(this.offset, value, this.endian);
    this.offset += 8;
  }

  writeString(value: string) {
    const data: Uint8Array = ByteBuffer.textEncoder.encode(value);
    const length: number = data.length;
    this.write2Unsigned(length);
    this.write(data, length);
  }
  // END Write

  static copy(
    dst: ArrayBuffer,
    src: ArrayLike<number>,
    offset?: number | undefined
  ) {
    new Uint8Array(dst).set(src, offset);
  }

  toArray(): Uint8Array {
    return new Uint8Array(
      this.accessor.buffer,
      this.accessor.byteOffset,
      this.offset
    );
  }

  shirink() {
    this.accessor = new DataView(
      this.accessor.buffer,
      this.accessor.byteOffset,
      this.offset
    );
  }

  private assertUnderflow(length: number) {
    if (this.accessor.byteLength < length) {
      throw new ByteBufferUnderflowError();
    }
  }

  private reserve(length: number) {
    if (this.accessor.buffer.byteLength < length) {
      const newByteLength: number = Math.max(
        this.accessor.buffer.byteLength << 1,
        length
      );
      const newBuffer = new SharedArrayBuffer(newByteLength);
      const newAccessor = new DataView(newBuffer);
      ByteBuffer.copy(newBuffer, this.toArray());
      this.accessor = newAccessor;
    } else if (this.accessor.byteLength < length) {
      const newAccessor = new DataView(
        this.accessor.buffer,
        this.accessor.byteOffset,
        length
      );
      this.accessor = newAccessor;
    }
  }
}
