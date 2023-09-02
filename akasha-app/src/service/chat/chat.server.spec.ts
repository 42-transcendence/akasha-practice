import { Test, TestingModule } from "@nestjs/testing";
import { ChatServer } from "./chat.server";

describe("ChatServer", () => {
  let provider: ChatServer;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ChatServer],
    }).compile();

    provider = module.get<ChatServer>(ChatServer);
  });

  it("should be defined", () => {
    expect(provider).toBeDefined();
  });
});
