export enum GameServerOpcode {
  HANDSHAKE,
  TEST_ECHO_REQUEST = 42,
}

export enum GameClientOpcode {
  INITIALIZE,
  TEST_ECHO_RESPONSE = 42,
}
