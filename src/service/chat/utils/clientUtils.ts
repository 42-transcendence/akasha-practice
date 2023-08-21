import { ByteBuffer } from "@libs/byte-buffer";
import { ChatOpCode, writeRoomJoinInfo, JoinCode, CreatCode, PartCode, KickCode, ChatRoom, ChatMembers, ChatMessages, readChatRooms, readChatMembersList, readAccounts, Account, NowChatRoom, MemberWithModeFlags, Message, readMessage, CreateChat, writeCreateChat, writeChatUUIDAndMemberUUIDs, ChatUUIDAndMemberUUIDs, readChatUUIDAndMemberUUIDs, readChatMembers, readChatMessages, readMemberWithModeFlags, InviteCode, readMembersWithModeFlags, ChatRoomWithLastMessageUUID, readChatRoomsWithLastMessageUUID, readChatRoomWithLastMessageUUID, ChatCode, CreateChatMessageWithOutModeFlags, writeCreateChatMessageWithOutModeFlags, readChatMessagesList } from "./utils";
import { NULL_UUID } from "@libs/uuid";
import { MessagesDB } from "./message_indexedDB";

let messageDB: MessagesDB;
let nowChatRoom: NowChatRoom | null = null;

export function sendConnectMessage(client: WebSocket) {
	const buf: ByteBuffer = ByteBuffer.createWithOpcode(ChatOpCode.CONNECT);
	const jwt = window.localStorage.getItem('access_token');
	if (jwt)
		buf.writeString(jwt);
	else
		throw new Error('로그인 상태가 아닙니다.')
	client.send(buf.toArray());
}

export function sendCreateRoom(client: WebSocket, room: CreateChat) {
	const buf: ByteBuffer = ByteBuffer.createWithOpcode(ChatOpCode.CREATE);
	writeCreateChat(buf, room);
	client.send(buf.toArray());
}

export function sendJoinRoom(client: WebSocket, room: { uuid: string, password: string }) {
	const buf: ByteBuffer = ByteBuffer.createWithOpcode(ChatOpCode.JOIN)
	writeRoomJoinInfo(buf, room);
	client.send(buf.toArray())
}

export function sendInvite(client: WebSocket, invitation: ChatUUIDAndMemberUUIDs) {
	const buf: ByteBuffer = ByteBuffer.createWithOpcode(ChatOpCode.INVITE);
	writeChatUUIDAndMemberUUIDs(buf, invitation);
	client.send(buf.toArray());
}


export function sendPart(client: WebSocket, roomUUID: string) {
	const buf: ByteBuffer = ByteBuffer.createWithOpcode(ChatOpCode.PART);
	buf.writeString(roomUUID);
	client.send(buf.toArray());
}

export function sendKick(client: WebSocket, kickList: ChatUUIDAndMemberUUIDs) {
	const buf: ByteBuffer = ByteBuffer.createWithOpcode(ChatOpCode.KICK);
	writeChatUUIDAndMemberUUIDs(buf, kickList);
	client.send(buf.toArray());
}
//TODO - chatCode를 어떻게 적용할지
export function sendChat(client: WebSocket, msg: CreateChatMessageWithOutModeFlags) {
	const buf: ByteBuffer = ByteBuffer.createWithOpcode(ChatOpCode.CHAT);
	buf.write1(ChatCode.NORMAL)
	writeCreateChatMessageWithOutModeFlags(buf, msg);
	client.send(buf.toArray());
}
//utils
async function makeEnterChatRoom(chatUUID: string): Promise<NowChatRoom> {
	const chatRooms: ChatRoomWithLastMessageUUID[] = JSON.parse(String(window.localStorage.getItem('chatRooms')));
	const chatMembersList: ChatMembers[] = JSON.parse(String(window.localStorage.getItem('chatMembersList')));
	const nowChatRoom: NowChatRoom = { chatRoom: null, members: null, messages: { chatUUID: chatUUID, messages: await messageDB.enterLoadMessages(chatUUID) } };
	for (let i = 0; i < chatRooms.length; i++) {
		if (chatRooms[i].info.uuid === chatUUID) {
			nowChatRoom.chatRoom = chatRooms[i];
			break;
		}
	}
	for (let i = 0; i < chatMembersList.length; i++) {
		if (chatMembersList[i].chatUUID === chatUUID) {
			nowChatRoom.members = chatMembersList[i];
			break;
		}
	}
	return (nowChatRoom);
}

async function makeUpdateChatRoom(chatUUID: string): Promise<NowChatRoom> {
	const chatRooms: ChatRoomWithLastMessageUUID[] = JSON.parse(String(window.localStorage.getItem('chatRooms')));
	const chatMembersList: ChatMembers[] = JSON.parse(String(window.localStorage.getItem('chatMembersList')));
	const nowChatRoom: NowChatRoom = { chatRoom: null, members: null, messages: { chatUUID: chatUUID, messages: await messageDB.readBelowCursorMessages(chatUUID) } };
	for (let i = 0; i < chatRooms.length; i++) {
		if (chatRooms[i].info.uuid === chatUUID) {
			nowChatRoom.chatRoom = chatRooms[i];
			break;
		}
	}
	for (let i = 0; i < chatMembersList.length; i++) {
		if (chatMembersList[i].chatUUID === chatUUID) {
			nowChatRoom.members = chatMembersList[i];
			break;
		}
	}
	return (nowChatRoom);
}

function addChatRoom(newChatRoom: ChatRoomWithLastMessageUUID) {
	const chatRooms: ChatRoomWithLastMessageUUID[] = JSON.parse(String(window.localStorage.getItem('chatRooms')));
	chatRooms.push(newChatRoom);
	window.localStorage.setItem('chatRooms', JSON.stringify(chatRooms));
}

function deleteChatRoom(chatUUID: string) {
	const chatRooms: ChatRoomWithLastMessageUUID[] = JSON.parse(String(window.localStorage.getItem('chatRooms')));
	for (let i = 0; i < chatRooms.length; i++) {
		if (chatRooms[i].info.uuid === chatUUID) {
			chatRooms.splice(i, 1);
			break;
		}
	}
	window.localStorage.setItem('chatRooms', JSON.stringify(chatRooms));
}

function addChatMembers(newChatMembers: ChatMembers) {
	const chatMembersList: ChatMembers[] = JSON.parse(String(window.localStorage.getItem('chatMembersList')));
	chatMembersList.push(newChatMembers);
	window.localStorage.setItem('chatMembersList', JSON.stringify(chatMembersList));
}

function addChatMember(chatUUID: string, chatMember: MemberWithModeFlags) {
	const chatMembersList: ChatMembers[] = JSON.parse(String(window.localStorage.getItem('chatMembersList')));
	for (let i = 0; i < chatMembersList.length; i++) {
		if (chatMembersList[i].chatUUID === chatUUID) {
			chatMembersList[i].members.push(chatMember);
			break;
		}
	}
	window.localStorage.setItem('chatMembersList', JSON.stringify(chatMembersList));
}

function addChatManyMember(chatUUID: string, chatMembers: MemberWithModeFlags[]) {
	const chatMembersList: ChatMembers[] = JSON.parse(String(window.localStorage.getItem('chatMembersList')));
	for (let i = 0; i < chatMembersList.length; i++) {
		if (chatMembersList[i].chatUUID === chatUUID) {
			for (const member of chatMembers) {
				chatMembersList[i].members.push(member);
			}
			break;
		}
	}
	window.localStorage.setItem('chatMembersList', JSON.stringify(chatMembersList));
}

function deleteChatMembers(chatUUID: string) {
	const chatMembersList: ChatMembers[] = JSON.parse(String(window.localStorage.getItem('chatMembersList')));
	for (let i = 0; i < chatMembersList.length; i++) {
		if (chatMembersList[i].chatUUID === chatUUID) {
			chatMembersList.splice(i, 1);
			break;
		}
	}
	window.localStorage.setItem('chatMembersList', JSON.stringify(chatMembersList));
}

function deleteChatMember(chatUUID: string, accountUUID: string) {
	const chatMembersList: ChatMembers[] = JSON.parse(String(window.localStorage.getItem('chatMembersList')));
	for (let i = 0; i < chatMembersList.length; i++) {
		if (chatMembersList[i].chatUUID === chatUUID) {
			for (let j = 0; j < chatMembersList[i].members.length; j++) {
				if (chatMembersList[i].members[j].accountUUID === accountUUID) {
					chatMembersList[i].members.splice(j, 1);
					break;
				}
			}
			break;
		}
	}
	window.localStorage.setItem('chatMembersList', JSON.stringify(chatMembersList));
}

function addChatMessages(newChatMessages: ChatMessages) {
	messageDB.addTable(newChatMessages);
}

function addChatMessage(chatUUID: string, message: Message) {
	messageDB.addMessage(chatUUID, message);
}

function deleteChatMessages(chatUUID: string) {
	messageDB.clearObjectStore("chat_" + chatUUID);
}

export async function updateLastMessageId(client: WebSocket, chatUUID: string) {
	const chatRooms: ChatRoomWithLastMessageUUID[] = JSON.parse(String(window.localStorage.getItem('chatRooms')));
	const messages: Message[] = await messageDB.readBelowCursorMessages(chatUUID);
	if (messages.length !== 0) {
		for (const lastMessage of messages) {
			//TODO - 공지 모드플레그 확인 절차
			if (lastMessage.modeFlags != 1) {
				for (let i = 0; i < chatRooms.length; i++) {
					if (chatRooms[i].info.uuid === chatUUID) {
						chatRooms[i].lastMessageId = lastMessage.uuid;
						const buf: ByteBuffer = ByteBuffer.createWithOpcode(ChatOpCode.CHAT_UPDATE)
						buf.writeUUID(chatUUID);
						buf.writeUUID(chatRooms[i].lastMessageId);
						client.send(buf.toArray());
						break;
					}
				}
				break;
			}
		}
	}
	else {
		for (let i = 0; i < chatRooms.length; i++) {
			if (chatRooms[i].info.uuid === chatUUID) {
				chatRooms[i].lastMessageId = NULL_UUID;
				const buf: ByteBuffer = ByteBuffer.createWithOpcode(ChatOpCode.CHAT_UPDATE)
				buf.writeUUID(chatUUID);
				buf.writeUUID(NULL_UUID);
				client.send(buf.toArray());
				break;
			}
		}
	}
	window.localStorage.setItem('chatRooms', JSON.stringify(chatRooms));
}

export async function setNowChatRoom(chatUUID: string): Promise<NowChatRoom> {
	const nowChatRoom: NowChatRoom = await makeEnterChatRoom(chatUUID);
	return nowChatRoom;
}

export async function updateNowChatRoom(chatUUID: string) {
	const nowChatRoom: NowChatRoom = await makeUpdateChatRoom(chatUUID);
	return nowChatRoom;
}

//accept
export function acceptConnect(client: WebSocket, buf: ByteBuffer) {
	if (buf.readBoolean()) {
		const sendBuf: ByteBuffer = ByteBuffer.createWithOpcode(ChatOpCode.INFO);
		client.send(sendBuf.toArray());
	}
	//TODO - 올바르지 않은 접근일 경우
	else
		throw new Error('올바르지 않은 접근입니다.')
}

export function acceptInfo(client: WebSocket, buf: ByteBuffer) {
	const chatRooms: ChatRoomWithLastMessageUUID[] = readChatRoomsWithLastMessageUUID(buf);
	const chatMembersList: ChatMembers[] = readChatMembersList(buf);
	const chatMessagesList: ChatMessages[] = readChatMessagesList(buf);
	window.localStorage.setItem('chatRooms', JSON.stringify(chatRooms));
	window.localStorage.setItem('chatMembersList', JSON.stringify(chatMembersList));
	messageDB = new MessagesDB(chatMessagesList, chatRooms);
	const sendBuf: ByteBuffer = ByteBuffer.createWithOpcode(ChatOpCode.FRIENDS);
	client.send(sendBuf.toArray());
	window.localStorage.removeItem('nowChatRoom');
}

export function acceptFriends(buf: ByteBuffer) {
	const friends: Account[] = readAccounts(buf);
	window.localStorage.setItem('friends', JSON.stringify(friends));
}

export async function acceptCreat(buf: ByteBuffer) {
	const code = buf.read1();
	const newChatRoom: ChatRoomWithLastMessageUUID = readChatRoomWithLastMessageUUID(buf);
	const newChatMembers: ChatMembers = readChatMembers(buf);
	const newChatMessages: ChatMessages = readChatMessages(buf);
	addChatRoom(newChatRoom);
	addChatMembers(newChatMembers);
	addChatMessages(newChatMessages);
	if (code === CreatCode.CREATER) {
		nowChatRoom = await setNowChatRoom(newChatRoom.info.uuid);
	}
}

export async function accpetJoin(buf: ByteBuffer) {
	const code = buf.read1();
	if (code === JoinCode.REJCET)
		return; // TODO - 비밀번호가 틀렸을경우.
	else if (code === JoinCode.ACCEPT) {
		const chatRoom: ChatRoomWithLastMessageUUID = readChatRoomWithLastMessageUUID(buf);
		const chatMembers: ChatMembers = readChatMembers(buf);
		const chatMessages: ChatMessages = readChatMessages(buf);
		addChatRoom(chatRoom);
		addChatMembers(chatMembers);
		addChatMessages(chatMessages);
		nowChatRoom = await setNowChatRoom(chatRoom.info.uuid);
	}
	else if (code === JoinCode.NEW_JOIN) {
		const uuid = buf.readString();
		const member: MemberWithModeFlags = readMemberWithModeFlags(buf);
		addChatMember(uuid, member);
		//TODO - join이 들어오면 리렌더를 할것임을 어떻게 알려줄것인가?
		if (nowChatRoom !== null && nowChatRoom.messages.chatUUID === uuid) {
			nowChatRoom = await updateNowChatRoom(uuid);
		}
	}
}

export function accpetPublicSearch(buf: ByteBuffer) {
	const publicRooms: ChatRoom[] = readChatRooms(buf);
	publicRooms;
	return;
}

export async function accpetInvite(buf: ByteBuffer) {
	const code = buf.read1();
	if (code === InviteCode.INVITER) {
		const chatRoom: ChatRoomWithLastMessageUUID = readChatRoomWithLastMessageUUID(buf);
		const chatMembers: ChatMembers = readChatMembers(buf);
		const chatMessages: ChatMessages = readChatMessages(buf);
		addChatRoom(chatRoom);
		addChatMembers(chatMembers);
		addChatMessages(chatMessages);
	}
	else if (code === InviteCode.MEMBER) {
		const chatUUID = buf.readString();
		const invitedMembers: MemberWithModeFlags[] = readMembersWithModeFlags(buf);
		addChatManyMember(chatUUID, invitedMembers)
		if (nowChatRoom !== null && nowChatRoom.messages.chatUUID == chatUUID) {
			nowChatRoom = await updateNowChatRoom(chatUUID);
		}
	}
}

export async function enter(client: WebSocket, chatUUID: string) {
	nowChatRoom = await setNowChatRoom(chatUUID);
	updateLastMessageId(client, chatUUID);
}

export async function acceptPart(buf: ByteBuffer) {
	const code = buf.read1();
	const chatUUID = buf.readString();
	if (code === PartCode.ACCEPT) {
		deleteChatRoom(chatUUID);
		deleteChatMembers(chatUUID);
		deleteChatMessages(chatUUID);
		nowChatRoom = null;
	}
	else if (code === PartCode.PART) {
		const accountUUID = buf.readString();
		deleteChatMember(chatUUID, accountUUID);
		if (nowChatRoom !== null && nowChatRoom.messages.chatUUID === chatUUID) {
			nowChatRoom = await updateNowChatRoom(chatUUID);
		}
	}
}

export async function acceptKick(buf: ByteBuffer) {
	const code = buf.read1();
	//TODO - 킥 권한이 없는 경우 어떻게 할것인가
	if (code === KickCode.REJCET) { }
	else if (code === KickCode.KICK_USER) {
		const chatUUID = buf.readString();
		deleteChatRoom(chatUUID);
		deleteChatMembers(chatUUID);
		deleteChatMessages(chatUUID);
		if (nowChatRoom !== null && nowChatRoom.messages.chatUUID === chatUUID) {
			nowChatRoom === null;
		}
	}
	else if (code === KickCode.ACCEPT) {
		const kickList: ChatUUIDAndMemberUUIDs = readChatUUIDAndMemberUUIDs(buf);
		for (let member of kickList.members) {
			deleteChatMember(kickList.chatUUID, member);
		}
		if (nowChatRoom !== null && nowChatRoom.messages.chatUUID === kickList.chatUUID) {
			nowChatRoom = await updateNowChatRoom(kickList.chatUUID);
		}
	}
}

export async function acceptChat(client: WebSocket, buf: ByteBuffer) {
	const chatUUID = buf.readString();
	const msg: Message = readMessage(buf);
	addChatMessage(chatUUID, msg);
	if (nowChatRoom && nowChatRoom.messages.chatUUID === chatUUID) {
		updateLastMessageId(client, chatUUID);
		nowChatRoom = await updateNowChatRoom(chatUUID);
	}
}

export function acceptChatOpCode(buf: ByteBuffer, client: WebSocket) {
	const code: ChatOpCode = buf.readOpcode();

	if (code === ChatOpCode.CONNECT)
		acceptConnect(client, buf);
	else if (code === ChatOpCode.INFO)
		acceptInfo(client, buf);
	else if (code === ChatOpCode.FRIENDS)
		acceptFriends(buf);
	else if (code === ChatOpCode.CREATE)
		acceptCreat(buf);
	else if (code === ChatOpCode.JOIN)
		accpetJoin(buf);
	else if (code === ChatOpCode.PUBLIC_SEARCH)
		accpetPublicSearch(buf);
	else if (code === ChatOpCode.INVITE)
		accpetInvite(buf);
	else if (code === ChatOpCode.PART)
		acceptPart(buf);
	else if (code === ChatOpCode.KICK)
		acceptKick(buf);
	else if (code === ChatOpCode.CHAT)
		acceptChat(client, buf);
}