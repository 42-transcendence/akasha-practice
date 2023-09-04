export type PhysicsAttribute = {
	position: { x: number, y: number },
	velocity: { x: number, y: number },
}
export type Frame = {
	id: number,
	paddle1: PhysicsAttribute,
	paddle1Hit: boolean,
	paddle2: PhysicsAttribute,
	paddle2Hit: boolean,
	ball: PhysicsAttribute,
	player1Score: number,
	player2Score: number
}
