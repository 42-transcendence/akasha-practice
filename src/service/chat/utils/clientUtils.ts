import { ByteBuffer } from "@libs/byte-buffer";
import { ChatOpCode, writeRoomJoinInfo, JoinCode, CreatCode, PartCode, KickCode, CreateChatMessaage, writeCreateChatMessaage, ChatRoom, ChatMembers, ChatMessages, readChatRooms, readChatMembersList, readChatMessagesList, readAccounts, Account, NowChatRoom, MemberWithModeFlags, Message, readMessage, CreateChat, writeCreateChat, writeChatUUIDAndMemberUUIDs, ChatUUIDAndMemberUUIDs, readChatUUIDAndMemberUUIDs, readChatMembers, readChatRoom, readChatMessages, readMemberWithModeFlags, InviteCode, readMembersWithModeFlags } from "./utils";

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
	//초대권한이 있는지 확인해함.
	const buf: ByteBuffer = ByteBuffer.createWithOpcode(ChatOpCode.INVITE);
	writeChatUUIDAndMemberUUIDs(buf, invitation);
	client.send(buf.toArray());
}

export function sendEnter(client: WebSocket, roomUUID: string) {
	const buf: ByteBuffer = ByteBuffer.createWithOpcode(ChatOpCode.ENTER);
	buf.writeString(roomUUID);
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

export function sendChat(client: WebSocket, msg: CreateChatMessaage) {
	const buf: ByteBuffer = ByteBuffer.createWithOpcode(ChatOpCode.CHAT);
	writeCreateChatMessaage(buf, msg);
	client.send(buf.toArray());
}
//utils
function makeNowChatRoom(chatUUID: string): NowChatRoom {
	const chatRooms: ChatRoom[] = JSON.parse(String(window.localStorage.getItem('chatRooms')));
	const chatMembersList: ChatMembers[] = JSON.parse(String(window.localStorage.getItem('chatMembersList')));
	const chatMessagesList: ChatMessages[] = JSON.parse(String(window.localStorage.getItem('chatMessagesList')));
	const nowChatRoom: NowChatRoom = { chatRoom: null, members: null, messages: null };
	for (let i = 0; i < chatRooms.length; i++) {
		if (chatRooms[i].uuid == chatUUID) {
			nowChatRoom.chatRoom = chatRooms[i];
			break;
		}
	}
	for (let i = 0; i < chatMembersList.length; i++) {
		if (chatMembersList[i].chatUUID == chatUUID) {
			nowChatRoom.members = chatMembersList[i];
			break;
		}
	}
	for (let i = 0; i < chatMessagesList.length; i++) {
		if (chatMessagesList[i].chatUUID == chatUUID) {
			nowChatRoom.messages = chatMessagesList[i];
			break;
		}
	}
	return (nowChatRoom);
}

function addChatRoom(newChatRoom: ChatRoom) {
	const chatRooms: ChatRoom[] = JSON.parse(String(window.localStorage.getItem('chatRooms')));
	chatRooms.push(newChatRoom);
	window.localStorage.setItem('chatRooms', JSON.stringify(chatRooms));
}

function deleteChatRoom(chatUUID: string) {
	const chatRooms: ChatRoom[] = JSON.parse(String(window.localStorage.getItem('chatRooms')));
	for (let i = 0; i < chatRooms.length; i++) {
		if (chatRooms[i].uuid == chatUUID) {
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
		if (chatMembersList[i].chatUUID == chatUUID) {
			chatMembersList[i].members.push(chatMember);
			break;
		}
	}
	window.localStorage.setItem('chatMembersList', JSON.stringify(chatMembersList));
}

function deleteChatMembers(chatUUID: string) {
	const chatMembersList: ChatMembers[] = JSON.parse(String(window.localStorage.getItem('chatMembersList')));
	for (let i = 0; i < chatMembersList.length; i++) {
		if (chatMembersList[i].chatUUID == chatUUID) {
			chatMembersList.splice(i, 1);
			break;
		}
	}
	window.localStorage.setItem('chatMembersList', JSON.stringify(chatMembersList));
}

function deleteChatMember(chatUUID: string, accountUUID: string) {
	const chatMembersList: ChatMembers[] = JSON.parse(String(window.localStorage.getItem('chatMembersList')));
	for (let i = 0; i < chatMembersList.length; i++) {
		if (chatMembersList[i].chatUUID == chatUUID) {
			for (let j = 0; j < chatMembersList[i].members.length; j++) {
				if (chatMembersList[i].members[j].account.uuid == accountUUID) {
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
	const chatMessagesList: ChatMessages[] = JSON.parse(String(window.localStorage.getItem('chatMessagesList')));
	chatMessagesList.push(newChatMessages);
	window.localStorage.setItem('chatMessagesList', JSON.stringify(chatMessagesList));
}

function addChatMessage(chatUUID: string, message: Message) {
	const chatMessagesList: ChatMessages[] = JSON.parse(String(window.localStorage.getItem('chatMessagesList')));
	for (let i = 0; i < chatMessagesList.length; i++) {
		if (chatMessagesList[i].chatUUID == chatUUID) {
			chatMessagesList[i].messages.push(message);
			break;
		}
	}
	window.localStorage.setItem('chatMessagesList', JSON.stringify(chatMessagesList));
}

function deleteChatMessages(chatUUID: string) {
	const chatMessagesList: ChatMessages[] = JSON.parse(String(window.localStorage.getItem('chatMessagesList')));
	for (let i = 0; i < chatMessagesList.length; i++) {
		if (chatMessagesList[i].chatUUID == chatUUID) {
			chatMessagesList.splice(i, 1);
			break;
		}
	}
	window.localStorage.setItem('chatMessagesList', JSON.stringify(chatMessagesList));
}

function setNowChatRoom(uuid: string) {
	const nowChatRoom: NowChatRoom = makeNowChatRoom(uuid);
	window.localStorage.setItem('nowChatRoom', JSON.stringify(nowChatRoom));
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
	const chatRooms: ChatRoom[] = readChatRooms(buf);
	const chatMembersList: ChatMembers[] = readChatMembersList(buf);
	const chatMessagesList: ChatMessages[] = readChatMessagesList(buf);
	window.localStorage.setItem('chatRooms', JSON.stringify(chatRooms));
	window.localStorage.setItem('chatMembersList', JSON.stringify(chatMembersList));
	window.localStorage.setItem('chatMessagesList', JSON.stringify(chatMessagesList));
	const sendBuf: ByteBuffer = ByteBuffer.createWithOpcode(ChatOpCode.FRIENDS);
	client.send(sendBuf.toArray());
	window.localStorage.removeItem('nowChatRoom');
}

export function acceptFriends(buf: ByteBuffer) {
	const friends: Account[] = readAccounts(buf);
	window.localStorage.setItem('friends', JSON.stringify(friends));
}

export function acceptCreat(buf: ByteBuffer) {
	const code = buf.read1();
	const newChatRoom: ChatRoom = readChatRoom(buf);
	const newChatMembers: ChatMembers = readChatMembers(buf);
	addChatRoom(newChatRoom);
	addChatMembers(newChatMembers);
	if (code == CreatCode.CREATER) {
		setNowChatRoom(newChatRoom.uuid);
	}
}

export function accpetJoin(buf: ByteBuffer) {
	const code = buf.read1();
	if (code == JoinCode.REJCET)
		return; // TODO - 비밀번호가 틀렸을경우.
	else if (code == JoinCode.ACCEPT) {
		const chatRoom = readChatRoom(buf);
		const chatMembers = readChatMembers(buf);
		const chatMessages = readChatMessages(buf);
		addChatRoom(chatRoom);
		addChatMembers(chatMembers);
		addChatMessages(chatMessages);
		setNowChatRoom(chatRoom.uuid);
	}
	else if (code == JoinCode.NEW_JOIN) {
		const uuid = buf.readString();
		const member: MemberWithModeFlags = readMemberWithModeFlags(buf);
		const nowChatRoom: NowChatRoom = JSON.parse(String(window.localStorage.getItem('nowChatRoom')));
		addChatMember(uuid, member);
		//TODO - join이 들어오면 리렌더를 할것임을 어떻게 알려줄것인가?
		if (nowChatRoom.chatRoom?.uuid == uuid) {
			setNowChatRoom(uuid);
		}
	}
}

export function accpetPublicSearch(buf: ByteBuffer) {
	const publicRooms: ChatRoom[] = readChatRooms(buf);
	publicRooms;
	return;
}

export function accpetInvite(buf: ByteBuffer) {
	const code = buf.read1();
	const nowChatRoom: NowChatRoom = JSON.parse(String(window.localStorage.getItem('nowChatRoom')));
	if (code == InviteCode.INVITER) {
		const chatRoom = readChatRoom(buf);
		const chatMembers = readChatMembers(buf);
		const chatMessages = readChatMessages(buf);
		addChatRoom(chatRoom);
		addChatMembers(chatMembers);
		addChatMessages(chatMessages);
	}
	else if (code == InviteCode.MEMBER) {
		const chatUUID = buf.readString();
		const invitedMembers: MemberWithModeFlags[] = readMembersWithModeFlags(buf);
		for (let member of invitedMembers) {
			addChatMember(chatUUID, member);
		}
		if (nowChatRoom && nowChatRoom.chatRoom?.uuid == chatUUID) {
			setNowChatRoom(chatUUID);
		}
	}
}

export function acceptEnter(buf: ByteBuffer) {
	const chatRoom = readChatRoom(buf);
	// const chatMembers = readChatMembers(buf);
	// const chatMessages = readChatMessages(buf);
	// addChatRoom(chatRoom);
	// addChatMembers(chatMembers);
	// addChatMessages(chatMessages);
	setNowChatRoom(chatRoom.uuid);
}

export function acceptPart(buf: ByteBuffer) {
	const code = buf.read1();
	const chatUUID = buf.readString();
	const nowChatRoom: NowChatRoom = JSON.parse(String(window.localStorage.getItem('nowChatRoom')));
	if (code == PartCode.ACCEPT) {
		if (nowChatRoom && nowChatRoom.chatRoom?.uuid == chatUUID) {
			window.localStorage.removeItem('nowChatRoom');
		}
		deleteChatRoom(chatUUID);
		deleteChatMembers(chatUUID);
		deleteChatMessages(chatUUID);
	}
	else if (code == PartCode.PART) {
		const accountUUID = buf.readString();
		deleteChatMember(chatUUID, accountUUID);
		if (nowChatRoom && nowChatRoom.chatRoom?.uuid == chatUUID) {
			setNowChatRoom(chatUUID)
		}
	}
}

export function acceptKick(buf: ByteBuffer) {
	const code = buf.read1();
	const nowChatRoom: NowChatRoom = JSON.parse(String(window.localStorage.getItem('nowChatRoom')));
	//TODO - 킥 권한이 없는 경우 어떻게 할것인가
	if (code == KickCode.REJCET) { }
	else if (code == KickCode.KICK_USER) {
		const chatUUID = buf.readString();
		if (nowChatRoom.chatRoom?.uuid == chatUUID) {
			window.localStorage.removeItem('nowChatRoom');
		}
		deleteChatRoom(chatUUID);
		deleteChatMembers(chatUUID);
		deleteChatMessages(chatUUID);
	}
	else if (code == KickCode.ACCEPT) {
		const kickList: ChatUUIDAndMemberUUIDs = readChatUUIDAndMemberUUIDs(buf);
		for (let member of kickList.members) {
			deleteChatMember(kickList.chatUUID, member);
		}
		if (nowChatRoom && nowChatRoom.chatRoom?.uuid == kickList.chatUUID) {
			setNowChatRoom(kickList.chatUUID);
		}
	}
}

export function accpetChat(buf: ByteBuffer) {
	const chatUUID = buf.readString();
	const msg: Message = readMessage(buf);
	const nowChatRoom: NowChatRoom = JSON.parse(String(window.localStorage.getItem('nowChatRoom')));
	addChatMessage(chatUUID, msg);
	if (nowChatRoom.chatRoom?.uuid == chatUUID) {
		setNowChatRoom(chatUUID);
	}
}

export function acceptChatOpCode(buf: ByteBuffer, client: WebSocket) {
	const code: ChatOpCode = buf.readOpcode();

	if (code == ChatOpCode.CONNECT)
		acceptConnect(client, buf);
	else if (code == ChatOpCode.INFO)
		acceptInfo(client, buf);
	else if (code == ChatOpCode.FRIENDS)
		acceptFriends(buf);
	else if (code == ChatOpCode.CREATE)
		acceptCreat(buf);
	else if (code == ChatOpCode.JOIN)
		accpetJoin(buf);
	else if (code == ChatOpCode.PUBLIC_SEARCH)
		accpetPublicSearch(buf);
	else if (code == ChatOpCode.INVITE)
		accpetInvite(buf);
	else if (code == ChatOpCode.ENTER)
		acceptEnter(buf);
	else if (code == ChatOpCode.PART)
		acceptPart(buf);
	else if (code == ChatOpCode.KICK)
		acceptKick(buf);
	else if (code == ChatOpCode.CHAT)
		accpetChat(buf);
}