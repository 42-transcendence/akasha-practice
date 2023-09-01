export const NICK_NAME_PATTERN = "[a-zA-Z0-9가-힣]{2,8}";

export const NICK_NAME_REGEX = new RegExp(`^${NICK_NAME_PATTERN}$`);
