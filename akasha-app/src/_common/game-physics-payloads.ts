import type { ByteBuffer } from "akasha-lib";

export type Vector2 = { x: number; y: number };

export function vec_distance(v1: Vector2, v2: Vector2): number {
  return Math.sqrt((v1.x - v2.x) ** 2 + (v1.y - v2.y) ** 2);
}

export function vec_normalize(v1: Vector2, v2: Vector2): Vector2 {
  return { x: v2.x - v1.x, y: v2.y - v1.y };
}

export function vec_unit(v: Vector2): Vector2 {
  const vecSize = Math.sqrt(v.x ** 2 + v.y ** 2);
  return { x: (v.x * -1) / vecSize, y: (v.y * -1) / vecSize };
}

export const BALL_RADIUS = 36;
export const PADDLE_RADIUS = 80;
export const GOAL_RADIUS = PADDLE_RADIUS + 8;
export const WIDTH = 1000;
export const HEIGHT = 1920;
export const FOCUS = Math.sqrt((HEIGHT / 2) ** 2 - (WIDTH / 2) ** 2);
export const FOCUS_POS1 = { x: WIDTH / 2, y: HEIGHT / 2 + FOCUS };
export const FOCUS_POS2 = { x: WIDTH / 2, y: HEIGHT / 2 - FOCUS };

export type PhysicsAttribute = {
  position: Vector2;
  velocity: Vector2;
};

export type Frame = {
  id: number;
  paddle1: PhysicsAttribute;
  paddle1Hit: boolean;
  paddle2: PhysicsAttribute;
  paddle2Hit: boolean;
  ball: PhysicsAttribute;
};

export type GravityObj = {
  pos: Vector2;
  radius: number;
  force: number;
};

export function writeGravityObj(data: GravityObj, payload: ByteBuffer) {
  payload.write4Float(data.pos.x);
  payload.write4Float(data.pos.y);
  payload.write4Unsigned(data.radius);
  payload.write4Float(data.force);
}

export function writeGravityObjs(data: GravityObj[], payload: ByteBuffer) {
  payload.write2Unsigned(data.length);
  for (let i = 0; i < data.length; i++) {
    writeGravityObj(data[i], payload);
  }
}

export function readGravityObj(payload: ByteBuffer): GravityObj {
  const x = payload.read4Float();
  const y = payload.read4Float();
  const pos = { x, y };
  const radius = payload.read4Unsigned();
  const force = payload.read4Float();
  return { pos, radius, force };
}

export function readGravityObjs(payload: ByteBuffer): GravityObj[] {
  const size = payload.read2Unsigned();
  const gravityObjs: GravityObj[] = [];
  for (let i = 0; i < size; i++) {
    gravityObjs.push(readGravityObj(payload));
  }
  return gravityObjs;
}

export function writePhysicsAttribute(
  data: PhysicsAttribute,
  payload: ByteBuffer,
) {
  payload.write4Float(data.position.x);
  payload.write4Float(data.position.y);
  payload.write4Float(data.velocity.x);
  payload.write4Float(data.velocity.y);
}

export function writeFrame(frame: Frame, payload: ByteBuffer) {
  payload.write2Unsigned(frame.id);
  writePhysicsAttribute(frame.paddle1, payload);
  payload.writeBoolean(frame.paddle1Hit);
  writePhysicsAttribute(frame.paddle2, payload);
  payload.writeBoolean(frame.paddle2Hit);
  writePhysicsAttribute(frame.ball, payload);
}

export function writeFrames(frames: Frame[], payload: ByteBuffer) {
  payload.write2Unsigned(frames.length);
  for (let i = 0; i < frames.length; i++) {
    writeFrame(frames[i], payload);
  }
}

export function readPhysicsAttribute(payload: ByteBuffer): PhysicsAttribute {
  const posX = payload.read4Float();
  const posY = payload.read4Float();
  const velocX = payload.read4Float();
  const velocY = payload.read4Float();
  return {
    position: { x: posX, y: posY },
    velocity: { x: velocX, y: velocY },
  };
}

export function readFrame(payload: ByteBuffer): Frame {
  const id = payload.read2Unsigned();
  const paddle1 = readPhysicsAttribute(payload);
  const paddle1Hit = payload.readBoolean();
  const paddle2 = readPhysicsAttribute(payload);
  const paddle2Hit = payload.readBoolean();
  const ball = readPhysicsAttribute(payload);
  return {
    id,
    paddle1,
    paddle1Hit,
    paddle2,
    paddle2Hit,
    ball,
  };
}

export function readFrames(payload: ByteBuffer): Frame[] {
  const size = payload.read2Unsigned();
  const frames: Frame[] = [];
  for (let i = 0; i < size; i++) {
    frames.push(readFrame(payload));
  }
  return frames;
}

export function readFrameWithoutBall(payload: ByteBuffer): Frame {
  const id = payload.read2Unsigned();
  const paddle1 = readPhysicsAttribute(payload);
  const paddle1Hit = payload.readBoolean();
  const paddle2 = readPhysicsAttribute(payload);
  const paddle2Hit = payload.readBoolean();
  const ball: PhysicsAttribute = {
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
  };
  return {
    id,
    paddle1,
    paddle1Hit,
    paddle2,
    paddle2Hit,
    ball,
  };
}

export function readFramesWithoutBall(payload: ByteBuffer): Frame[] {
  const size = payload.read2Unsigned();
  const frames: Frame[] = [];
  for (let i = 0; i < size; i++) {
    frames.push(readFrameWithoutBall(payload));
  }
  return frames;
}
