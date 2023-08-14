import { toHexString } from "./hex";
import {
  InvalidUUIDError,
  parseUUID,
  stringifyUUID,
  validateUUID,
} from "./uuid";

export class ByteBufferUnderflowError extends Error {
  override get name() {
    return "ByteBufferUnderflowError";
  }

  get [Symbol.toStringTag]() {
    return this.name;
  }
}

export type ReadonlyUint8Array = Omit<
  Readonly<Uint8Array>,
  "copyWithin" | "fill" | "reverse" | "set" | "sort"
>;

const isDefined_SharedArrayBuffer_: boolean =
  typeof SharedArrayBuffer === "function";

export class ByteBuffer {
  private static readonly TEXT_ENCODER: TextEncoder = new TextEncoder();
  private static readonly TEXT_DECODER: TextDecoder = new TextDecoder();

  private static readonly SMART_ACTION: Record<
    string,
    (buf: ByteBuffer, value: string) => any
  > = {
    ["O"]: (buf, value) => buf.writeOpcode(Number(value)),
    ["1"]: (buf, value) => buf.write1Signed(Number(value)),
    ["B"]: (buf, value) => buf.write1(Number(value)),
    ["2"]: (buf, value) => buf.write2(Number(value)),
    ["W"]: (buf, value) => buf.write2Unsigned(Number(value)),
    ["4"]: (buf, value) => buf.write4(Number(value)),
    ["D"]: (buf, value) => buf.write4Unsigned(Number(value)),
    ["8"]: (buf, value) => buf.write8(BigInt(value)),
    ["Q"]: (buf, value) => buf.write8Unsigned(BigInt(value)),
    ["f"]: (buf, value) => buf.write4Float(Number(value)),
    ["d"]: (buf, value) => buf.write8Float(Number(value)),
    ["S"]: (buf, value) => buf.writeString(value),
    ["t"]: (buf, value) => buf.writeDate(new Date(Date.now() + Number(value))),
    ["T"]: (buf, value) => buf.writeDate(new Date(value)),
    ["U"]: (buf, value) => buf.writeUUID(value),
  };
  private static readonly SMART_REGEX = new RegExp(
    `([${Object.keys(ByteBuffer.SMART_ACTION).join("|")}]){(.*?)}`,
    "g"
  );

  accessor: DataView;
  offset: number;
  endian: boolean;

  private constructor(accessor: DataView, endian?: boolean | undefined) {
    this.accessor = accessor;
    this.offset = 0;
    this.endian = endian ?? true;
  }

  static create(
    length: number = 128,
    endian?: boolean | undefined
  ): ByteBuffer {
    const buffer: ArrayBuffer = isDefined_SharedArrayBuffer_
      ? new SharedArrayBuffer(length)
      : new ArrayBuffer(length);
    const accessor = new DataView(buffer);
    return new ByteBuffer(accessor, endian);
  }

  static createWithOpcode(
    opcode: number,
    length?: number | undefined,
    endian?: boolean | undefined
  ): ByteBuffer {
    const result = ByteBuffer.create(length, endian);
    result.writeOpcode(opcode);
    return result;
  }

  static from(buffer: ArrayBuffer, endian?: boolean | undefined): ByteBuffer;
  static from(
    buffer: SharedArrayBuffer,
    endian?: boolean | undefined
  ): ByteBuffer;
  static from(array: Uint8Array, endian?: boolean | undefined): ByteBuffer;

  static from(
    arrayOrBuffer: ArrayBuffer | SharedArrayBuffer | Uint8Array,
    endian?: boolean | undefined
  ): ByteBuffer {
    const accessor =
      "buffer" in arrayOrBuffer
        ? new DataView(
            arrayOrBuffer.buffer,
            arrayOrBuffer.byteOffset,
            arrayOrBuffer.byteLength
          )
        : new DataView(arrayOrBuffer);
    return new ByteBuffer(accessor, endian);
  }

  static fromSmartBufferString(smart: string): ByteBuffer {
    const buffer = ByteBuffer.create();
    const it = smart.matchAll(ByteBuffer.SMART_REGEX);
    for (const [, key, value] of it) {
      const action = ByteBuffer.SMART_ACTION[key];
      if (action !== undefined) {
        action(buffer, value);
      }
    }
    return buffer;
  }

  seek(offset: number): void {
    this.assertUnderflow(offset);
    this.offset = offset;
  }

  // BEGIN Read
  read(length: number): ReadonlyUint8Array {
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

  readOpcode(): number {
    return this.read2Unsigned();
  }

  readLength(): number {
    return this.read2Unsigned();
  }

  readBoolean(): boolean {
    const data: number = this.read1();
    const value: boolean = data !== 0;
    return value;
  }

  readString(): string {
    const length: number = this.readLength();
    const data: ReadonlyUint8Array = this.read(length);
    const value = ByteBuffer.TEXT_DECODER.decode(data);
    return value;
  }

  readDate(): Date {
    const time: bigint = this.read8();
    const value: Date = new Date(Number(time));
    return value;
  }

  readUUID(): string {
    const data: ReadonlyUint8Array = this.read(16);
    const value = stringifyUUID(data as Readonly<Uint8Array>);
    return value;
  }
  // END Read

  // BEGIN Write
  write(value: Uint8Array, length: number): this {
    this.reserve(this.offset + length);
    ByteBuffer.copy(
      this.accessor.buffer,
      value,
      this.accessor.byteOffset + this.offset
    );
    this.offset += length;
    return this;
  }

  write1(value: number): this {
    this.reserve(this.offset + 1);
    this.accessor.setUint8(this.offset, value);
    this.offset += 1;
    return this;
  }

  write1Signed(value: number): this {
    this.reserve(this.offset + 1);
    this.accessor.setInt8(this.offset, value);
    this.offset += 1;
    return this;
  }

  write2(value: number): this {
    this.reserve(this.offset + 2);
    this.accessor.setInt16(this.offset, value, this.endian);
    this.offset += 2;
    return this;
  }

  write2Unsigned(value: number): this {
    this.reserve(this.offset + 2);
    this.accessor.setUint16(this.offset, value, this.endian);
    this.offset += 2;
    return this;
  }

  write4(value: number): this {
    this.reserve(this.offset + 4);
    this.accessor.setInt32(this.offset, value, this.endian);
    this.offset += 4;
    return this;
  }

  write4Unsigned(value: number): this {
    this.reserve(this.offset + 4);
    this.accessor.setUint32(this.offset, value, this.endian);
    this.offset += 4;
    return this;
  }

  write8(value: bigint): this {
    this.reserve(this.offset + 8);
    this.accessor.setBigInt64(this.offset, value, this.endian);
    this.offset += 8;
    return this;
  }

  write8Unsigned(value: bigint): this {
    this.reserve(this.offset + 8);
    this.accessor.setBigUint64(this.offset, value, this.endian);
    this.offset += 8;
    return this;
  }

  write4Float(value: number): this {
    this.reserve(this.offset + 4);
    this.accessor.setFloat32(this.offset, value, this.endian);
    this.offset += 4;
    return this;
  }

  write8Float(value: number): this {
    this.reserve(this.offset + 8);
    this.accessor.setFloat64(this.offset, value, this.endian);
    this.offset += 8;
    return this;
  }

  writeOpcode(value: number): this {
    return this.write2Unsigned(value);
  }

  writeLength(value: number): this {
    return this.write2Unsigned(value);
  }

  writeBoolean(value: boolean): this {
    const data: number = value ? 1 : 0;
    this.write1(data);
    return this;
  }

  writeString(value: string): this {
    const data: Uint8Array = ByteBuffer.TEXT_ENCODER.encode(value);
    const length: number = data.length;
    this.writeLength(length);
    this.write(data, length);
    return this;
  }

  writeDate(value: Date): this {
    const time: bigint = BigInt(value.getTime());
    this.write8(time);
    return this;
  }

  writeUUID(value: string): this {
    if (!validateUUID(value)) {
      throw new InvalidUUIDError();
    }
    const data: Uint8Array = parseUUID(value);
    this.write(data, 16);
    return this;
  }
  // END Write

  static copy(
    dst: ArrayBuffer,
    src: ArrayLike<number>,
    offset?: number | undefined
  ): void {
    new Uint8Array(dst).set(src, offset);
  }

  toArray(): Uint8Array {
    return new Uint8Array(
      this.accessor.buffer,
      this.accessor.byteOffset,
      this.offset
    );
  }

  shirink(): void {
    this.accessor = new DataView(
      this.accessor.buffer,
      this.accessor.byteOffset,
      this.offset
    );
  }

  toString(): string {
    return toHexString(
      new Uint8Array(
        this.accessor.buffer,
        this.accessor.byteOffset,
        this.offset
      ),
      "-"
    ).toUpperCase();
  }

  toDumpString(): string {
    return toHexString(
      new Uint8Array(this.accessor.buffer, this.accessor.byteOffset),
      "-"
    ).toUpperCase();
  }

  private assertUnderflow(length: number): void {
    if (this.accessor.byteLength < length) {
      throw new ByteBufferUnderflowError();
    }
  }

  private reserve(length: number): void {
    if (this.accessor.buffer.byteLength < length) {
      const newByteLength: number = Math.max(
        this.accessor.buffer.byteLength << 1,
        length
      );
      const newBuffer =
        isDefined_SharedArrayBuffer_ &&
        this.accessor.buffer instanceof SharedArrayBuffer
          ? new SharedArrayBuffer(newByteLength)
          : new ArrayBuffer(newByteLength);
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
