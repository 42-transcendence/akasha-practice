import { ByteBuffer } from "@libs/byte-buffer";
import { Injectable } from "@nestjs/common";
import { ChatWebSocket } from "./chat-websocket";
import { CustomException } from "./utils/exception";
import { ChatMemberModeFlags, CreatCode, RoomInfo, readRoomJoinInfo, PartCode, KickCode, CreateChatMessaage, ChatRoom, ChatMessages, ChatMembers, Account, MemberWithModeFlags, Message, writeChatRooms, writeChatMembersList, writeChatMessagesList, writeAccounts, CreateChat, readCreateChat, writeMessage, ChatUUIDAndMemberUUIDs, readChatUUIDAndMemberUUIDs, writeChatUUIDAndMemberUUIDs, writeChatMembers, writeChatMessages, writeMemberWithModeFlags, InviteCode, writeMembersWithModeFlags, ChatRoomWithLastMessageUUID, writeChatRoomWithLastMessageUUID, writeChatRoomsWithLastMessageUUID, readCreateChatMessageWithOutModeFlags, ChatMessageFlags } from "./utils/utils";
import { ChatOpCode, JoinCode } from "./utils/utils";
import { ChatEntity } from "src/generated/model";
import { AuthPayload, AuthService } from "src/user/auth/auth.service";
import { ChatService } from "./chat.service";
import { NULL_UUID } from "@libs/uuid";

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
		this.writeChatRoomInfosWhitAccountUUID(buf, roomList, client.account.uuid);
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
		const accounts = await this.chatService.getAccountsIdUUID(createInfo.members);
		//초대할 유저들의 id리스트 생성
		const memberList: number[] = [];
		for (let account of accounts) {
			memberList.push(account.id);
		}
		//room & chatMemberCreate
		await this.chatService.createChatMember(newRoom.id, client.userId, ChatMemberModeFlags.ADMIN, null);
		await this.chatService.createChatMembers(newRoom.id, memberList, ChatMemberModeFlags.NORMAL, null)

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
		sendCreaterBuf.write1(CreatCode.CREATER);
		sendInviterBuf.write1(CreatCode.INVITER);

		this.writeChatRoomInfoWithLastMessageUUID(sendCreaterBuf, roomInfo, NULL_UUID);
		this.writeChatRoomInfoWithLastMessageUUID(sendInviterBuf, roomInfo, NULL_UUID);

		for (const otherClient of clients) {
			if (createInfo.members.includes(otherClient.account.uuid))
				otherClient.send(sendInviterBuf.toArray());
		}
		//create message Notice
		const content = client.account.nickName + "님이" + createInfo.chat.title + "을 생성하셨습니다.";
		const _client = { userId: client.userId, userUUID: client.account.uuid };
		this.makeNotice(newRoom.uuid, content, _client, clients);
		for (const account of accounts) {
			const content = account.nickName + "님이 입장하셨습니다.";
			const _client = { userId: account.id, userUUID: account.uuid };
			this.makeNotice(newRoom.uuid, content, _client, clients);
		}
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
		await this.chatService.createChatMember(chatRoom.id, client.userId, ChatMemberModeFlags.NORMAL, this.retLastmessageId(chatRoom.messages));
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
		this.writeChatRoomInfoWithLastMessageUUID(sendAcceptBuf, roomInfo, this.retLastmessageId(chatRoom.messages));
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
		//join message Notice : 공지 모드 플레그
		const content: string = client.account.nickName + "님이 입장하셨습니다.";
		const _client = { userId: client.userId, userUUID: client.account.uuid }
		this.makeNotice(roomJoinInfo.uuid, content, _client, clients);
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
		//TODO - 권한이 없으면 초대 거부
		const room = await this.chatService.getRoomIdAndMembersUUID(invitation.chatUUID);
		if (!room)
			throw new CustomException('채팅방이 존재하지 않습니다.');
		if (client.getModeFlags(invitation.chatUUID) == ChatMemberModeFlags.NORMAL)
			throw new CustomException('초대 권한이 없습니다.');
		const lastMessageId = this.retLastmessageId(room.messages);
		//기존 방 멤버들 목록
		const nonInvitedMembers: string[] = [];
		for (const member of room.members) {
			nonInvitedMembers.push(member.account.uuid);
		}
		// 초대 목록에 중복되는 유저들 삭제
		const invitedMembers: string[] = [];
		for (const member of invitation.members) {
			if (!nonInvitedMembers.includes(member)) {
				invitedMembers.push(member);
			}
		}
		const accounts = await this.chatService.getAccounts(invitedMembers);
		//초대할 유저들의 id리스트 생성
		const memberList: number[] = [];
		for (let account of accounts) {
			memberList.push(account.id);
		}
		//chatMember add
		await this.chatService.createChatMembers(room?.id, memberList, ChatMemberModeFlags.NORMAL, lastMessageId)
		//roomInformation추출
		const roomInfo: RoomInfo | null = await this.chatService.getChatRoomFromUUID(invitation.chatUUID);
		if (!roomInfo) {
			throw new CustomException('존재하지 않는 채팅방입니다.')
		}
		// room의 멤버 리스트 작성
		const roomMembers: string[] = [];
		for (const member of roomInfo.members) {
			roomMembers.push(member.account.uuid);
		}
		const invitedMembersWithModeFlags: MemberWithModeFlags[] = [];
		for (const member of roomInfo.members) {
			if (invitedMembers.includes(member.account.uuid)) {
				const inviter: MemberWithModeFlags = {
					account: member.account,
					modeFalgs: member.modeFlags,
				};
				invitedMembersWithModeFlags.push(inviter);
			}
		}
		//초대받을 client 내부에 roomUUID, modeFlags를 추가
		for (let i = 0; i < clients.length; i++) {
			if (invitedMembers.includes(clients[i].account.uuid)) {
				clients[i].addRoomsInClientSocket([{ chat: roomInfo }])
			}
		}
		const sendInviterBuf: ByteBuffer = ByteBuffer.createWithOpcode(ChatOpCode.INVITE);
		const sendMemberBuf: ByteBuffer = ByteBuffer.createWithOpcode(ChatOpCode.INVITE);
		sendInviterBuf.write1(InviteCode.INVITER);
		sendMemberBuf.write1(InviteCode.MEMBER);
		this.writeChatRoomInfoWithLastMessageUUID(sendInviterBuf, roomInfo, lastMessageId);
		sendMemberBuf.writeString(roomInfo.uuid);
		writeMembersWithModeFlags(sendMemberBuf, invitedMembersWithModeFlags);
		for (let otherClient of clients) {
			if (invitedMembers.includes(otherClient.account.uuid)) {
				otherClient.send(sendInviterBuf.toArray());
			}
			else if (roomMembers.includes(otherClient.account.uuid)) {
				otherClient.send(sendMemberBuf.toArray());
			}
		}
		//invite message Notice
		for (const account of accounts) {
			const content = account.nickName + "님이 입장하셨습니다.";
			const _client = { userId: account.id, userUUID: account.uuid };
			this.makeNotice(invitation.chatUUID, content, _client, clients);
		}
	}

	// async enterRoom(buf: ByteBuffer) {
	// 	const roomUUID = buf.readString();
	// 	const roomInfo: RoomInfo | null = await this.chatService.getChatRoomFromUUID(roomUUID);
	// 	const sendBuf = ByteBuffer.createWithOpcode(ChatOpCode.ENTER);
	// 	if (roomInfo) {
	// 		this.writeChatRoomInfo(sendBuf, roomInfo)
	// 	}
	// 	else {
	// 		throw new CustomException('채팅방이 존재하지 않습니다.');
	// 	}
	// 	// client.send(sendBuf.toArray());
	// 	return sendBuf;
	// }

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
			//나가는 방에 모든 채팅 기록 삭제
			await this.chatService.deleteChatMessages(room.id);
			await this.chatService.deleteChatRoom(roomUUID);
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
			if (roomUserIds.includes(otherClient.userId) && otherClient.userId != client.userId)
				otherClient.send(sendOtherUserBuf.toArray());
		//client 내부에 roomUUID, modeFlags를 삭제
		client.deleteRoomInClientSocket(roomUUID);
		//part message Notice
		const content = client.account.nickName + "님이 퇴장하셨습니다.";
		const _client = { userId: client.userId, userUUID: client.account.uuid };
		this.makeNotice(roomUUID, content, _client, clients);
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
		for (const member of room.members) {
			roomMembers.push(member.accountId);
		}
		const accounts = await this.chatService.getAccountsIdUUID(kickList.members);
		const kickMembers: number[] = [];
		for (const account of accounts) {
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
		//kick message Notice
		for (const account of accounts) {
			const content = account.nickName + "님이 퇴장당하셨습니다.";
			const _client = { userId: account.id, userUUID: account.uuid };
			this.makeNotice(kickList.chatUUID, content, _client, clients);
		}
	}

	async chat(client: ChatWebSocket, clients: ChatWebSocket[], modeFalgs: number, buf: ByteBuffer) {
		const msg = readCreateChatMessageWithOutModeFlags(buf);
		const msgInfo: CreateChatMessaage = { chatUUID: msg.chatUUID, content: msg.content, modeFalgs };
		const _client: { userId: number, userUUID: string } = { userId: client.userId, userUUID: client.account.uuid }
		await this.chatWithCreateChatMessage(msgInfo, _client, clients);
	}

	//utils

	private async chatWithCreateChatMessage(msgInfo: CreateChatMessaage, client: { userId: number, userUUID: string }, clients: ChatWebSocket[]) {
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
			uuid: msg.uuid,
			accountUUID: client.userUUID,
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

	private divideChatsMembersMessagesWithLastMessageUUID(chatRooms: ChatRoomWithLastMessageUUID[], chatMembers: ChatMembers[], chatMessages: ChatMessages[], room: RoomInfo, lastMessageUUID: string) {
		// chatRoom
		chatRooms.push({
			info: {
				uuid: room.uuid,
				title: room.title,
				modeFlags: room.modeFlags,
				password: room.password,
				limit: room.limit
			},
			lastMessageId: lastMessageUUID
		});
		//chatMembers
		const members: MemberWithModeFlags[] = [];
		for (const member of room.members) {
			members.push({
				account: member.account,
				modeFalgs: member.modeFlags,
			});
		}
		chatMembers.push({
			chatUUID: room.uuid,
			members: members,
		})
		//chatMessages
		const messages: Message[] = [];
		if (room.messages) {
			for (const message of room.messages) {
				messages.push({
					uuid: message.uuid,
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

	private divideChatsMembersMessagesWithAccountUUID(chatRooms: ChatRoomWithLastMessageUUID[], chatMembers: ChatMembers[], chatMessages: ChatMessages[], room: RoomInfo, accountUUID: string) {
		//chatMembers
		const members: MemberWithModeFlags[] = [];
		let lastMessageId: string = NULL_UUID;
		for (const member of room.members) {
			members.push({
				account: member.account,
				modeFalgs: member.modeFlags,
			});
			if (member.account.uuid == accountUUID && member.lastMessageId != null) {
				lastMessageId = member.lastMessageId;
			}
		}
		chatMembers.push({
			chatUUID: room.uuid,
			members: members,
		})
		// chatRoom
		chatRooms.push({
			info: {
				uuid: room.uuid,
				title: room.title,
				modeFlags: room.modeFlags,
				password: room.password,
				limit: room.limit
			},
			lastMessageId
		});
		//chatMessages
		const messages: Message[] = [];
		if (room.messages) {
			for (const message of room.messages) {
				messages.push({
					uuid: message.uuid,
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

	private writeChatRoomInfoWithLastMessageUUID(buf: ByteBuffer, chatRoomInfo: RoomInfo, lastMessageUUID: string) {
		const chatRooms: ChatRoomWithLastMessageUUID[] = [];
		const chatMembersList: ChatMembers[] = [];
		const chatMessagesList: ChatMessages[] = [];
		this.divideChatsMembersMessagesWithLastMessageUUID(chatRooms, chatMembersList, chatMessagesList, chatRoomInfo, lastMessageUUID);
		writeChatRoomWithLastMessageUUID(buf, chatRooms[0]);
		writeChatMembers(buf, chatMembersList[0]);
		writeChatMessages(buf, chatMessagesList[0]);
		return buf;
	}

	private writeChatRoomInfosWhitAccountUUID(buf: ByteBuffer, roomList: { chat: RoomInfo }[], accountUUID: string) {
		const chatRooms: ChatRoomWithLastMessageUUID[] = [];
		const chatMembersList: ChatMembers[] = [];
		const chatMessagesList: ChatMessages[] = [];
		for (const room of roomList) {
			this.divideChatsMembersMessagesWithAccountUUID(chatRooms, chatMembersList, chatMessagesList, room.chat, accountUUID);
		}
		writeChatRoomsWithLastMessageUUID(buf, chatRooms);
		writeChatMembersList(buf, chatMembersList);
		writeChatMessagesList(buf, chatMessagesList);
		return buf;
	}

	private retLastmessageId(messages: { uuid: string }[]): string {
		const messageAt0 = messages.at(0)
		if (messageAt0 == undefined) {
			return NULL_UUID;
		}
		return messageAt0.uuid;
	}

	private makeNotice(chatUUID: string, content: string, client: { userId: number, userUUID: string }, clients: ChatWebSocket[]) {
		const msg: CreateChatMessaage = {
			chatUUID: chatUUID,
			//TODO - 공지 모드 플레그
			modeFalgs: ChatMessageFlags.NOTICE,
			content
		};
		this.chatWithCreateChatMessage(msg, client, clients);
	}
}