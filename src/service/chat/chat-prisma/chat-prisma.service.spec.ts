import { Test, TestingModule } from '@nestjs/testing';
import { ChatPrismaService } from './chat-prisma.service';

describe('ChatPrismaService', () => {
  let service: ChatPrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ChatPrismaService],
    }).compile();

    service = module.get<ChatPrismaService>(ChatPrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
