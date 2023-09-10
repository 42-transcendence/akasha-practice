import { Test, TestingModule } from "@nestjs/testing";
import { GameServer } from "./game.server";

describe("GameServer", () => {
  let provider: GameServer;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GameServer],
    }).compile();

    provider = module.get<GameServer>(GameServer);
  });

  it("should be defined", () => {
    expect(provider).toBeDefined();
  });
});
