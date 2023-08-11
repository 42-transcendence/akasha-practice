import { ByteBuffer } from "@libs/byte-buffer";
import { ActiveStatus } from "@prisma/client";
import { NULL_UUID } from "@libs/uuid";

export enum ChatOpCode {
	CONNECT,
	INFO,
	FRIENDS,
	CREATE,
	INVITE,
	JOIN,
	ENTER,
	PUBLIC_SEARCH,
	PART,
	KICK,
	CHAT,
}

export enum ChatMemberModeFlags {
	ADMIN,
	MANAGER,
	NORMAL
}

export enum ChatMessageFlags {

}

export enum ChatRoomMode {
	PUBLIC_PASS,
	PUBLIC_NOPASS,
	PRIVATE_PASS,
	PRIVATE_NOPASS,
}

export enum JoinCode {
	REJCET,
	ACCEPT,
	NEW_JOIN
}

export enum CreatCode {
	CREATER,
	INVITER
}

export enum PartCode {
	ACCEPT,
	PART
}

export enum KickCode {
	ACCEPT,
	REJCET,
	KICK_USER
}

// use Join
export function writeRoomJoinInfo(buf: ByteBuffer, roomJoinInfo: { uuid: string, password: string }): ByteBuffer {
	buf.writeString(roomJoinInfo.uuid);
	buf.writeString(roomJoinInfo.password);
	return buf;
}

export function readRoomJoinInfo(buf: ByteBuffer): { uuid: string, password: string } {
	const uuid = buf.readString();
	const password = buf.readString();
	return {
		uuid,
		password
	};
}

//ChatMessage Type

export type CreateChatMessaage = {
	chatUUID: string,
	content: string,
	modeFalgs: number,
}

export function writeCreateChatMessaage(buf: ByteBuffer, msg: CreateChatMessaage) {
	buf.writeString(msg.chatUUID);
	buf.writeString(msg.content);
	buf.write4Unsigned(msg.modeFalgs);
}

export function readCreateChatMessaage(buf: ByteBuffer): CreateChatMessaage {
	const chatUUID = buf.readString();
	const content = buf.readString();
	const modeFalgs = buf.read4Unsigned();
	return {
		chatUUID,
		content,
		modeFalgs,
	}
}

//ChatRoom Type

export type ChatRoom = {
	uuid: string,
	title: string,
	modeFlags: number,
	password: string,
	limit: number,
};

export function writeChatRoom(buf: ByteBuffer, chatRoom: ChatRoom) {
	buf.writeUUID(chatRoom.uuid);
	buf.writeString(chatRoom.title);
	buf.write4Unsigned(chatRoom.modeFlags);
	buf.writeString(chatRoom.password);
	buf.write4Unsigned(chatRoom.limit);
	return buf;
}

export function readChatRoom(buf: ByteBuffer): ChatRoom {
	return ({
		uuid: buf.readUUID(),
		title: buf.readString(),
		modeFlags: buf.read4Unsigned(),
		password: buf.readString(),
		limit: buf.read4Unsigned()
	});
}

export function writeChatRooms(buf: ByteBuffer, chatRooms: ChatRoom[]) {
	buf.write4Unsigned(chatRooms.length);//room의 갯수
	for (let i = 0; i < chatRooms.length; i++) {
		buf.writeUUID(chatRooms[i].uuid);
		buf.writeString(chatRooms[i].title);
		buf.write4Unsigned(chatRooms[i].modeFlags);
		buf.writeString(chatRooms[i].password);
		buf.write4Unsigned(chatRooms[i].limit);
	}
	return buf;
}

export function readChatRooms(buf: ByteBuffer): ChatRoom[] {
	const size = buf.read4Unsigned();
	const chatRooms: ChatRoom[] = [];
	for (let i = 0; i < size; i++) {
		chatRooms.push({
			uuid: buf.readUUID(),
			title: buf.readString(),
			modeFlags: buf.read4Unsigned(),
			password: buf.readString(),
			limit: buf.read4Unsigned()
		})
	};
	return chatRooms;
}

//Account Type
function getActiveStatusNumber(a: ActiveStatus) {
	switch (a) {
		case ActiveStatus.OFFLINE:
			return 0;
		case ActiveStatus.ONLINE:
			return 1;
		case ActiveStatus.IDLE:
			return 2;
		case ActiveStatus.DO_NOT_DISTURB:
			return 3;
		case ActiveStatus.INVISIBLE:
			return 4;
		case ActiveStatus.GAME:
			return 5;
	}
}

function getActiveStatusFromNumber(n: number): ActiveStatus {
	switch (n) {
		case 0:
			return ActiveStatus.OFFLINE;
		case 1:
			return ActiveStatus.ONLINE;
		case 2:
			return ActiveStatus.IDLE;
		case 3:
			return ActiveStatus.DO_NOT_DISTURB;
		case 4:
			return ActiveStatus.INVISIBLE;
		case 5:
			return ActiveStatus.GAME;
	}
	return ActiveStatus.OFFLINE;
}

export type Account = {
	uuid: string,
	nickName: string | null,
	nickTag: number,
	avatarKey: string | null,
	activeStatus: ActiveStatus,
	activeTimestamp: Date,
	statusMessage: string
}

export function writeAccount(buf: ByteBuffer, account: Account) {
	buf.writeUUID(account.uuid);
	const nickName = account.nickName;
	if (nickName !== null) {
		buf.writeBoolean(true);
		buf.writeString(nickName);
	}
	else {
		buf.writeBoolean(false);
	}
	buf.write4Unsigned(account.nickTag);
	const avatarKey = account.avatarKey;
	if (avatarKey !== null) {
		buf.writeBoolean(true);
		buf.writeString(avatarKey);
	}
	else {
		buf.writeBoolean(false);
	}
	buf.write4Unsigned(getActiveStatusNumber(account.activeStatus));
	buf.writeDate(account.activeTimestamp);
	buf.writeString(account.statusMessage);
	return buf;
}

export function readAccount(buf: ByteBuffer): Account {
	const uuid = buf.readUUID();
	let nickName: string | null = null;
	if (buf.readBoolean()) {
		nickName = buf.readString();
	}
	const nickTag = buf.read4Unsigned();
	let avatarKey: string | null = null;
	if (buf.readBoolean()) {
		avatarKey = buf.readString();
	}
	const activeStatus = getActiveStatusFromNumber(buf.read4Unsigned());
	const activeTimestamp = buf.readDate();
	const statusMessage = buf.readString();
	return ({
		uuid,
		nickName,
		nickTag,
		avatarKey,
		activeStatus,
		activeTimestamp,
		statusMessage
	})
}

export function writeAccounts(buf: ByteBuffer, accounts: Account[]) {
	buf.write4Unsigned(accounts.length) // accounts 갯수
	for (let i = 0; i < accounts.length; i++) {
		buf.writeUUID(accounts[i].uuid);
		const nickName = accounts[i].nickName;
		if (nickName !== null) {
			buf.writeBoolean(true);
			buf.writeString(nickName);
		}
		else {
			buf.writeBoolean(false);
		}
		buf.write4Unsigned(accounts[i].nickTag);
		const avatarKey = accounts[i].avatarKey;
		if (avatarKey !== null) {
			buf.writeBoolean(true);
			buf.writeString(avatarKey);
		}
		else {
			buf.writeBoolean(false);
		}
		buf.write4Unsigned(getActiveStatusNumber(accounts[i].activeStatus));
		buf.writeDate(accounts[i].activeTimestamp);
		buf.writeString(accounts[i].statusMessage);
	}
	return buf;
}

export function readAccounts(buf: ByteBuffer): Account[] {
	const size = buf.read4Unsigned() // accounts 갯수
	const accounts: Account[] = [];
	for (let i = 0; i < size; i++) {
		const uuid = buf.readUUID();
		let nickName: string | null = null;
		if (buf.readBoolean()) {
			nickName = buf.readString();
		}
		const nickTag = buf.read4Unsigned();
		let avatarKey: string | null = null;
		if (buf.readBoolean()) {
			avatarKey = buf.readString();
		}
		const activeStatus = getActiveStatusFromNumber(buf.read4Unsigned());
		const activeTimestamp = buf.readDate();
		const statusMessage = buf.readString();
		accounts.push({
			uuid,
			nickName,
			nickTag,
			avatarKey,
			activeStatus,
			activeTimestamp,
			statusMessage
		})
	}
	return accounts;
}

//MemberWithModeFlags Type
export type MemberWithModeFlags = {
	account: Account,
	modeFalgs: number
}

export function writeMemberWithModeFlags(buf: ByteBuffer, member: MemberWithModeFlags) {
	writeAccount(buf, member.account);
	buf.write4Unsigned(member.modeFalgs);
	return buf;
}

export function readMemberWithModeFlags(buf: ByteBuffer): MemberWithModeFlags {
	const account: Account = readAccount(buf);
	const modeFlags = buf.read4Unsigned();
	return ({
		account: account,
		modeFalgs: modeFlags
	})

}

export function writeMembersWithModeFlags(buf: ByteBuffer, members: MemberWithModeFlags[]) {
	buf.write4Unsigned(members.length); // members의 크기
	for (let i = 0; i < members.length; i++) {
		writeAccounts(buf, [members[i].account]);
		buf.write4Unsigned(members[i].modeFalgs);
	}
	return buf;
}

export function readMembersWithModeFlags(buf: ByteBuffer): MemberWithModeFlags[] {
	const size = buf.read4Unsigned(); // members의 크기
	const members: MemberWithModeFlags[] = [];
	for (let i = 0; i < size; i++) {
		const accounts: Account[] = readAccounts(buf);
		const modeFlags = buf.read4Unsigned();
		members.push({
			account: accounts[0],
			modeFalgs: modeFlags
		})

	}
	return members;
}

//ChatMember Type
export type ChatMembers = {
	chatUUID: string,
	members: MemberWithModeFlags[],
}

export function writeChatMembers(buf: ByteBuffer, chatMembers: ChatMembers) {
	buf.writeUUID(chatMembers.chatUUID);
	writeMembersWithModeFlags(buf, chatMembers.members);
	return buf;
}

export function readChatMembers(buf: ByteBuffer): ChatMembers {
	const chatUUID = buf.readUUID();
	const members: MemberWithModeFlags[] = readMembersWithModeFlags(buf);
	return ({
		chatUUID,
		members,
	});
}

export function writeChatMembersList(buf: ByteBuffer, chatMembersList: ChatMembers[]) {
	buf.write4Unsigned(chatMembersList.length); // chatMembersList의 크기
	for (let i = 0; i < chatMembersList.length; i++) {
		buf.writeUUID(chatMembersList[i].chatUUID);
		writeMembersWithModeFlags(buf, chatMembersList[i].members);
	}
	return buf;
}

export function readChatMembersList(buf: ByteBuffer): ChatMembers[] {
	const size = buf.read4Unsigned(); // chatMembersList의 크기
	const chatMembersList: ChatMembers[] = [];
	for (let i = 0; i < size; i++) {
		const chatUUID = buf.readUUID();
		const members: MemberWithModeFlags[] = readMembersWithModeFlags(buf);
		chatMembersList.push({
			chatUUID,
			members,
		});
	}
	return chatMembersList;
}
//Message

export type Message = {
	id: bigint,
	accountUUID: string,
	content: string,
	modeFlags: number,
	timestamp: Date,
}

export function writeMessages(buf: ByteBuffer, messages: Message[]) {
	buf.write4Unsigned(messages.length); // message의 갯수
	for (let i = 0; i < messages.length; i++) {
		buf.write8Unsigned(messages[i].id);
		buf.write4Unsigned(messages[i].modeFlags);
		//TODO 익명플레그 구현 결정하기
		if (!(messages[i].modeFlags & 4)) {
			buf.writeUUID(messages[i].accountUUID);
		}
		else {
			buf.writeUUID(NULL_UUID);
		}
		buf.writeString(messages[i].content);
		buf.writeDate(messages[i].timestamp);
	}
	return buf;
}

export function readMessages(buf: ByteBuffer): Message[] {
	const size = buf.read4Unsigned(); // message의 갯수
	const messages: Message[] = [];
	for (let i = 0; i < size; i++) {
		const id = buf.read8Unsigned();
		const modeFlags = buf.read4Unsigned();
		const accountUUID = buf.readUUID();
		const content = buf.readString();
		const timestamp = buf.readDate();
		messages.push({
			id,
			accountUUID,
			content,
			modeFlags,
			timestamp
		})
	}
	return messages;
}

export function writeMessage(buf: ByteBuffer, message: Message) {
	buf.write8Unsigned(message.id);
	buf.write4Unsigned(message.modeFlags);
	//TODO 익명플레그 구현 결정하기
	if (!(message.modeFlags & 4)) {
		buf.writeUUID(message.accountUUID);
	}
	else {
		buf.writeUUID(NULL_UUID);
	}
	buf.writeString(message.content);
	buf.writeDate(message.timestamp);
	return buf;
}

export function readMessage(buf: ByteBuffer): Message {
	const id = buf.read8Unsigned();
	const modeFlags = buf.read4Unsigned();
	const accountUUID = buf.readUUID();
	const content = buf.readString();
	const timestamp = buf.readDate();
	return ({
		id,
		accountUUID,
		content,
		modeFlags,
		timestamp
	});
}

//ChatMessages Type
export type ChatMessages = {
	chatUUID: string,
	messages: Message[]
}

export function writeChatMessages(buf: ByteBuffer, chatMessages: ChatMessages) {
	buf.writeUUID(chatMessages.chatUUID);
	writeMessages(buf, chatMessages.messages);
	return buf;
}

export function readChatMessages(buf: ByteBuffer): ChatMessages {
	const chatUUID = buf.readUUID();
	const messages: Message[] = readMessages(buf);
	return ({
		chatUUID,
		messages
	});
}

export function writeChatMessagesList(buf: ByteBuffer, chatMessagesList: ChatMessages[]) {
	buf.write4Unsigned(chatMessagesList.length); // chatMessagesList의 크기
	for (let i = 0; i < chatMessagesList.length; i++) {
		buf.writeUUID(chatMessagesList[i].chatUUID);
		writeMessages(buf, chatMessagesList[i].messages);
	}
	return buf;
}

export function readChatMessagesList(buf: ByteBuffer): ChatMessages[] {
	const size = buf.read4Unsigned(); // chatMessagesList의 크기
	const chatMessagesList: ChatMessages[] = [];
	for (let i = 0; i < size; i++) {
		const chatUUID = buf.readUUID();
		const messages: Message[] = readMessages(buf);
		chatMessagesList.push({
			chatUUID,
			messages
		})
	}
	return chatMessagesList;
}

//CreateChat Type
export type CreateChatInfo = {
	title: string,
	modeFlags: number,
	password: string,
	limit: number,
}
export type CreateChat = {
	chat: CreateChatInfo,
	members: string[]
}

export function writeCreateChat(buf: ByteBuffer, createChat: CreateChat) {
	buf.writeString(createChat.chat.title);
	buf.write4Unsigned(createChat.chat.modeFlags);
	buf.writeString(createChat.chat.password);
	buf.write4Unsigned(createChat.chat.limit);
	buf.write4Unsigned(createChat.members.length);
	for (let i = 0; i < createChat.members.length; i++) {
		buf.writeUUID(createChat.members[i]);
	}
	return buf;
}

export function readCreateChat(buf: ByteBuffer): CreateChat {
	const title = buf.readString();
	const modeFlags = buf.read4Unsigned();
	const password = buf.readString();
	const limit = buf.read4Unsigned();
	const size = buf.read4Unsigned();
	const members: string[] = [];
	for (let i = 0; i < size; i++) {
		members.push(buf.readUUID());
	}
	return {
		chat: {
			title,
			modeFlags,
			password,
			limit,
		},
		members
	};
}

//ChatUUIDAndMemberUUIDS Type
export type ChatUUIDAndMemberUUIDs = {
	chatUUID: string,
	members: string[]
}

export function writeChatUUIDAndMemberUUIDs(buf: ByteBuffer, list: ChatUUIDAndMemberUUIDs) {
	buf.writeString(list.chatUUID);
	buf.write4Unsigned(list.members.length); // list.members의 크기
	for (let i = 0; i < list.members.length; i++) {
		buf.writeString(list.members[i]);
	}
	return buf;
}

export function readChatUUIDAndMemberUUIDs(buf: ByteBuffer): ChatUUIDAndMemberUUIDs {
	const chatUUID = buf.readString();
	const size = buf.read4Unsigned(); // list.members의 크기
	const members: string[] = []
	for (let i = 0; i < size; i++) {
		members.push(buf.readString());
	}
	return {
		chatUUID,
		members
	};
}

//ChatRoomInfo Type

export type RoomInfo = {
	uuid: string;
	title: string;
	modeFlags: number;
	password: string;
	limit: number;
	members: { account: RoomInfoAccount, modeFlags: number }[];
	messages?: RoomInfoMessage[];
}

type RoomInfoAccount = {
	uuid: string,
	nickName: string | null,
	nickTag: number,
	avatarKey: string | null,
	activeStatus: ActiveStatus,
	activeTimestamp: Date,
	statusMessage: string
}

type RoomInfoMessage = {
	id: bigint,
	content: string,
	timestamp: Date,
	modeFlags: number,
	account: {
		uuid: string,
	}
}

//NowChatRoom Type
export type NowChatRoom = {
	chatRoom: ChatRoom | null,
	members: ChatMembers | null,
	messages: ChatMessages | null
}