import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ChatMemberModeFlags, ChatRoomMode, CreateChatInfo, CreateChatMessaage, RoomInfo } from './utils/utils';
import { ChatMemberEntity } from 'src/generated/model';

@Injectable()
export class ChatService {
	constructor(private prismaService: PrismaService) { }

	async getAccount(AcountUUID: string) {
		return (await this.prismaService.account.findUnique({
			where: {
				uuid: AcountUUID,
			},
			select: {
				id: true,
				nickName: true,
				nickTag: true,
				avatarKey: true,
				activeStatus: true,
				activeTimestamp: true,
				statusMessage: true
			}
		}));
	}

	async getAccounts(AcountUUIDs: string[]) {
		return (await this.prismaService.account.findMany({
			where: {
				uuid: { in: AcountUUIDs }
			},
			select: {
				id: true,
				nickName: true,
				nickTag: true,
				avatarKey: true,
				activeStatus: true,
				activeTimestamp: true,
				statusMessage: true
			}
		}));
	}

	async getChatRooms(accountId: number): Promise<{ chat: RoomInfo }[]> {
		return (await this.prismaService.chatMember.findMany({
			where: {
				accountId: accountId,
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
						}
					}
				}
			}
		}));
	}

	async getFriends(accountId: number) {
		return (await this.prismaService.friend.findMany({
			where: {
				accountId: accountId
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
		}));
	}

	async createChat(info: CreateChatInfo) {
		return (await this.prismaService.chat.create({
			data: info,
		}));
	}

	async getAccountsId(members: string[]) {
		return (await this.prismaService.account.findMany({
			where: {
				uuid: { in: members }
			},
			select: {
				id: true
			}
		}));
	}

	async createChatMember(chatId: number, accountId: number, modeFlags: ChatMemberModeFlags) {
		return (await this.prismaService.chatMember.create({
			data: {
				chatId,
				accountId,
				modeFlags
			}
		}));
	}

	private CreateChatMemberArray(chatRoomId: number, memberList: number[], modeFlags: ChatMemberModeFlags): ChatMemberEntity[] {
		const arr: ChatMemberEntity[] = [];
		for (let i of memberList)
			arr.push({ chatId: chatRoomId, accountId: i, modeFlags: modeFlags });
		return arr;
	}

	async createChatMembers(chatId: number, accountIds: number[], modeFlags: ChatMemberModeFlags) {
		return (await this.prismaService.chatMember.createMany({
			data: this.CreateChatMemberArray(chatId, accountIds, modeFlags),
		}));
	}

	async getChatRoomWithoutMessages(chatId: number): Promise<RoomInfo | null> {
		return (await this.prismaService.chat.findUnique({
			where: {
				id: chatId,
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
		}));
	}
	async getChatRoomWithId(chatUUID: string) {
		return (await this.prismaService.chat.findUnique({
			where: {
				uuid: chatUUID,
			}
		}));
	}
	async getChatRoomFromId(chatId: number): Promise<RoomInfo | null> {
		return (await this.prismaService.chat.findUnique({
			where: {
				id: chatId,
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
		}));
	}

	async getChatRoomFromUUID(chatUUID: string): Promise<RoomInfo | null> {
		return (await this.prismaService.chat.findUnique({
			where: {
				uuid: chatUUID
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
						modeFlags: true,
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
				}
			},
		}));
	}

	async getRoomIdAndMembersUUID(chatUUID: string) {
		return (await this.prismaService.chat.findUnique({
			where: {
				uuid: chatUUID
			},
			select:
			{
				id: true,
				members: {
					select: {
						account: {
							select: {
								uuid: true
							}
						}
					}
				}
			}
		}));
	}

	async getChatRoomIdWithAccountIds(chatUUID: string) {
		return (await this.prismaService.chat.findUnique({
			where: {
				uuid: chatUUID,
			},
			select: {
				id: true,
				members: {
					select: {
						accountId: true
					}
				}
			}
		}))
	}

	async deleteChatMember(chatId: number, accountId: number) {
		return (await this.prismaService.chatMember.delete({
			where: {
				chatId_accountId: { chatId: chatId, accountId: accountId }
			}
		}));
	}

	async deleteChatRoom(chatUUID: string) {
		return (await this.prismaService.chat.delete({
			where: {
				uuid: chatUUID
			}
		}));
	}

	async deleteChatMessages(chatId: number) {
		return (await this.prismaService.chatMessage.deleteMany({
			where: {
				chatId: chatId
			}
		}));
	}

	async getAccountOfId(accountUUIDs: string[]) {
		return (await this.prismaService.account.findMany({
			where: {
				uuid: { in: accountUUIDs }
			},
			select: {
				id: true
			}
		}));
	}

	async deleteChatMembers(chatId: number, accountIds: number[]) {
		return (await this.prismaService.chatMember.deleteMany({
			where: {
				chatId: chatId,
				accountId: { in: accountIds }
			}
		}));
	}

	async createChatMessage(chatId: number, accountId: number, msgInfo: CreateChatMessaage) {
		return (await this.prismaService.chatMessage.create({
			data: {
				chatId: chatId,
				accountId: accountId,
				content: msgInfo.content,
				modeFlags: msgInfo.modeFalgs
			}
		}));
	}

	async getOpenChatRoom() {
		return (await this.prismaService.chat.findMany({
			where: {
				OR: [
					{
						modeFlags: ChatRoomMode.PUBLIC_NOPASS
					},
					{
						modeFlags: ChatRoomMode.PUBLIC_PASS
					}
				]
			},
			select: {
				uuid: true,
				title: true,
				modeFlags: true,
				password: true,
				limit: true,
			}
		}));
	}
}
