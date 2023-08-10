import { ByteBuffer } from "@libs/byte-buffer";
import { $Enums, Prisma } from "@prisma/client";
import { ChatMemberEntity } from "src/generated/model";
import { NULL_UUID } from "@libs/uuid";
import { ChatWebSocket } from "../chat-socket";

export enum ChatOpCode {
	Connect,
	Friends,
	Rooms,
	Create,
	Invite,
	Join,
	Enter,
	PublicSearch,
	Part,
	Kick,
	Chat,
}

export enum ChatMemberModeFlags {
	Admin,
	Manager,
	Normal
}

export enum ChatMessageFlags {

}

export enum ChatRoomMode {
	PublicPass,
	PublicNoPass,
	PrivatePass,
	PrivateNoPass,
}

export enum JoinCode {
	Reject,
	Accept,
	NewJoin
}

export enum CreatCode {
	Creater,
	Inviter
}

export enum PartCode {
	Accept,
	Part
}

export enum KickCode {
	Accept,
	Reject,
	KickUser
}

//utils

export function CreateChatMemberArray(chatRoomId: number, memberList: number[]): ChatMemberEntity[] {
	const arr: ChatMemberEntity[] = [];
	for (let i of memberList)
		arr.push({ chatId: chatRoomId, accountId: i, modeFlags: ChatMemberModeFlags.Normal });
	return arr;
}


export function addRoomsInClientSocket(client: ChatWebSocket, rooms: ChatWithoutId[]) {
	for (let room of rooms) {
		for (let member of room.members) {
			if (member.account.uuid == client.userUUID)
				client.rooms.push({ roomUUID: room.uuid, modeFlags: member.modeFlags });
		}
	}
}

export function deleteRoomInClientSocket(client: ChatWebSocket, roomUUID: string) {
	for (let i = 0; i < client.rooms.length; ++i) {
		if (client.rooms[i].roomUUID == roomUUID)
			client.rooms.splice(i, 1);
	}
}

interface member {
	account: {
		uuid: string,
		avatarKey: string | null
	};
	modeFlags: number;
}

export function removeUser(members: ChatMemberWithChatUuid[] | member[], userUUID: string) {
	for (let i = 0; i < members.length; ++i) {
		if (members[i].account.uuid == userUUID) {
			members.splice(i, 1);
			break;
		}
	}
}

//chatWhitoutIdUuid

const chatWhitoutIdUuid = Prisma.validator<Prisma.ChatDefaultArgs>()({
	select: {
		title: true,
		modeFlags: true,
		password: true,
		limit: true
	},
});
export type ChatWithoutIdUuid = Prisma.ChatGetPayload<typeof chatWhitoutIdUuid>

export function writeChatAndMemebers(buf: ByteBuffer, room: ChatWithoutIdUuid, members: string[]): ByteBuffer {
	buf.write4Unsigned(room.modeFlags);
	buf.write4Unsigned(room.limit);
	buf.writeString(room.title);
	buf.writeString(room.password);
	buf.write2Unsigned(members.length);
	for (let member of members)
		buf.writeString(member)
	return buf;
}

export function readChatAndMemebers(buf: ByteBuffer): { chat: ChatWithoutIdUuid, members: string[] } {
	const modeFlags = buf.read4Unsigned();
	const limit = buf.read4Unsigned();
	const title = buf.readString();
	const password = buf.readString();
	const membersSize = buf.read2Unsigned();
	const members: string[] = [];
	for (let i = 0; i < membersSize; ++i)
		members.push(buf.readString());
	return {
		chat: {
			modeFlags,
			limit,
			title,
			password,
		},
		members
	}
}

//chatWhitoutId

const chatWhitoutId = Prisma.validator<Prisma.ChatDefaultArgs>()({
	select: {
		uuid: true,
		title: true,
		modeFlags: true,
		password: true,
		limit: true,
		// _count: {
		// 	select: {
		// 		members: true,
		// 	}
		// },
		members: {
			select: {
				account: {
					select: {
						uuid: true,
						avatarKey: true
					}
				},
				modeFlags: true
			},
			orderBy: {
				accountId: 'asc'
			},
		},
		messages: {
			select: {
				id: true,
				account: {
					select: {
						uuid: true,
					}
				},
				content: true,
				timestamp: true,
				modeFlags: true,
			},
			orderBy: {
				id: 'desc'
			},
			take: 1
		}
	},
});
export type ChatWithoutId = Prisma.ChatGetPayload<typeof chatWhitoutId>

export function writeChat(buf: ByteBuffer, room: ChatWithoutId): ByteBuffer {
	buf.writeString(room.uuid);
	buf.write4Unsigned(room.modeFlags);
	buf.write4Unsigned(room.limit);
	buf.writeString(room.title);
	buf.writeString(room.password);
	writeChatMessage(buf, room.messages[0]);
	writeAccountInChats(buf, room.members);
	return buf;
}

export function wrtieChats(buf: ByteBuffer, rooms: ChatWithoutId[]): ByteBuffer {
	buf.write2Unsigned(rooms.length);
	for (let room of rooms) {
		buf.writeString(room.uuid);
		buf.write4Unsigned(room.modeFlags);
		buf.write4Unsigned(room.limit);
		buf.writeString(room.title);
		buf.writeString(room.password);
		writeChatMessage(buf, room.messages[0]);
		writeAccountInChats(buf, room.members);
	}
	return buf;
}

export function readChat(buf: ByteBuffer): ChatWithoutId {
	const uuid = buf.readString();
	const modeFlags = buf.read4Unsigned();
	const limit = buf.read4Unsigned();
	const title = buf.readString();
	const password = buf.readString();
	const message = readChatMessage(buf);
	const members = readAccountInChats(buf);
	return {
		uuid,
		modeFlags,
		limit,
		title,
		password,
		members: members,
		messages: [message]
	}
}

export function readChats(buf: ByteBuffer): ChatWithoutId[] {
	const size = buf.read2Unsigned();
	const rooms: ChatWithoutId[] = [];
	for (let i = 0; i < size; ++i) {
		rooms.push({
			uuid: buf.readString(),
			modeFlags: buf.read4Unsigned(),
			limit: buf.read4Unsigned(),
			title: buf.readString(),
			password: buf.readString(),
			messages: [readChatMessage(buf)],
			members: readAccountInChats(buf)
		})
	}
	return rooms;
}

export class accountInChat {
	account: { uuid: string, avatarKey: string | null };
	modeFlags: number;
}

function writeAccountInChats(buf: ByteBuffer, accounts: accountInChat[]) {
	buf.write2Unsigned(accounts.length);
	for (let i = 0; i < accounts.length; ++i) {
		buf.writeString(accounts[i].account.uuid);
		const avatarKey = accounts[i].account.avatarKey;
		if (avatarKey) {
			buf.writeBoolean(true);
			buf.writeString(avatarKey);
		}
		else
			buf.writeBoolean(false);
		buf.write4Unsigned(accounts[i].modeFlags);
	}
	return buf;
}

function readAccountInChats(buf: ByteBuffer): accountInChat[] {
	const size = buf.read2Unsigned();
	const accounts: accountInChat[] = [];
	for (let i = 0; i < size; ++i) {
		const uuid = buf.readString();
		let avatarKey: string | null = null;
		if (buf.readBoolean()) {
			avatarKey = buf.readString();
		}
		const modeFlags = buf.read4Unsigned();
		accounts.push({ account: { uuid, avatarKey }, modeFlags })
	}
	return accounts;
}

//chatMemberWithChatUuid

const chatMemberWithChatUuid = Prisma.validator<Prisma.ChatMemberDefaultArgs>()({
	select: {
		account: {
			select: {
				uuid: true,
				nickName: true,
				nickTag: true,
				avatarKey: true,
				activeStatus: true,
				activeTimestamp: true,
				statusMessage: true
			}
		},
		modeFlags: true,
	}
});
export type ChatMemberWithChatUuid = Prisma.ChatMemberGetPayload<typeof chatMemberWithChatUuid>

export function writeChatMemberAccount(buf: ByteBuffer, member: ChatMemberWithChatUuid): ByteBuffer {
	buf.writeString(member.account.uuid);
	if (member.account.nickName) {
		buf.writeBoolean(true);
		buf.writeString(member.account.nickName);
	}
	else
		buf.writeBoolean(false);
	buf.write4Unsigned(member.account.nickTag);
	if (member.account.avatarKey) {
		buf.writeBoolean(true);
		buf.writeString(member.account.avatarKey)
	}
	else
		buf.writeBoolean(false);
	buf.writeString(member.account.activeStatus)
	buf.writeDate(member.account.activeTimestamp);
	buf.writeString(member.account.statusMessage);
	buf.write4Unsigned(member.modeFlags);
	return buf;
}

export function writeChatMemberAccounts(buf: ByteBuffer, members: ChatMemberWithChatUuid[]): ByteBuffer {
	buf.write2Unsigned(members.length);
	for (let member of members) {
		buf.writeString(member.account.uuid);
		if (member.account.nickName) {
			buf.writeBoolean(true);
			buf.writeString(member.account.nickName);
		}
		else
			buf.writeBoolean(false);
		buf.write4Unsigned(member.account.nickTag);
		if (member.account.avatarKey) {
			buf.writeBoolean(true);
			buf.writeString(member.account.avatarKey)
		}
		else
			buf.writeBoolean(false);
		buf.writeString(member.account.activeStatus)
		buf.writeDate(member.account.activeTimestamp);
		buf.writeString(member.account.statusMessage);
		buf.write4Unsigned(member.modeFlags);
	}
	return buf;
}

export function readChatMemberAccount(buf: ByteBuffer): ChatMemberWithChatUuid {
	const uuid = buf.readString();
	let nickName: string | null = null;
	if (buf.readBoolean())
		nickName = buf.readString();
	const nickTag = buf.read4Unsigned();
	let avatarKey: string | null = null;
	if (buf.readBoolean())
		avatarKey = buf.readString();
	const activeStatus = buf.readString() as $Enums.ActiveStatus;
	const activeTimestamp = buf.readDate();
	const statusMessage = buf.readString();
	const modeFlags = buf.read4Unsigned();
	return {
		account: {
			uuid,
			nickName,
			nickTag,
			avatarKey,
			activeStatus,
			activeTimestamp,
			statusMessage
		},
		modeFlags,
	}
}

export function readChatMemberAccounts(buf: ByteBuffer): ChatMemberWithChatUuid[] {
	const size = buf.read2Unsigned();
	const members: ChatMemberWithChatUuid[] = [];
	for (let i = 0; i < size; ++i) {
		const uuid = buf.readString();
		let nickName: string | null = null;
		if (buf.readBoolean())
			nickName = buf.readString();
		const nickTag = buf.read4Unsigned();
		let avatarKey: string | null = null;
		if (buf.readBoolean())
			avatarKey = buf.readString();
		const activeStatus = buf.readString() as $Enums.ActiveStatus;
		const activeTimestamp = buf.readDate();
		const statusMessage = buf.readString();
		const modeFlags = buf.read4Unsigned();
		const member: ChatMemberWithChatUuid = {
			account: {
				uuid,
				nickName,
				nickTag,
				avatarKey,
				activeStatus,
				activeTimestamp,
				statusMessage
			},
			modeFlags,
		}
		members.push(member);
	}
	return members;
}

//chatMessageWithChatUuid

const chatMessageWithChatUuid = Prisma.validator<Prisma.ChatMessageDefaultArgs>()({
	select: {
		id: true,
		account: {
			select: {
				uuid: true
			}
		},
		content: true,
		modeFlags: true,
		timestamp: true,
	}
});
export type ChatMessageWithChatUuid = Prisma.ChatMessageGetPayload<typeof chatMessageWithChatUuid>

export function writeChatMessage(buf: ByteBuffer, chatMessage: ChatMessageWithChatUuid): ByteBuffer {
	buf.write8Unsigned(chatMessage.id)
	//TODO 익명플레그 구현 결정하기
	if (!(chatMessage.modeFlags & 4)) {
		buf.writeUUID(chatMessage.account.uuid);
	} else {
		buf.writeUUID(NULL_UUID);
	}
	buf.write4Unsigned(chatMessage.modeFlags);
	buf.writeDate(chatMessage.timestamp);
	buf.writeString(chatMessage.content);
	return buf;
}

export function writeChatMessages(buf: ByteBuffer, chatMessages: ChatMessageWithChatUuid[]): ByteBuffer {
	buf.write2Unsigned(chatMessages.length);
	for (let chatMessage of chatMessages) {
		buf.write8Unsigned(chatMessage.id)
		//TODO 익명플레그 구현 결정하기
		if (!(chatMessage.modeFlags & 4)) {
			buf.writeUUID(chatMessage.account.uuid);
		} else {
			buf.writeUUID(NULL_UUID);
		}
		buf.write4Unsigned(chatMessage.modeFlags);
		buf.writeDate(chatMessage.timestamp);
		buf.writeString(chatMessage.content);
	}
	return buf;
}

export function readChatMessage(buf: ByteBuffer): ChatMessageWithChatUuid {
	const id = buf.read8Unsigned();
	const accountUuid = buf.readUUID();
	const modeFlags = buf.read4Unsigned();
	const timestamp = buf.readDate();
	const content = buf.readString();
	return {
		id,
		account: { uuid: accountUuid },
		modeFlags,
		timestamp,
		content
	}
}

export function readChatMessages(buf: ByteBuffer): ChatMessageWithChatUuid[] {
	const size = buf.read2Unsigned();
	const messages: ChatMessageWithChatUuid[] = [];
	for (let i = 0; i < size; ++i)
		messages.push({
			id: buf.read8Unsigned(),
			account: { uuid: buf.readUUID() },
			modeFlags: buf.read4Unsigned(),
			timestamp: buf.readDate(),
			content: buf.readString(),
		})
	return messages;
}

//RoomInfo

export class RoomInfo {
	uuid: string;
	title: string;
	modeFlags: number;
	password: string;
	limit: number;
	members: ChatMemberWithChatUuid[];
	messages?: ChatMessageWithChatUuid[];
}
export function writeRoominfo(buf: ByteBuffer, roomInfo: RoomInfo): ByteBuffer {
	buf.writeString(roomInfo.uuid);
	buf.writeString(roomInfo.title);
	buf.write4Unsigned(roomInfo.modeFlags);
	buf.writeString(roomInfo.password);
	buf.write4Unsigned(roomInfo.limit);
	writeChatMemberAccounts(buf, roomInfo.members);
	if (roomInfo.messages) {
		buf.writeBoolean(true);
		writeChatMessages(buf, roomInfo.messages);
	}
	else
		buf.writeBoolean(false);
	return buf;
}

export function readRoominfo(buf: ByteBuffer): RoomInfo {
	const uuid = buf.readString();
	const title = buf.readString();
	const modeFlags = buf.read4Unsigned();
	const password = buf.readString();
	const limit = buf.read4Unsigned();
	const members = readChatMemberAccounts(buf);
	let messages: ChatMessageWithChatUuid[] | undefined = undefined;
	if (buf.readBoolean())
		readChatMessages(buf);
	return {
		uuid,
		title,
		modeFlags,
		password,
		limit,
		members,
		messages
	}
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

// use invite
export function writeMembersAndChatUUID(buf: ByteBuffer, list: { chatUUID: string, members: string[] }) {
	buf.writeString(list.chatUUID)
	buf.write2(list.members.length);
	for (let i = 0; i < list.members.length; ++i) {
		buf.writeString(list.members[i]);
	}
	return buf;
}

export function readMembersAndChatUUID(buf: ByteBuffer): { chatUUID: string, members: string[] } {
	const members: string[] = [];
	const chatUUID = buf.readString();
	const size = buf.read2();
	for (let i = 0; i < size; ++i) {
		members.push(buf.readString());
	}
	return {
		chatUUID,
		members
	}
}

// accountWithUuid

const accountWithUuid = Prisma.validator<Prisma.AccountDefaultArgs>()({
	select: {
		uuid: true,
		nickName: true,
		nickTag: true,
		avatarKey: true,
		activeStatus: true,
		activeTimestamp: true,
		statusMessage: true
	},
});
export type AccountWithUuid = Prisma.AccountGetPayload<typeof accountWithUuid>

export function writeAccountWithUuids(buf: ByteBuffer, accounts: AccountWithUuid[]) {
	buf.write4Unsigned(accounts.length);
	for (let account of accounts) {
		buf.writeString(account.uuid);
		if (account.nickName) {
			buf.writeBoolean(true);
			buf.writeString(account.nickName);
		}
		else
			buf.writeBoolean(false);
		buf.write4Unsigned(account.nickTag);
		if (account.avatarKey) {
			buf.writeBoolean(true);
			buf.writeString(account.avatarKey)
		}
		else
			buf.write1(0);
		buf.writeString(account.activeStatus)
		buf.writeDate(account.activeTimestamp);
		buf.writeString(account.statusMessage);
	}
	return buf;
}

export function readAccountWithUuids(buf: ByteBuffer): AccountWithUuid[] {
	const size = buf.read4Unsigned();
	const accountList: AccountWithUuid[] = [];
	for (let i = 0; i < size; ++i) {
		const uuid = buf.readString();
		let nickName: string | null = null;
		if (buf.readBoolean())
			nickName = buf.readString();
		const nickTag = buf.read4Unsigned();
		let avatarKey: string | null = null;
		if (buf.readBoolean())
			avatarKey = buf.readString();
		const activeStatus = buf.readString() as $Enums.ActiveStatus;
		const activeTimestamp = buf.readDate();
		const statusMessage = buf.readString();
		accountList.push({
			uuid,
			nickName,
			nickTag,
			avatarKey,
			activeStatus,
			activeTimestamp,
			statusMessage
		})
	}
	return accountList;
}

//ChatMessage

export class CreateChatMessaage {
	chatUUID: string;
	content: string;
	modeFalgs: number;
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