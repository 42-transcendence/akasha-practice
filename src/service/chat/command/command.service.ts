import { PrismaService } from "src/prisma/prisma.service";
import { ByteBuffer } from "@libs/byte-buffer";
import { Injectable } from "@nestjs/common";
import { ChatWebSocket } from "../chatSocket";
import { CustomException } from "../utils/exception";
import { AccountWithUuid, ChatMemberModeFlags, ChatRoomMode, ChatWithoutIdUuid, CreatCode, CreateChatMemberArray, RoomInfo, readChatAndMemebers, readMembersAndChatUUID, readRoomJoinInfo, writeChatMemberAccount, writeRoominfo, writeChat, wrtieChats, writeAccountWithUuids, PartCode, addRoomsInClientSocket, KickCode, writeMembersAndChatUUID, readCreateChatMessaage, ChatMessageWithChatUuid, writeChatMessage, CreateChatMessaage } from "../utils/utils";
import { ChatOpCode, ChatWithoutId, JoinCode } from "../utils/utils";
import { ChatEntity } from "src/generated/model";
import { AuthPayload, AuthService } from "src/user/auth/auth.service";

@Injectable()
export class CommandService {
	constructor(private prismaService: PrismaService, private authService: AuthService) { }

	async chatServerConnect(buf: ByteBuffer, client: ChatWebSocket) {
		const jwt = buf.readString();
		const payload: AuthPayload = await this.authService.extractJWTPayload(jwt);
		const sendBuf = ByteBuffer.createWithOpcode(ChatOpCode.Connect);
		const userId = await this.prismaService.account.findUnique({
			where: {
				uuid: payload.user_id
			},
			select: {
				id: true,
			}
		})
		if (!userId)
			throw new CustomException('올바르지 않은 유저 id입니다.')
		client.userId = userId?.id
		client.userUUID = payload.user_id;
		client.send(sendBuf.toArray());
	}

	async sendRooms(client: ChatWebSocket) {
		const buf: ByteBuffer = ByteBuffer.createWithOpcode(ChatOpCode.Rooms);
		const chatList: ChatWithoutId[] = [];
		const roomList: { chat: ChatWithoutId }[] = await this.prismaService.chatMember.findMany({
			where: {
				accountId: client.userId,
			},
			select: {
				chat: {
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
								content: true,
								timestamp: true,
								modeFlags: true,
								account: {
									select: {
										uuid: true,
									}
								}
							},
							orderBy: {
								id: 'desc'
							},
							take: 1
						}
					}
				}
			}
		});
		for (let room of roomList)
			chatList.push(room.chat);
		wrtieChats(buf, chatList);
		//client 내부에 roomUUID, modeFlags를 추가
		addRoomsInClientSocket(client, chatList);
		//
		client.send(buf.toArray());
	}

	async sendFriends(client: ChatWebSocket) {
		const buf = ByteBuffer.createWithOpcode(ChatOpCode.Friends);
		const friendList: { friendAccount: AccountWithUuid }[] = await this.prismaService.friend.findMany({
			where: {
				accountId: client.userId
			},
			select: {
				friendAccount: {
					select: {
						uuid: true,
						nickName: true,
						nickTag: true,
						avatarKey: true,
						activeStatus: true,
						activeTimestamp: true,
						statusMessage: true
					}
				}
			}
		});
		const friends: AccountWithUuid[] = [];
		for (let friend of friendList)
			friends.push(friend.friendAccount);
		writeAccountWithUuids(buf, friends);
		client.send(buf.toArray());
	}

	async create(buf: ByteBuffer, client: ChatWebSocket, clients: ChatWebSocket[]) {
		const createInfo: { chat: ChatWithoutIdUuid, members: string[] } = readChatAndMemebers(buf)
		const newRoom: ChatEntity = await this.prismaService.chat.create({
			data: createInfo.chat,
		});
		const accounts = await this.prismaService.account.findMany({
			where: {
				uuid: { in: createInfo.members }
			},
			select: {
				id: true
			}
		});
		//초대할 유저들의 id리스트 생성
		const memberList: number[] = [];
		for (let account of accounts) {
			memberList.push(account.id);
		}
		//room & chatMemberCreate
		await this.prismaService.chatMember.create({
			data: {
				chatId: newRoom.id,
				accountId: client.userId,
				modeFlags: ChatMemberModeFlags.Admin
			}
		})
		await this.prismaService.chatMember.createMany({
			data: CreateChatMemberArray(newRoom.id, memberList),
		})

		//roomInformation추출
		const roomInfo: RoomInfo | null = await this.prismaService.chat.findUnique({
			where: {
				id: newRoom.id,
			},
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
					}
				},
			}
		})
		//client 내부에 roomUUID, modeFlags를 추가
		//TODO - invite는 무조건 모드플레그가 normal이면 굳이 for문을 돌릴 필요가없다.
		if (roomInfo) {
			for (let i = 0; i < clients.length; ++i) {
				if (createInfo.members.includes(clients[i].userUUID)) {
					for (let i = 0; i < roomInfo.members.length; ++i) {
						if (roomInfo.members[i].account.uuid == clients[i].userUUID)
							this.addRoomInClientSocket(clients[i], roomInfo?.uuid, roomInfo.members[i].modeFlags);
					}
				}
			}
		}
		//Creater와 Inviter에게 roomInformation 전달
		const sendCreaterBuf: ByteBuffer = ByteBuffer.createWithOpcode(ChatOpCode.Create);
		const sendInivterBuf: ByteBuffer = ByteBuffer.createWithOpcode(ChatOpCode.Create);
		sendCreaterBuf.write1(CreatCode.Creater);
		sendInivterBuf.write1(CreatCode.Inviter);
		if (roomInfo) {
			writeRoominfo(sendCreaterBuf, roomInfo);
			writeRoominfo(sendInivterBuf, roomInfo);
		}
		else
			throw new CustomException('존재하지 않는 채팅방입니다.')
		client.send(sendCreaterBuf.toArray());
		for (let otherClient of clients) {
			if (createInfo.members.includes(otherClient.userUUID))
				otherClient.send(sendInivterBuf.toArray());
		}
		//TODO - create message
	}

	async join(buf: ByteBuffer, client: ChatWebSocket, clients: ChatWebSocket[]) {
		const roomJoinInfo: { uuid: string, password: string } = readRoomJoinInfo(buf);
		const chatRoom = await this.prismaService.chat.findUnique({
			where: {
				uuid: roomJoinInfo.uuid,
			}
		});
		//Reject
		if (!chatRoom)
			throw new CustomException('채팅방이 존재하지 않습니다.')
		else if (chatRoom.password != roomJoinInfo.password) {
			const sendRejectBuf = ByteBuffer.createWithOpcode(ChatOpCode.Join);
			sendRejectBuf.write1(JoinCode.Reject);
			client.send(sendRejectBuf.toArray());
			return;
		}
		//chatMember create
		await this.prismaService.chatMember.create({
			data: {
				chatId: chatRoom.id,
				accountId: client.userId,
				modeFlags: ChatMemberModeFlags.Normal
			}
		})
		//RoomInfo find
		const roomInfo: RoomInfo | null = await this.prismaService.chat.findUnique({
			where: {
				id: chatRoom.id,
			},
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
					}
				},
				messages: {
					select: {
						id: true,
						account: {
							select: {
								uuid: true
							}
						},
						content: true,
						modeFlags: true,
						timestamp: true
					},
					orderBy: {
						id: 'desc'
					}
				}
			}
		});
		//client 내부에 roomUUID, modeFlags를 추가
		if (roomInfo) {
			this.addRoomInClientSocket(client, client.userUUID, ChatMemberModeFlags.Normal);
		}
		//Accept
		const sendAcceptBuf = ByteBuffer.createWithOpcode(ChatOpCode.Join);
		sendAcceptBuf.write1(JoinCode.Accept);
		if (roomInfo)
			writeRoominfo(sendAcceptBuf, roomInfo);
		else
			throw new CustomException('채팅방이 존재하지 않습니다.');
		client.send(sendAcceptBuf.toArray());
		//NewJoin
		const sendNewJoinBuf = ByteBuffer.createWithOpcode(ChatOpCode.Join);
		sendAcceptBuf.write1(JoinCode.NewJoin);
		sendAcceptBuf.writeString(chatRoom.uuid);
		const otherMembers: string[] = []
		for (let member of roomInfo.members) {
			if (member.account.uuid == client.userUUID) {
				writeChatMemberAccount(sendNewJoinBuf, member);
			}
			else {
				otherMembers.push(member.account.uuid);
			}
		}
		for (let otherClinet of clients)
			if (otherMembers.includes(otherClinet.userUUID))
				otherClinet.send(sendNewJoinBuf.toArray());
		//TODO - join message
	}

	async searchPubilcRoom(client: ChatWebSocket) {
		const publicRooms: ChatWithoutId[] = await this.prismaService.chat.findMany({
			where: {
				OR: [
					{
						modeFlags: ChatRoomMode.PublicNoPass
					},
					{
						modeFlags: ChatRoomMode.PublicPass
					}
				]
			},
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
						content: true,
						timestamp: true,
						modeFlags: true,
						account: {
							select: {
								uuid: true,
							}
						}
					},
					orderBy: {
						id: 'desc'
					},
					take: 1
				}
			}
		});
		const buf = ByteBuffer.createWithOpcode(ChatOpCode.PublicSearch);
		wrtieChats(buf, publicRooms);
		client.send(buf.toArray());
	}

	async invite(client: ChatWebSocket, clients: ChatWebSocket[], buf: ByteBuffer) {
		const invitation: { chatUUID: string, members: string[] } = readMembersAndChatUUID(buf);
		const accounts = await this.prismaService.account.findMany({
			where: {
				uuid: { in: invitation.members }
			},
			select: {
				id: true
			}
		});
		//권한이 없으면 초대 거부
		const room = await this.prismaService.chat.findUnique({
			where: {
				uuid: invitation.chatUUID
			},
			select:
			{
				id: true,
				members: {
					where: {
						accountId: client.userId,
					},
					select: {
						modeFlags: true,
					},
				}
			}
		})
		//초대할 유저들의 id리스트 생성
		const memberList: number[] = [];
		for (let account of accounts) {
			memberList.push(account.id);
		}
		//
		if (!room)
			throw new CustomException('채팅방이 존재하지 않습니다.');
		if (room.members[0].modeFlags == ChatMemberModeFlags.Normal)
			throw new CustomException('초대 권한이 없습니다.');
		//chatMember add
		await this.prismaService.chatMember.createMany({
			data: CreateChatMemberArray(room?.id, memberList)
		});
		//roomInformation추출
		const roomInfo: ChatWithoutId | null = await this.prismaService.chat.findUnique({
			where: {
				uuid: invitation.chatUUID,
			},
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
								avatarKey: true
							}
						},
						modeFlags: true,
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
		//초대받을 client 내부에 roomUUID, modeFlags를 추가
		//TODO - invite는 무조건 모드플레그가 normal이면 굳이 for문을 돌릴 필요가없다.
		if (roomInfo) {
			for (let i = 0; i < clients.length; ++i) {
				if (invitation.members.includes(clients[i].userUUID)) {
					for (let i = 0; i < roomInfo.members.length; ++i) {
						if (roomInfo.members[i].account.uuid == clients[i].userUUID)
							this.addRoomInClientSocket(clients[i], roomInfo?.uuid, roomInfo.members[i].modeFlags);
					}
				}
			}
		}
		const sendBuf: ByteBuffer = ByteBuffer.createWithOpcode(ChatOpCode.Invite);
		if (roomInfo) {
			writeChat(sendBuf, roomInfo);
		}
		else
			throw new CustomException('존재하지 않는 채팅방입니다.')
		for (let otherClient of clients) {
			if (invitation.members.includes(otherClient.userUUID))
				otherClient.send(sendBuf.toArray());
		}
		//TODO - invite message
	}

	async enterRoom(buf: ByteBuffer, client: ChatWebSocket) {
		const roomUUID = buf.readString();
		const roomInfo: RoomInfo | null = await this.prismaService.chat.findUnique({
			where: {
				uuid: roomUUID
			},
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
					}
				},
				messages: {
					select: {
						id: true,
						account: {
							select: {
								uuid: true
							}
						},
						content: true,
						modeFlags: true,
						timestamp: true
					},
					orderBy: {
						id: 'desc'
					}
				}
			}
		});
		const sendBuf = ByteBuffer.createWithOpcode(ChatOpCode.Enter);
		if (roomInfo)
			writeRoominfo(sendBuf, roomInfo);
		else
			throw new CustomException('채팅방이 존재하지 않습니다.');
		client.send(sendBuf.toArray());
	}

	async part(buf: ByteBuffer, client: ChatWebSocket, clients: ChatWebSocket[]) {
		const roomUUID = buf.readString();
		//chat id/인원수/member의 권한 추출
		const room = await this.prismaService.chat.findUnique({
			where: {
				uuid: roomUUID,
			},
			select: {
				id: true,
				members: {
					select: {
						modeFlags: true,
						accountId: true
					}
				}
			}
		});
		if (!room)
			throw new CustomException('채팅방이 존재하지 않습니다.')
		//chatMember 삭제
		await this.prismaService.chatMember.delete({
			where: {
				chatId_accountId: { chatId: room.id, accountId: client.userId }
			}
		})
		//나가는 방에 혼자있으면 방 삭제
		if (room.members.length == 1) {
			await this.prismaService.chat.delete({
				where: {
					uuid: roomUUID
				}
			});
			//나가는 방에 모든 채팅 기록 삭제
			await this.prismaService.chatMessage.deleteMany({
				where: {
					chatId: room.id
				}
			})
		}
		//TODO: 나가는 유저의 권한이 admin일때 어떻게 admin 권한을 넘길것인가?
		else if (room.members[0].modeFlags == ChatMemberModeFlags.Admin) { }//
		// Part user에 보낼 buf
		const sendPartUserBuf: ByteBuffer = ByteBuffer.createWithOpcode(ChatOpCode.Part);
		sendPartUserBuf.write1(PartCode.Accept);
		sendPartUserBuf.writeString(roomUUID);
		client.send(sendPartUserBuf.toArray());
		// 나머지 채팅방 참여 유저에 보낼 buf
		const sendOtherUserBuf: ByteBuffer = ByteBuffer.createWithOpcode(ChatOpCode.Part);
		sendOtherUserBuf.write1(PartCode.Part);
		sendOtherUserBuf.writeString(roomUUID);
		sendOtherUserBuf.writeString(client.userUUID);
		const roomUserUUIDs: number[] = [];
		for (let member of room.members)
			roomUserUUIDs.push(member.accountId);
		for (let otherClient of clients)
			if (roomUserUUIDs.includes(otherClient.userId))
				otherClient.send(sendOtherUserBuf.toArray());
		//client 내부에 roomUUID, modeFlags를 삭제
		this.deleteRoomsInClientSocket(client, roomUUID);
		//TODO - part message
	}

	async kick(buf: ByteBuffer, client: ChatWebSocket, clients: ChatWebSocket[]) {
		const kickList: { chatUUID: string, members: string[] } = readMembersAndChatUUID(buf);
		//Reject
		for (let room of client.rooms) {
			const sendRejectBuf = ByteBuffer.createWithOpcode(ChatOpCode.Kick);
			if (room.roomUUID == kickList.chatUUID && room.modeFlags != 4) {
				sendRejectBuf.write1(KickCode.Reject);
				client.send(sendRejectBuf.toArray());
				return;
			}

		}
		//Accept
		const room = await this.prismaService.chat.findUnique({
			where: {
				uuid: kickList.chatUUID,
			},
			select: {
				id: true,
				members: {
					select: {
						accountId: true
					}
				}
			}
		});
		if (!room)
			throw new CustomException('채팅방이 존재하지 않습니다.')
		const roomMembers: number[] = [];
		for (let member of room.members) {
			roomMembers.push(member.accountId);
		}
		const accounts = await this.prismaService.account.findMany({
			where: {
				uuid: { in: kickList.members }
			},
			select: {
				id: true
			}
		});
		const kickMembers: number[] = [];
		for (let account of accounts) {
			kickMembers.push(account.id);
		}
		await this.prismaService.chatMember.deleteMany({
			where: {
				chatId: room.id,
				accountId: { in: kickMembers }
			}
		})
		for (let i = 0; i < clients.length; ++i) {
			if (roomMembers.includes(clients[i].userId)) {
				const sendBuf = ByteBuffer.createWithOpcode(ChatOpCode.Kick);
				if (kickList.members.includes(clients[i].userUUID)) {
					sendBuf.write1(KickCode.KickUser);
					sendBuf.writeString(kickList.chatUUID);
					this.deleteRoomsInClientSocket(clients[i], kickList.chatUUID)
				}
				else {
					sendBuf.write1(KickCode.Accept);
					writeMembersAndChatUUID(sendBuf, kickList);
				}
				clients[i].send(sendBuf.toArray());
			}
		}
		//TODO - kick message
	}

	async chat(buf: ByteBuffer, client: ChatWebSocket, clients: ChatWebSocket[]) {
		const msgInfo = readCreateChatMessaage(buf);
		await this.chatWithCreateChatMessage(msgInfo, client, clients);
	}

	//utils
	private deleteRoomsInClientSocket(client: ChatWebSocket, roomUUID: string) {
		for (let i = 0; i < client.rooms.length; ++i) {
			if (client.rooms[i].roomUUID == roomUUID) {
				client.rooms.splice(i, 1);
			}
		}
	}

	private addRoomInClientSocket(client: ChatWebSocket, roomUUID: string, modeFlags: number) {
		client.rooms.push({ roomUUID, modeFlags });
	}

	private async chatWithCreateChatMessage(msgInfo: CreateChatMessaage, client: ChatWebSocket, clients: ChatWebSocket[]) {
		const room = await this.prismaService.chat.findUnique({
			where: {
				uuid: msgInfo.chatUUID
			},
			select: {
				id: true,
				members: {
					select: {
						accountId: true
					}
				}
			}
		});
		if (!room)
			throw new CustomException('채팅방이 존재하지 않습니다.')
		const members: number[] = [];
		for (let member of room.members) {
			members.push(member.accountId);
		}
		//새로운 메세지 DB에 생성
		const msg = await this.prismaService.chatMessage.create({
			data: {
				chatId: room.id,
				accountId: client.userId,
				content: msgInfo.content,
				modeFlags: msgInfo.modeFalgs
			}
		})
		//소켓 연결중인 방 참여 인원에게 새로운 메세지 전달
		const sendMsg: ChatMessageWithChatUuid = {
			id: msg.id,
			account: { uuid: client.userUUID },
			content: msg.content,
			modeFlags: msg.modeFlags,
			timestamp: msg.timestamp
		}
		const sendBuf = ByteBuffer.createWithOpcode(ChatOpCode.Chat);
		sendBuf.writeString(msgInfo.chatUUID);
		writeChatMessage(sendBuf, sendMsg);
		for (let _client of clients) {
			if (members.includes(_client.userId)) {
				_client.send(sendBuf.toArray());
			}
		}
	}
}