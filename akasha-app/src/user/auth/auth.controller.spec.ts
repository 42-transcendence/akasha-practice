import { Test, TestingModule } from "@nestjs/testing";
import { AuthService } from "./auth.service";
import { ConfigModule } from "@nestjs/config";
import { AuthController } from "./auth.controller";
import { AccountsModule } from "@/user/accounts/accounts.module";
import { SessionsModule } from "@/user/sessions/sessions.module";

describe("AuthController", () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule, AccountsModule, SessionsModule],
      controllers: [AuthController],
      providers: [AuthService],
      exports: [AuthService],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("root", () => {
    it('should return "Hello World!"', () => {
      expect(controller.getHello()).toBe("Hello World!");
    });
  });
});
