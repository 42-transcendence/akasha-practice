import { Frame, PhysicsAttribute } from "@/_common/game-payload";
import { ByteBuffer } from "akasha-lib";

export function writePhysicsAttribute(payload: ByteBuffer, data: PhysicsAttribute) {
	payload.write4(data.position.x);
	payload.write4(data.position.y);
	payload.write8Float(data.velocity.x);
	payload.write8Float(data.velocity.y);
}

export function writeFrame(payload: ByteBuffer, frame: Frame) {
	payload.write4Unsigned(frame.id);
	writePhysicsAttribute(payload, frame.paddle1);
	payload.writeBoolean(frame.paddle1Hit);
	writePhysicsAttribute(payload, frame.paddle2);
	payload.writeBoolean(frame.paddle2Hit);
	writePhysicsAttribute(payload, frame.ball);
	payload.write1(frame.player1Score);
	payload.write1(frame.player2Score);
}

export function writeFrames(payload: ByteBuffer, frames: Frame[]) {
	payload.write4Unsigned(frames.length);
	for (let i = 0; i < frames.length; i++) {
		writeFrame(payload, frames[i]);
	}
}

export function readPhysicsAttribute(payload: ByteBuffer): PhysicsAttribute {
	const posX = payload.read4();
	const posY = payload.read4();
	const velocX = payload.read8Float();
	const velocY = payload.read8Float();
	return { position: { x: posX, y: posY }, velocity: { x: velocX, y: velocY } };
}

export function readFrame(payload: ByteBuffer): Frame {
	const id = payload.read4Unsigned();
	const paddle1 = readPhysicsAttribute(payload);
	const paddle1Hit = payload.readBoolean();
	const paddle2 = readPhysicsAttribute(payload);
	const paddle2Hit = payload.readBoolean();
	const ball = readPhysicsAttribute(payload);
	const player1Score = payload.read1();
	const player2Score = payload.read1();
	return { id, paddle1, paddle1Hit, paddle2, paddle2Hit, ball, player1Score, player2Score };
}

export function readFrames(payload: ByteBuffer): Frame[] {
	const size = payload.read4Unsigned();
	const frames: Frame[] = []
	for (let i = 0; i < size; i++) {
		frames.push(readFrame(payload));
	}
	return frames;
}