export const enum GameServerOpcode {
  HANDSHAKE,
  TEST_ECHO_REQUEST = 42,
}

export const enum GameClientOpcode {
  INITIALIZE,
  TEST_ECHO_RESPONSE = 42,
}
