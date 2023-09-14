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

const BALL_RADIUS = 36;
const PADDLE_RADIUS = 80;
const GOAL_RADIUS = PADDLE_RADIUS + 8;
const WIDTH = 1000;
const HEIGHT = 1920
const focus = Math.sqrt((HEIGHT / 2) ** 2 - (WIDTH / 2) ** 2);
const focusPos1 = { x: WIDTH / 2, y: (HEIGHT / 2) + focus };
const focusPos2 = { x: WIDTH / 2, y: (HEIGHT / 2) - focus };

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

export function getScore(frame: Frame, field: string) {
	//점수 겟또
	if (field === "normal") {
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
			frame.ball.velocity.x = 15;
			frame.ball.velocity.y = 15;
		}
	}
	else if (field === 'ellipse') {
		if (distance(frame.ball.position, focusPos1) <= GOAL_RADIUS + BALL_RADIUS) {
			frame.player2Score++;
			frame.ball.position.x = WIDTH / 2;
			frame.ball.position.y = HEIGHT / 2;
			frame.ball.velocity.x = 15;
			frame.ball.velocity.y = 15;
		}
		else if (distance(frame.ball.position, focusPos2) <= GOAL_RADIUS + BALL_RADIUS) {
			frame.player1Score++;
			frame.ball.position.x = WIDTH / 2;
			frame.ball.position.y = HEIGHT / 2;
			frame.ball.velocity.x = -15;
			frame.ball.velocity.y = -15;
		}
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

export function physicsEngine(frame: Frame, field: string) {
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
	// if (gravities.length > 0) {
	// 	allAttractive(gravities, frame.ball);
	// }
	// if (field === "ellipse") {
	// 	ellipseReflection(frame.ball)
	// }
	// wallReflextion(frame.ball.position, frame.ball.velocity);
	// limitVelocity(frame.ball.velocity);
	getScore(frame, field);
}


function makePointInEllipse(theta: number): { x: number, y: number } {
	const distance = ((WIDTH / 2) * (HEIGHT / 2)) / (Math.sqrt((((HEIGHT / 2) * Math.cos(theta)) ** 2) + (((WIDTH / 2) * Math.sin(theta)) ** 2)))
	return { x: distance * Math.cos(theta), y: distance * Math.sin(theta) };
}

function determinantNormal(circlePos: { x: number, y: number }, pointInEllipse: { x: number, y: number }): number {
	return (((WIDTH / 2) ** 2) * pointInEllipse.y * (pointInEllipse.x - circlePos.x)) - (((HEIGHT / 2) ** 2) * pointInEllipse.x * (pointInEllipse.y - circlePos.y));
}

function review(circlePos: { x: number, y: number }, pointInEllipse: { x: number, y: number }): number {
	return ((((WIDTH / 2) ** 2) * pointInEllipse.y * (pointInEllipse.x - circlePos.x)) / (((HEIGHT / 2) ** 2) * pointInEllipse.x * (pointInEllipse.y - circlePos.y)));
}

function ellipseInOut(point: { x: number, y: number }) {
	return ((((point.x - WIDTH / 2) ** 2) / ((WIDTH / 2) ** 2)) + (((point.y - HEIGHT / 2) ** 2) / ((HEIGHT / 2) ** 2)));
}

function oneQuadrantLogic(circlePos: { x: number, y: number }): number {
	let upper = Math.PI / 2;
	let lower = 0;
	while (true) {
		const theta = (upper + lower) / 2;
		const pointInEllipse = makePointInEllipse(theta);
		if ((upper - lower) * (180 / Math.PI) < 0.001) {
			const num = review(circlePos, pointInEllipse)
			if (num > 1.1 || num < 0.9) {
				upper = Math.PI * (3 / 4);
				lower = -1 * Math.PI / 4;
			}
			else {
				return theta
			}
		}
		if (determinantNormal(circlePos, pointInEllipse) < 0) {
			upper = theta;
		}
		else if (determinantNormal(circlePos, pointInEllipse) > 0) {
			lower = theta;
		}
		else {
			return theta
		}
	}
}

function ellipseReflection(ball: PhysicsAttribute) {
	const circlePos = { x: ball.position.x - WIDTH / 2, y: ball.position.y - HEIGHT / 2 };
	const normal = { x: 0, y: 0 };
	// x축 대칭
	circlePos.y *= -1;
	if (0 < circlePos.x && 0 < circlePos.y) { // 1사분면
		const theta = oneQuadrantLogic(circlePos);
		const pointInEllipse = makePointInEllipse(theta);
		normal.x = pointInEllipse.x - circlePos.x;
		normal.y = pointInEllipse.y - circlePos.y;
	}
	else if (0 > circlePos.x && 0 < circlePos.y) { // 2사분면
		circlePos.x *= -1;
		const theta = oneQuadrantLogic(circlePos);
		const pointInEllipse = makePointInEllipse(theta);
		normal.x = pointInEllipse.x - circlePos.x;
		normal.y = pointInEllipse.y - circlePos.y;
		normal.x *= -1;
	}
	else if (0 > circlePos.x && 0 > circlePos.y) { // 3사분면
		circlePos.x *= -1;
		circlePos.y *= -1;
		const theta = oneQuadrantLogic(circlePos);
		const pointInEllipse = makePointInEllipse(theta);
		normal.x = pointInEllipse.x - circlePos.x;
		normal.y = pointInEllipse.y - circlePos.y;
		normal.x *= -1;
		normal.y *= -1;
	}
	else if (0 < circlePos.x && 0 > circlePos.y) { // 4사분면
		circlePos.y *= -1;
		const theta = oneQuadrantLogic(circlePos);
		const pointInEllipse = makePointInEllipse(theta);
		normal.x = pointInEllipse.x - circlePos.x;
		normal.y = pointInEllipse.y - circlePos.y;
		normal.y *= -1;
	}
	if (ball.position.y === 0 || ball.position.y === HEIGHT) {
		ball.velocity.y *= -1;
	}
	if (ball.position.x === 0 || ball.position.x === WIDTH) {
		ball.velocity.x *= -1;
	}
	// 다시 x축 대칭!
	normal.y *= -1;

	const inOutCheck = ellipseInOut(ball.position);
	if (Math.sqrt(normal.x ** 2 + normal.y ** 2) <= BALL_RADIUS && inOutCheck < 1) {
		const velocity = ball.velocity;
		if (normal.x * velocity.x + normal.y * velocity.y >= 0) {
			const theta = Math.atan2(normal.y, normal.x);
			const alpha = Math.atan2(velocity.y, velocity.x);
			const newVx = velocity.x * Math.cos(2 * theta - 2 * alpha) - velocity.y * Math.sin(2 * theta - 2 * alpha);
			const newVy = velocity.x * Math.sin(2 * theta - 2 * alpha) + velocity.y * Math.cos(2 * theta - 2 * alpha);
			ball.velocity.x = newVx * -1;
			ball.velocity.y = newVy * -1;
		}
	}
	else if (inOutCheck >= 1) {
		ball.velocity.x += 5 * normal.x;
		ball.velocity.y += 5 * normal.y;
	}
}


function allAttractive(gravities: GravityObj[], ball: PhysicsAttribute) {
	for (let i = 0; i < gravities.length; i++) {
		attractive(gravities[i].pos, ball, gravities[i].force);
	}
}

function attractive(attractiveCenter: { x: number, y: number }, ball: PhysicsAttribute, gravityConstant: number) {
	const normal = { x: attractiveCenter.x - ball.position.x, y: attractiveCenter.y - ball.position.y }
	const distance = Math.sqrt(normal.x * normal.x + normal.y * normal.y);
	const force = { x: gravityConstant * normal.x / (distance * + 1), y: gravityConstant * normal.y / (distance + 1) };
	ball.velocity.x += force.x / 3;
	ball.velocity.y += force.y / 3;
}
