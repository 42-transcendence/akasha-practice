import { ByteBuffer } from "@libs/byte-buffer";
import { Injectable } from "@nestjs/common";
import { ChatWebSocket } from "./chat-websocket";
import { CustomException } from "./utils/exception";
import { ChatMemberModeFlags, CreatCode, RoomInfo, readRoomJoinInfo, PartCode, KickCode, readCreateChatMessaage, CreateChatMessaage, ChatRoom, ChatMessages, ChatMembers, Account, MemberWithModeFlags, Message, writeChatRooms, writeChatMembersList, writeChatMessagesList, writeAccounts, CreateChat, readCreateChat, writeMessage, ChatUUIDAndMemberUUIDs, readChatUUIDAndMemberUUIDs, writeChatUUIDAndMemberUUIDs, writeChatRoom, writeChatMembers, writeChatMessages, writeMemberWithModeFlags } from "./utils/utils";
import { ChatOpCode, JoinCode } from "./utils/utils";
import { ChatEntity } from "src/generated/model";
import { AuthPayload, AuthService } from "src/user/auth/auth.service";
import { ChatService } from "./chat.service";

@Injectable()
export class ChatSocket {
	constructor(private chatService: ChatService, private authService: AuthService) { }

	async chatServerConnect(buf: ByteBuffer, client: ChatWebSocket) {
		const sendBuf = ByteBuffer.createWithOpcode(ChatOpCode.CONNECT);
		try {
			const jwt = buf.readString();
			const payload: AuthPayload = await this.authService.extractJWTPayload(jwt);
			const user = await this.chatService.getAccount(payload.user_id);
			if (!user)
				throw new CustomException('올바르지 않은 유저 id입니다.')
			sendBuf.writeBoolean(true);
			client.userId = user.id
			client.account.uuid = payload.user_id;
			client.account.nickName = user.nickName;
			client.account.nickTag = user.nickTag;
			client.account.avatarKey = user.avatarKey;
			client.account.activeStatus = user.activeStatus;
			client.account.activeTimestamp = user.activeTimestamp;
			client.account.statusMessage = user.statusMessage;
			client.send(sendBuf.toArray());
		} catch (e) {
			sendBuf.writeBoolean(false);
			client.send(sendBuf.toArray());
		}
	}

	async sendInfo(client: ChatWebSocket) {
		const buf: ByteBuffer = ByteBuffer.createWithOpcode(ChatOpCode.INFO);
		const roomList: { chat: RoomInfo }[] = await this.chatService.getChatRooms(client.userId);
		this.writeChatRoomInfos(buf, roomList);
		//client 내부에 roomUUID, modeFlags를 추가
		client.addRoomsInClientSocket(roomList);
		// client.send(buf.toArray());
		return buf;
	}

	async sendFriends(client: ChatWebSocket) {
		const buf = ByteBuffer.createWithOpcode(ChatOpCode.FRIENDS);
		const friendList: { friendAccount: Account }[] = await this.chatService.getFriends(client.userId);
		const friends: Account[] = [];
		for (let friend of friendList)
			friends.push(friend.friendAccount);
		writeAccounts(buf, friends);
		// client.send(buf.toArray());
		return buf;
	}

	async create(client: ChatWebSocket, clients: ChatWebSocket[], buf: ByteBuffer) {
		const createInfo: CreateChat = readCreateChat(buf);
		const newRoom: ChatEntity = await this.chatService.createChat(createInfo.chat);
		const accounts = await this.chatService.getAccountsId(createInfo.members);
		//초대할 유저들의 id리스트 생성
		const memberList: number[] = [];
		for (let account of accounts) {
			memberList.push(account.id);
		}
		//room & chatMemberCreate
		await this.chatService.createChatMember(newRoom.id, client.userId, ChatMemberModeFlags.ADMIN);
		await this.chatService.createChatMembers(newRoom.id, memberList, ChatMemberModeFlags.NORMAL)

		//roomInformation추출
		const roomInfo: RoomInfo | null = await this.chatService.getChatRoomWithoutMessages(newRoom.id);
		if (!roomInfo) {
			throw new CustomException('존재하지 않는 채팅방입니다.')
		}
		//client 내부에 roomUUID, modeFlags를 추가
		for (let i = 0; i < clients.length; i++) {
			if (createInfo.members.includes(clients[i].account.uuid)) {
				clients[i].addRoomsInClientSocket([{ chat: roomInfo }])
			}
		}
		//Creater와 Inviter에게 roomInformation 전달
		const sendCreaterBuf: ByteBuffer = ByteBuffer.createWithOpcode(ChatOpCode.CREATE);
		const sendInviterBuf: ByteBuffer = ByteBuffer.createWithOpcode(ChatOpCode.CREATE);
		const chatRooms: ChatRoom[] = [];
		const chatMembers: ChatMembers[] = [];
		sendCreaterBuf.write1(CreatCode.CREATER);
		sendInviterBuf.write1(CreatCode.INVITER);

		this.divideChatsMembersMessages(chatRooms, chatMembers, [], roomInfo);
		writeChatRoom(sendCreaterBuf, chatRooms[0]);
		writeChatRoom(sendInviterBuf, chatRooms[0]);
		writeChatMembers(sendCreaterBuf, chatMembers[0]);
		writeChatMembers(sendInviterBuf, chatMembers[0]);

		for (let otherClient of clients) {
			if (createInfo.members.includes(otherClient.account.uuid))
				otherClient.send(sendInviterBuf.toArray());
		}
		//TODO - create message
		// client.send(sendCreaterBuf.toArray());
		return sendCreaterBuf;
	}

	async join(client: ChatWebSocket, clients: ChatWebSocket[], buf: ByteBuffer) {
		const roomJoinInfo: { uuid: string, password: string } = readRoomJoinInfo(buf);
		const chatRoom = await this.chatService.getChatRoomWithId(roomJoinInfo.uuid);
		//Reject
		if (!chatRoom)
			throw new CustomException('채팅방이 존재하지 않습니다.')
		else if (chatRoom.password != roomJoinInfo.password) {
			const sendRejectBuf = ByteBuffer.createWithOpcode(ChatOpCode.JOIN);
			sendRejectBuf.write1(JoinCode.REJCET);
			client.send(sendRejectBuf.toArray());
			return;
		}
		//chatMember create
		await this.chatService.createChatMember(chatRoom.id, client.userId, ChatMemberModeFlags.NORMAL);
		//RoomInfo find
		const roomInfo: RoomInfo | null = await this.chatService.getChatRoomFromId(chatRoom.id);
		if (!roomInfo) {
			throw new CustomException('채팅방이 존재하지 않습니다.');
		}
		//client 내부에 roomUUID, modeFlags를 추가
		client.addRoomsInClientSocket([{ chat: roomInfo }]);
		//Accept
		const sendAcceptBuf = ByteBuffer.createWithOpcode(ChatOpCode.JOIN);
		sendAcceptBuf.write1(JoinCode.ACCEPT);
		this.writeChatRoomInfo(buf, roomInfo);
		client.send(sendAcceptBuf.toArray());
		//NewJoin
		const sendNewJoinBuf = ByteBuffer.createWithOpcode(ChatOpCode.JOIN);
		sendNewJoinBuf.write1(JoinCode.NEW_JOIN);
		sendNewJoinBuf.writeString(chatRoom.uuid);
		// NewJoin에 보낼 MemberWithModeFlags write 및 보낼 clientList작성
		const otherMembers: string[] = []
		for (let member of roomInfo.members) {
			if (member.account.uuid == client.account.uuid) {
				writeMemberWithModeFlags(sendNewJoinBuf, { account: member.account, modeFalgs: member.modeFlags })
			}
			else {
				otherMembers.push(member.account.uuid);
			}
		}
		for (let otherClinet of clients)
			if (otherMembers.includes(otherClinet.account.uuid))
				otherClinet.send(sendNewJoinBuf.toArray());
		//TODO - join message
	}

	async searchPubilcRoom() {
		const publicRooms: ChatRoom[] = await this.chatService.getOpenChatRoom();
		const buf = ByteBuffer.createWithOpcode(ChatOpCode.PUBLIC_SEARCH);
		writeChatRooms(buf, publicRooms);
		// client.send(buf.toArray());
		return buf;
	}

	async invite(client: ChatWebSocket, clients: ChatWebSocket[], buf: ByteBuffer) {
		const invitation: ChatUUIDAndMemberUUIDs = readChatUUIDAndMemberUUIDs(buf);
		const accounts = await this.chatService.getAccounts(invitation.members);
		//권한이 없으면 초대 거부
		const room = await this.chatService.getRoomId(invitation.chatUUID);
		//초대할 유저들의 id리스트 생성
		const memberList: number[] = [];
		for (let account of accounts) {
			memberList.push(account.id);
		}
		//
		if (!room)
			throw new CustomException('채팅방이 존재하지 않습니다.');
		if (client.getModeFlags(invitation.chatUUID) == ChatMemberModeFlags.NORMAL)
			throw new CustomException('초대 권한이 없습니다.');
		//chatMember add
		await this.chatService.createChatMembers(room?.id, memberList, ChatMemberModeFlags.NORMAL)
		//roomInformation추출
		const roomInfo: RoomInfo | null = await this.chatService.getChatRoomFromUUID(invitation.chatUUID);
		if (!roomInfo) {
			throw new CustomException('존재하지 않는 채팅방입니다.')
		}
		//초대받을 client 내부에 roomUUID, modeFlags를 추가
		for (let i = 0; i < clients.length; i++) {
			if (invitation.members.includes(clients[i].account.uuid)) {
				clients[i].addRoomsInClientSocket([{ chat: roomInfo }])
			}
		}
		const sendBuf: ByteBuffer = ByteBuffer.createWithOpcode(ChatOpCode.INVITE);
		this.writeChatRoomInfo(buf, roomInfo);
		for (let otherClient of clients) {
			if (invitation.members.includes(otherClient.account.uuid))
				otherClient.send(sendBuf.toArray());
		}
		//TODO - invite message
	}

	async enterRoom(buf: ByteBuffer) {
		const roomUUID = buf.readString();
		const roomInfo: RoomInfo | null = await this.chatService.getChatRoomFromUUID(roomUUID);
		const sendBuf = ByteBuffer.createWithOpcode(ChatOpCode.ENTER);
		if (roomInfo) {
			this.writeChatRoomInfo(buf, roomInfo)
		}
		else {
			throw new CustomException('채팅방이 존재하지 않습니다.');
		}
		// client.send(sendBuf.toArray());
		return sendBuf;
	}

	async part(client: ChatWebSocket, clients: ChatWebSocket[], buf: ByteBuffer) {
		const roomUUID = buf.readString();
		//chat id/인원수/member의 권한 추출
		const room = await this.chatService.getChatRoomIdWithAccountIds(roomUUID);
		if (!room)
			throw new CustomException('채팅방이 존재하지 않습니다.')
		//chatMember 삭제
		await this.chatService.deleteChatMember(room.id, client.userId);
		//나가는 방에 혼자있으면 방 삭제
		if (room.members.length == 1) {
			await this.chatService.deleteChatRoom(roomUUID);
			//나가는 방에 모든 채팅 기록 삭제
			await this.chatService.deleteChatMessages(room.id);
		}
		//TODO: 나가는 유저의 권한이 admin일때 어떻게 admin 권한을 넘길것인가?
		else if (client.getModeFlags(roomUUID) == ChatMemberModeFlags.ADMIN) { }//
		// Part user에 보낼 buf
		const sendPartUserBuf: ByteBuffer = ByteBuffer.createWithOpcode(ChatOpCode.PART);
		sendPartUserBuf.write1(PartCode.ACCEPT);
		sendPartUserBuf.writeString(roomUUID);
		client.send(sendPartUserBuf.toArray());
		// 나머지 채팅방 참여 유저에 보낼 buf
		const sendOtherUserBuf: ByteBuffer = ByteBuffer.createWithOpcode(ChatOpCode.PART);
		sendOtherUserBuf.write1(PartCode.PART);
		sendOtherUserBuf.writeString(roomUUID);
		sendOtherUserBuf.writeString(client.account.uuid);
		const roomUserIds: number[] = [];
		for (let member of room.members)
			roomUserIds.push(member.accountId);
		for (let otherClient of clients)
			if (roomUserIds.includes(otherClient.userId))
				otherClient.send(sendOtherUserBuf.toArray());
		//client 내부에 roomUUID, modeFlags를 삭제
		client.deleteRoomInClientSocket(roomUUID);
		//TODO - part message
	}

	async kick(client: ChatWebSocket, clients: ChatWebSocket[], buf: ByteBuffer) {
		const kickList: ChatUUIDAndMemberUUIDs = readChatUUIDAndMemberUUIDs(buf);
		//Reject
		for (let room of client.rooms) {
			const sendRejectBuf = ByteBuffer.createWithOpcode(ChatOpCode.KICK);
			if (room.roomUUID == kickList.chatUUID && room.modeFlags != 4) {
				sendRejectBuf.write1(KickCode.REJCET);
				client.send(sendRejectBuf.toArray());
				return;
			}
		}
		//Accept
		const room = await this.chatService.getChatRoomIdWithAccountIds(kickList.chatUUID);
		if (!room)
			throw new CustomException('채팅방이 존재하지 않습니다.')
		const roomMembers: number[] = [];
		for (let member of room.members) {
			roomMembers.push(member.accountId);
		}
		const accountIds = await this.chatService.getAccountOfId(kickList.members);
		const kickMembers: number[] = [];
		for (let account of accountIds) {
			kickMembers.push(account.id);
		}
		await this.chatService.deleteChatMembers(room.id, kickMembers);

		for (let i = 0; i < clients.length; ++i) {
			if (roomMembers.includes(clients[i].userId)) {
				const sendBuf = ByteBuffer.createWithOpcode(ChatOpCode.KICK);
				if (kickList.members.includes(clients[i].account.uuid)) {
					sendBuf.write1(KickCode.KICK_USER);
					sendBuf.writeString(kickList.chatUUID);
					clients[i].deleteRoomInClientSocket(kickList.chatUUID);
				}
				else {
					sendBuf.write1(KickCode.ACCEPT);
					writeChatUUIDAndMemberUUIDs(sendBuf, kickList);
				}
				clients[i].send(sendBuf.toArray());
			}
		}
		//TODO - kick message
	}

	async chat(client: ChatWebSocket, clients: ChatWebSocket[], buf: ByteBuffer) {
		const msgInfo = readCreateChatMessaage(buf);
		await this.chatWithCreateChatMessage(msgInfo, client, clients);
	}

	//utils

	private async chatWithCreateChatMessage(msgInfo: CreateChatMessaage, client: ChatWebSocket, clients: ChatWebSocket[]) {
		const room = await this.chatService.getChatRoomIdWithAccountIds(msgInfo.chatUUID);
		if (!room)
			throw new CustomException('채팅방이 존재하지 않습니다.')
		const members: number[] = [];
		for (let member of room.members) {
			members.push(member.accountId);
		}
		//새로운 메세지 DB에 생성
		const msg = await this.chatService.createChatMessage(room.id, client.userId, msgInfo);
		//소켓 연결중인 방 참여 인원에게 새로운 메세지 전달
		const sendMsg: Message = {
			id: msg.id,
			accountUUID: client.account.uuid,
			content: msg.content,
			modeFlags: msg.modeFlags,
			timestamp: msg.timestamp
		}
		const sendBuf = ByteBuffer.createWithOpcode(ChatOpCode.CHAT);
		sendBuf.writeString(msgInfo.chatUUID);
		writeMessage(sendBuf, sendMsg);
		for (let _client of clients) {
			if (members.includes(_client.userId)) {
				_client.send(sendBuf.toArray());
			}
		}
	}

	private divideChatsMembersMessages(chatRooms: ChatRoom[], chatMembers: ChatMembers[], chatMessages: ChatMessages[], room: RoomInfo) {
		chatRooms.push({
			uuid: room.uuid,
			title: room.title,
			modeFlags: room.modeFlags,
			password: room.password,
			limit: room.limit
		});
		const members: MemberWithModeFlags[] = [];
		for (const member of room.members) {
			members.push({
				account: member.account,
				modeFalgs: member.modeFlags
			})
		}
		chatMembers.push({
			chatUUID: room.uuid,
			members: members,
		})
		const messages: Message[] = [];
		if (room.messages) {
			for (const message of room.messages) {
				messages.push({
					id: message.id,
					accountUUID: message.account.uuid,
					content: message.content,
					modeFlags: message.modeFlags,
					timestamp: message.timestamp,
				});
			}
		}
		chatMessages.push({
			chatUUID: room.uuid,
			messages: messages
		})
	}

	private writeChatRoomInfo(buf: ByteBuffer, chatRoomInfo: RoomInfo) {
		const chatRooms: ChatRoom[] = [];
		const chatMembersList: ChatMembers[] = [];
		const chatMessagesList: ChatMessages[] = [];
		this.divideChatsMembersMessages(chatRooms, chatMembersList, chatMessagesList, chatRoomInfo);
		writeChatRoom(buf, chatRooms[0]);
		writeChatMembers(buf, chatMembersList[0]);
		writeChatMessages(buf, chatMessagesList[0]);
		return buf;
	}

	private writeChatRoomInfos(buf: ByteBuffer, roomList: { chat: RoomInfo }[]) {
		const chatRooms: ChatRoom[] = [];
		const chatMembersList: ChatMembers[] = [];
		const chatMessagesList: ChatMessages[] = [];
		for (const room of roomList) {
			this.divideChatsMembersMessages(chatRooms, chatMembersList, chatMessagesList, room.chat);
		}
		writeChatRooms(buf, chatRooms);
		writeChatMembersList(buf, chatMembersList);
		writeChatMessagesList(buf, chatMessagesList);
		return buf;
	}
}