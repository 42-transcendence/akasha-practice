export const NICK_NAME_PATTERN = "[a-zA-Z0-9가-힣]{2,8}";
export const MIN_NICK_TAG_NUMBER = 1000;
export const MAX_NICK_TAG_NUMBER = 9999;
export const AVATAR_FORM_DATA_KEY = "avatar";
export const AVATAR_MIME_TYPE = "image/webp";
export const AVATAR_LIMIT = 1 * 1024 * 1024; //NOTE: 1MB
export const MAX_GAME_HISTORY = 10;

export const NICK_NAME_REGEX = new RegExp(`^${NICK_NAME_PATTERN}$`);
export const AVATAR_MIME_REGEX = new RegExp(`^${AVATAR_MIME_TYPE}$`);
