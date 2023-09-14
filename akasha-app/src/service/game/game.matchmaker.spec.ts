import { Test, TestingModule } from "@nestjs/testing";
import { GameMatchmaker } from "./game.matchmaker";

describe("GameMatchmaker", () => {
  let provider: GameMatchmaker;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GameMatchmaker],
    }).compile();

    provider = module.get<GameMatchmaker>(GameMatchmaker);
  });

  it("should be defined", () => {
    expect(provider).toBeDefined();
  });
});
