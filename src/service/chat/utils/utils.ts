import { ByteBuffer } from "@libs/byte-buffer";
import { $Enums, ActiveStatus, Prisma } from "@prisma/client";
import { ChatMemberEntity } from "src/generated/model";
import { NULL_UUID } from "@libs/uuid";

export enum ChatOpCode {
	CONNECT,
	INFO,
	FRIENDS,
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
		members: {
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

// //RoomInfo

// export class RoomInfo {
// 	uuid: string;
// 	title: string;
// 	modeFlags: number;
// 	password: string;
// 	limit: number;
// 	members: ChatMemberWithChatUuid[];
// 	messages?: ChatMessageWithChatUuid[];
// }
// export function writeRoominfo(buf: ByteBuffer, roomInfo: RoomInfo): ByteBuffer {
// 	buf.writeString(roomInfo.uuid);
// 	buf.writeString(roomInfo.title);
// 	buf.write4Unsigned(roomInfo.modeFlags);
// 	buf.writeString(roomInfo.password);
// 	buf.write4Unsigned(roomInfo.limit);
// 	writeChatMemberAccounts(buf, roomInfo.members);
// 	if (roomInfo.messages) {
// 		buf.writeBoolean(true);
// 		writeChatMessages(buf, roomInfo.messages);
// 	}
// 	else
// 		buf.writeBoolean(false);
// 	return buf;
// }

// export function readRoominfo(buf: ByteBuffer): RoomInfo {
// 	const uuid = buf.readString();
// 	const title = buf.readString();
// 	const modeFlags = buf.read4Unsigned();
// 	const password = buf.readString();
// 	const limit = buf.read4Unsigned();
// 	const members = readChatMemberAccounts(buf);
// 	let messages: ChatMessageWithChatUuid[] | undefined = undefined;
// 	if (buf.readBoolean())
// 		readChatMessages(buf);
// 	return {
// 		uuid,
// 		title,
// 		modeFlags,
// 		password,
// 		limit,
// 		members,
// 		messages
// 	}
// }

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

//ChatRoom Type

export type ChatRoom = {
	uuid: string,
	title: string,
	modeFlags: number,
	password: string,
	limit: number,
};

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

export function writeAccounts(buf: ByteBuffer, Accounts: Account[]) {
	buf.write4Unsigned(Accounts.length) // accounts 갯수
	for (let i = 0; i < Accounts.length; i++) {
		buf.writeUUID(Accounts[i].uuid);
		const nickName = Accounts[i].nickName;
		if (nickName !== null) {
			buf.writeBoolean(true);
			buf.writeString(nickName);
		}
		else {
			buf.writeBoolean(false);
		}
		buf.write4Unsigned(Accounts[i].nickTag);
		const avatarKey = Accounts[i].avatarKey;
		if (avatarKey !== null) {
			buf.writeBoolean(true);
			buf.writeString(avatarKey);
		}
		else {
			buf.writeBoolean(false);
		}
		buf.write4Unsigned(getActiveStatusNumber(Accounts[i].activeStatus));
		buf.writeDate(Accounts[i].activeTimestamp);
		buf.writeString(Accounts[i].statusMessage);
	}
	return buf;
}

export function readAccounts(buf: ByteBuffer): Account[] {
	const size = buf.read4Unsigned() // accounts 갯수
	const Accounts: Account[] = [];
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
		Accounts.push({
			uuid,
			nickName,
			nickTag,
			avatarKey,
			activeStatus,
			activeTimestamp,
			statusMessage
		})
	}
	return Accounts;
}

//MemberWithModeFlags Type
export type MemberWithModeFlags = {
	account: Account,
	modeFalgs: number
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

//ChatMessages Type
export type ChatMessages = {
	chatUUID: string,
	messages: Message[]
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

//ChatRoomInfo Type

export type RoomInfo = {
	uuid: string;
	title: string;
	modeFlags: number;
	password: string;
	limit: number;
	members: { account: RoomInfoAccount }[];
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