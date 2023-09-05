import { Frame } from "@/_common/game-payload";

const BALL_RADIUS = 36;
const PADDLE_RADIUS = 80;
const WIDTH = 1000;
const HEIGHT = 1920

function distance(p1: { x: number, y: number }, p2: { x: number, y: number }): number {
	return (Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2))
}

function getNormalVec(ballPos: { x: number, y: number }, paddlePos: { x: number, y: number }): { x: number, y: number } {
	return { x: paddlePos.x - ballPos.x, y: paddlePos.y - ballPos.y };
}

function paddleReflextion(ballV: { x: number, y: number }, normal: { x: number, y: number }) {
	const velocity = { x: ballV.x, y: ballV.y };
	const normalVec = normal;
	if (normalVec.x * velocity.x + normalVec.y * velocity.y >= 0) {
		const theta = Math.atan2(normalVec.y, normalVec.x);
		const alpha = Math.atan2(velocity.y, velocity.x);
		const newVx = velocity.x * Math.cos(2 * theta - 2 * alpha) - velocity.y * Math.sin(2 * theta - 2 * alpha);
		const newVy = velocity.x * Math.sin(2 * theta - 2 * alpha) + velocity.y * Math.cos(2 * theta - 2 * alpha);
		ballV.x = newVx * -1.1;
		ballV.y = newVy * -1.1;
	}
}

function wallReflextion(ballPos: { x: number, y: number }, ballV: { x: number, y: number }) {
	if (ballPos.x < BALL_RADIUS) {
		ballPos.x = BALL_RADIUS;
		ballV.x *= -1;
	} else if (ballPos.x > WIDTH - BALL_RADIUS) {
		ballPos.x = WIDTH - BALL_RADIUS;
		ballV.x *= -1;
	}
}

function limitVelocity(ballV: { x: number, y: number }) {
	//속도제한
	if (ballV.x > 35) {
		ballV.x = 35;
	}
	if (ballV.y > 35) {
		ballV.y = 35;
	}
}

export function getScore(frame: Frame) {
	//점수 겟또
	if (frame.ball.position.y < BALL_RADIUS) {
		frame.player1Score++;
		frame.ball.position.x = WIDTH / 2;
		frame.ball.position.y = HEIGHT / 2;
		frame.ball.velocity.x = -15;
		frame.ball.velocity.y = -15;
	} else if (frame.ball.position.y > HEIGHT - BALL_RADIUS) {
		frame.player2Score++;
		frame.ball.position.x = WIDTH / 2;
		frame.ball.position.y = HEIGHT / 2;
		frame.ball.velocity.x = -15;
		frame.ball.velocity.y = -15;
	}
}

function makeUnitVec(vec: { x: number, y: number }): { x: number, y: number } {
	const vecSize = Math.sqrt(vec.x ** 2 + vec.y ** 2);
	return ({ x: vec.x * -1 / vecSize, y: vec.y * -1 / vecSize });
}

export function copy(dest: { x: number, y: number }, source: { x: number, y: number }) {
	dest.x = source.x;
	dest.y = source.y;
}

export function physicsEngine(frame: Frame) {
	frame.paddle1Hit = false;
	frame.paddle2Hit = false;
	if (distance(frame.ball.position, frame.paddle1.position) <= BALL_RADIUS + PADDLE_RADIUS) {
		const normalVec = getNormalVec(frame.ball.position, frame.paddle1.position);
		const unitVec = makeUnitVec(normalVec);
		frame.ball.position.x = frame.paddle1.position.x + (BALL_RADIUS + PADDLE_RADIUS) * unitVec.x;
		frame.ball.position.y = frame.paddle1.position.y + (BALL_RADIUS + PADDLE_RADIUS) * unitVec.y;
		paddleReflextion(frame.ball.velocity, normalVec);
		frame.paddle1Hit = true;
		frame.ball.velocity.x += frame.paddle1.velocity.x / 8;
		frame.ball.velocity.y += frame.paddle1.velocity.y / 8;
	}
	else if (distance(frame.ball.position, frame.paddle2.position) <= BALL_RADIUS + PADDLE_RADIUS) {
		const normalVec = getNormalVec(frame.ball.position, frame.paddle2.position);
		const unitVec = makeUnitVec(normalVec);
		frame.ball.position.x = frame.paddle2.position.x + (BALL_RADIUS + PADDLE_RADIUS) * unitVec.x;
		frame.ball.position.y = frame.paddle2.position.y + (BALL_RADIUS + PADDLE_RADIUS) * unitVec.y;
		paddleReflextion(frame.ball.velocity, normalVec);
		frame.paddle2Hit = true;
		frame.ball.velocity.x += frame.paddle2.velocity.x / 8;
		frame.ball.velocity.y += frame.paddle2.velocity.y / 8;
	}
	wallReflextion(frame.ball.position, frame.ball.velocity);
	limitVelocity(frame.ball.velocity);
	getScore(frame);
}