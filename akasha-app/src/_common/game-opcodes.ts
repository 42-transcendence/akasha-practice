export const enum GameServerOpcode {
  HANDSHAKE,
  CREATE,
  START,
  JOIN,
  FRAME
}

export const enum GameClientOpcode {
  INITIALIZE,
  ACCEPT,
  REJECT,
  START,
  RESYNC,
  SYNC,
  WIN,
  LOSE,
  DRAW
}
