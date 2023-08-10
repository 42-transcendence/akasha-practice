import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ChatMemberModeFlags, CreateChatInfo, RoomInfo } from '../utils/utils';
import { ChatMemberEntity } from 'src/generated/model';

@Injectable()
export class ChatPrismaService {
	constructor(private prismaService: PrismaService) { }

	async getAccountId(AcountUUID: string) {
		return (await this.prismaService.account.findUnique({
			where: {
				uuid: AcountUUID,
			},
			select: {
				id: true
			}
		}));
	}

	async getChatRoomInfo(accountId: number): Promise<RoomInfo[]> {
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

	async getRoomInfo(chatId: number): Promise<RoomInfo | null> {
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
}
