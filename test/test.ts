import { copy, getScore, physicsEngine } from "./game-physics-engine";
import { ByteBuffer } from "./library/byte-buffer"
import * as WebSocket from 'ws';

const field = "ellipse";
const gravitiesObj: GravityObj[] = makeGravitisObj();
// const field = "normal";
// const gravitiesObj: GravityObj[] = []


type PhysicsAttribute = {
	position: { x: number, y: number },
	velocity: { x: number, y: number },
}
type Frame = {
	id: number,
	paddle1: PhysicsAttribute,
	paddle1Hit: boolean,
	paddle2: PhysicsAttribute,
	paddle2Hit: boolean,
	ball: PhysicsAttribute,
	player1Score: number,
	player2Score: number
}

type GravityObj = {
	pos: { x: number, y: number },
	radius: number,
	force: number
}

const enum GameServerOpcode {
	HANDSHAKE,
	CREATE,
	START,
	FRAME
}

const enum GameClientOpcode {
	INITIALIZE,
	ACCEPT,
	REJECT,
	START,
	RESYNC_ALL,
	RESYNC_PART,
	RESYNC_PARTOF,
	SYNC,
	WIN,
	LOSE,
	DRAW
}

function writePhysicsAttribute(payload: ByteBuffer, data: PhysicsAttribute) {
	payload.write4Float(data.position.x);
	payload.write4Float(data.position.y);
	payload.write4Float(data.velocity.x);
	payload.write4Float(data.velocity.y);
}

function writeFrame(payload: ByteBuffer, frame: Frame) {
	payload.write4Unsigned(frame.id);
	writePhysicsAttribute(payload, frame.paddle1);
	payload.writeBoolean(frame.paddle1Hit);
	writePhysicsAttribute(payload, frame.paddle2);
	payload.writeBoolean(frame.paddle2Hit);
	writePhysicsAttribute(payload, frame.ball);
	payload.write1(frame.player1Score);
	payload.write1(frame.player2Score);
}

function writeFrames(payload: ByteBuffer, frames: Frame[]) {
	payload.write2Unsigned(frames.length);
	for (let i = 0; i < frames.length; i++) {
		writeFrame(payload, frames[i]);
	}
}

function readPhysicsAttribute(payload: ByteBuffer): PhysicsAttribute {
	const posX = payload.read4Float();
	const posY = payload.read4Float();
	const velocX = payload.read4Float();
	const velocY = payload.read4Float();
	return { position: { x: posX, y: posY }, velocity: { x: velocX, y: velocY } };
}

function readFrame(payload: ByteBuffer): Frame {
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

function readFrames(payload: ByteBuffer): Frame[] {
	const size = payload.read2Unsigned();
	const frames: Frame[] = []
	for (let i = 0; i < size; i++) {
		frames.push(readFrame(payload));
	}
	return frames;
}

function readFrameWithoutBall(payload: ByteBuffer): Frame {
	const id = payload.read4Unsigned();
	const paddle1 = readPhysicsAttribute(payload);
	const paddle1Hit = payload.readBoolean();
	const paddle2 = readPhysicsAttribute(payload);
	const paddle2Hit = payload.readBoolean();
	const ball: PhysicsAttribute = { position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 } }
	const player1Score = payload.read1();
	const player2Score = payload.read1();
	return { id, paddle1, paddle1Hit, paddle2, paddle2Hit, ball, player1Score, player2Score };
}

function readFramesWithoutBall(payload: ByteBuffer): Frame[] {
	const size = payload.read2Unsigned();
	const frames: Frame[] = []
	for (let i = 0; i < size; i++) {
		frames.push(readFrameWithoutBall(payload));
	}
	return frames;
}
const Frames: { fixed: boolean, frame: Frame }[] = [];

function getFrame(client: WebSocket, clients: Set<WebSocket>, payload: ByteBuffer) {
	const player: number = payload.read1();
	const frame: Frame = readFrame(payload);
	if (Frames.length === 0) {
		Frames.push({ fixed: false, frame })
	}
	else {
		if (Frames[Frames.length - 1].frame.id < frame.id) {
			Frames.push({ fixed: false, frame: frame });
		}
		else {
			const resyncFrames: { allSync: boolean, frames: Frame[] } = syncFrame(player, Frames, frame, field, gravitiesObj);
			if (resyncFrames.allSync === true) {
				const buf = ByteBuffer.createWithOpcode(GameClientOpcode.RESYNC_ALL);
				writeFrames(buf, resyncFrames.frames);
				for (const _clinet of clients) {
					_clinet.send(buf.toArray());
				}
			}
			else if (resyncFrames.allSync === false) {
				const buf = ByteBuffer.createWithOpcode(GameClientOpcode.RESYNC_PART);
				writeFrames(buf, resyncFrames.frames);
				for (const _clinet of clients) {
					_clinet.send(buf.toArray());
				}
			}
			let count = 0;
			for (; count < Frames.length; count++) {
				if (Frames[count].fixed === false) {
					break;
				}
			}
			Frames.splice(0, count);
		}
	}
}

function ballDiffCheck(ball1: PhysicsAttribute, ball2: PhysicsAttribute): boolean {
	if (Math.abs(ball1.position.x - ball2.position.x) > 50) {
		return false;
	}
	if (Math.abs(ball1.position.y - ball2.position.y) > 50) {
		return false;
	}
	return true;
}

function syncFrame(player: number, frames: { fixed: boolean, frame: Frame }[], frame: Frame, field: string, gravities: GravityObj[]): {
	allSync: boolean, frames: Frame[]
} {
	const sendFrames: Frame[] = [];
	const velocity = { x: 0, y: 0 };
	const prevPos = { x: 0, y: 0 };
	const ball: PhysicsAttribute = { position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 } }
	let tempFrmae: Frame | undefined = undefined;
	for (let i = 0; i < frames.length; i++) {
		if (frames[i].frame.id === frame.id) {
			frames[i].fixed == true;
			//프레임 패들 위치 속도 병합
			if (player === 1) {
				frames[i].frame.paddle1 = frame.paddle1;
				copy(velocity, frame.paddle1.velocity);
				copy(prevPos, frame.paddle1.position);
			}
			else {
				frames[i].frame.paddle2 = frame.paddle2;
				copy(velocity, frame.paddle2.velocity);
				copy(prevPos, frame.paddle2.position);
			}
			//프레임 공의 위치 속도 병합
			if (frame.paddle1Hit === true || frame.paddle2Hit === true) {
				frames[i].frame.ball = frame.ball;
			}
			copy(ball.velocity, frames[i].frame.ball.velocity);
			copy(ball.position, frames[i].frame.ball.position);
			physicsEngine(frames[i].frame, field, []);
			sendFrames.push(frames[i].frame);
			tempFrmae = frames[i].frame;
		}
		else if (frames[i].frame.id > frame.id) {
			break;
			prevPos.x += velocity.x;
			prevPos.y += velocity.y;
			if (player === 1) {
				copy(frames[i].frame.paddle1.position, prevPos);
				copy(frames[i].frame.paddle1.velocity, velocity);
			}
			else {
				copy(frames[i].frame.paddle2.position, prevPos);
				copy(frames[i].frame.paddle2.velocity, velocity);
			}
			ball.position.x += ball.velocity.x;
			ball.position.y += ball.velocity.y;
			copy(frames[i].frame.ball.position, ball.position);
			copy(frames[i].frame.ball.velocity, ball.velocity);
			// 자체 물리엔진 적용!
			physicsEngine(frames[i].frame, field, gravities);
			if (player === 1) {
				copy(prevPos, frames[i].frame.paddle1.position);
				copy(velocity, frames[i].frame.paddle1.velocity);
			}
			else {
				copy(prevPos, frames[i].frame.paddle2.position);
				copy(velocity, frames[i].frame.paddle2.velocity);
			}
			sendFrames.push(frames[i].frame);
		}
	}
	if (tempFrmae !== undefined && (tempFrmae.paddle1Hit === false && tempFrmae.paddle2Hit === false) && (tempFrmae.player1Score === frame.player1Score && tempFrmae.player2Score === frame.player2Score) && ballDiffCheck(tempFrmae.ball, frame.ball) === true) {
		return { allSync: false, frames: sendFrames };
	}
	return ({ allSync: true, frames: sendFrames });
}

function makeRandom(min: number, max: number): number {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function makeGravitisObj(): GravityObj[] {
	const gravities: GravityObj[] = [];
	gravities.push({ pos: { x: makeRandom(100, 900), y: makeRandom(200, 960) }, radius: makeRandom(40, 50), force: makeRandom(1, 5) / 6 });
	gravities.push({ pos: { x: makeRandom(100, 900), y: makeRandom(960, 1770) }, radius: makeRandom(30, 40), force: makeRandom(1, 5) / 8 });
	return gravities;
}


let count = 0;
const express = require('express');
const app = express();

app.use("/", (req: any, res: any) => { })

// 3. 30001 port에서 서버 구동
const HTTPServer = app.listen(3002, () => {
	console.log("Server is open at port:3002");
});

const wsModule = require('ws');

// 2. WebSocket 서버 생성/구동
const webSocketServer = new wsModule.Server(
	{
		server: HTTPServer, // WebSocket서버에 연결할 HTTP서버를 지정한다.
		// port: 30002 // WebSocket연결에 사용할 port를 지정한다(생략시, http서버와 동일한 port 공유 사용)
	}
);

webSocketServer.on('connection', (ws: any, request: any) => {


	// 2) 클라이언트에게 메시지 전송
	if (ws.readyState === ws.OPEN) { // 연결 여부 체크
		count++;
	}

	if (count == 2) {
		for (const ws of webSocketServer.clients) {
			const buf = ByteBuffer.createWithOpcode(GameClientOpcode.START);
			buf.writeString(field)
			buf.writeString(JSON.stringify(gravitiesObj));
			ws.send(buf.toArray());
		}
		count = 0;
	}

	// 3) 클라이언트로부터 메시지 수신 이벤트 처리
	ws.on('message', (msg: any) => {
		const payload = ByteBuffer.from(msg);
		const opcode = payload.readOpcode();
		if (opcode === GameServerOpcode.FRAME) {
			getFrame(ws, webSocketServer.clients, payload);
		}
	})

	// 4) 에러 처러
	ws.on('error', (error: any) => {
	})

	// 5) 연결 종료 이벤트 처리
	ws.on('close', () => {
		Frames.splice(0, Frames.length);
	})
});